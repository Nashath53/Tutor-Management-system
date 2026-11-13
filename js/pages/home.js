import { initPublicPage, href } from '../components/layout.js';
import { listSubjects } from '../services/subject.service.js';
import { listPublicClasses } from '../services/class.service.js';
import { listPublicTeachers } from '../services/teacher.service.js';
import { api } from '../services/api.js';
import { t, loc, onLanguageChange } from '../i18n/language.js';
import { esc } from '../utils/dom.js';
import { teacherCard, testimonialCard, dayLabel, hhmm } from './shared-cards.js';
import { animateCount, initReveal } from '../components/ui.js';
import { openReviewModal, renderSurvey } from './public-forms.js';

await initPublicPage('home');

let subjects = [], classes = [], teachers = [], testimonials = [], stats = null;
let faqTab = 'students';
/** FAQ groups → number of questions. Text lives in i18n as faq.<group>.<n>.q / .a */
const FAQ = { students: 5, fees: 5, portal: 4, teachers: 4 };
let counted = false;

function renderStats() {
  const s = stats || { students: 0, classes: classes.length, teachers: teachers.length };
  const set = (id, v, opts) => { const el = document.getElementById(id); if (!el) return; if (!counted) animateCount(el, v, opts); else el.textContent = Number(v).toFixed(opts?.decimals || 0) + (opts?.suffix || ''); };
  set('statStudents', s.students || 0, { suffix: '+' });
  set('statClasses', s.classes || 0);
  set('statTeachers', s.teachers || 0);
  const r = document.getElementById('statRating');
  if (r) { if (s.rating_avg) set('statRating', s.rating_avg, { decimals: 1, suffix: '★' }); else r.textContent = '–'; }
  counted = true;
}

function renderHeroRows() {
  const rows = classes.flatMap((c) => (c.slots || []).map((s) => ({ c, s }))).sort((a, b) => a.s.weekday - b.s.weekday || a.s.start_time.localeCompare(b.s.start_time)).slice(0, 3);
  const el = document.getElementById('hvRows');
  if (!el || !rows.length) return;
  el.innerHTML = rows.map(({ c, s }) => `<div class="hv-row"><span class="hv-time">${esc(dayLabel(s.weekday))} ${esc(hhmm(s.start_time))}</span><span class="hv-cls"><b>${esc(loc({ name_en: c.subject_name_en, name_ta: c.subject_name_ta }, 'name'))}</b><small>${esc(t('common.grade'))}&nbsp;${esc(c.grade)}</small></span><span class="chip">${c.medium === 'tamil' ? 'TA' : c.medium === 'sinhala' ? 'SI' : 'EN'}</span></div>`).join('');
}

function renderSubjects() {
  const grid = document.getElementById('subjectGrid');
  grid.innerHTML = subjects.length ? subjects.map((s) => {
    const n = classes.filter((c) => c.subject_id === s.id).length;
    return `<div class="col-sm-6 col-lg-4" data-reveal><a class="subject-card" href="${href(`courses.html?subject=${s.id}`)}">
      <span class="s-icon"><i class="bi ${esc(s.icon || 'bi-book')}" aria-hidden="true"></i></span>
      <h3>${esc(loc(s, 'name'))}</h3><p>${esc(loc(s, 'description'))}</p>
      <span class="s-meta">${esc(t('home.classCount', { n }))} <i class="bi bi-arrow-right" aria-hidden="true"></i></span></a></div>`;
  }).join('') : `<div class="col-12"><div class="empty-state"><i class="bi bi-journal" aria-hidden="true"></i><p>${esc(t('home.noSubjects'))}</p></div></div>`;
}

function renderTeachers() {
  const tp = document.getElementById('teacherPreview');
  tp.innerHTML = teachers.length ? teachers.slice(0, 3).map((x) => `<div class="col-md-6 col-lg-4">${teacherCard(x)}</div>`).join('') : `<div class="col-12"><div class="empty-state"><p>${esc(t('teachers.empty'))}</p></div></div>`;
}

function renderTestimonials() {
  const el = document.getElementById('testiTrack');
  el.innerHTML = testimonials.length ? testimonials.map(testimonialCard).join('')
    : `<div class="m-card empty-state w-100"><i class="bi bi-chat-quote" aria-hidden="true"></i><p>${esc(t('home.testiEmpty'))}</p></div>`;
}

function renderFaq() {
  document.getElementById('faqTabs').innerHTML = Object.keys(FAQ).map((g) => `<button type="button" role="tab" class="${g === faqTab ? 'active' : ''}" aria-selected="${g === faqTab}" data-faq="${g}"><i class="bi ${{ students: 'bi-mortarboard', fees: 'bi-wallet2', portal: 'bi-phone', teachers: 'bi-person-workspace' }[g]}" aria-hidden="true"></i>${esc(t(`faq.tab.${g}`))}</button>`).join('');
  const list = [];
  for (let n = 1; n <= FAQ[faqTab]; n++) list.push(`<details ${n === 1 ? 'open' : ''}><summary><span>${esc(t(`faq.${faqTab}.${n}.q`))}</span><span class="q-ico" aria-hidden="true"><i class="bi bi-plus-lg"></i></span></summary><div class="a">${esc(t(`faq.${faqTab}.${n}.a`))}</div></details>`);
  document.getElementById('faqList').innerHTML = list.join('');
}
document.getElementById('faqTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-faq]'); if (b) { faqTab = b.dataset.faq; renderFaq(); } });
/* One open answer at a time keeps the list short on phones. */
document.getElementById('faqList').addEventListener('toggle', (e) => {
  if (e.target.open) document.querySelectorAll('#faqList details[open]').forEach((d) => { if (d !== e.target) d.open = false; });
}, true);

document.querySelectorAll('[data-track]').forEach((b) => b.addEventListener('click', () => {
  const tr = document.getElementById('testiTrack');
  tr.scrollBy({ left: Number(b.dataset.track) * Math.min(tr.clientWidth * 0.9, 420), behavior: 'smooth' });
}));
document.getElementById('shareStoryBtn').addEventListener('click', () => openReviewModal());

function render() { renderStats(); renderHeroRows(); renderSubjects(); renderTeachers(); renderTestimonials(); renderFaq(); renderSurvey(document.getElementById('surveyMount')); initReveal(); }

const safe = (p, fb) => p.catch((e) => { console.warn(e); return fb; });
[subjects, classes, teachers, testimonials, stats] = await Promise.all([
  safe(listSubjects(), []), safe(listPublicClasses(), []), safe(listPublicTeachers(), []),
  safe(api.rpc('get_public_testimonials'), []), safe(api.rpc('get_public_stats'), null)
]);
render();
onLanguageChange(render);
