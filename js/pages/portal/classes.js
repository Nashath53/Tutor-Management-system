import { initPortalPage } from '../../components/portal-shell.js';
import { href } from '../../components/common.js';
import { loadMyData, classTitle } from './portal-data.js';
import { requestAdmission, paymentStatus } from '../../services/enrollment.service.js';
import { getClassPrivate } from '../../services/class.service.js';
import { getSettings } from '../../services/settings.service.js';
import { t, loc, onLanguageChange } from '../../i18n/language.js';
import { esc } from '../../utils/dom.js';
import { money, fmtDate, badge } from '../../utils/format.js';
import { confirmDialog } from '../../components/modal.js';
import { showToast, toastError } from '../../components/toast.js';
import { dayLabel, hhmm } from '../shared-cards.js';
import { mountPolls } from './poll-card.js';

const { student, content } = await initPortalPage('classes');
const settings = await getSettings();
let data, privates = new Map(), statuses = new Map();

function card(e) {
  const c = data.classById.get(e.class_id);
  const limit = Number(settings.trial.sessions || 2);
  const priv = privates.get(e.class_id);
  const ps = statuses.get(e.id);
  let body = '';
  if (['trial', 'trial_completed'].includes(e.status)) {
    const used = Number(e.trial_sessions_used || 0);
    body = `<div><div class="d-flex justify-content-between small mb-1"><span>${esc(t('portal.trialUsed'))}</span><b>${used} / ${limit}</b></div>
      <div class="m-progress"><span style="width:${Math.min(100, (used / limit) * 100)}%"></span></div></div>
      ${c?.trial_group_link ? `<a class="btn btn-sm btn-ghost" href="${esc(c.trial_group_link)}" target="_blank" rel="noopener"><i class="bi bi-people me-1" aria-hidden="true"></i>${esc(t('portal.trialGroup'))}</a>` : ''}
      ${e.status === 'trial_completed' ? `<p class="small text-muted m-0">${esc(t('portal.trialDone', { fee: settings.admission_fee.enabled ? money(settings.admission_fee.amount) : t('portal.noFee') }))}</p>
        <button type="button" class="btn btn-primary" data-request="${esc(e.id)}">${esc(t('portal.requestAdmission'))}</button>` : `<p class="small text-muted m-0">${esc(t('portal.trialInfo'))}</p>`}`;
  } else if (e.status === 'admission_requested') {
    body = `<p class="small m-0">${esc(t('portal.awaitingApproval'))}</p>
      ${ps ? `<div><div class="d-flex justify-content-between small mb-1"><span>${esc(t('portal.verifiedPaid'))}</span><b>${money(ps.paid)} / ${money(ps.required)}</b></div>
      <div class="m-progress"><span style="width:${ps.required > 0 ? Math.min(100, (ps.paid / ps.required) * 100) : 100}%"></span></div>
      <div class="small text-muted mt-1">${esc(t('portal.minPayment', { pct: ps.min_payment_percent }))}</div></div>` : ''}
      <a class="btn btn-primary" href="${href('portal/fees.html?pay=1')}"><i class="bi bi-bank me-1" aria-hidden="true"></i>${esc(t('portal.payNow'))}</a>`;
  } else if (e.status === 'approved') {
    body = `<div class="small text-muted">${esc(t('portal.paidFrom'))}: <b class="text-body">${fmtDate(e.paid_from_date)}</b></div>
      <div class="d-flex flex-wrap gap-2">
      ${priv?.paid_group_link ? `<a class="btn btn-sm btn-whatsapp" href="${esc(priv.paid_group_link)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp me-1" aria-hidden="true"></i>${esc(t('portal.classGroup'))}</a>` : ''}
      ${priv?.online_meeting_link ? `<a class="btn btn-sm btn-primary" href="${esc(priv.online_meeting_link)}" target="_blank" rel="noopener"><i class="bi bi-camera-video me-1" aria-hidden="true"></i>${esc(t('portal.joinOnline'))}</a>` : ''}
      <a class="btn btn-sm btn-ghost" href="${href('portal/recordings.html')}"><i class="bi bi-play-btn me-1" aria-hidden="true"></i>${esc(t('portal.nav.recordings'))}</a></div>`;
  } else {
    body = `<p class="small text-muted m-0">${esc(t('portal.inactive'))}</p>`;
  }
  return `<div class="col-12 col-md-6"><div class="enrol-card h-100">
    <div class="d-flex justify-content-between gap-2"><span class="code small">${esc(e.enrollment_code)}</span>${badge(e.status)}</div>
    <h3>${esc(classTitle(c))}</h3>
    ${c ? `${(c.slots || []).length ? `<div class="sched">${c.slots.map((s) => `<span class="chip chip-teal"><i class="bi bi-clock" aria-hidden="true"></i>${esc(dayLabel(s.weekday))} ${esc(hhmm(s.start_time))}–${esc(hhmm(s.end_time))}</span>`).join('')}</div>` : `<div class="small text-muted"><i class="bi bi-clock me-1" aria-hidden="true"></i>${esc(loc(c, 'schedule'))}</div>`}
      ${c.location ? `<div class="small text-muted"><i class="bi bi-geo-alt me-1" aria-hidden="true"></i>${esc(c.location)}</div>` : ''}
      ${(c.teacher_list || []).length ? `<div class="small text-muted"><i class="bi bi-person-badge me-1" aria-hidden="true"></i>${c.teacher_list.map((x) => `<a href="${href(`teacher-profile.html?id=${x.id}`)}">${esc(x.name)}</a>`).join(', ')}</div>` : ''}
      <div class="small text-muted">${money(c.rate_per_session)} / ${esc(t('courses.perSession'))}</div>` : ''}
    ${body}</div></div>`;
}

function render() {
  content.innerHTML = `<h1 class="portal-title">${esc(t('portal.nav.classes'))}</h1><p class="portal-sub">${esc(t('portal.classesSub'))}</p><div id="pollMount" class="mb-4" hidden></div>
    ${data.enrollments.length ? `<div class="row g-4">${data.enrollments.map(card).join('')}</div>`
      : `<div class="m-card empty-state"><i class="bi bi-easel" aria-hidden="true"></i><h3>${esc(t('portal.noClassesTitle'))}</h3><p>${esc(t('portal.noClasses'))}</p><a class="btn btn-primary mt-3" href="${href('courses.html')}">${esc(t('nav.courses'))}</a></div>`}`;
  mountPolls(document.getElementById('pollMount'));
}

content.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-request]');
  if (!b) return;
  const ok = await confirmDialog({ title: t('portal.requestAdmission'), message: t('portal.requestConfirm'), confirmLabel: t('portal.requestAdmission') });
  if (!ok) return;
  try { await requestAdmission(b.dataset.request); showToast(t('portal.requestSent'), 'success'); await load(); } catch (e) { toastError(e); }
});

async function load() {
  data = await loadMyData(student.id);
  const approved = data.enrollments.filter((e) => e.status === 'approved');
  const pendingAdm = data.enrollments.filter((e) => e.status === 'admission_requested');
  const [privs, sts] = await Promise.all([
    Promise.all(approved.map((e) => getClassPrivate(e.class_id).catch(() => null))),
    Promise.all(pendingAdm.map((e) => paymentStatus(e.id).catch(() => null)))
  ]);
  privates = new Map(privs.filter(Boolean).map((p) => [p.class_id, p]));
  statuses = new Map(pendingAdm.map((e, i) => [e.id, sts[i]]));
  render();
}
try { await load(); } catch (e) { toastError(e); }
onLanguageChange(() => data && render());
