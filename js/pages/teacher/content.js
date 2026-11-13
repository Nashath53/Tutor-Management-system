/**
 * Teacher uploads: recordings, learning resources, and public YouTube / free Zoom links.
 * Everything waits for admin approval. Removing an approved item sends a removal request.
 */
import { initAdminPage } from '../../components/admin-shell.js';
import { createCrud } from '../../components/crud.js';
import { api } from '../../services/api.js';
import { esc, qs } from '../../utils/dom.js';
import { fmtDate, fmtDateTime, humanize } from '../../utils/format.js';
import { confirmDialog } from '../../components/modal.js';
import { showToast, toastError } from '../../components/toast.js';
import { safeUrl, youtubeId } from '../../components/ui.js';
import { tabs, gradeOpts } from '../admin/admin-common.js';
import { loadTeacherCtx, notLinkedHtml, classLabel } from './teacher-common.js';

const { content, profile } = await initAdminPage({ page: 'content', title: 'Recordings & resources', area: 'teacher' });
const T = await loadTeacherCtx(profile);
if (!T.teacher) content.innerHTML = notLinkedHtml();
else {
  const tid = T.teacher.id;
  content.innerHTML = '<div class="notice-box mb-3"><i class="bi bi-shield-check" aria-hidden="true"></i><span>Everything you add is checked by the admin before students see it. Use <b>https</b> links from Google Drive, YouTube, OneDrive, Dropbox, Zoom or Telegram. Never upload personal student information.</span></div><div id="tabs" class="mb-3"></div><div id="panel"></div>';
  const panel = () => content.querySelector('#panel');
  const myClassOpts = () => T.classes.map((c) => ({ value: c.id, label: classLabel(c) }));
  const fromLocal = (v) => (v ? new Date(v).toISOString() : null);
  const chip = (r) => (r.delete_requested ? '<span class="badge-status s-rejected">Removal requested</span>' : r.status === 'pending' ? '<span class="badge-status s-pending">Waiting for approval</span>' : r.status === 'rejected' ? `<span class="badge-status s-rejected">Rejected</span>${r.review_note ? `<div class="small text-muted mt-1">${esc(r.review_note)}</div>` : ''}` : '<span class="badge-status s-approved">Live</span>');
  const link = (u) => { const s = safeUrl(u); return s ? `<a class="small" href="${esc(s)}" target="_blank" rel="noopener">${esc(new URL(s).hostname)} <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>` : '—'; };
  const remove = (table) => (r) => ({ label: r.status === 'approved' ? 'Ask admin to remove' : 'Delete', icon: 'bi-trash', danger: true, onClick: async ({ reload }) => {
    if (r.delete_requested) return showToast('Removal already requested.', 'info');
    if (await confirmDialog({ title: r.status === 'approved' ? 'Request removal' : 'Delete', message: r.status === 'approved' ? 'This item is live. The admin will confirm before it is removed.' : 'Delete this item?', danger: true, confirmLabel: 'Yes' }) == null) return;
    try { const x = await api.rpc('teacher_delete_content', { p_table: table, p_id: r.id }); showToast(x === 'deleted' ? 'Deleted' : 'Removal requested', 'success'); reload(); } catch (e) { toastError(e); }
  } });
  const statusTabs = { items: [{ value: 'all', label: 'All' }, { value: 'pending', label: 'Waiting', icon: 'bi-hourglass-split', test: (r) => r.status === 'pending' || r.delete_requested }, { value: 'live', label: 'Live', icon: 'bi-broadcast', test: (r) => r.status === 'approved' && !r.delete_requested }, { value: 'rejected', label: 'Rejected', test: (r) => r.status === 'rejected' }] };

  const views = {
    recordings: () => createCrud(panel(), {
      load: () => api.select('recordings', { eq: { teacher_id: tid }, order: ['recorded_on', 'desc'] }), singular: 'recording', newLabel: 'Add recording', searchKeys: ['title_en', 'topic'], canEdit: false, tabs: statusTabs,
      columns: [{ label: 'Title', render: (r) => `<b>${esc(r.title_en)}</b>${r.topic ? `<div class="small text-muted">${esc(r.topic)}</div>` : ''}` }, { label: 'Class', render: (r) => esc(classLabel(T.classesById.get(r.class_id))) }, { label: 'Lesson', render: (r) => fmtDate(r.recorded_on) }, { label: 'Link', render: (r) => link(r.drive_url) }, { label: 'Until', render: (r) => (r.expires_at ? fmtDate(r.expires_at) : '<span class="small text-muted">No deadline</span>') }, { label: 'Status', render: chip }],
      fields: [
        { name: 'class_id', label: 'Class', type: 'select', required: true, options: myClassOpts, col: 'col-12' },
        { name: 'title_en', label: 'Title (English)', required: true }, { name: 'title_ta', label: 'Title (Tamil)' },
        { name: 'topic', label: 'Topic' }, { name: 'recorded_on', label: 'Lesson date', type: 'date', required: true },
        { name: 'drive_url', label: 'Recording link (https)', type: 'url', required: true, col: 'col-12' },
        { name: 'expires_at', label: 'Available until (optional)', type: 'datetime-local', help: 'Empty = stays until the admin removes it.' }],
      save: async (v) => { await api.rpc('submit_recording', { p: { ...v, expires_at: fromLocal(v.expires_at) } }); showToast('Sent for approval', 'success'); },
      rowActions: (r) => [remove('recordings')(r)]
    }),
    resources: () => createCrud(panel(), {
      load: () => api.select('resources', { eq: { teacher_id: tid }, order: ['created_at', 'desc'] }), singular: 'resource', newLabel: 'Add resource', searchKeys: ['title_en', 'topic', 'kind'], canEdit: false, tabs: statusTabs,
      columns: [{ label: 'Title', render: (r) => `<b>${esc(r.title_en)}</b><div class="small text-muted">${esc(humanize(r.kind))}${r.topic ? ` · ${esc(r.topic)}` : ''}</div>` }, { label: 'For', render: (r) => `${r.class_id ? esc(classLabel(T.classesById.get(r.class_id))) : `Grade ${esc(r.grade || 'all')}`}<div class="small text-muted">${r.access === 'free' ? 'Free' : 'Enrolled only'}</div>` }, { label: 'Link', render: (r) => link(r.url) }, { label: 'Status', render: chip }],
      fields: [
        { name: 'title_en', label: 'Title (English)', required: true }, { name: 'title_ta', label: 'Title (Tamil)' },
        { name: 'kind', label: 'Type', type: 'select', required: true, placeholder: false, options: ['past_paper', 'model_paper', 'short_note', 'mindmap', 'youtube', 'telegram', 'link'].map((k) => ({ value: k, label: humanize(k) })) },
        { name: 'topic', label: 'Topic' }, { name: 'url', label: 'Link (https)', type: 'url', required: true, col: 'col-12' },
        { name: 'class_id', label: 'Only for my class (optional)', type: 'select', options: myClassOpts, placeholder: '—' },
        { name: 'grade', label: 'Grade', type: 'select', options: gradeOpts, placeholder: 'All grades' },
        { name: 'access', label: 'Who can open it', type: 'select', placeholder: false, options: [{ value: 'enrolled', label: 'Enrolled students only' }, { value: 'free', label: 'Free — all students of that grade' }] },
        { name: 'expires_at', label: 'Available until (optional)', type: 'datetime-local' },
        { name: 'description', label: 'Short description', type: 'textarea', rows: 2, col: 'col-12' }],
      save: async (v) => { await api.rpc('submit_resource', { p: { ...v, subject_id: v.class_id ? T.classesById.get(v.class_id)?.subject_id : null, expires_at: fromLocal(v.expires_at) } }); showToast('Sent for approval', 'success'); },
      rowActions: (r) => [remove('resources')(r)]
    }),
    media: () => createCrud(panel(), {
      intro: 'These appear on your <b>public teacher profile</b> after approval: YouTube lessons and free Zoom/Meet sessions that anyone may join.',
      load: () => api.select('teacher_media', { eq: { teacher_id: tid }, order: ['created_at', 'desc'] }), singular: 'link', newLabel: 'Add video or free session', searchKeys: ['title'], canEdit: false, tabs: statusTabs,
      card: (r, i, ui) => { const yt = youtubeId(r.url); return `<article class="ent-card">${yt ? `<img src="https://i.ytimg.com/vi/${esc(yt)}/mqdefault.jpg" alt="" loading="lazy" class="w-100 rounded-3" style="aspect-ratio:16/9;object-fit:cover">` : ''}<div class="ec-head"><span class="ec-ico"><i class="bi ${r.kind === 'youtube' ? 'bi-youtube' : 'bi-camera-video'}" aria-hidden="true"></i></span><div class="min-w-0"><h3 class="ec-title">${esc(r.title)}</h3><div class="ec-sub">${r.kind === 'youtube' ? 'YouTube video' : `Free session${r.starts_at ? ` · ${fmtDateTime(r.starts_at)}` : ''}`}</div></div>${ui.menu}</div><div>${link(r.url)}</div><div class="ec-foot">${chip(r)}</div></article>`; },
      columns: [{ label: 'Title', render: (r) => `<b>${esc(r.title)}</b>` }, { label: 'Type', render: (r) => esc(humanize(r.kind)) }, { label: 'Link', render: (r) => link(r.url) }, { label: 'Status', render: chip }],
      fields: [
        { name: 'kind', label: 'Type', type: 'select', placeholder: false, options: [{ value: 'youtube', label: 'YouTube video' }, { value: 'free_session', label: 'Free Zoom / Meet session' }], col: 'col-12' },
        { name: 'title', label: 'Title', required: true, col: 'col-12' }, { name: 'url', label: 'Link (https)', type: 'url', required: true, col: 'col-12' },
        { name: 'starts_at', label: 'Session date & time (free sessions)', type: 'datetime-local' }],
      save: async (v) => { await api.rpc('submit_teacher_media', { p: { ...v, starts_at: fromLocal(v.starts_at) } }); showToast('Sent for approval', 'success'); },
      rowActions: (r) => [remove('teacher_media')(r)]
    })
  };
  tabs(content.querySelector('#tabs'), [{ id: 'recordings', label: 'Recordings' }, { id: 'resources', label: 'Papers & notes' }, { id: 'media', label: 'Public videos & free sessions' }], (id) => views[id](), qs('tab') || undefined);
}
