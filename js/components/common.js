/** Shared page boot code: translations, offline indicator, demo banner, Service Worker. */
import { applyTranslations, setLanguage, t } from '../i18n/language.js';
import { registerServiceWorker } from '../pwa/register-sw.js';
import { api } from '../services/api.js';
import { store } from '../utils/storage.js';
import { themeToggleHtml, bindThemeToggles, applyTheme } from './ui.js';

applyTheme();

export const BASE = document.documentElement.dataset.base || '';
export const href = (p) => BASE + p;

export function langSwitchHtml() {
  return `<span class="d-inline-flex align-items-center gap-2">${themeToggleHtml()}<div class="lang-switch" role="group" aria-label="Language / மொழி">
    <button type="button" data-lang="en" aria-pressed="false">EN</button>
    <button type="button" data-lang="ta" aria-pressed="false" lang="ta">தமிழ்</button></div></span>`;
}

export function bindLangSwitch(root = document) {
  root.querySelectorAll('[data-lang]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => setLanguage(b.dataset.lang));
  });
  bindThemeToggles(root);
}

export function brandHtml(target = 'index.html') {
  return `<a class="brand" href="${href(target)}" aria-label="Mentora Learning Centre">
    <span class="brand-mark" aria-hidden="true">M</span>
    <span class="brand-text"><span class="brand-name">Mentora</span><span class="brand-sub" data-i18n="brand.sub">Learning Centre</span></span></a>`;
}

function demoBanner() {
  if (api.mode !== 'demo' || store.get('mentora-hide-demo-banner')) return;
  const el = document.createElement('div');
  el.className = 'mode-banner no-print';
  el.innerHTML = `<div class="container d-flex align-items-center gap-3">
    <i class="bi bi-info-circle" aria-hidden="true"></i>
    <span class="flex-grow-1" data-i18n="demo.banner">Preview mode: sample data is stored only in this browser. Connect Supabase to go live.</span>
    <button type="button" class="btn-close" aria-label="Close"></button></div>`;
  el.querySelector('.btn-close').addEventListener('click', () => { store.set('mentora-hide-demo-banner', true); el.remove(); });
  document.body.prepend(el);
}

function offlineWatch() {
  const update = () => document.body.classList.toggle('is-offline', !navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

export function bootCommon() {
  demoBanner();
  offlineWatch();
  applyTranslations();
  bindLangSwitch();
  registerServiceWorker();
}

export const offlinePill = () => `<span class="offline-pill"><i class="bi bi-wifi-off" aria-hidden="true"></i><span data-i18n="common.offline">Offline</span></span>`;
export { t };
