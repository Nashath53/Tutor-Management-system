import { initAdminPage } from '../../components/admin-shell.js';
import { createCrud, openFormModal } from '../../components/crud.js';
import { listEnquiries, updateEnquiry, convertEnquiry } from '../../services/enquiry.service.js';
import { lookups, classLabel, opts, phoneLink } from './admin-common.js';
import { esc } from '../../utils/dom.js';
import { fmtDateTime, badge, humanize } from '../../utils/format.js';
import { waLink, openWhatsApp } from '../../utils/whatsapp.js';
import { showToast } from '../../components/toast.js';
import { openModal } from '../../components/modal.js';
import { initials } from '../../utils/format.js';

const { content } = await initAdminPage({ page: 'enquiries', title: 'Student enquiries' });
let L;
const STATUSES = ['new', 'contacted', 'trial', 'converted', 'closed'];
const ICON = { new: 'bi-envelope-paper', contacted: 'bi-telephone', trial: 'bi-stars', converted: 'bi-patch-check', closed: 'bi-archive' };
const ago = (iso) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

createCrud(content, {
  intro: 'Enquiries from the website. "WhatsApp opened" only means the visitor opened WhatsApp — it is <b>not</b> proof that a message was sent. Convert an enquiry to create the student record (MA-xxxx) and an enrolment.',
  load: async () => { L = await lookups('classes', 'subjects'); return listEnquiries(); },
  singular: 'enquiry', canCreate: false, searchKeys: ['student_name', 'phone', 'guardian_name', 'subject_name'],
  tabs: { items: [{ value: 'all', label: 'All', icon: 'bi-inbox' }, ...STATUSES.map((st) => ({ value: st, label: humanize(st), icon: ICON[st], test: (r) => r.status === st }))], initial: 'new' },
  filters: [{ name: 'class_type', label: 'Type', options: opts(['free_trial', 'group', 'individual', 'revision', 'paper_class']) }],
  searchPlaceholder: 'Search name, phone, subject…',
  onRowClick: (r) => details(r),
  card: (r, i, ui) => `<article class="ent-card enq-card s-${esc(r.status)}">
    <div class="ec-head"><span class="avatar">${esc(initials(r.student_name))}</span><div><h3 class="ec-title">${esc(r.student_name)}</h3><div class="ec-sub">${esc(ago(r.created_at))}${r.guardian_name ? ` · ${esc(r.guardian_name)}` : ''}</div></div><div class="ec-menu">${ui.menu}</div></div>
    <div class="ec-tags">${badge(r.status)}<span class="chip chip-primary">${esc(r.subject_name || 'Any subject')}</span><span class="chip">G${esc(r.grade || '?')}</span><span class="chip chip-teal">${esc(humanize(r.class_type))}</span>${r.whatsapp_opened_at ? '<span class="chip" title="Visitor opened WhatsApp. This is not proof a message was sent."><i class="bi bi-whatsapp"></i>Opened</span>' : ''}</div>
    ${r.requirements ? `<p class="small text-muted m-0 line-clamp-2">${esc(r.requirements)}</p>` : ''}
    <div class="ec-foot"><a class="btn btn-sm btn-ghost" href="tel:+${esc(r.phone)}"><i class="bi bi-telephone" aria-hidden="true"></i>Call</a>${ui.primary}${ui.edit}<button type="button" class="btn btn-sm btn-ghost ms-auto" data-act="${i}:0"><i class="bi bi-eye" aria-hidden="true"></i>Details</button></div></article>`,
  defaultView: 'cards',
  initialFilters: {},
  columns: [
    { label: 'Received', render: (r) => `<span class="small">${fmtDateTime(r.created_at)}</span>` },
    { label: 'Student', render: (r) => `<b>${esc(r.student_name)}</b><div class="small text-muted">${esc(r.guardian_name || '')}</div>` },
    { label: 'Phone', render: (r) => phoneLink(r.phone) },
    { label: 'Interest', render: (r) => `${esc(r.subject_name || '—')}<div class="small text-muted">G${esc(r.grade || '?')} · ${esc(humanize(r.medium))} · ${esc(humanize(r.class_mode))}</div>` },
    { label: 'Type', render: (r) => esc(humanize(r.class_type)) },
    { label: 'WhatsApp', render: (r) => (r.whatsapp_opened_at ? '<span class="small text-muted">Opened</span>' : '<span class="small text-muted">—</span>') },
    { label: 'Status', render: (r) => badge(r.status) }
  ],
  fields: [
    { name: 'status', label: 'Status', type: 'select', options: opts(STATUSES), placeholder: false },
    { name: 'admin_notes', label: 'Admin notes', type: 'textarea', col: 'col-12' }
  ],
  save: (v, row) => updateEnquiry(row.id, v),
  primaryAction: (r) => (r.student_id ? null : { label: 'Convert', onClick: ({ reload }) => convert(r, reload) }),
  rowActions: (r) => [
    { label: 'View details', icon: 'bi-eye', onClick: () => details(r) },
    { label: 'Reply on WhatsApp', icon: 'bi-whatsapp', onClick: () => openWhatsApp(waLink(r.whatsapp || r.phone, `Hello ${r.guardian_name || r.student_name}, this is Mentora Learning Centre regarding your enquiry for ${r.subject_name || 'classes'}.`)) }
  ]
});

function details(r) {
  openModal({ title: r.student_name, body: `<dl class="kv">
    <dt>Guardian</dt><dd>${esc(r.guardian_name || '—')}</dd><dt>Phone</dt><dd>${phoneLink(r.phone)}</dd><dt>WhatsApp</dt><dd>${phoneLink(r.whatsapp)}</dd><dt>Email</dt><dd>${esc(r.email || '—')}</dd>
    <dt>Subject</dt><dd>${esc(r.subject_name || '—')}</dd><dt>Grade</dt><dd>${esc(r.grade || '—')}</dd><dt>Medium / mode</dt><dd>${esc(humanize(r.medium))} · ${esc(humanize(r.class_mode))}</dd>
    <dt>Class type</dt><dd>${esc(humanize(r.class_type))}</dd><dt>Preferred start</dt><dd>${esc(r.preferred_join_date || '—')}</dd>
    <dt>Heard about us</dt><dd>${esc((r.referral_sources || []).map(humanize).join(', ') || '—')}${r.referral_note ? ` — ${esc(r.referral_note)}` : ''}</dd>
    <dt>Requirements</dt><dd style="white-space:pre-line">${esc(r.requirements || '—')}</dd><dt>Consent</dt><dd>${r.consent ? 'Yes' : 'No'}</dd>
    <dt>Language</dt><dd>${r.language === 'ta' ? 'Tamil' : 'English'}</dd><dt>Admin notes</dt><dd style="white-space:pre-line">${esc(r.admin_notes || '—')}</dd></dl>` });
}

function convert(r, reload) {
  const match = L.classes.filter((c) => c.is_active && (!r.subject_id || c.subject_id === r.subject_id));
  const list = match.length ? match : L.classes.filter((c) => c.is_active);
  openFormModal({
    title: `Convert ${r.student_name}`, size: '', submitLabel: 'Create student & enrolment',
    fields: [
      { name: 'class_id', label: 'Class', type: 'select', required: true, col: 'col-12', default: r.class_id, options: list.map((c) => ({ value: c.id, label: classLabel(c) })) },
      { name: 'as_trial', label: 'Start with free trial sessions', type: 'checkbox', col: 'col-12', default: r.class_type === 'free_trial' }
    ],
    onSave: async (v) => {
      const res = await convertEnquiry(r.id, v.class_id, v.as_trial);
      showToast(`Student created · enrolment ${res.enrollment_code}`, 'success');
      reload();
    }
  });
}
