/** Teacher reviews — approved reviews only (pending ones are verified by the admin first). */
import { initAdminPage } from '../../components/admin-shell.js';
import { api } from '../../services/api.js';
import { esc } from '../../utils/dom.js';
import { fmtDate, humanize } from '../../utils/format.js';
import { starsHtml } from '../../components/ui.js';
import { href } from '../../components/common.js';
import { loadTeacherCtx, notLinkedHtml } from './teacher-common.js';
import { toastError } from '../../components/toast.js';

const { content, profile } = await initAdminPage({ page: 'reviews', title: 'Reviews', area: 'teacher' });
const T = await loadTeacherCtx(profile);
if (!T.teacher) content.innerHTML = notLinkedHtml();
else {
  const rows = await api.rpc('get_my_reviews').catch((e) => { toastError(e); return []; });
  const avg = rows.length ? rows.reduce((a, r) => a + r.rating, 0) / rows.length : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => [n, rows.filter((r) => r.rating === n).length]);
  content.innerHTML = `<div class="row g-4"><div class="col-lg-4"><div class="m-card text-center"><div class="display-5 fw-bold">${avg ? avg.toFixed(1) : '—'}</div><div class="my-2">${starsHtml(Math.round(avg))}</div><p class="small text-muted">${rows.length} approved review(s)</p>
      <div class="rating-bars text-start">${dist.map(([n, c]) => `<div class="rb"><span>${n} <i class="bi bi-star-fill text-warning" aria-hidden="true"></i></span><span class="bar"><span style="width:${rows.length ? (c / rows.length) * 100 : 0}%"></span></span><span class="text-end">${c}</span></div>`).join('')}</div>
      <a class="btn btn-outline-primary btn-sm mt-3" href="${href(`teacher-profile.html?id=${encodeURIComponent(T.teacher.id)}`)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>See my public profile</a>
      <p class="small text-muted mt-3 mb-0">Reviews are checked by the admin before they appear. You cannot edit or remove reviews — ask the admin if one is unfair.</p></div></div>
    <div class="col-lg-8">${rows.length ? rows.map((r) => `<div class="m-card mb-3"><div class="d-flex justify-content-between flex-wrap gap-2"><div><b>${esc(r.reviewer_name)}</b> <span class="small text-muted">· ${esc(humanize(r.reviewer_role || 'student'))}${r.grade ? ` · Grade ${esc(r.grade)}` : ''}</span></div>${starsHtml(r.rating)}</div><p class="mt-2 mb-1">"${esc(r.comment)}"</p><span class="small text-muted">${fmtDate(r.created_at)}</span></div>`).join('') : '<div class="m-card"><div class="empty-state"><i class="bi bi-star" aria-hidden="true"></i><h3>No reviews yet</h3><p>Students and parents can review you on your public profile page.</p></div></div>'}</div></div>`;
}
