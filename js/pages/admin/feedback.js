/**
 * Feedback & reviews:
 *  - Reviews & testimonials: nothing appears on the website until an admin approves it.
 *    Use the private phone number to verify the reviewer is a real student/parent.
 *  - Survey insights: answers from the "Help us improve" form, with charts.
 *  - Complaints: track each complaint from new → resolved.
 */
import { initAdminPage } from '../../components/admin-shell.js';
import { createCrud, openFormModal } from '../../components/crud.js';
import { api } from '../../services/api.js';
import { lookups, teacherLabel, tabs, phoneLink, kpiCard, downloadCsv } from './admin-common.js';
import { esc, qs } from '../../utils/dom.js';
import { fmtDate, fmtDateTime, humanize, badge } from '../../utils/format.js';
import { confirmDialog } from '../../components/modal.js';
import { showToast, toastError } from '../../components/toast.js';
import { starsHtml, openDrawer } from '../../components/ui.js';
import { barChart, donutChart } from '../../components/charts.js';

const { content } = await initAdminPage({ page: 'feedback', title: 'Feedback & reviews' });
const L = await lookups('teachers');
content.innerHTML = '<div id="tabs" class="mb-3"></div><div id="panel"></div>';
const panel = () => content.querySelector('#panel');

async function reviewAct(r, action, reload) {
  let note = null;
  if (action === 'reject') { note = await confirmDialog({ title: 'Reject review', message: 'It will not be shown publicly.', reason: true, reasonLabel: 'Internal note (optional)', danger: true, confirmLabel: 'Reject' }); if (note == null) return; }
  if (action === 'delete' && await confirmDialog({ title: 'Delete review', message: 'Delete this review permanently?', danger: true, confirmLabel: 'Delete' }) == null) return;
  try { await api.rpc('review_content', { p_table: 'reviews', p_id: r.id, p_action: action, p_note: note || null }); showToast('Done', 'success'); reload(); } catch (e) { toastError(e); }
}

const views = {
  reviews: () => createCrud(panel(), {
    intro: 'Reviews about teachers and testimonials about Mentora. <b>Only approved reviews are public.</b> The reviewer\'s phone is private — call or WhatsApp to verify before approving. Featured testimonials appear on the home page.',
    load: () => api.select('reviews', { order: ['created_at', 'desc'] }), searchKeys: ['reviewer_name', 'comment', (r) => teacherLabel(L.teachersById.get(r.teacher_id))],
    tabs: { items: [
      { value: 'pending', label: 'Awaiting approval', icon: 'bi-hourglass-split', test: (r) => r.status === 'pending' },
      { value: 'approved', label: 'Approved', icon: 'bi-patch-check', test: (r) => r.status === 'approved' },
      { value: 'featured', label: 'Featured', icon: 'bi-star', test: (r) => r.is_featured },
      { value: 'rejected', label: 'Rejected', test: (r) => r.status === 'rejected' }, { value: 'all', label: 'All' }] },
    filters: [{ name: 'about', label: 'About', options: [{ value: 'mentora', label: 'Mentora (testimonial)' }, ...L.teachers.map((t) => ({ value: t.id, label: teacherLabel(t) }))], test: (r, v) => (v === 'mentora' ? !r.teacher_id : r.teacher_id === v) },
      { name: 'rating', label: 'Rating', options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} stars` })), test: (r, v) => String(r.rating) === v }],
    card: (r, i, ui) => `<article class="ent-card review-admin ${r.status === 'rejected' ? 'is-muted' : ''}"><div class="ec-head"><span class="avatar-sm">${esc((r.reviewer_name || '?')[0])}</span><div class="min-w-0"><h3 class="ec-title">${esc(r.reviewer_name)}</h3><div class="ec-sub">${esc(humanize(r.reviewer_role))}${r.grade ? ` · Grade ${esc(r.grade)}` : ''}</div></div>${ui.menu}</div>
      <div class="d-flex align-items-center gap-2">${starsHtml(r.rating)}<span class="small text-muted">${fmtDate(r.created_at)}</span></div>
      <blockquote class="small m-0">"${esc(r.comment)}"</blockquote>
      <div class="ec-tags"><span class="chip ${r.teacher_id ? 'chip-primary' : 'chip-teal'}">${r.teacher_id ? esc(teacherLabel(L.teachersById.get(r.teacher_id))) : 'About Mentora'}</span>${r.is_featured ? '<span class="chip chip-gold"><i class="bi bi-star-fill" aria-hidden="true"></i> Featured</span>' : ''}</div>
      <div class="small">${r.phone ? `<i class="bi bi-shield-lock text-muted" aria-hidden="true"></i> Verify: ${phoneLink(r.phone)}` : '<span class="text-muted">No phone given — verify another way</span>'}</div>
      <div class="ec-foot">${badge(r.status)}<span class="ms-auto">${ui.primary}</span></div></article>`,
    columns: [
      { label: 'Reviewer', render: (r) => `<b>${esc(r.reviewer_name)}</b><div class="small text-muted">${esc(humanize(r.reviewer_role))}</div>` },
      { label: 'About', render: (r) => (r.teacher_id ? esc(teacherLabel(L.teachersById.get(r.teacher_id))) : 'Mentora') },
      { label: 'Rating', sort: (r) => r.rating, render: (r) => starsHtml(r.rating) },
      { label: 'Comment', render: (r) => `<span class="small line-clamp-2">${esc(r.comment)}</span>` },
      { label: 'Status', render: (r) => badge(r.status) + (r.is_featured ? ' <span class="chip chip-gold">Featured</span>' : '') }
    ],
    primaryAction: (r) => (r.status === 'pending' ? { label: 'Approve', icon: 'bi-check-lg', class: 'btn-primary', onClick: ({ reload }) => reviewAct(r, 'approve', reload) } : null),
    rowActions: (r) => [
      r.status !== 'approved' && { label: 'Approve', icon: 'bi-check2-circle', onClick: ({ reload }) => reviewAct(r, 'approve', reload) },
      r.status !== 'rejected' && { label: 'Reject / hide', icon: 'bi-eye-slash', onClick: ({ reload }) => reviewAct(r, 'reject', reload) },
      r.status === 'approved' && { label: r.is_featured ? 'Remove from home page' : 'Feature on home page', icon: 'bi-star', onClick: async ({ reload }) => { try { await api.update('reviews', r.id, { is_featured: !r.is_featured }); reload(); } catch (e) { toastError(e); } } },
      { divider: true },
      { label: 'Delete', icon: 'bi-trash', danger: true, onClick: ({ reload }) => reviewAct(r, 'delete', reload) }
    ]
  }),

  survey: async () => {
    const rows = await api.select('audience_feedback', { order: ['created_at', 'desc'] });
    const NEEDS = ['past_papers', 'model_papers', 'revision', 'recordings', 'online', 'new_subjects', 'exam_tips', 'career'];
    const needCount = NEEDS.map((n) => [n, rows.filter((r) => (r.needs || []).includes(n)).length]).sort((a, b) => b[1] - a[1]);
    const rated = rows.filter((r) => r.rating); const avg = rated.length ? rated.reduce((a, r) => a + r.rating, 0) / rated.length : 0;
    const roles = ['student', 'parent', 'teacher', 'other'].map((x) => ({ label: humanize(x), value: rows.filter((r) => r.role === x).length }));
    panel().innerHTML = `<p class="page-intro">Answers from the "Help us improve" survey on the website. Use them to plan new papers, classes and services.</p>
      <div class="kpi-grid kpi-row-4 mb-4">${[kpiCard('bi-ui-checks', 'Responses', String(rows.length), `${rows.filter((r) => r.status === 'new').length} new`, 'accent'),
        kpiCard('bi-star-half', 'Average rating', avg ? avg.toFixed(1) : '—', `${rated.length} rated`, 't-gold'),
        kpiCard('bi-lightbulb', 'Ideas shared', String(rows.filter((r) => r.ideas).length), 'Free-text ideas', 't-teal'),
        kpiCard('bi-telephone', 'Want a reply', String(rows.filter((r) => r.contact).length), 'Left contact details', 't-green')].join('')}</div>
      <div class="row g-4 mb-4"><div class="col-lg-7"><div class="m-card h-100"><div class="card-head"><h2>What people need most</h2></div><div id="sv1"></div></div></div>
        <div class="col-lg-5"><div class="m-card h-100"><div class="card-head"><h2>Who answered</h2></div><div id="sv2"></div></div></div></div>
      <div class="m-card"><div class="card-head"><h2>Responses</h2><button type="button" class="btn btn-ghost btn-sm" id="svCsv"><i class="bi bi-download" aria-hidden="true"></i>CSV</button></div>
        ${rows.length ? rows.map((r) => `<div class="req-item ${r.status === 'new' ? 'is-new' : ''}"><span class="ri-ico"><i class="bi bi-chat-square-quote" aria-hidden="true"></i></span><div class="min-w-0"><b>${esc(r.name || 'Anonymous')}</b> <span class="small text-muted">· ${esc(humanize(r.role || 'other'))}${r.grade ? ` · Grade ${esc(r.grade)}` : ''} · ${fmtDate(r.created_at)}</span> ${r.rating ? starsHtml(r.rating) : ''}
          <div class="ec-tags mt-1">${(r.needs || []).map((n) => `<span class="chip chip-teal">${esc(humanize(n))}</span>`).join('')}</div>
          ${r.improve ? `<div class="small mt-1"><b>Improve:</b> ${esc(r.improve)}</div>` : ''}${r.ideas ? `<div class="small"><b>Ideas:</b> ${esc(r.ideas)}</div>` : ''}${r.contact ? `<div class="small text-muted"><i class="bi bi-telephone" aria-hidden="true"></i> ${esc(r.contact)}</div>` : ''}</div>
          <div class="ri-actions">${r.status === 'new' ? `<button type="button" class="btn btn-sm btn-ghost" data-rev="${esc(r.id)}"><i class="bi bi-check2" aria-hidden="true"></i>Mark reviewed</button>` : '<span class="badge-status s-approved">Reviewed</span>'}</div></div>`).join('') : '<div class="empty-state"><i class="bi bi-inbox" aria-hidden="true"></i><p>No survey answers yet. Share the website link to start collecting them.</p></div>'}</div>`;
    barChart(panel().querySelector('#sv1'), { labels: needCount.map(([n]) => humanize(n)), series: [{ name: 'Votes', data: needCount.map(([, v]) => v), color: '#06B6D4' }], height: 230 });
    donutChart(panel().querySelector('#sv2'), { items: roles, centerSub: 'people' });
    panel().querySelector('#svCsv').addEventListener('click', () => downloadCsv('mentora-survey.csv', rows.map((r) => ({ date: r.created_at, name: r.name, role: r.role, grade: r.grade, rating: r.rating, needs: (r.needs || []).join('; '), improve: r.improve, ideas: r.ideas }))));
    panel().querySelectorAll('[data-rev]').forEach((b) => b.addEventListener('click', async () => { try { await api.update('audience_feedback', b.dataset.rev, { status: 'reviewed' }); views.survey(); } catch (e) { toastError(e); } }));
  },

  complaints: () => createCrud(panel(), {
    intro: 'Complaints from the Contact page. Reply within 2 working days, note what you did, and mark it resolved. The person can quote their reference number (MC-…) when they call.',
    load: () => api.select('complaints', { order: ['created_at', 'desc'] }), searchKeys: ['reference_no', 'name', 'subject', 'phone'],
    tabs: { items: [{ value: 'open', label: 'Open', icon: 'bi-exclamation-circle', test: (r) => ['new', 'in_progress'].includes(r.status) }, { value: 'resolved', label: 'Resolved', icon: 'bi-check2-circle', test: (r) => ['resolved', 'closed'].includes(r.status) }, { value: 'all', label: 'All' }] },
    filters: [{ name: 'category', label: 'Category', options: ['teaching', 'fees', 'facility', 'staff', 'online', 'other'].map((c) => ({ value: c, label: humanize(c) })) }],
    onRowClick: (r, ctx) => details(r, ctx),
    columns: [
      { label: 'Reference', sort: (r) => r.reference_no, render: (r) => `<span class="code">${esc(r.reference_no)}</span><div class="small text-muted">${fmtDate(r.created_at)}</div>` },
      { label: 'From', render: (r) => `<b>${esc(r.name)}</b><div class="small">${phoneLink(r.phone)}</div>` },
      { label: 'Complaint', render: (r) => `<span class="chip">${esc(humanize(r.category))}</span> <b class="small">${esc(r.subject)}</b><div class="small text-muted line-clamp-2">${esc(r.details)}</div>` },
      { label: 'Status', render: (r) => `<span class="badge-status s-${r.status === 'new' ? 'pending' : r.status === 'in_progress' ? 'trial' : 'approved'}">${esc(humanize(r.status))}</span>` }
    ],
    primaryAction: (r) => ({ label: 'Update', icon: 'bi-pencil', onClick: (ctx) => update(r, ctx) })
  })
};
function details(r, ctx) {
  openDrawer({ title: r.reference_no, html: `<dl class="kv"><dt>From</dt><dd>${esc(r.name)}</dd><dt>Phone</dt><dd>${phoneLink(r.phone)}</dd>${r.email ? `<dt>Email</dt><dd>${esc(r.email)}</dd>` : ''}<dt>Category</dt><dd>${esc(humanize(r.category))}</dd><dt>Received</dt><dd>${fmtDateTime(r.created_at)}</dd><dt>Status</dt><dd>${esc(humanize(r.status))}</dd></dl>
    <h3 class="h6 mt-3">${esc(r.subject)}</h3><p class="small" style="white-space:pre-wrap">${esc(r.details)}</p>${r.admin_notes ? `<div class="notice-box"><i class="bi bi-journal-text" aria-hidden="true"></i><span>${esc(r.admin_notes)}</span></div>` : ''}
    <div class="d-flex gap-2 mt-3"><a class="btn btn-ghost btn-sm" href="https://wa.me/${esc(r.phone)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp" aria-hidden="true"></i>WhatsApp</a><button type="button" class="btn btn-primary btn-sm" data-upd>Update status</button></div>`,
  onMount: (el, close) => el.querySelector('[data-upd]').addEventListener('click', () => { close?.(); update(r, ctx); }) });
}
function update(r, { reload }) {
  openFormModal({ title: `Update ${r.reference_no}`, size: '', row: r, submitLabel: 'Save', fields: [
    { name: 'status', label: 'Status', type: 'select', placeholder: false, col: 'col-12', options: ['new', 'in_progress', 'resolved', 'closed'].map((s) => ({ value: s, label: humanize(s) })) },
    { name: 'admin_notes', label: 'What was done (internal)', type: 'textarea', col: 'col-12' }],
  onSave: async (v) => { await api.update('complaints', r.id, { ...v, resolved_at: ['resolved', 'closed'].includes(v.status) ? r.resolved_at || new Date().toISOString() : null }); showToast('Complaint updated', 'success'); reload(); } });
}

tabs(content.querySelector('#tabs'), [{ id: 'reviews', label: 'Reviews & testimonials' }, { id: 'survey', label: 'Survey insights' }, { id: 'complaints', label: 'Complaints' }], (id) => Promise.resolve(views[id]()).catch(toastError), qs('tab') || undefined);
