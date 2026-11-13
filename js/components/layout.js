/** Public website header + footer. */
import { BASE, href, langSwitchHtml, brandHtml, bootCommon, offlinePill } from './common.js';
import { setupInstallButton } from '../pwa/register-sw.js';
import { APP } from '../config/app.config.js';
import { getSettings } from '../services/settings.service.js';
import { esc } from '../utils/dom.js';
import { initReveal } from './ui.js';
import { registerHandler, startAutoSync } from '../pwa/offline-queue.service.js';
import { submitEnquiry } from '../services/enquiry.service.js';

const NAV = [
  ['index.html', 'nav.home', 'home'],
  ['courses.html', 'nav.courses', 'courses'],
  ['teachers.html', 'nav.teachers', 'teachers'],
  ['teach-with-us.html', 'nav.teachWithUs', 'teach'],
  ['contact.html', 'nav.contact', 'contact']
];

function header(active) {
  return `<a class="skip-link" href="#main" data-i18n="common.skip">Skip to content</a>
  <header class="site-header no-print">
    <nav class="navbar navbar-expand-lg" aria-label="Main">
      <div class="container">
        ${brandHtml()}
        <div class="mobile-tools d-flex align-items-center gap-2 d-lg-none ms-auto me-2">${offlinePill()}${langSwitchHtml()}</div>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" data-i18n-aria="nav.menu">
          <i class="bi bi-list fs-4" aria-hidden="true"></i></button>
        <div class="collapse navbar-collapse" id="mainNav">
          <ul class="navbar-nav mx-lg-auto gap-lg-1 mt-3 mt-lg-0">
            ${NAV.map(([p, k, id]) => `<li class="nav-item"><a class="nav-link ${id === active ? 'active' : ''}" ${id === active ? 'aria-current="page"' : ''} href="${href(p)}" data-i18n="${k}"></a></li>`).join('')}
          </ul>
          <div class="d-flex flex-column flex-lg-row align-items-lg-center gap-2 mt-3 mt-lg-0">
            <span class="d-none d-lg-inline-flex">${offlinePill()}</span>
            <span class="desk-tools d-none d-lg-inline-flex">${langSwitchHtml()}</span>
            <a class="btn btn-ghost" href="${href('login.html')}"><i class="bi bi-person-circle me-1" aria-hidden="true"></i><span data-i18n="nav.login"></span></a>
            <a class="btn btn-primary" href="${href('join-class.html')}" data-i18n="nav.joinClass"></a>
          </div>
        </div>
      </div>
    </nav>
  </header>`;
}

function socialLinks(s = {}) {
  const items = [['facebook', 'bi-facebook', 'Facebook'], ['instagram', 'bi-instagram', 'Instagram'], ['youtube', 'bi-youtube', 'YouTube'], ['tiktok', 'bi-tiktok', 'TikTok'], ['telegram', 'bi-telegram', 'Telegram']]
    .filter(([k]) => /^https:\/\//i.test(s[k] || ''));
  return items.length ? `<div class="footer-social">${items.map(([k, i, l]) => `<a href="${esc(s[k])}" target="_blank" rel="noopener" aria-label="${l}" title="${l}"><i class="bi ${i}" aria-hidden="true"></i></a>`).join('')}</div>` : '';
}

function footer(c, social) {
  const year = new Date().getFullYear();
  return `<footer class="site-footer no-print">
    <div class="container">
      <div class="row g-5">
        <div class="col-lg-4">
          ${brandHtml()}
          <p class="mt-3 mb-3" data-i18n="footer.about"></p>
          ${socialLinks(social)}
          <div class="mb-3"></div>
          <button class="btn btn-sm btn-light-outline" type="button" id="installBtn" hidden><i class="bi bi-download me-1" aria-hidden="true"></i><span data-i18n="pwa.install"></span></button>
        </div>
        <div class="col-6 col-lg-2"><h4 data-i18n="footer.explore"></h4><ul>
          ${NAV.slice(1).map(([p, k]) => `<li><a href="${href(p)}" data-i18n="${k}"></a></li>`).join('')}
          <li><a href="${href('join-class.html')}" data-i18n="nav.joinClass"></a></li></ul></div>
        <div class="col-6 col-lg-3"><h4 data-i18n="footer.students"></h4><ul>
          <li><a href="${href('login.html')}" data-i18n="footer.portal"></a></li>
          <li><a href="${href('courses.html')}" data-i18n="footer.freeTrial"></a></li>
          <li><a href="${href('contact.html#complaint')}" data-i18n="footer.complaint"></a></li>
          <li><a href="${href('index.html#survey')}" data-i18n="footer.survey"></a></li>
          <li><a href="${href('privacy.html')}" data-i18n="footer.privacy"></a></li></ul></div>
        <div class="col-lg-3"><h4 data-i18n="footer.contact"></h4><ul>
          <li><i class="bi bi-geo-alt me-2" aria-hidden="true"></i>${esc(c.address)}</li>
          <li><i class="bi bi-telephone me-2" aria-hidden="true"></i><a href="tel:+${esc(String(c.whatsapp).replace(/\D/g, ''))}">${esc(c.phone)}</a></li>
          <li><i class="bi bi-whatsapp me-2" aria-hidden="true"></i><a href="https://wa.me/${esc(String(c.whatsapp).replace(/\D/g, ''))}" target="_blank" rel="noopener">WhatsApp</a></li>
          <li><i class="bi bi-envelope me-2" aria-hidden="true"></i><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>
          <li><i class="bi bi-clock me-2" aria-hidden="true"></i>${esc(c.hours)}</li></ul></div>
      </div>
      <div class="footer-bottom d-flex flex-column flex-md-row justify-content-between gap-2">
        <span>© ${year} ${esc(APP.name)}. <span data-i18n="footer.rights"></span></span>
        <span>v${esc(APP.version)}</span>
      </div>
    </div>
  </footer>`;
}

export async function initPublicPage(active) {
  const settings = await getSettings();
  document.getElementById('site-header').innerHTML = header(active);
  document.getElementById('site-footer').innerHTML = footer(settings.contact, settings.social);
  const h = document.querySelector('.site-header');
  const onScroll = () => h.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  bootCommon();
  initReveal();
  setupInstallButton(document.getElementById('installBtn'));
  // Enquiries typed while offline are kept in IndexedDB and sent automatically when back online.
  registerHandler('enquiry', (payload) => submitEnquiry(payload));
  startAutoSync();
  return settings;
}

export { BASE, href };
