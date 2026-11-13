/**
 * Notices, recordings, learning resources, community groups and teacher videos.
 * Teachers' submissions arrive as "pending" — approve them here after checking the link.
 */
import { initAdminPage } from '../../components/admin-shell.js';
import { createCrud } from '../../components/crud.js';
import * as K from '../../services/content.service.js';
import { api } from '../../services/api.js';
import { lookups, classLabel, tabs, gradeOpts, teacherLabel } from './admin-common.js';
import { esc, qs } from '../../utils/dom.js';
import { fmtDate, fmtDateTime, humanize } from '../../utils/format.js';
import { confirmDialog } from '../../components/modal.js';
import { showToast, toastError } from '../../components/toast.js';
import { safeUrl, youtubeId } from '../../components/ui.js';

const { content } = await initAdminPage({ page: 'content', title: 'Notices, recordings & resources' });
const L = await lookups('classes', 'subjects', 'teachers');
const counts = await Promise.all(['recordings', 'resources', 'teacher_media'].map((t) => api.select(t).then((r) => r.filter((x) => x.status === 'pending' || x.delete_requested).length).catch(() => 0)));
content.innerHTML = '<div id="tabs" class="mb-3"></div><div id="panel"></div>';
const panel = () => document.getElementById('panel');

const ALL = '__all__';
const classOpts = () => L.classes.map((c) => ({ value: c.id, label: classLabel(c) }));
const subjOpts = () => L.subjects.map((s) => ({ value: s.id, label: s.name_en }));
const isExpired = (r) => r.expires_at && new Date(r.expires_at) < new Date();
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);
const stateChip = (r) => r.delete_requested ? '<span class="badge-status s-rejected">Removal requested</span>'
  : r.status === 'pending' ? '<span class="badge-status s-pending">Awaiting approval</span>'
  : r.status === 'rejected' ? '<span class="badge-status s-rejected">Rejected</span>'
  : isExpired(r) ? '<span class="badge-status s-withdrawn">Expired</span>'
  : r.is_published === false ? '<span class="badge-status s-withdrawn">Hidden</span>' : '<span class="badge-status s-approved">Live</span>';
const linkCell = (u) => { const s = safeUrl(u); return s ? `<a href="${esc(s)}" target="_blank" rel="noopener" class="small text-truncate d-inline-block" style="max-width:220px">${esc(new URL(s).hostname)} <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>` : '—'; };
const expiryCell = (r) => (r.expires_at ? `<span class="${isExpired(r) ? 'text-danger' : ''}">${fmtDate(r.expires_at)}</span>` : '<span class="small text-muted">No deadline</span>');
const statusTabs = [
  { value: 'all', label: 'All' },
  { value: 'review', label: 'Needs review', icon: 'bi-hourglass-split', test: (r) => r.status === 'pending' || r.delete_requested },
  { value: 'live', label: 'Live', icon: 'bi-broadcast', test: (r) => r.status === 'approved' && !isExpired(r) && r.is_published !== false },
  { value: 'expired', label: 'Expired', icon: 'bi-clock-history', test: (r) => isExpired(r) }
];

/** Approve / reject / delete via the audited review_content RPC. */
async function review(table, r, action, reload) {
  let note = '';
  if (action === 'approve' && !r.delete_requested) {
    const ok = await confirmDialog({ title: 'Approve', message: 'Have you opened the link and checked it is correct and safe for students?', confirmLabel: 'Yes, approve' });
    if (ok == null) return;
  } else if (action === 'reject') {
    note = await confirmDialog({ title: 'Reject', message: 'The teacher will see this note.', reason: true, reasonRequired: true, reasonLabel: 'Reason', danger: true, confirmLabel: 'Reject' });
    if (note == null) return;
  } else if (action === 'delete') {
    if (await confirmDialog({ title: 'Delete permanently', message: `Delete "${r.title_en || r.title}"? Students will lose access immediately.`, danger: true, confirmLabel: 'Delete' }) == null) return;
  }
  try { await api.rpc('review_content', { p_table: table, p_id: r.id, p_action: action, p_note: note || null }); showToast('Done', 'success'); reload(); } catch (e) { toastError(e); }
}
const reviewActions = (table, r) => [
  (r.status === 'pending') && { label: 'Approve', icon: 'bi-check2-circle', onClick: ({ reload }) => review(table, r, 'approve', reload) },
  (r.status === 'pending') && { label: 'Reject', icon: 'bi-x-circle', onClick: ({ reload }) => review(table, r, 'reject', reload) },
  r.delete_requested && { label: 'Keep (decline removal)', icon: 'bi-arrow-counterclockwise', onClick: ({ reload }) => review(table, r, 'approve', reload) },
  { label: r.delete_requested ? 'Approve removal (delete)' : 'Delete', icon: 'bi-trash', danger: true, onClick: ({ reload }) => review(table, r, 'delete', reload) }
];
const submitter = (r) => (r.teacher_id ? `<span class="small text-muted">by ${esc(teacherLabel(L.teachersById.get(r.teacher_id)))}</span>` : '');

const views = {
  notices: () => createCrud(panel(), {
    intro: 'Notices appear in the student portal. Choose <b>All students</b> to show a notice to everyone.',
    load: K.listNotices, singular: 'notice', newLabel: 'New notice', searchKeys: ['title_en', 'title_ta', 'body_en'],
    tabs: { items: [{ value: 'all', label: 'All' }, { value: 'pub', label: 'Published', test: (r) => r.is_published }, { value: 'draft', label: 'Drafts', test: (r) => !r.is_published }] },
    card: (r, i, ui) => `<article class="ent-card"><div class="ec-head"><span class="ec-ico"><i class="bi bi-megaphone" aria-hidden="true"></i></span><div class="min-w-0"><h3 class="ec-title">${esc(r.title_en)}</h3><div class="ec-sub" lang="ta">${esc(r.title_ta || '')}</div></div>${ui.menu}</div>
      <p class="small text-muted m-0 line-clamp-2">${esc(r.body_en || '')}</p>
      <div class="ec-tags"><span class="chip chip-teal">${esc(r.class_id ? classLabel(L.classesById.get(r.class_id)) : 'All students')}</span></div>
      <div class="ec-foot">${r.is_published ? `<span class="badge-status s-approved">Published ${fmtDate(r.published_at)}</span>` : '<span class="badge-status s-pending">Draft</span>'}<span class="ms-auto">${ui.edit}</span></div></article>`,
    columns: [
      { label: 'Title', sort: (r) => r.title_en, render: (r) => `<b>${esc(r.title_en)}</b><div class="small text-muted" lang="ta">${esc(r.title_ta || '')}</div>` },
      { label: 'Audience', render: (r) => esc(r.class_id ? classLabel(L.classesById.get(r.class_id)) : 'All students') },
      { label: 'Published', sort: (r) => r.published_at || '', render: (r) => (r.is_published ? fmtDate(r.published_at) : '<span class="badge-status s-pending">Draft</span>') }
    ],
    fields: [
      { name: 'title_en', label: 'Title (English)', required: true }, { name: 'title_ta', label: 'Title (Tamil)' },
      { name: 'body_en', label: 'Message (English)', type: 'textarea', required: true }, { name: 'body_ta', label: 'Message (Tamil)', type: 'textarea' },
      { name: 'class_id', label: 'Audience', type: 'select', options: classOpts, placeholder: 'All students' },
      { name: 'is_published', label: 'Published', type: 'checkbox', default: true }
    ],
    save: (v, row) => K.saveNotice({ ...v, id: row.id }),
    rowActions: (r) => [{ label: 'Delete', icon: 'bi-trash', danger: true, onClick: async ({ reload }) => { if (await confirmDialog({ title: 'Delete notice', message: 'Delete this notice permanently?', danger: true, confirmLabel: 'Delete' }) != null) { try { await K.removeNotice(r.id); reload(); } catch (e) { toastError(e); } } } }]
  }),

  recordings: () => createCrud(panel(), {
    intro: 'Recordings are visible only to students with an <b>approved</b> enrolment. Choose <b>All classes</b> for a lesson every paid student may watch. Leave the deadline empty to keep it until you remove it. Teachers\' uploads wait here for your approval.',
    load: K.listRecordings, singular: 'recording', newLabel: 'New recording', searchKeys: ['title_en', 'topic', (r) => classLabel(L.classesById.get(r.class_id))],
    tabs: { items: statusTabs, initial: counts[0] ? 'review' : 'all' },
    filters: [{ name: 'class_id', label: 'Class', options: () => [{ value: ALL, label: 'All classes (shared)' }, ...classOpts()], test: (r, v) => (v === ALL ? !r.class_id : r.class_id === v) }],
    columns: [
      { label: 'Title', sort: (r) => r.title_en, render: (r) => `<b>${esc(r.title_en)}</b>${r.topic ? `<div class="small text-muted">${esc(r.topic)}</div>` : ''}${submitter(r)}` },
      { label: 'Class', render: (r) => (r.class_id ? esc(classLabel(L.classesById.get(r.class_id))) : '<span class="chip chip-primary">All classes</span>') },
      { label: 'Lesson date', sort: (r) => r.recorded_on || '', render: (r) => fmtDate(r.recorded_on) },
      { label: 'Link', render: (r) => linkCell(r.drive_url) },
      { label: 'Deadline', sort: (r) => r.expires_at || '9999', render: expiryCell },
      { label: 'Status', render: stateChip }
    ],
    fields: [
      { name: 'class_id', label: 'Class', type: 'select', options: () => [{ value: ALL, label: 'All classes — every approved student' }, ...classOpts()], placeholder: false, col: 'col-12' },
      { name: 'title_en', label: 'Title (English)', required: true }, { name: 'title_ta', label: 'Title (Tamil)' },
      { name: 'topic', label: 'Topic', placeholder: 'e.g. Algebra — quadratic equations' },
      { name: 'recorded_on', label: 'Lesson date', type: 'date', required: true },
      { name: 'drive_url', label: 'Recording link (https)', type: 'url', required: true, col: 'col-12', help: 'Google Drive, YouTube (unlisted), OneDrive or Zoom cloud link.' },
      { name: 'expires_at', label: 'Available until (optional)', type: 'datetime-local', help: 'Empty = stays until an admin removes it.' },
      { name: 'is_published', label: 'Visible to students', type: 'checkbox', default: true }
    ],
    save: (v, row) => K.saveRecording({ ...v, id: row.id, class_id: v.class_id === ALL || !v.class_id ? null : v.class_id, expires_at: fromLocal(v.expires_at), status: row.status || 'approved' }),
    rowActions: (r) => reviewActions('recordings', r)
  }),

  resources: () => createCrud(panel(), {
    intro: 'Past papers, model papers, short notes, mind maps and helpful YouTube videos. <b>Free</b> items are open to every signed-in student of that grade/subject; <b>Enrolled</b> items only to students with an approved class.',
    load: () => api.select('resources', { order: ['sort_order', 'asc'] }), singular: 'resource', newLabel: 'New resource', searchKeys: ['title_en', 'topic', 'kind'],
    tabs: { items: statusTabs, initial: counts[1] ? 'review' : 'all' },
    filters: [{ name: 'kind', label: 'Type', options: ['past_paper', 'model_paper', 'short_note', 'mindmap', 'youtube', 'telegram', 'link', 'other'].map((k) => ({ value: k, label: humanize(k) })) },
      { name: 'grade', label: 'Grade', options: gradeOpts }],
    card: (r, i, ui) => { const yt = youtubeId(r.url); return `<article class="ent-card">${yt ? `<img src="https://i.ytimg.com/vi/${esc(yt)}/mqdefault.jpg" alt="" loading="lazy" class="w-100 rounded-3" style="aspect-ratio:16/9;object-fit:cover">` : ''}
      <div class="ec-head"><span class="ec-ico"><i class="bi ${kindIcon(r.kind)}" aria-hidden="true"></i></span><div class="min-w-0"><h3 class="ec-title">${esc(r.title_en)}</h3><div class="ec-sub">${esc(humanize(r.kind))}${r.topic ? ` · ${esc(r.topic)}` : ''}</div></div>${ui.menu}</div>
      <div class="ec-tags">${r.grade ? `<span class="chip chip-teal">G${esc(r.grade)}</span>` : ''}${r.subject_id ? `<span class="chip">${esc(L.subjectsById.get(r.subject_id)?.name_en || '')}</span>` : ''}<span class="chip ${r.access === 'free' ? 'chip-gold' : 'chip-primary'}">${r.access === 'free' ? 'Free' : 'Enrolled only'}</span></div>
      <div class="small">${linkCell(r.url)} ${submitter(r)}</div>
      <div class="ec-foot">${stateChip(r)}<span class="small text-muted">${r.expires_at ? `Until ${fmtDate(r.expires_at)}` : ''}</span><span class="ms-auto">${ui.edit}</span></div></article>`; },
    columns: [
      { label: 'Title', sort: (r) => r.title_en, render: (r) => `<b>${esc(r.title_en)}</b><div class="small text-muted">${esc(humanize(r.kind))}${r.topic ? ` · ${esc(r.topic)}` : ''}</div>${submitter(r)}` },
      { label: 'Audience', render: (r) => `${r.grade ? `G${esc(r.grade)} ` : 'All grades '}${r.subject_id ? esc(L.subjectsById.get(r.subject_id)?.name_en || '') : ''}<div class="small text-muted">${r.access === 'free' ? 'Free' : 'Enrolled only'}</div>` },
      { label: 'Link', render: (r) => linkCell(r.url) },
      { label: 'Deadline', render: expiryCell },
      { label: 'Status', render: stateChip }
    ],
    fields: [
      { name: 'title_en', label: 'Title (English)', required: true }, { name: 'title_ta', label: 'Title (Tamil)' },
      { name: 'kind', label: 'Type', type: 'select', required: true, placeholder: false, options: ['past_paper', 'model_paper', 'short_note', 'mindmap', 'youtube', 'telegram', 'link', 'other'].map((k) => ({ value: k, label: humanize(k) })) },
      { name: 'topic', label: 'Topic' },
      { name: 'url', label: 'Link (https)', type: 'url', required: true, col: 'col-12' },
      { name: 'grade', label: 'Grade', type: 'select', options: gradeOpts, placeholder: 'All grades', col: 'col-md-4' },
      { name: 'subject_id', label: 'Subject', type: 'select', options: subjOpts, placeholder: 'All subjects', col: 'col-md-4' },
      { name: 'access', label: 'Who can open it', type: 'select', placeholder: false, options: [{ value: 'free', label: 'Free — all students' }, { value: 'enrolled', label: 'Enrolled students only' }], col: 'col-md-4' },
      { name: 'class_id', label: 'Only for one class (optional)', type: 'select', options: classOpts, placeholder: '—' },
      { name: 'expires_at', label: 'Available until (optional)', type: 'datetime-local' },
      { name: 'description', label: 'Short description', type: 'textarea', rows: 2, col: 'col-12' },
      { name: 'sort_order', label: 'Order', type: 'number', default: 100, col: 'col-md-4' }
    ],
    save: async (v, row) => { const d = { ...v, expires_at: fromLocal(v.expires_at) }; if (row.id) await api.update('resources', row.id, d); else await api.insert('resources', { ...d, status: 'approved', delete_requested: false }); },
    rowActions: (r) => reviewActions('resources', r)
  }),

  groups: () => createCrud(panel(), {
    intro: 'Official WhatsApp / Telegram / Facebook groups by grade and subject. Students see only the groups for their grade. Use invite links that admins control, and never post personal numbers.',
    load: () => api.select('community_links', { order: ['sort_order', 'asc'] }), singular: 'group', newLabel: 'New group', searchKeys: ['title', 'platform'],
    card: (r, i, ui) => `<article class="ent-card ${r.is_active ? '' : 'is-muted'}"><div class="ec-head"><span class="ec-ico"><i class="bi bi-${r.platform === 'other' ? 'link-45deg' : esc(r.platform)}" aria-hidden="true"></i></span><div class="min-w-0"><h3 class="ec-title">${esc(r.title)}</h3><div class="ec-sub">${esc(humanize(r.platform))}</div></div>${ui.menu}</div>
      <div class="ec-tags"><span class="chip chip-teal">${r.grade ? `Grade ${esc(r.grade)}` : 'All grades'}</span>${r.subject_id ? `<span class="chip">${esc(L.subjectsById.get(r.subject_id)?.name_en || '')}</span>` : ''}</div>
      <div class="small">${linkCell(r.url)}</div><div class="ec-foot">${r.is_active ? '<span class="badge-status s-approved">Active</span>' : '<span class="badge-status s-withdrawn">Hidden</span>'}<span class="ms-auto">${ui.edit}</span></div></article>`,
    columns: [{ label: 'Group', render: (r) => `<b>${esc(r.title)}</b><div class="small text-muted">${esc(humanize(r.platform))}</div>` }, { label: 'Grade', render: (r) => esc(r.grade || 'All') }, { label: 'Link', render: (r) => linkCell(r.url) }, { label: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') }],
    fields: [
      { name: 'title', label: 'Group name', required: true, col: 'col-12' },
      { name: 'platform', label: 'Platform', type: 'select', placeholder: false, options: ['whatsapp', 'telegram', 'facebook', 'youtube', 'other'].map((p) => ({ value: p, label: humanize(p) })) },
      { name: 'url', label: 'Invite link (https)', type: 'url', required: true },
      { name: 'grade', label: 'Grade', type: 'select', options: gradeOpts, placeholder: 'All grades' },
      { name: 'subject_id', label: 'Subject', type: 'select', options: subjOpts, placeholder: 'All subjects' },
      { name: 'sort_order', label: 'Order', type: 'number', default: 100 }, { name: 'is_active', label: 'Show to students', type: 'checkbox', default: true }
    ],
    save: (v, row) => (row.id ? api.update('community_links', row.id, v) : api.insert('community_links', v)),
    rowActions: (r) => [{ label: 'Delete', icon: 'bi-trash', danger: true, onClick: async ({ reload }) => { if (await confirmDialog({ title: 'Delete group link', message: 'Remove this group link?', danger: true, confirmLabel: 'Delete' }) != null) { try { await api.remove('community_links', r.id); reload(); } catch (e) { toastError(e); } } } }]
  }),

  media: () => createCrud(panel(), {
    intro: 'YouTube videos and free Zoom sessions that teachers add to their <b>public</b> profile. Nothing is shown on the website until you approve it.',
    load: () => api.select('teacher_media', { order: ['created_at', 'desc'] }), singular: 'video', searchKeys: ['title', (r) => teacherLabel(L.teachersById.get(r.teacher_id))],
    tabs: { items: [{ value: 'pending', label: 'Awaiting approval', icon: 'bi-hourglass-split', test: (r) => r.status === 'pending' }, { value: 'approved', label: 'Approved', test: (r) => r.status === 'approved' }, { value: 'all', label: 'All' }], initial: counts[2] ? 'pending' : 'all' },
    card: (r, i, ui) => { const yt = youtubeId(r.url); return `<article class="ent-card">${yt ? `<img src="https://i.ytimg.com/vi/${esc(yt)}/mqdefault.jpg" alt="" loading="lazy" class="w-100 rounded-3" style="aspect-ratio:16/9;object-fit:cover">` : ''}<div class="ec-head"><span class="ec-ico"><i class="bi ${r.kind === 'youtube' ? 'bi-youtube' : 'bi-camera-video'}" aria-hidden="true"></i></span><div class="min-w-0"><h3 class="ec-title">${esc(r.title)}</h3><div class="ec-sub">${esc(teacherLabel(L.teachersById.get(r.teacher_id)))}${r.starts_at ? ` · ${fmtDateTime(r.starts_at)}` : ''}</div></div>${ui.menu}</div><div class="small">${linkCell(r.url)}</div><div class="ec-foot">${stateChip(r)}</div></article>`; },
    columns: [{ label: 'Title', render: (r) => `<b>${esc(r.title)}</b><div class="small text-muted">${esc(humanize(r.kind))}</div>` }, { label: 'Teacher', render: (r) => esc(teacherLabel(L.teachersById.get(r.teacher_id))) }, { label: 'Link', render: (r) => linkCell(r.url) }, { label: 'Status', render: stateChip }],
    rowActions: (r) => reviewActions('teacher_media', r)
  })
};
const kindIcon = (k) => ({ past_paper: 'bi-file-earmark-text', model_paper: 'bi-file-earmark-check', short_note: 'bi-journal-text', mindmap: 'bi-diagram-3', youtube: 'bi-youtube', telegram: 'bi-telegram' }[k] || 'bi-link-45deg');

tabs(document.getElementById('tabs'), [
  { id: 'notices', label: 'Notices' }, { id: 'recordings', label: 'Recordings', count: counts[0] }, { id: 'resources', label: 'Resources', count: counts[1] },
  { id: 'groups', label: 'Community groups' }, { id: 'media', label: 'Teacher videos', count: counts[2] }
], (id) => views[id](), qs('tab') || undefined);
