/** Student portal frame (bilingual). */
import { href, brandHtml, bootCommon, offlinePill, langSwitchHtml, BASE } from './common.js';
import { requireRole, signOut } from '../services/auth.service.js';
import { api } from '../services/api.js';
import { t } from '../i18n/language.js';

const TABS = [
  ['index', 'portal.nav.home', 'bi-house'],
  ['classes', 'portal.nav.classes', 'bi-easel'],
  ['fees', 'portal.nav.fees', 'bi-wallet2'],
  ['attendance', 'portal.nav.attendance', 'bi-calendar-check'],
  ['notices', 'portal.nav.notices', 'bi-megaphone'],
  ['recordings', 'portal.nav.recordings', 'bi-play-btn'],
  ['profile', 'portal.nav.profile', 'bi-person']
];

export async function initPortalPage(page) {
  const profile = await requireRole(['student'], BASE);
  if (!profile) return new Promise(() => {});
  document.getElementById('portal-nav').innerHTML = `
    <div class="container">
      <div class="bar">${brandHtml('portal/index.html')}
        <div class="ms-auto d-flex align-items-center gap-2">${offlinePill()}${langSwitchHtml()}
          <button type="button" class="btn btn-sm btn-ghost" id="signOutBtn" data-i18n-aria="portal.signOut"><i class="bi bi-box-arrow-right" aria-hidden="true"></i></button></div></div>
      <nav class="portal-tabs" aria-label="Portal">${TABS.map(([p, k, i]) => `<a href="${href(`portal/${p}.html`)}" class="${p === page ? 'active' : ''}" ${p === page ? 'aria-current="page"' : ''}><i class="bi ${i}" aria-hidden="true"></i><span data-i18n="${k}"></span></a>`).join('')}</nav>
    </div>`;
  const bottom = document.createElement('nav');
  bottom.className = 'portal-bottom-nav no-print';
  bottom.setAttribute('aria-label', 'Portal');
  bottom.innerHTML = TABS.filter((x) => ['index', 'classes', 'fees', 'attendance', 'profile'].includes(x[0]))
    .map(([p, k, i]) => `<a href="${href(`portal/${p}.html`)}" class="${p === page ? 'active' : ''}"><i class="bi ${i}" aria-hidden="true"></i><span data-i18n="${k}"></span></a>`).join('');
  document.body.appendChild(bottom);
  document.getElementById('signOutBtn').addEventListener('click', async () => { await signOut(); location.href = href('login.html'); });

  let student = null;
  if (profile.student_id) student = await api.get('students', profile.student_id).catch(() => null);
  bootCommon();
  const content = document.getElementById('portal-content');
  if (!student) {
    content.innerHTML = `<div class="m-card empty-state"><i class="bi bi-link-45deg" aria-hidden="true"></i><h3>${t('portal.notLinkedTitle')}</h3><p>${t('portal.notLinked')}</p></div>`;
    return new Promise(() => {});
  }
  return { profile, student, content };
}
