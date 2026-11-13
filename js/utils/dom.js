export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape any value before inserting it into HTML. Always use this for user data. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

export function formData(form) {
  const data = {};
  const fd = new FormData(form);
  for (const [key, value] of fd.entries()) {
    if (key in data) {
      data[key] = Array.isArray(data[key]) ? [...data[key], value] : [data[key], value];
    } else data[key] = value;
  }
  // Ensure multi-checkbox groups are always arrays
  form.querySelectorAll('[data-multi]').forEach((g) => {
    const name = g.dataset.multi;
    const v = data[name];
    data[name] = v == null ? [] : Array.isArray(v) ? v : [v];
  });
  return data;
}

export function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${esc(label || '')}`;
  } else {
    button.disabled = false;
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}

export function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

export function indexBy(rows, key = 'id') {
  const map = new Map();
  (rows || []).forEach((r) => map.set(r[key], r));
  return map;
}

export function groupBy(rows, key) {
  const map = new Map();
  (rows || []).forEach((r) => {
    const k = typeof key === 'function' ? key(r) : r[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return map;
}

export const sum = (rows, fn) => (rows || []).reduce((a, r) => a + Number(fn(r) || 0), 0);
