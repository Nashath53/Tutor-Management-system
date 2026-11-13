/**
 * Learning hub: class recordings, free library (by grade/subject/topic), YouTube lessons,
 * papers & notes, and official Mentora community groups.
 * Visibility is enforced by RLS on the server; the filters here only organise what the server returned.
 */
import { initPortalPage } from '../../components/portal-shell.js';
import { loadMyData, classTitle } from './portal-data.js';
import { api } from '../../services/api.js';
import { listSubjects } from '../../services/subject.service.js';
import { t, loc, onLanguageChange } from '../../i18n/language.js';
import { esc, qs } from '../../utils/dom.js';
import { fmtDate } from '../../utils/format.js';
import { toastError } from '../../components/toast.js';
import { ytLiteHtml, youtubeId, safeUrl } from '../../components/ui.js';

const { student, content } = await initPortalPage('recordings');
let data, recs = [], resources = [], groups = [], subjects = [];
let tab = qs('tab') || 'recordings', topic = '', q = '';

const KIND_ICON = { past_paper: ['bi-file-earmark-text', 'k-paper'], model_paper: ['bi-file-earmark-check', 'k-paper'], short_note: ['bi-journal-text', 'k-note'], mindmap: ['bi-diagram-3', 'k-note'], youtube: ['bi-youtube', 'k-youtube'], telegram: ['bi-telegram', 'k-telegram'], link: ['bi-link-45deg', ''], other: ['bi-folder2-open', ''] };
const live = (x) => x.status !== 'rejected' && x.status !== 'pending' && (!x.expires_at || Date.parse(x.expires_at) > Date.now());
const daysLeft = (x) => (x.expires_at ? Math.ceil((Date.parse(x.expires_at) - Date.now()) / 864e5) : null);

function scopeData() {
  const approved = data.enrollments.filter((e) => e.status === 'approved').map((e) => e.class_id);
  const liveIds = data.enrollments.filter((e) => ['trial', 'trial_completed', 'admission_requested', 'approved'].includes(e.status)).map((e) => e.class_id);
  const mySubjects = new Set(liveIds.map((id) => data.classById.get(id)?.subject_id).filter(Boolean));
  const myRecs = recs.filter((r) => r.is_published !== false && live(r) && (r.class_id ? approved.includes(r.class_id) : approved.length > 0));
  const myRes = resources.filter((r) => live(r) && (
    (r.class_id && approved.includes(r.class_id)) ||
    (!r.class_id && r.access === 'free' && (!r.grade || r.grade === student.grade)) ||
    (!r.class_id && r.access === 'enrolled' && approved.length && (!r.subject_id || mySubjects.has(r.subject_id)))));
  const myGroups = groups.filter((g) => g.is_active !== false && (!g.grade || g.grade === student.grade) && (!g.subject_id || mySubjects.has(g.subject_id) || !liveIds.length));
  return { myRecs, myRes, myGroups, hasPaid: approved.length > 0 };
}

const subjName = (id) => { const s = subjects.find((x) => x.id === id); return s ? loc(s, 'name') : ''; };
const match = (x) => !q || `${x.title_en} ${x.title_ta || ''} ${x.topic || ''}`.toLowerCase().includes(q);

function recCard(r) {
  const left = daysLeft(r);
  const yt = youtubeId(r.drive_url);
  return `<div class="col-12 col-md-6 col-xl-4"><div class="rec-card">
    ${yt ? ytLiteHtml(r.drive_url, loc(r, 'title')) : `<div class="rc-thumb"><i class="bi bi-play-circle" aria-hidden="true"></i></div>`}
    <div class="d-flex flex-wrap gap-2"><span class="chip ${r.class_id ? 'chip-primary' : 'chip-teal'}">${esc(r.class_id ? classTitle(data.classById.get(r.class_id)) : t('rec.allClasses'))}</span>
      ${left != null ? `<span class="chip ${left <= 3 ? 'chip-accent' : 'chip-gold'}"><i class="bi bi-hourglass-split" aria-hidden="true"></i>${esc(t('rec.daysLeft', { n: left }))}</span>` : ''}</div>
    <h2 class="h6 m-0">${esc(loc(r, 'title'))}</h2>
    <div class="small text-muted">${r.topic ? `${esc(r.topic)} · ` : ''}${fmtDate(r.recorded_on)}</div>
    ${yt ? '' : `<a class="btn btn-sm btn-primary align-self-start mt-auto" href="${esc(safeUrl(r.drive_url))}" target="_blank" rel="noopener"><i class="bi bi-play-fill" aria-hidden="true"></i>${esc(t('rec.watch'))}</a>`}
  </div></div>`;
}
function resItem(r) {
  const [icon, cls] = KIND_ICON[r.kind] || KIND_ICON.other;
  return `<a class="media-item" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener"><span class="mi-ico ${cls}"><i class="bi ${icon}" aria-hidden="true"></i></span>
    <div class="flex-grow-1 min-w-0"><b>${esc(loc(r, 'title'))}</b><span class="sub">${esc(t(`res.kind.${r.kind}`))}${r.grade ? ` · ${esc(t('common.grade'))} ${esc(r.grade)}` : ''}${r.subject_id ? ` · ${esc(subjName(r.subject_id))}` : ''}${r.topic ? ` · ${esc(r.topic)}` : ''}</span></div>
    ${r.access === 'free' ? `<span class="chip chip-teal">${esc(t('rec.free'))}</span>` : ''}<i class="bi bi-box-arrow-up-right text-muted" aria-hidden="true"></i></a>`;
}

function render() {
  const { myRecs, myRes, myGroups, hasPaid } = scopeData();
  const vids = myRes.filter((r) => r.kind === 'youtube');
  const docs = myRes.filter((r) => r.kind !== 'youtube');
  const TABS = [['recordings', 'bi-play-btn', myRecs.length], ['videos', 'bi-youtube', vids.length], ['resources', 'bi-journal-text', docs.length], ['groups', 'bi-people', myGroups.length]];
  const pool = tab === 'videos' ? vids : tab === 'resources' ? docs : tab === 'recordings' ? myRecs : [];
  const topics = [...new Set(pool.map((x) => x.topic).filter(Boolean))].sort();
  if (topic && !topics.includes(topic)) topic = '';
  const list = pool.filter((x) => (!topic || x.topic === topic) && match(x));

  let body = '';
  if (tab === 'groups') {
    body = myGroups.length ? `<div class="row g-3">${myGroups.map((g) => `<div class="col-sm-6 col-lg-4"><a class="group-card" href="${esc(safeUrl(g.url))}" target="_blank" rel="noopener">
      <span class="g-ico ${esc(g.platform)}"><i class="bi bi-${g.platform === 'other' ? 'link-45deg' : esc(g.platform)}" aria-hidden="true"></i></span>
      <div class="min-w-0"><b class="d-block">${esc(g.title)}</b><span class="small text-muted">${g.grade ? `${esc(t('common.grade'))} ${esc(g.grade)}` : esc(t('rec.allGrades'))}${g.subject_id ? ` · ${esc(subjName(g.subject_id))}` : ''}</span></div>
      <i class="bi bi-arrow-up-right ms-auto text-muted" aria-hidden="true"></i></a></div>`).join('')}</div>
      <p class="small text-muted mt-3 mb-0"><i class="bi bi-shield-check me-1" aria-hidden="true"></i>${esc(t('rec.groupsNote'))}</p>` : `<div class="m-card empty-state"><i class="bi bi-people" aria-hidden="true"></i><p>${esc(t('rec.noGroups'))}</p></div>`;
  } else if (!list.length) {
    body = `<div class="m-card empty-state"><i class="bi ${tab === 'videos' ? 'bi-youtube' : 'bi-play-btn'}" aria-hidden="true"></i><p>${esc(tab === 'recordings' && !hasPaid ? t('rec.paidOnly') : t('rec.none'))}</p></div>`;
  } else if (tab === 'recordings') {
    body = `<div class="row g-3">${list.map(recCard).join('')}</div>`;
  } else if (tab === 'videos') {
    body = `<div class="row g-3">${list.map((v) => `<div class="col-12 col-md-6 col-xl-4"><div class="rec-card">${ytLiteHtml(v.url, loc(v, 'title'))}<b class="small">${esc(loc(v, 'title'))}</b><span class="small text-muted">${v.topic ? esc(v.topic) : ''}${v.grade ? ` · ${esc(t('common.grade'))} ${esc(v.grade)}` : ''}</span></div></div>`).join('')}</div>`;
  } else {
    body = `<div class="d-grid gap-2">${list.map(resItem).join('')}</div>`;
  }

  content.innerHTML = `<h1 class="portal-title">${esc(t('rec.hubTitle'))}</h1><p class="portal-sub">${esc(t('rec.hubSub'))}</p>
    <div class="seg seg-scroll lib-tabs" role="tablist">${TABS.map(([k, i, n]) => `<button type="button" role="tab" data-tab="${k}" aria-pressed="${tab === k}" aria-selected="${tab === k}"><i class="bi ${i}" aria-hidden="true"></i>${esc(t(`rec.tab.${k}`))}<span class="n">${n}</span></button>`).join('')}</div>
    ${tab !== 'groups' ? `<div class="filter-bar mb-3"><div class="search-wrap"><i class="bi bi-search" aria-hidden="true"></i><input type="search" class="form-control" id="rq" value="${esc(q)}" placeholder="${esc(t('rec.searchPh'))}" aria-label="${esc(t('common.search'))}"></div>
      ${topics.length ? `<select class="form-select w-auto" id="topicSel" aria-label="${esc(t('rec.topic'))}"><option value="">${esc(t('rec.allTopics'))}</option>${topics.map((x) => `<option ${x === topic ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}</div>` : ''}
    ${body}`;
  content.querySelector('#topicSel')?.addEventListener('change', (e) => { topic = e.target.value; render(); });
  const inp = content.querySelector('#rq');
  inp?.addEventListener('input', () => { q = inp.value.trim().toLowerCase(); const pos = inp.selectionStart; render(); const n = content.querySelector('#rq'); n.focus(); n.setSelectionRange(pos, pos); });
}
content.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; topic = ''; render(); } });

try {
  const safe = (p) => p.catch(() => []);
  [data, recs, resources, groups, subjects] = await Promise.all([loadMyData(student.id), safe(api.select('recordings', { order: ['recorded_on', 'desc'] })), safe(api.select('resources', { order: ['sort_order', 'asc'] })), safe(api.select('community_links', { order: ['sort_order', 'asc'] })), safe(listSubjects())]);
  render();
} catch (e) { toastError(e); }
onLanguageChange(() => data && render());
