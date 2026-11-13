/**
 * In-page modals (Bootstrap). Native confirm()/prompt() are avoided because
 * some embedded previews block them and they cannot be translated or styled.
 */
import { esc } from '../utils/dom.js';
import { t } from '../i18n/language.js';

export function openModal({ title, body = '', footer, size = '', onShown, static: isStatic = false }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal fade';
  wrap.tabIndex = -1;
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('role', 'dialog');
  wrap.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable ${size}">
      <div class="modal-content">
        <div class="modal-header"><h2 class="modal-title">${esc(title)}</h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(t('common.close'))}"></button></div>
        <div class="modal-body">${body}</div>
        ${footer === false ? '' : `<div class="modal-footer">${footer || `<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">${esc(t('common.close'))}</button>`}</div>`}
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const modal = new window.bootstrap.Modal(wrap, isStatic ? { backdrop: 'static' } : {});
  wrap.addEventListener('hidden.bs.modal', () => { modal.dispose(); wrap.remove(); });
  if (onShown) wrap.addEventListener('shown.bs.modal', () => onShown(wrap), { once: true });
  modal.show();
  return { el: wrap, close: () => modal.hide(), body: wrap.querySelector('.modal-body') };
}

/** Promise-based confirm. Optional reason field when `reason: true` (resolves to the text). */
export function confirmDialog({ title, message, confirmLabel, danger = false, reason = false, reasonLabel, reasonRequired = true }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title: title || t('common.confirm'),
      body: `<p class="mb-3">${esc(message || '')}</p>${reason ? `<label class="form-label" for="cd-reason">${esc(reasonLabel || t('common.reason'))}</label><textarea id="cd-reason" class="form-control" rows="3"></textarea><div class="invalid-feedback">${esc(t('validation.required'))}</div>` : ''}`,
      footer: `<button type="button" class="btn btn-ghost" data-bs-dismiss="modal">${esc(t('common.cancel'))}</button>
               <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirmLabel || t('common.confirm'))}</button>`
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => {
      if (reason) {
        const ta = m.el.querySelector('#cd-reason');
        if (reasonRequired && !ta.value.trim()) { ta.classList.add('is-invalid'); ta.focus(); return; }
        done = true; resolve(ta.value.trim() || ''); m.close(); return;
      }
      done = true; resolve(true); m.close();
    });
    m.el.addEventListener('hidden.bs.modal', () => { if (!done) resolve(reason ? null : false); });
  });
}
