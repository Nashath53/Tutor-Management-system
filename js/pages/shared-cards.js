/** Public cards used on several pages (premium teacher + class cards). */
import { t, loc, opt } from '../i18n/language.js';
import { esc } from '../utils/dom.js';
import { money, initials } from '../utils/format.js';
import { teacherBadges, starsHtml, socialRow, chipsCell } from '../components/ui.js';

const DOW_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const dayLabel = (weekday) => opt('day', DOW_KEYS[(Number(weekday) || 1) - 1]);
export const hhmm = (s) => {
  const [h, m] = String(s || '').split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${ap}`;
};

export function avatarHtml(name, url, cls = '') {
  return url ? `<img class="avatar ${cls}" src="${esc(url)}" alt="" loading="lazy" width="76" height="76">` : `<span class="avatar ${cls}" aria-hidden="true">${esc(initials(name))}</span>`;
}

export function teacherCard(x) {
  const subjects = (x.subjects || []).map((s) => loc(s, 'name'));
  const rating = x.rating_count ? `<b>${Number(x.rating_avg).toFixed(1)}</b><span>${starsHtml(x.rating_avg)}</span>` : `<b>—</b><span>${esc(t('teachers.noRatings'))}</span>`;
  return `<article class="tcard" data-reveal>
    <div class="tcard-cover"></div>
    <div class="tcard-body">
      <div class="d-flex justify-content-between align-items-end gap-2">${avatarHtml(x.display_name, x.photo_url)}${socialRow(x)}</div>
      <div><h3>${esc(x.display_name)}</h3>${loc(x, 'headline') ? `<p class="headline">${esc(loc(x, 'headline'))}</p>` : ''}</div>
      ${teacherBadges(x)}
      <div class="tcard-stats">
        <div><b>${esc(x.experience_years || 0)}+</b><span>${esc(t('teachers.yearsShort'))}</span></div>
        <div><b>${esc(x.student_count || 0)}</b><span>${esc(t('teachers.students'))}</span></div>
        <div>${rating}</div>
      </div>
      <div>${chipsCell(subjects, { max: 3 })}</div>
      ${(x.specialties || []).length ? `<div class="chip-row">${x.specialties.slice(0, 4).map((s) => `<span class="chip chip-teal">${esc(s)}</span>`).join('')}</div>` : ''}
      <div class="tcard-foot"><a class="btn btn-primary btn-sm flex-grow-1" href="teacher-profile.html?id=${esc(x.id)}"><span>${esc(t('teachers.viewProfile'))}</span><i class="bi bi-arrow-right" aria-hidden="true"></i></a></div>
    </div>
  </article>`;
}

export function classCard(c) {
  const subject = loc({ name_en: c.subject_name_en, name_ta: c.subject_name_ta }, 'name');
  const title = loc(c, 'title') || `${subject} · ${t('common.grade')} ${c.grade}`;
  const slots = (c.slots || []).map((s) => `${dayLabel(s.weekday)} ${hhmm(s.start_time)}–${hhmm(s.end_time)}`);
  const schedule = slots.length ? slots.join(' · ') : loc(c, 'schedule');
  const teachers = (c.teacher_list || []).length ? c.teacher_list : (c.teachers || []).map((n) => ({ name: n }));
  const modeIcon = c.class_mode === 'online' ? 'bi-wifi' : c.class_mode === 'hybrid' ? 'bi-laptop' : 'bi-building';
  return `<article class="ccard" data-reveal>
    ${c.trial_enabled ? `<span class="ribbon"><i class="bi bi-stars me-1" aria-hidden="true"></i>${esc(t('courses.trialBadge'))}</span>` : ''}
    <div class="ccard-top">
      <span class="chip mode ${c.class_mode === 'online' ? 'chip-teal' : 'chip-primary'}"><i class="bi ${modeIcon}" aria-hidden="true"></i>${esc(opt('mode', c.class_mode))}</span>
      <span class="s-ico mt-2"><i class="bi ${esc(c.subject_icon || 'bi-book')}" aria-hidden="true"></i></span>
      <h3>${esc(title)}</h3>
      <div class="chip-row"><span class="chip">${esc(t('common.grade'))} ${esc(c.grade)}</span><span class="chip">${esc(opt('medium', c.medium))}</span>${c.student_count ? `<span class="chip chip-gold"><i class="bi bi-people-fill" aria-hidden="true"></i>${esc(t('courses.joined', { n: c.student_count }))}</span>` : ''}</div>
    </div>
    <div class="ccard-body">
      ${schedule ? `<div class="row-i"><i class="bi bi-clock" aria-hidden="true"></i><span>${esc(schedule)}</span></div>` : ''}
      ${c.location ? `<div class="row-i"><i class="bi bi-geo-alt" aria-hidden="true"></i><span>${esc(c.location)}</span></div>` : ''}
      ${teachers.length ? `<div class="row-i"><i class="bi bi-person-badge" aria-hidden="true"></i><span>${teachers.map((x) => (x.id ? `<a href="teacher-profile.html?id=${esc(x.id)}">${esc(x.name)}</a>` : esc(x.name))).join(', ')}</span></div>` : ''}
      <div class="row-i"><i class="bi bi-collection" aria-hidden="true"></i><span>${esc(opt('classType', c.class_type))}</span></div>
    </div>
    <div class="ccard-foot">
      <div class="price">${money(c.rate_per_session).replace('.00', '')} <small>/ ${esc(t('courses.perSession'))}</small></div>
      <div class="btns">
        ${c.trial_enabled ? `<button type="button" class="btn btn-sm btn-accent" data-trial="${esc(c.id)}"><i class="bi bi-stars" aria-hidden="true"></i>${esc(t('courses.joinTrial'))}</button>` : ''}
        <a class="btn btn-sm btn-outline-primary" href="join-class.html?class=${esc(c.id)}">${esc(t('courses.enquire'))}</a>
      </div>
    </div>
  </article>`;
}

export function testimonialCard(r) {
  return `<article class="testi">
    ${starsHtml(r.rating)}
    <blockquote>${esc(r.comment)}</blockquote>
    <div class="who">${avatarHtml(r.reviewer_name)}<div><b>${esc(r.reviewer_name)}</b><span>${esc(t(`review.role.${r.reviewer_role || 'student'}`))}${r.grade ? ` · ${esc(t('common.grade'))} ${esc(r.grade)}` : ''}${r.teacher_name ? ` · ${esc(r.teacher_name)}` : ''}</span></div></div>
    <span class="verified-tick"><i class="bi bi-patch-check-fill" aria-hidden="true"></i>${esc(t('review.verified'))}</span>
  </article>`;
}
