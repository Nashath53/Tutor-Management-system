/**
 * Reusable admin list + form.
 *
 * createCrud(mount, {
 *   title, load: async () => rows, columns: [{ label, render(row) | key, class }],
 *   fields: [{ name, label, type, options, required, help, col, default }],
 *   save: async (values, row) => ..., searchKeys: ['full_name'], filters: [{ name, label, options, test(row, value) }],
 *   rowActions: (row) => [{ label, icon, onClick, danger }], newLabel, emptyText
 * })
 *
 * Field types: text, email, tel, url, number, date, time, textarea, select, checkbox, multi (checkbox pills), section
 */
import { esc, formData } from '../utils/dom.js';
import { openModal } from './modal.js';
import { showToast, toastError } from './toast.js';
import { validateForm, normalizePhone } from '../utils/validate.js';

const optionsOf = (f) => (typeof f.options === 'function' ? f.options() : f.options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: o }));

export function fieldHtml(f, value) {
  const id = `f-${f.name}`;
  const req = f.required ? 'required' : '';
  const label = f.label ? `<label class="form-label" for="${id}">${esc(f.label)}${f.required ? '<span class="req">*</span>' : ''}</label>` : '';
  const help = f.help ? `<div class="form-text">${esc(f.help)}</div>` : '';
  const fb = `<div class="invalid-feedback">${esc(f.invalid || 'Please check this field.')}</div>`;
  const col = f.col || 'col-md-6';
  let v = value ?? f.default ?? '';
  if (f.type === 'datetime-local' && v) { const d = new Date(v); if (!isNaN(d)) v = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); }
  let input;
  switch (f.type) {
    case 'section':
      return `<div class="col-12"><div class="form-section-title mt-2 mb-0">${esc(f.label)}</div></div>`;
    case 'textarea':
      input = `<textarea class="form-control" id="${id}" name="${f.name}" rows="${f.rows || 3}" ${req} maxlength="${f.max || 2000}">${esc(v)}</textarea>`; break;
    case 'select':
      input = `<select class="form-select" id="${id}" name="${f.name}" ${req}>${f.placeholder !== false ? `<option value="">${esc(f.placeholder || 'Select…')}</option>` : ''}${optionsOf(f).map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`; break;
    case 'checkbox':
      return `<div class="${col}"><div class="form-check form-switch mt-md-4 pt-md-2"><input class="form-check-input" type="checkbox" role="switch" id="${id}" name="${f.name}" value="true" ${v === true || v === 'true' ? 'checked' : ''}><label class="form-check-label" for="${id}">${esc(f.label)}</label></div>${help}</div>`;
    case 'multi': {
      const vals = Array.isArray(v) ? v.map(String) : [];
      return `<div class="${col} check-group" ${f.required ? 'data-required-group' : ''} data-multi="${f.name}"><span class="form-label d-block">${esc(f.label)}${f.required ? '<span class="req">*</span>' : ''}</span><div class="check-pills">${optionsOf(f).map((o, i) => `<input type="checkbox" id="${id}-${i}" name="${f.name}" value="${esc(o.value)}" ${vals.includes(String(o.value)) ? 'checked' : ''}><label for="${id}-${i}">${esc(o.label)}</label>`).join('')}</div><div class="invalid-feedback">Select at least one.</div>${help}</div>`;
    }
    default:
      input = `<input class="form-control" type="${f.type || 'text'}" id="${id}" name="${f.name}" value="${esc(v)}" ${req} ${f.type === 'tel' ? 'data-phone' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null && f.type === 'number' ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : f.type === 'number' ? 'step="any"' : ''} ${f.pattern ? `pattern="${f.pattern}"` : ''} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>`;
  }
  return `<div class="${col}">${label}${input}${fb}${help}</div>`;
}

/** Convert raw form values to typed values based on field definitions. */
export function readFields(form, fields) {
  const raw = formData(form);
  const out = {};
  fields.forEach((f) => {
    if (f.type === 'section' || f.readonly) return;
    let v = raw[f.name];
    if (f.type === 'checkbox') v = v === 'true';
    else if (f.type === 'multi') v = Array.isArray(v) ? v : v ? [v] : [];
    else if (f.type === 'number') v = v === '' || v == null ? null : Number(v);
    else if (f.type === 'tel') v = v ? normalizePhone(v) || v : null;
    else if (typeof v === 'string') v = v.trim() === '' ? null : v.trim();
    out[f.name] = v ?? null;
  });
  return out;
}

export function openFormModal({ title, fields, row = {}, onSave, size = 'modal-lg', submitLabel = 'Save' }) {
  const m = openModal({
    title, size,
    body: `<form novalidate class="row g-3" id="crudForm">${fields.map((f) => fieldHtml(f, row[f.name])).join('')}</form>`,
    footer: `<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">Cancel</button><button type="submit" form="crudForm" class="btn btn-primary">${esc(submitLabel)}</button>`
  });
  const form = m.el.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(form)) return;
    const btn = m.el.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await onSave(readFields(form, fields), row);
      m.close();
    } catch (err) { toastError(err); } finally { btn.disabled = false; }
  });
  return m;
}

/** Three-dot menu. Popper "fixed" strategy keeps it from being clipped by scrolling tables/cards. */
export function actionMenu(actions, key) {
  if (!actions.length) return '';
  return `<div class="dropdown d-inline-block"><button class="dot-btn d-inline-grid" type="button" data-bs-toggle="dropdown" data-bs-popper-config='{"strategy":"fixed"}' aria-expanded="false" aria-label="More actions"><i class="bi bi-three-dots-vertical" aria-hidden="true"></i></button><ul class="dropdown-menu dropdown-menu-end shadow">${actions.map((a, j) => (a.divider ? '<li><hr class="dropdown-divider"></li>' : `<li><button type="button" class="dropdown-item ${a.danger ? 'text-danger' : ''}" data-act="${key}:${j}"><i class="bi ${a.icon || 'bi-dot'} me-2" aria-hidden="true"></i>${esc(a.label)}</button></li>`)).join('')}</ul></div>`;
}

/**
 * Extra options (all optional):
 *  tabs: { name, items: [{ value, label, test(row) }] }  → segmented tabs with live counts
 *  columns[].sort: true | (row) => value                  → click header to sort
 *  pageSize: 20                                           → pagination
 *  onRowClick(row, { reload })                            → whole row clickable (e.g. open a drawer)
 *  card(row, i) → html, defaultView: 'cards' | 'table'    → card grid with a view toggle
 */
export function createCrud(mount, cfg) {
  let rows = [];
  const state = { q: '', filters: {}, tab: cfg.tabs?.initial ?? cfg.tabs?.items?.[0]?.value ?? '', sort: cfg.defaultSort || null, page: 0, view: cfg.card ? (cfg.defaultView || 'cards') : 'table' };
  const pageSize = cfg.pageSize || 20;
  const cols = cfg.columns || [];
  mount.innerHTML = `
    ${cfg.intro ? `<p class="page-intro">${cfg.intro}</p>` : ''}
    ${cfg.header ? `<div data-header class="mb-4"></div>` : ''}
    ${cfg.tabs ? `<div class="seg seg-scroll mb-3" role="tablist" data-tabs></div>` : ''}
    <div class="toolbar">
      <div class="search"><i class="bi bi-search" aria-hidden="true"></i><input type="search" class="form-control" placeholder="${esc(cfg.searchPlaceholder || 'Search…')}" aria-label="Search"></div>
      ${(cfg.filters || []).map((f) => `<select class="form-select" data-filter="${f.name}" aria-label="${esc(f.label)}"><option value="">${esc(f.label)}: all</option>${optionsOf(f).map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`).join('')}
      <div class="ms-auto">${cfg.card ? `<div class="view-toggle" role="group" aria-label="View"><button type="button" data-view="cards" aria-label="Card view"><i class="bi bi-grid-3x2-gap" aria-hidden="true"></i></button><button type="button" data-view="table" aria-label="Table view"><i class="bi bi-list-ul" aria-hidden="true"></i></button></div>` : ''}
      ${(cfg.toolbarButtons || []).map((b, i) => `<button type="button" class="btn ${b.class || 'btn-outline-primary'}" data-tb="${i}"><i class="bi ${b.icon || 'bi-plus'} me-1" aria-hidden="true"></i>${esc(b.label)}</button>`).join('')}
      ${cfg.fields && cfg.canCreate !== false ? `<button type="button" class="btn btn-primary" data-new><i class="bi bi-plus-lg me-1" aria-hidden="true"></i>${esc(cfg.newLabel || 'New')}</button>` : ''}</div>
    </div>
    <div data-body></div>`;
  const body = mount.querySelector('[data-body]');
  let current = [];

  const sortVal = (c, r) => (typeof c.sort === 'function' ? c.sort(r) : r[c.key] ?? '');
  function filtered() {
    const q = state.q.toLowerCase();
    const base = rows.filter((r) => {
      if (q && !(cfg.searchKeys || []).some((k) => String(typeof k === 'function' ? k(r) : r[k] ?? '').toLowerCase().includes(q))) return false;
      return (cfg.filters || []).every((f) => !state.filters[f.name] || (f.test ? f.test(r, state.filters[f.name]) : String(r[f.name]) === state.filters[f.name]));
    });
    return base;
  }
  function tabbed(list) {
    if (!cfg.tabs) return list;
    const tb = cfg.tabs.items.find((x) => x.value === state.tab);
    return tb?.test ? list.filter(tb.test) : list;
  }
  function sorted(list) {
    if (!state.sort) return list;
    const c = cols[state.sort.i]; if (!c) return list;
    const dir = state.sort.dir === 'desc' ? -1 : 1;
    return [...list].sort((a, b) => { const x = sortVal(c, a); const y = sortVal(c, b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir; });
  }

  const rowActionsOf = (r) => (cfg.rowActions ? cfg.rowActions(r) : []).filter(Boolean);
  const editBtn = (i) => (cfg.fields && cfg.canEdit !== false ? `<button type="button" class="btn btn-sm btn-ghost" data-edit="${i}" aria-label="Edit"><i class="bi bi-pencil" aria-hidden="true"></i></button>` : '');
  const primaryBtn = (r, i) => { const p = cfg.primaryAction ? cfg.primaryAction(r) : null; return p ? `<button type="button" class="btn btn-sm ${p.class || 'btn-outline-primary'}" data-primary="${i}">${p.icon ? `<i class="bi ${p.icon}" aria-hidden="true"></i>` : ''}${esc(p.label)}</button>` : ''; };

  function render() {
    const all = filtered();
    if (cfg.tabs) {
      mount.querySelector('[data-tabs]').innerHTML = cfg.tabs.items.map((x) => `<button type="button" role="tab" data-tab="${esc(x.value)}" aria-pressed="${state.tab === x.value}" aria-selected="${state.tab === x.value}">${x.icon ? `<i class="bi ${x.icon}" aria-hidden="true"></i>` : ''}${esc(x.label)}<span class="n">${x.test ? all.filter(x.test).length : all.length}</span></button>`).join('');
    }
    if (cfg.header) mount.querySelector('[data-header]').innerHTML = cfg.header(rows);
    mount.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
    const list = sorted(tabbed(all));
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    state.page = Math.min(state.page, pages - 1);
    current = list.slice(state.page * pageSize, state.page * pageSize + pageSize);
    const empty = `<div class="empty-state"><i class="bi bi-inbox" aria-hidden="true"></i><h3>${esc(cfg.emptyTitle || 'Nothing here yet')}</h3><p>${esc(cfg.emptyText || 'Records you add will appear here.')}</p></div>`;
    const pager = list.length > pageSize ? `<div class="pager"><span>Showing ${state.page * pageSize + 1}–${Math.min(list.length, (state.page + 1) * pageSize)} of ${list.length}</span><div class="btn-group"><button type="button" class="btn btn-sm btn-ghost" data-page="-1" ${state.page === 0 ? 'disabled' : ''} aria-label="Previous page"><i class="bi bi-chevron-left" aria-hidden="true"></i></button><span class="btn btn-sm btn-ghost disabled">${state.page + 1} / ${pages}</span><button type="button" class="btn btn-sm btn-ghost" data-page="1" ${state.page >= pages - 1 ? 'disabled' : ''} aria-label="Next page"><i class="bi bi-chevron-right" aria-hidden="true"></i></button></div></div>` : `<div class="pager"><span>${list.length} of ${rows.length} record(s)</span></div>`;

    if (state.view === 'cards' && cfg.card) {
      body.innerHTML = current.length ? `<div class="ent-grid">${current.map((r, i) => cfg.card(r, i, { menu: actionMenu(rowActionsOf(r), i), edit: editBtn(i), primary: primaryBtn(r, i) })).join('')}</div><div class="m-card p-0 mt-3">${pager}</div>` : `<div class="m-card">${empty}</div>`;
      return;
    }
    body.innerHTML = `<div class="m-table-wrap"><div class="table-responsive"><table class="table m-table ${cfg.onRowClick ? 'rows-clickable' : ''}"><thead><tr>${cols.map((c, i) => `<th class="${c.class || ''} ${c.sort ? `sortable ${state.sort?.i === i ? `sort-${state.sort.dir}` : ''}` : ''}" ${c.sort ? `data-sort="${i}" tabindex="0" aria-sort="${state.sort?.i === i ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"` : ''}>${esc(c.label)}</th>`).join('')}<th class="actions"><span class="visually-hidden">Actions</span></th></tr></thead>
      <tbody>${current.length ? current.map((r, i) => `<tr data-row="${i}">${cols.map((c) => `<td class="${c.class || ''}" ${c.label ? `data-label="${esc(c.label)}"` : ''}>${c.render ? c.render(r) : esc(r[c.key] ?? '—')}</td>`).join('')}<td class="actions"><div class="d-inline-flex gap-1 align-items-center">${primaryBtn(r, i)}${editBtn(i)}${actionMenu(rowActionsOf(r), i)}</div></td></tr>`).join('') : `<tr><td colspan="${cols.length + 1}">${empty}</td></tr>`}</tbody></table></div>${pager}</div>`;
  }

  async function reload() {
    body.innerHTML = `<div class="m-card"><div class="skeleton skeleton-line w-75"></div><div class="skeleton skeleton-line w-50"></div><div class="skeleton skeleton-line w-75"></div></div>`;
    try { rows = await cfg.load(); render(); } catch (err) { toastError(err); body.innerHTML = `<div class="m-card"><div class="empty-state"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i><h3>Could not load data</h3><p>${esc(err.message)}</p></div></div>`; }
  }

  const openForm = (row = {}) => openFormModal({
    title: row.id ? `Edit ${cfg.singular || 'record'}` : (cfg.newLabel || 'New'),
    fields: typeof cfg.fields === 'function' ? cfg.fields(row) : cfg.fields, row,
    onSave: async (values) => { await cfg.save(values, row); showToast('Saved', 'success'); await reload(); }
  });

  let qTimer;
  mount.querySelector('input[type=search]').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value; state.page = 0; render(); }, 120); });
  mount.querySelectorAll('[data-filter]').forEach((s) => s.addEventListener('change', () => { state.filters[s.dataset.filter] = s.value; state.page = 0; render(); }));
  mount.querySelector('[data-new]')?.addEventListener('click', () => openForm({}));
  mount.querySelectorAll('[data-tb]').forEach((b) => b.addEventListener('click', () => cfg.toolbarButtons[b.dataset.tb].onClick({ reload })));
  mount.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; render(); }));
  mount.querySelector('[data-tabs]')?.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { state.tab = b.dataset.tab; state.page = 0; render(); } });
  const sortBy = (th) => { const i = Number(th.dataset.sort); state.sort = state.sort?.i === i ? { i, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { i, dir: 'asc' }; render(); };
  body.addEventListener('keydown', (e) => { const th = e.target.closest('[data-sort]'); if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sortBy(th); } });
  body.addEventListener('click', (e) => {
    const th = e.target.closest('[data-sort]'); if (th) return sortBy(th);
    const pg = e.target.closest('[data-page]'); if (pg) { state.page += Number(pg.dataset.page); render(); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) return openForm(current[ed.dataset.edit]);
    const pr = e.target.closest('[data-primary]');
    if (pr) return cfg.primaryAction(current[pr.dataset.primary]).onClick({ reload });
    const act = e.target.closest('[data-act]');
    if (act) {
      const [i, j] = act.dataset.act.split(':').map(Number);
      return rowActionsOf(current[i])[j].onClick({ reload });
    }
    if (cfg.onRowClick && !e.target.closest('a,button,input,select,label,.dropdown')) {
      const tr = e.target.closest('[data-row]'); if (tr) cfg.onRowClick(current[tr.dataset.row], { reload });
    }
  });

  if (cfg.initialFilters) {
    Object.entries(cfg.initialFilters).forEach(([k, v]) => { state.filters[k] = v; const s = mount.querySelector(`[data-filter="${k}"]`); if (s) s.value = v; });
  }
  reload();
  return { reload, getRows: () => rows, setTab: (v) => { state.tab = v; render(); }, render };
}
