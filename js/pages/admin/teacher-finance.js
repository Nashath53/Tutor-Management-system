import { initAdminPage } from '../../components/admin-shell.js';
import { href } from '../../components/common.js';
import { lookups, teacherLabel, classLabel, kpiCard } from './admin-common.js';
import { barChart } from '../../components/charts.js';
import { addMonths, initials } from '../../utils/format.js';
import { getSettings } from '../../services/settings.service.js';
import { api } from '../../services/api.js';
import { esc } from '../../utils/dom.js';
import { money, monthStart, monthLabel } from '../../utils/format.js';
import { toastError } from '../../components/toast.js';

const { content } = await initAdminPage({ page: 'teacher-finance', title: 'Teacher earnings' });
const settings = await getSettings();
const cm = settings.commission, tx = settings.tax;
let month = monthStart();

content.innerHTML = `<p class="page-intro">Live preview of each teacher's share of <b>collected</b> class revenue (verified payments applied to session charges). Admission fees and reversed payments are excluded.
  Commission: <b>${cm.intro_rate}%</b> in the teacher's first eligible month for their first ${cm.intro_student_cap} eligible students, then <b>${cm.standard_rate}%</b>. Commission is Mentora's fee — it is separate from statutory withholding tax${tx.wht_enabled ? ` (WHT ${tx.wht_rate}% above ${money(tx.wht_threshold)}/month is ON)` : ' (WHT is currently OFF in Settings)'}.</p>
  <div class="toolbar"><div class="month-nav"><button type="button" class="btn btn-sm btn-ghost rounded-pill" data-mv="-1" aria-label="Previous month"><i class="bi bi-chevron-left" aria-hidden="true"></i></button><b id="mLabel"></b><button type="button" class="btn btn-sm btn-ghost rounded-pill" data-mv="1" aria-label="Next month"><i class="bi bi-chevron-right" aria-hidden="true"></i></button></div><a class="btn btn-primary ms-auto" href="${href('admin/settlements.html')}"><i class="bi bi-bank me-1" aria-hidden="true"></i>Go to settlements</a></div>
  <div id="out"></div>`;

async function draw() {
  const out = content.querySelector('#out');
  try {
    const [L, allocs, ledger, payments] = await Promise.all([lookups('teachers', 'classes', 'class_teachers'), api.select('payment_allocations'), api.select('fee_ledger', { eq: { entry_type: 'session_charge' } }), api.select('payments', { eq: { status: 'verified' } })]);
    const ledgerById = new Map(ledger.map((l) => [l.id, l])); const payById = new Map(payments.map((p) => [p.id, p]));
    const perClass = new Map();
    allocs.filter((a) => !a.reversed_at).forEach((a) => {
      const l = ledgerById.get(a.ledger_id); const p = payById.get(a.payment_id);
      if (!l || !p || (p.verified_at || p.paid_on).slice(0, 7) !== month.slice(0, 7)) return;
      perClass.set(l.class_id, (perClass.get(l.class_id) || 0) + Number(a.amount));
    });
    const rows = L.teachers.filter((t) => t.status === 'active').map((t) => {
      const cts = L.class_teachers.filter((x) => x.teacher_id === t.id);
      const lines = cts.map((ct) => ({ cls: L.classesById.get(ct.class_id), pct: Number(ct.allocation_percent), collected: perClass.get(ct.class_id) || 0 })).map((x) => ({ ...x, share: Math.round(x.collected * x.pct) / 100 }));
      const share = lines.reduce((s, x) => s + x.share, 0);
      const first = !t.first_eligible_month || t.first_eligible_month.slice(0, 7) === month.slice(0, 7);
      return { t, lines, share, first };
    });
    content.querySelector('#mLabel').textContent = monthLabel(month);
    const rate = (r) => (r.first ? cm.intro_rate : cm.standard_rate);
    const comm = (r) => Math.round(r.share * rate(r)) / 100;
    const tot = rows.reduce((a, r) => a + r.share, 0), totC = rows.reduce((a, r) => a + comm(r), 0);
    const top = [...rows].sort((a, b) => b.share - a.share);
    out.innerHTML = `<div class="kpi-grid kpi-row-4 mb-4">${[
      kpiCard('bi-cash-coin', 'Collected class revenue', money(tot), esc(monthLabel(month)), 'accent'),
      kpiCard('bi-percent', 'Est. Mentora commission', money(totC), `${tot ? ((totC / tot) * 100).toFixed(1) : 0}% effective`, 't-gold'),
      kpiCard('bi-wallet2', 'Est. teacher payouts', money(tot - totC), 'Before WHT', 't-green'),
      kpiCard('bi-person-badge', 'Teachers earning', String(rows.filter((r) => r.share > 0).length), `of ${rows.length} active`, 't-teal')].join('')}</div>
      <div class="m-card mb-4"><div class="card-head"><h2>Teacher share vs commission</h2></div><div id="earnChart"></div></div>
      <div class="ent-grid">${top.map((r) => { const max = Math.max(1, ...r.lines.map((x) => x.share));
        return `<article class="ent-card"><div class="ec-head"><span class="avatar-sm">${esc(initials(teacherLabel(r.t)))}</span><div class="min-w-0"><h3 class="ec-title">${esc(teacherLabel(r.t))}</h3><div class="ec-sub code">${esc(r.t.teacher_code || '')}</div></div><span class="chip ${r.first ? 'chip-gold' : 'chip-primary'}">${rate(r)}%</span></div>
        <div class="ec-meta"><div><b>${money(r.share)}</b><span>Share</span></div><div><b>${money(comm(r))}</b><span>Commission</span></div><div><b>${money(r.share - comm(r))}</b><span>Net (pre-WHT)</span></div></div>
        <div>${r.lines.map((x) => `<div class="earn-line"><span class="text-truncate">${esc(classLabel(x.cls))} · ${x.pct}%</span><b>${money(x.share)}</b><span class="bar"><span style="width:${(x.share / max) * 100}%"></span></span></div>`).join('') || '<span class="small text-muted">No classes assigned</span>'}</div>
        <div class="ec-foot small text-muted">${r.first ? `First eligible month — ${cm.intro_rate}% for first ${cm.intro_student_cap} students` : `Standard ${cm.standard_rate}% commission`}</div></article>`; }).join('')}</div>
      <p class="small text-muted mt-3">Estimates only — the official figures are calculated by the database when you generate a settlement.</p>`;
    barChart(content.querySelector('#earnChart'), { labels: top.map((r) => teacherLabel(r.t).split(' ')[0]), series: [{ name: 'Teacher net', data: top.map((r) => r.share - comm(r)), color: '#10B981' }, { name: 'Commission', data: top.map(comm), color: '#F97316' }], stacked: true, format: money, height: 220 });
  } catch (e) { toastError(e); }
}
content.addEventListener('click', (e) => { const b = e.target.closest('[data-mv]'); if (b) { month = addMonths(month, Number(b.dataset.mv)); draw(); } });
draw();
