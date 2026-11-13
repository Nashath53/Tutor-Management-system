import { initPortalPage } from '../../components/portal-shell.js';
import { loadMyData, classTitle } from './portal-data.js';
import { listNotices } from '../../services/content.service.js';
import { t, loc, onLanguageChange } from '../../i18n/language.js';
import { esc } from '../../utils/dom.js';
import { fmtDate } from '../../utils/format.js';
import { toastError } from '../../components/toast.js';

const { student, content } = await initPortalPage('notices');
let data, notices = [], scope = 'all', q = '';
const isNew = (n) => Date.now() - Date.parse(n.published_at || 0) < 7 * 864e5;

function render() {
  const ids = data.enrollments.map((e) => e.class_id);
  const mine = notices.filter((n) => n.is_published && (!n.class_id || ids.includes(n.class_id)));
  const list = mine.filter((n) => (scope === 'all' || (scope === 'everyone' ? !n.class_id : n.class_id === scope))
    && (!q || `${loc(n, 'title')} ${loc(n, 'body')}`.toLowerCase().includes(q)));
  const classTabs = [...new Set(mine.filter((n) => n.class_id).map((n) => n.class_id))];
  content.innerHTML = `<h1 class="portal-title">${esc(t('portal.nav.notices'))}</h1><p class="portal-sub">${esc(t('notices.sub'))}</p>
    <div class="filter-bar mb-4"><div class="search-wrap"><i class="bi bi-search" aria-hidden="true"></i><input type="search" class="form-control" id="nq" value="${esc(q)}" placeholder="${esc(t('common.search'))}" aria-label="${esc(t('common.search'))}"></div>
      <div class="seg seg-scroll"><button type="button" data-scope="all" aria-pressed="${scope === 'all'}">${esc(t('common.all'))}<span class="n">${mine.length}</span></button>
      <button type="button" data-scope="everyone" aria-pressed="${scope === 'everyone'}">${esc(t('notices.everyone'))}</button>
      ${classTabs.map((c) => `<button type="button" data-scope="${esc(c)}" aria-pressed="${scope === c}">${esc(classTitle(data.classById.get(c)))}</button>`).join('')}</div></div>
    ${list.length ? `<div class="d-grid gap-3">${list.map((n) => `<article class="notice-card ${isNew(n) ? 'is-new' : ''}">
      <span class="nc-ico ${n.class_id ? '' : 'all'}"><i class="bi ${n.class_id ? 'bi-easel' : 'bi-megaphone'}" aria-hidden="true"></i></span>
      <div class="min-w-0 flex-grow-1"><div class="d-flex flex-wrap gap-2 align-items-center mb-1"><span class="chip ${n.class_id ? 'chip-primary' : 'chip-teal'}">${esc(n.class_id ? classTitle(data.classById.get(n.class_id)) : t('notices.everyone'))}</span>
        ${isNew(n) ? `<span class="chip chip-accent">${esc(t('notices.new'))}</span>` : ''}<span class="small text-muted ms-auto">${fmtDate(n.published_at)}</span></div>
        <h2 class="h6 mb-1">${esc(loc(n, 'title'))}</h2>
        <details class="nc-body"><summary>${esc(t('notices.read'))}</summary><p class="m-0 text-muted" style="white-space:pre-line">${esc(loc(n, 'body'))}</p></details></div></article>`).join('')}</div>`
      : `<div class="m-card empty-state"><i class="bi bi-megaphone" aria-hidden="true"></i><p>${esc(t('portal.noNotices'))}</p></div>`}`;
  const inp = content.querySelector('#nq');
  inp.addEventListener('input', () => { q = inp.value.trim().toLowerCase(); const pos = inp.selectionStart; render(); const n = content.querySelector('#nq'); n.focus(); n.setSelectionRange(pos, pos); });
}
content.addEventListener('click', (e) => { const b = e.target.closest('[data-scope]'); if (b) { scope = b.dataset.scope; render(); } });
try { [data, notices] = await Promise.all([loadMyData(student.id), listNotices()]); render(); } catch (e) { toastError(e); }
onLanguageChange(() => data && render());
