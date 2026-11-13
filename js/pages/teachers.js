import { initPublicPage } from '../components/layout.js';
import { listPublicTeachers } from '../services/teacher.service.js';
import { listSubjects } from '../services/subject.service.js';
import { t, loc, onLanguageChange } from '../i18n/language.js';
import { esc } from '../utils/dom.js';
import { teacherCard } from './shared-cards.js';
import { initReveal } from '../components/ui.js';

await initPublicPage('teachers');
let teachers = [], subjects = [], subject = '', q = '', sort = 'students';

function renderControls() {
  document.getElementById('subjectFilter').innerHTML = `<option value="">${esc(t('teachers.allSubjects'))}</option>` + subjects.map((s) => `<option value="${esc(s.id)}" ${s.id === subject ? 'selected' : ''}>${esc(loc(s, 'name'))}</option>`).join('');
  document.getElementById('teacherSort').innerHTML = [['students', t('teachers.sortStudents')], ['rating', t('teachers.sortRating')], ['experience', t('teachers.sortExperience')]]
    .map(([v, l]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${esc(l)}</option>`).join('');
}
function renderGrid() {
  const hay = (x) => [x.display_name, x.headline_en, x.headline_ta, ...(x.specialties || []), ...(x.subjects || []).flatMap((s) => [s.name_en, s.name_ta])].join(' ').toLowerCase();
  const sorters = { students: (a, b) => (b.student_count || 0) - (a.student_count || 0), rating: (a, b) => (b.rating_avg || 0) - (a.rating_avg || 0), experience: (a, b) => (b.experience_years || 0) - (a.experience_years || 0) };
  const list = teachers.filter((x) => (!subject || (x.subjects || []).some((s) => s.id === subject)) && (!q || hay(x).includes(q))).sort(sorters[sort]);
  document.getElementById('teacherGrid').innerHTML = list.length
    ? list.map((x) => `<div class="col-md-6 col-lg-4">${teacherCard(x)}</div>`).join('')
    : `<div class="col-12"><div class="m-card empty-state"><i class="bi bi-person" aria-hidden="true"></i><h3>${esc(t('teachers.emptyTitle'))}</h3><p>${esc(t('teachers.empty'))}</p></div></div>`;
  initReveal();
}
function render() { renderControls(); renderGrid(); }
document.getElementById('subjectFilter').addEventListener('change', (e) => { subject = e.target.value; renderGrid(); });
document.getElementById('teacherSort').addEventListener('change', (e) => { sort = e.target.value; renderGrid(); });
document.getElementById('teacherSearch').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); renderGrid(); });
try { [teachers, subjects] = await Promise.all([listPublicTeachers(), listSubjects()]); } catch (e) { console.warn(e); }
render();
onLanguageChange(render);
