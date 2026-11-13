import { initPublicPage } from '../components/layout.js';
import { t, onLanguageChange } from '../i18n/language.js';
import { esc } from '../utils/dom.js';
import { waLink, openWhatsApp } from '../utils/whatsapp.js';
import { copyText } from '../components/ui.js';
import { showToast } from '../components/toast.js';
import { renderComplaint } from './public-forms.js';

const settings = await initPublicPage('contact');
const c = settings.contact;
const map = settings.map || { lat: 7.2083, lng: 79.8358, zoom: 15, label: 'Mentora Learning Centre' };
const digits = String(c.whatsapp).replace(/\D/g, '');
const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${map.lat},${map.lng}`;

function tile(cls, icon, key, value, actions) {
  return `<div class="col-sm-6 col-lg-4" data-reveal><div class="contact-tile ${cls}"><span class="ct-ico"><i class="bi ${icon}" aria-hidden="true"></i></span>
    <div class="min-w-0 flex-grow-1"><b>${esc(t(key))}</b><div class="v">${value}</div>${actions ? `<div class="ct-actions">${actions}</div>` : ''}</div></div></div>`;
}
const copyBtn = (v) => `<button type="button" class="btn btn-sm btn-ghost" data-copy="${esc(v)}"><i class="bi bi-clipboard" aria-hidden="true"></i>${esc(t('common.copy'))}</button>`;

function render() {
  document.getElementById('contactCards').innerHTML = [
    tile('t-wa', 'bi-whatsapp', 'contact.whatsapp', esc(c.phone), `<button class="btn btn-sm btn-whatsapp" type="button" data-wa><i class="bi bi-whatsapp" aria-hidden="true"></i>${esc(t('contact.chat'))}</button>`),
    tile('', 'bi-telephone', 'contact.phone', esc(c.phone), `<a class="btn btn-sm btn-primary" href="tel:+${esc(digits)}"><i class="bi bi-telephone" aria-hidden="true"></i>${esc(t('contact.call'))}</a>${copyBtn(c.phone)}`),
    tile('t-mail', 'bi-envelope', 'contact.email', esc(c.email), `<a class="btn btn-sm btn-outline-primary" href="mailto:${esc(c.email)}"><i class="bi bi-send" aria-hidden="true"></i>${esc(t('contact.write'))}</a>${copyBtn(c.email)}`),
    tile('', 'bi-geo-alt', 'contact.address', esc(c.address), `<a class="btn btn-sm btn-primary" href="${esc(dirUrl)}" target="_blank" rel="noopener"><i class="bi bi-sign-turn-right" aria-hidden="true"></i>${esc(t('contact.directions'))}</a>${copyBtn(c.address)}`),
    tile('t-time', 'bi-clock', 'contact.hours', esc(c.hours), ''),
    tile('t-time', 'bi-exclamation-octagon', 'contact.complaintTile', esc(t('contact.complaintTileText')), `<a class="btn btn-sm btn-ghost" href="#complaint"><i class="bi bi-arrow-down" aria-hidden="true"></i>${esc(t('contact.complaintGo'))}</a>`)
  ].join('');
  document.getElementById('mapOverlay').innerHTML = `<div class="m-card m-card-sm d-flex gap-3 align-items-center shadow"><span class="feature-icon"><i class="bi bi-building" aria-hidden="true"></i></span><div class="min-w-0"><b class="d-block small">${esc(map.label || 'Mentora')}</b><span class="small text-muted">${esc(c.address)}</span></div><a class="btn btn-sm btn-accent ms-auto" href="${esc(dirUrl)}" target="_blank" rel="noopener" aria-label="${esc(t('contact.directions'))}"><i class="bi bi-sign-turn-right" aria-hidden="true"></i></a></div>`;
}
document.getElementById('contactCards').addEventListener('click', async (e) => {
  if (e.target.closest('[data-wa]')) openWhatsApp(waLink(digits, t('contact.waText', {}, 'en')));
  const cp = e.target.closest('[data-copy]');
  if (cp) { await copyText(cp.dataset.copy); showToast(t('common.copied'), 'success'); }
});

/* ---- Interactive map: Leaflet + OpenStreetMap, loaded only when the map scrolls into view (saves data on 3G). ---- */
function loadCss(href) { return new Promise((r) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = r; l.onerror = r; document.head.appendChild(l); }); }
function loadJs(src) { return new Promise((r, j) => { const s = document.createElement('script'); s.src = src; s.onload = r; s.onerror = j; document.head.appendChild(s); }); }
async function initMap() {
  try {
    await Promise.all([loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'), loadJs('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')]);
    const L = window.L;
    const m = L.map('map', { scrollWheelZoom: false, tap: true }).setView([map.lat, map.lng], map.zoom || 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
    const icon = L.divIcon({ className: 'map-pin', html: '<span><i class="bi bi-mortarboard-fill"></i></span>', iconSize: [42, 42], iconAnchor: [21, 42] });
    L.marker([map.lat, map.lng], { icon }).addTo(m).bindPopup(`<b>${esc(map.label || 'Mentora')}</b><br>${esc(c.address)}`);
    m.on('click', () => m.scrollWheelZoom.enable());
    document.getElementById('mapPh').hidden = true;
  } catch {
    document.getElementById('mapPh').innerHTML = `<div><i class="bi bi-map" aria-hidden="true"></i><p class="small mb-2">${esc(t('contact.mapOffline'))}</p><a class="btn btn-sm btn-primary" href="${esc(dirUrl)}" target="_blank" rel="noopener">${esc(t('contact.directions'))}</a></div>`;
  }
}
const frame = document.getElementById('mapFrame');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); initMap(); } }, { rootMargin: '200px' });
  io.observe(frame);
} else initMap();

render();
renderComplaint(document.getElementById('complaintMount'));
onLanguageChange(() => { render(); if (document.getElementById('complaintForm')) renderComplaint(document.getElementById('complaintMount')); });
if (location.hash === '#complaint') setTimeout(() => document.getElementById('complaint').scrollIntoView({ behavior: 'smooth' }), 300);
