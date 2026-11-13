/**
 * Protects unsaved form data:
 *  - Autosaves the form to local storage while typing and restores it after reloads/updates.
 *  - Tells the Service Worker updater that a form is "dirty" so it will not reload the page.
 * Files are never saved (browsers do not allow it).
 */
import { store } from './storage.js';

window.__mentoraDirty = window.__mentoraDirty || new Set();

export function protectForm(form, key) {
  const storageKey = `mentora-draft:${key}`;
  const saved = store.get(storageKey);
  if (saved) restore(form, saved);
  const save = () => {
    const values = {};
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!el.name || el.type === 'file' || el.type === 'password') return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        values[el.name] = values[el.name] || [];
        if (el.checked) values[el.name].push(el.value);
      } else values[el.name] = el.value;
    });
    store.set(storageKey, values);
    window.__mentoraDirty.add(key);
  };
  form.addEventListener('input', save);
  form.addEventListener('change', save);
  return {
    clear() { store.remove(storageKey); window.__mentoraDirty.delete(key); window.dispatchEvent(new Event('mentora:forms-clean')); },
    hadDraft: !!saved
  };
}

function restore(form, values) {
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!el.name || !(el.name in values) || el.type === 'file' || el.type === 'password') return;
    const v = values[el.name];
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = Array.isArray(v) && v.includes(el.value);
    else el.value = v;
  });
}

export const hasDirtyForms = () => window.__mentoraDirty.size > 0;
