import { esc } from '../utils/dom.js';

function stack() {
  let s = document.querySelector('.toast-stack');
  if (!s) {
    s = document.createElement('div');
    s.className = 'toast-stack';
    s.setAttribute('role', 'status');
    s.setAttribute('aria-live', 'polite');
    document.body.appendChild(s);
  }
  return s;
}

const ICONS = { success: 'bi-check-circle-fill', error: 'bi-exclamation-octagon-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };

/** showToast('Saved', 'success') — optional action: { label, onClick } */
export function showToast(message, type = 'info', { timeout = 4500, action } = {}) {
  const el = document.createElement('div');
  el.className = `m-toast ${type}`;
  el.innerHTML = `<i class="bi ${ICONS[type] || ICONS.info}" aria-hidden="true"></i><div>${esc(message)}</div>`;
  if (action) {
    const b = document.createElement('button');
    b.className = 'btn btn-sm btn-light';
    b.textContent = action.label;
    b.addEventListener('click', () => { action.onClick(); el.remove(); });
    el.appendChild(b);
  }
  stack().appendChild(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

export const toastError = (err) => showToast(err?.message || String(err), 'error', { timeout: 7000 });
