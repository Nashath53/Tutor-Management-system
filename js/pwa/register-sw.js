/**
 * Service Worker registration + SAFE automatic updates.
 * 1. Register sw.js and check for a new version (on load, every 30 minutes, and when the tab becomes visible).
 * 2. The new worker pre-caches the new app shell in the background. If any file fails, it stays inactive (old version keeps working).
 * 3. When installed: if no form has unsaved data → activate and reload automatically.
 *    Otherwise show an "Update ready" bar so the user can finish first.
 */
import { hasDirtyForms } from '../utils/form-guard.js';
import { t } from '../i18n/language.js';

const safeToReload = () => !hasDirtyForms() && !document.querySelector('.modal.show');

function showUpdateBar(onUpdate) {
  if (document.querySelector('.update-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'update-bar no-print';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `<span>${t('pwa.updateReady')}</span><button class="btn btn-sm btn-light" type="button">${t('pwa.updateNow')}</button>`;
  bar.querySelector('button').addEventListener('click', () => { bar.remove(); onUpdate(); });
  document.body.appendChild(bar);
}

export function registerServiceWorker() {
  // Some embedded/sandboxed frames throw on merely reading navigator.serviceWorker — never let that break the page.
  let sw = null;
  try { sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null; } catch { sw = null; }
  if (!sw) return;
  const base = document.documentElement.dataset.base || '';
  let refreshing = false;

  sw.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });

  const activate = (worker) => worker.postMessage({ type: 'SKIP_WAITING' });
  const handleWaiting = (worker) => {
    if (safeToReload()) return activate(worker);
    showUpdateBar(() => activate(worker));
    window.addEventListener('mentora:forms-clean', () => { if (safeToReload()) activate(worker); }, { once: true });
  };

  const start = async () => {
    try {
      const reg = await sw.register(base + 'sw.js', { scope: base || './' });
      if (reg.waiting && sw.controller) handleWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && sw.controller) handleWaiting(nw);
        });
      });
      const check = () => reg.update().catch(() => {});
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    } catch (err) {
      console.info('Service Worker not registered:', err.message);
    }
  };
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
}

/** "Install app" button support (Android/Chrome/Edge). iOS uses Share → Add to Home Screen. */
let deferredPrompt = null;
export function setupInstallButton(button) {
  if (!button) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    button.hidden = false;
  });
  button.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    button.hidden = true;
  });
  window.addEventListener('appinstalled', () => { button.hidden = true; });
}
