/**
 * Public teacher profile (teacher-profile.html?id=...).
 * Data comes from get_public_teacher — a SECURITY DEFINER RPC that only returns
 * public, admin-approved fields (no phone, email, address, CV or bank details).
 */
import { initPublicPage } from '../components/layout.js';
import { api } from '../services/api.js';
import { t, loc, opt, onLanguageChange } from '../i18n/language.js';
import { esc, qs } from '../utils/dom.js';
import { money, fmtDateTime, fmtDate } from '../utils/format.js';
import { teacherBadges, starsHtml, socialRow, ytLiteHtml, safeUrl } from '../components/ui.js';
import { avatarHtml } from './shared-cards.js';
import { openReviewModal } from './public-forms.js';

await initPublicPage('teachers');
const id = qs('id');
let x = null;

function zoomItem(m) {
  const soon = m.starts_at && Date.parse(m.starts_at) - Date.now() < 3 * 3600e3;
  return `<a class="media-item" href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener nofollow">
    <span class="mi-ico k-zoom"><i class="bi bi-camera-video-fill" aria-hidden="true"></i></span>
    <div class="flex-grow-1 min-w-0"><b>${esc(m.title)}</b><span class="sub">${m.starts_at ? esc(fmtDateTime(m.starts_at)) : esc(t('tp.anytime'))}</span></div>
    ${soon ? `<span class="chip chip-accent">${esc(t('tp.startingSoon'))}</span>` : `<span class="chip chip-teal">${esc(t('tp.free'))}</span>`}</a>`;
}

function render() {
  if (!x) {
    document.getElementById('tpHero').innerHTML = `<div class="empty-state text-center py-4"><i class="bi bi-person-x" aria-hidden="true"></i><h1 class="h4">${esc(t('tp.notFound'))}</h1><a class="btn btn-accent mt-3" href="teachers.html">${esc(t('tp.back'))}</a></div>`;
    ['tpAbout', 'tpMedia', 'tpClasses', 'tpRating', 'tpReviews'].forEach((k) => { document.getElementById(k).hidden = true; });
    return;
  }
  document.title = `${x.display_name} — Mentora Learning Centre`;
  const subjects = (x.subjects || []).map((s) => loc(s, 'name'));
  document.getElementById('tpHero').innerHTML = `
    <a class="small text-reset opacity-75 d-inline-flex align-items-center gap-1 mb-3" href="teachers.html"><i class="bi bi-arrow-left" aria-hidden="true"></i>${esc(t('tp.back'))}</a>
    <div class="d-flex flex-wrap gap-4 align-items-center">
      ${avatarHtml(x.display_name, x.photo_url)}
      <div class="flex-grow-1 min-w-0">
        <h1>${esc(x.display_name)}</h1>
        ${loc(x, 'headline') ? `<p class="mb-2">${esc(loc(x, 'headline'))}</p>` : ''}
        ${teacherBadges(x, { limit: 6 })}
      </div>
      <div class="d-grid gap-2">${socialRow(x)}
        <button type="button" class="btn btn-accent" data-review><i class="bi bi-star" aria-hidden="true"></i>${esc(t('tp.rate'))}</button></div>
    </div>
    <div class="tp-kpis">
      <div><b>${esc(x.student_count || 0)}</b><span>${esc(t('tp.studentsJoined'))}</span></div>
      <div><b>${x.rating_count ? Number(x.rating_avg).toFixed(1) : '—'}</b><span>${esc(t('tp.ratingN', { n: x.rating_count || 0 }))}</span></div>
      <div><b>${esc(x.experience_years || 0)}+</b><span>${esc(t('tp.yearsExp'))}</span></div>
      <div><b>${(x.classes || []).length}</b><span>${esc(t('tp.openClasses'))}</span></div>
    </div>`;

  document.getElementById('tpAbout').innerHTML = `<h2 class="h5 mb-3">${esc(t('tp.about'))}</h2>
    ${loc(x, 'bio') ? `<p class="text-muted">${esc(loc(x, 'bio'))}</p>` : ''}
    <div class="row g-3">
      <div class="col-sm-6"><div class="eyebrow mb-2">${esc(t('tp.subjects'))}</div><div class="chip-row">${subjects.map((s) => `<span class="chip chip-primary">${esc(s)}</span>`).join('') || '—'}</div></div>
      <div class="col-sm-6"><div class="eyebrow mb-2">${esc(t('tp.mediums'))}</div><div class="chip-row">${(x.mediums || []).map((m) => `<span class="chip">${esc(opt('medium', m))}</span>`).join('')}${(x.class_modes || []).map((m) => `<span class="chip chip-teal">${esc(opt('mode', m))}</span>`).join('')}</div></div>
      ${(x.specialties || []).length ? `<div class="col-12"><div class="eyebrow mb-2">${esc(t('tp.expertise'))}</div><div class="chip-row">${x.specialties.map((s) => `<span class="chip chip-gold">${esc(s)}</span>`).join('')}</div></div>` : ''}
      ${(x.qualifications || []).length ? `<div class="col-12"><div class="eyebrow mb-2">${esc(t('teachers.verified'))}</div><ul class="qual-list">${x.qualifications.map((q) => `<li><i class="bi bi-patch-check-fill" aria-hidden="true"></i><span>${esc(q.title)}${q.institution ? ` — ${esc(q.institution)}` : ''}${q.year ? ` (${esc(q.year)})` : ''}</span></li>`).join('')}</ul></div>` : ''}
    </div>`;

  const vids = (x.media || []).filter((m) => m.kind === 'youtube');
  const free = (x.media || []).filter((m) => m.kind === 'free_session').sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  document.getElementById('tpMedia').innerHTML = `<h2 class="h5 mb-1">${esc(t('tp.freeTitle'))}</h2><p class="small text-muted mb-3">${esc(t('tp.freeLead'))}</p>
    ${free.length ? `<div class="d-grid gap-2 mb-4">${free.map(zoomItem).join('')}</div>` : `<p class="small text-muted">${esc(t('tp.noFree'))}</p>`}
    <h3 class="h6 mb-3"><i class="bi bi-youtube text-danger me-1" aria-hidden="true"></i>${esc(t('tp.videos'))}</h3>
    ${vids.length ? `<div class="row g-3">${vids.map((v) => `<div class="col-sm-6">${ytLiteHtml(v.url, v.title)}</div>`).join('')}</div>` : `<p class="small text-muted mb-0">${esc(t('tp.noVideos'))}</p>`}`;

  document.getElementById('tpClasses').innerHTML = `<h2 class="h5 mb-3">${esc(t('tp.classes'))}</h2>
    ${(x.classes || []).length ? `<div class="d-grid gap-2">${x.classes.map((c) => `<a class="media-item" href="join-class.html?class=${esc(c.id)}">
      <span class="mi-ico"><i class="bi bi-easel" aria-hidden="true"></i></span>
      <div class="flex-grow-1 min-w-0"><b>${esc(loc(c, 'title'))}</b><span class="sub">${esc(t('common.grade'))} ${esc(c.grade)} · ${esc(opt('medium', c.medium))} · ${esc(opt('mode', c.class_mode))}${loc(c, 'schedule') ? ` · ${esc(loc(c, 'schedule'))}` : ''}</span></div>
      <span class="fw-bold small text-nowrap">${money(c.rate_per_session).replace('.00', '')}</span></a>`).join('')}</div>` : `<p class="small text-muted mb-0">${esc(t('tp.noClasses'))}</p>`}`;

  const total = x.rating_count || 0;
  const bd = x.rating_breakdown || {};
  document.getElementById('tpRating').innerHTML = `<h2 class="h5 mb-3">${esc(t('tp.ratings'))}</h2>
    <div class="d-flex align-items-center gap-3 mb-3"><div class="display-6 fw-bold">${total ? Number(x.rating_avg).toFixed(1) : '—'}</div><div>${starsHtml(x.rating_avg || 0)}<div class="small text-muted">${esc(t('tp.ratingN', { n: total }))}</div></div></div>
    <div class="rating-bars">${[5, 4, 3, 2, 1].map((n) => { const c = bd[n] || 0; const pct = total ? Math.round((c / total) * 100) : 0; return `<div class="rb"><span>${n} ★</span><span class="bar"><span style="width:${pct}%"></span></span><span>${c}</span></div>`; }).join('')}</div>
    <button type="button" class="btn btn-outline-primary w-100 mt-3" data-review><i class="bi bi-pencil-square" aria-hidden="true"></i>${esc(t('tp.writeReview'))}</button>`;

  const rv = x.reviews || [];
  document.getElementById('tpReviews').innerHTML = `<h2 class="h5 mb-3">${esc(t('tp.feedback'))}</h2>
    ${rv.length ? rv.map((r) => `<div class="review"><div class="d-flex justify-content-between gap-2 align-items-center"><b class="small">${esc(r.reviewer_name)}</b>${starsHtml(r.rating)}</div>
      <div class="small text-muted">${esc(t(`review.role.${r.reviewer_role || 'student'}`))}${r.grade ? ` · ${esc(t('common.grade'))} ${esc(r.grade)}` : ''} · ${esc(fmtDate(r.created_at))}</div><p>${esc(r.comment)}</p></div>`).join('') : `<p class="small text-muted mb-0">${esc(t('tp.noReviews'))}</p>`}`;
}

document.addEventListener('click', (e) => { if (e.target.closest('[data-review]') && x) openReviewModal({ teacherId: x.id, teacherName: x.display_name }); });

try { x = id ? await api.rpc('get_public_teacher', { p_teacher_id: id }) : null; } catch (err) { console.warn(err); x = null; }
render();
onLanguageChange(render);
