import { bootCommon, brandHtml, langSwitchHtml, href } from '../components/common.js';
import { signIn, getProfile, homeFor } from '../services/auth.service.js';
import { api, isDemo } from '../services/api.js';
import { t, onLanguageChange, applyTranslations } from '../i18n/language.js';
import { setBusy, esc, qs } from '../utils/dom.js';
import { validateForm } from '../utils/validate.js';
import { showToast, toastError } from '../components/toast.js';
import { bindPasswordToggles } from '../components/ui.js';

document.getElementById('loginBrand').innerHTML = brandHtml();
document.getElementById('loginLang').innerHTML = langSwitchHtml();
bootCommon();

const next = qs('next');
function go(profile) {
  const home = homeFor(profile, document.documentElement.dataset.base || '');
  const area = home.split('/').slice(-2)[0];   // admin | teacher | portal — only return to a page of YOUR area
  const dest = next && /^(admin|portal|teacher)\/[a-z-]+\.html$/.test(next) && next.startsWith(area + '/') ? href(next) : home;
  location.replace(dest);
}

const existing = await getProfile();
if (existing) go(existing);

const form = document.getElementById('loginForm');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm(form)) return;
  const btn = form.querySelector('[type=submit]');
  setBusy(btn, true, t('login.signingIn'));
  try {
    const profile = await signIn(form.email.value, form.password.value);
    if (!profile) throw new Error(t('login.noProfile'));
    go(profile);
  } catch (err) { toastError(err); setBusy(btn, false); }
});

document.getElementById('forgotBtn').addEventListener('click', async () => {
  const email = form.email.value.trim();
  if (!email) { form.email.focus(); return showToast(t('login.enterEmail'), 'warning'); }
  try {
    // After clicking the email link the user lands signed in on Profile, where they set a new password.
    await api.auth.resetPassword(email, location.origin + href('login.html') + '?next=portal/profile.html');
    showToast(t('login.resetSent'), 'success');
  } catch (err) { toastError(err); }
});

function renderDemo() {
  const box = document.getElementById('demoAccounts');
  if (!isDemo()) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="eyebrow mb-2">${esc(t('login.demoTitle'))}</div><p class="small text-muted mb-3">${esc(t('login.demoHelp'))}</p>
    <div class="d-grid gap-2">${api.auth.demoAccounts.map((a) => `<button type="button" class="btn btn-ghost text-start d-flex justify-content-between align-items-center" data-email="${esc(a.email)}">
      <span><b>${esc(t('role.' + a.profile.role))}</b><br><small class="text-muted">${esc(a.email)}</small></span><i class="bi bi-box-arrow-in-right" aria-hidden="true"></i></button>`).join('')}</div>
    <button type="button" class="btn btn-link btn-sm px-0 mt-3" id="resetDemo">${esc(t('login.resetDemo'))}</button>`;
  box.querySelectorAll('[data-email]').forEach((b) => b.addEventListener('click', () => {
    form.email.value = b.dataset.email; form.password.value = 'demo1234'; form.requestSubmit();
  }));
  box.querySelector('#resetDemo').addEventListener('click', () => { api.reset(); location.reload(); });
}
renderDemo();
bindPasswordToggles(document);
onLanguageChange(() => { renderDemo(); applyTranslations(); });
