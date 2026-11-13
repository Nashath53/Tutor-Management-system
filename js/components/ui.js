/**
 * Small UI helpers shared by every page (no libraries, tiny, fast on 3G).
 *  - Theme (light by default, dark on request, remembered on this device)
 *  - Password "eye" toggle, animated counters, reveal-on-scroll
 *  - Star ratings, "+N" chip overflow, teacher expertise badges, YouTube lite embed
 */
import { store } from '../utils/storage.js';
import { esc } from '../utils/dom.js';
import { t } from '../i18n/language.js';

const THEME_KEY = 'mentora-theme';

/* ---------------- Theme ---------------- */
export const getTheme = () => (store.get(THEME_KEY) === 'dark' ? 'dark' : 'light');
export function applyTheme(theme = getTheme()) {
  const root = document.documentElement;
  if (theme === 'dark') { root.dataset.theme = 'dark'; root.setAttribute('data-bs-theme', 'dark'); }
  else { delete root.dataset.theme; root.removeAttribute('data-bs-theme'); }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#0B1220' : '#2563EB';
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
    b.setAttribute('aria-pressed', String(theme === 'dark'));
    b.setAttribute('aria-label', theme === 'dark' ? t('theme.light') : t('theme.dark'));
    b.title = b.getAttribute('aria-label');
  });
}
export function setTheme(theme) { store.set(THEME_KEY, theme); applyTheme(theme); window.dispatchEvent(new CustomEvent('mentora:theme', { detail: theme })); }
export const themeToggleHtml = () => `<button type="button" class="theme-toggle" data-theme-toggle aria-pressed="false" aria-label="Dark theme"><i class="bi bi-moon-stars-fill" aria-hidden="true"></i><i class="bi bi-sun-fill" aria-hidden="true"></i></button>`;
export function bindThemeToggles(root = document) {
  root.querySelectorAll('[data-theme-toggle]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => setTheme(getTheme() === 'dark' ? 'light' : 'dark'));
  });
  applyTheme();
}

/* ---------------- Password eye ---------------- */
export function bindPasswordToggles(root = document) {
  root.querySelectorAll('input[type="password"]:not([data-eye])').forEach((input) => {
    input.dataset.eye = '1';
    let wrap = input.parentElement;
    if (!wrap.classList.contains('pw-wrap')) {
      wrap = document.createElement('div');
      wrap.className = 'pw-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      // keep Bootstrap's invalid-feedback working (it must be a sibling of the input's wrapper)
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-eye';
    btn.setAttribute('aria-label', t('common.showPassword'));
    btn.innerHTML = '<i class="bi bi-eye" aria-hidden="true"></i>';
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = `<i class="bi ${show ? 'bi-eye-slash' : 'bi-eye'}" aria-hidden="true"></i>`;
      btn.setAttribute('aria-label', show ? t('common.hidePassword') : t('common.showPassword'));
    });
    wrap.appendChild(btn);
  });
}

/* ---------------- Counters + reveal ---------------- */
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export function animateCount(el, to, { duration = 1100, suffix = '', decimals = 0 } = {}) {
  const target = Number(to) || 0;
  if (reduced() || !('IntersectionObserver' in window)) { el.textContent = target.toFixed(decimals) + suffix; return; }
  const run = () => {
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const v = target * (1 - Math.pow(1 - p, 3));
      el.textContent = v.toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); run(); } });
  io.observe(el);
}
export function initReveal(root = document) {
  if (reduced() || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('reveal-ready');
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -40px 0px' });
  root.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el, i) => { el.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`; io.observe(el); });
}

/* ---------------- Stars ---------------- */
export function starsHtml(value, { size = '' } = {}) {
  const v = Math.round((Number(value) || 0) * 2) / 2;
  let s = '';
  for (let i = 1; i <= 5; i++) s += `<i class="bi ${v >= i ? 'bi-star-fill' : v >= i - 0.5 ? 'bi-star-half' : 'bi-star off'}" aria-hidden="true"></i>`;
  return `<span class="stars ${size}" role="img" aria-label="${v} / 5">${s}</span>`;
}
export function starInputHtml(name = 'rating', required = true) {
  let s = '';
  for (let i = 5; i >= 1; i--) s += `<input type="radio" id="${name}-${i}" name="${name}" value="${i}" ${required && i === 5 ? 'required' : ''}><label for="${name}-${i}" title="${i}"><i class="bi bi-star-fill" aria-hidden="true"></i><span class="visually-hidden">${i}</span></label>`;
  return `<div class="star-input" role="radiogroup">${s}</div>`;
}

/* ---------------- Chips with +N overflow ---------------- */
let popEl = null;
function closePop() { popEl?.remove(); popEl = null; }
document.addEventListener('click', (e) => {
  const more = e.target.closest('[data-chip-more]');
  if (!more) { if (popEl && !e.target.closest('.chip-pop')) closePop(); return; }
  e.stopPropagation();
  closePop();
  const items = JSON.parse(more.dataset.chipMore || '[]');
  popEl = document.createElement('div');
  popEl.className = 'chip-pop';
  popEl.setAttribute('role', 'dialog');
  popEl.innerHTML = items.map((x) => `<span class="chip chip-primary">${esc(x)}</span>`).join('');
  document.body.appendChild(popEl);
  const r = more.getBoundingClientRect();
  const left = Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - popEl.offsetWidth - 12);
  popEl.style.left = `${Math.max(8, left)}px`;
  popEl.style.top = `${window.scrollY + r.bottom + 6}px`;
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
window.addEventListener('scroll', closePop, { passive: true });

/** Show at most `max` chips; the rest collapse into a "+N" button that opens a small popover. */
export function chipsCell(labels, { max = 2, cls = 'chip-primary', empty = '—' } = {}) {
  const list = (labels || []).filter(Boolean);
  if (!list.length) return `<span class="text-muted">${empty}</span>`;
  const shown = list.slice(0, max).map((x) => `<span class="chip ${cls}" title="${esc(x)}">${esc(x)}</span>`).join('');
  const rest = list.slice(max);
  const more = rest.length ? `<button type="button" class="chip chip-more" data-chip-more='${esc(JSON.stringify(list))}' aria-label="${t('common.showAll')} (${list.length})">+${rest.length}</button>` : '';
  return `<div class="chip-cell">${shown}${more}</div>`;
}

/* ---------------- Teacher expertise badges ---------------- */
export function expertiseLevel(years) {
  const y = Number(years) || 0;
  if (y >= 15) return { key: 'master', icon: 'bi-gem' };
  if (y >= 8) return { key: 'senior', icon: 'bi-award-fill' };
  if (y >= 3) return { key: 'experienced', icon: 'bi-mortarboard-fill' };
  return { key: 'rising', icon: 'bi-rocket-takeoff-fill' };
}
export function teacherBadges(tch, { limit = 4 } = {}) {
  const out = [];
  const lvl = expertiseLevel(tch.experience_years);
  out.push(`<span class="xbadge lvl-${lvl.key}"><i class="bi ${lvl.icon}" aria-hidden="true"></i>${t(`badge.${lvl.key}`)}</span>`);
  const quals = tch.qualifications || [];
  if (tch.is_verified || quals.some((q) => q.is_verified || q.verified)) out.push(`<span class="xbadge verified"><i class="bi bi-patch-check-fill" aria-hidden="true"></i>${t('badge.verified')}</span>`);
  if (Number(tch.rating_avg) >= 4.5 && Number(tch.rating_count) >= 3) out.push(`<span class="xbadge top"><i class="bi bi-star-fill" aria-hidden="true"></i>${t('badge.topRated')}</span>`);
  if (Number(tch.student_count) >= 20) out.push(`<span class="xbadge popular"><i class="bi bi-people-fill" aria-hidden="true"></i>${t('badge.popular')}</span>`);
  return `<div class="badge-row">${out.slice(0, limit).join('')}</div>`;
}

/* ---------------- Social links (public only — never private details) ---------------- */
const SOCIAL = [['linkedin_url', 'linkedin', 'bi-linkedin', 'LinkedIn'], ['youtube_url', 'youtube', 'bi-youtube', 'YouTube'], ['facebook_url', 'facebook', 'bi-facebook', 'Facebook'], ['website_url', 'website', 'bi-globe2', 'Website']];
export const safeUrl = (u) => { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x.href : ''; } catch { return ''; } };
export function socialRow(obj) {
  const links = SOCIAL.map(([k, cls, icon, label]) => { const u = safeUrl(obj?.[k]); return u ? `<a class="s-${cls}" href="${esc(u)}" target="_blank" rel="noopener nofollow" aria-label="${label}" title="${label}"><i class="bi ${icon}" aria-hidden="true"></i></a>` : ''; }).join('');
  return links ? `<div class="social-row">${links}</div>` : '';
}

/* ---------------- YouTube lite embed ---------------- */
export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  return m ? m[1] : null;
}
export function ytLiteHtml(url, title = '') {
  const id = youtubeId(url);
  if (!id) return `<a class="media-item" href="${esc(safeUrl(url))}" target="_blank" rel="noopener"><span class="mi-ico k-youtube"><i class="bi bi-youtube"></i></span><div><b>${esc(title || 'YouTube')}</b></div></a>`;
  return `<button type="button" class="yt-lite" data-yt="${id}" style="background-image:url('https://i.ytimg.com/vi/${id}/hqdefault.jpg')" aria-label="${esc(t('common.play'))}: ${esc(title)}"><span class="play"><i class="bi bi-play-fill" aria-hidden="true"></i></span><span class="yt-title">${esc(title)}</span></button>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.yt-lite[data-yt]');
  if (!b || b.querySelector('iframe')) return;
  const f = document.createElement('iframe');
  f.src = `https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0`;
  f.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
  f.allowFullscreen = true;
  f.title = b.getAttribute('aria-label') || 'YouTube';
  b.appendChild(f);
});

/* ---------------- Drawer ---------------- */
export function openDrawer({ title, html, onMount }) {
  document.querySelectorAll('.m-drawer, .m-drawer-scrim').forEach((x) => x.remove());
  const scrim = document.createElement('div'); scrim.className = 'm-drawer-scrim';
  const d = document.createElement('aside'); d.className = 'm-drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = `<div class="m-drawer-head"><h2 class="h6 m-0 flex-grow-1">${title}</h2><button type="button" class="btn-close" aria-label="${t('common.close')}"></button></div><div class="m-drawer-body">${html}</div>`;
  document.body.append(scrim, d);
  const prev = document.activeElement;
  const close = () => { d.classList.remove('open'); scrim.classList.remove('open'); setTimeout(() => { d.remove(); scrim.remove(); prev?.focus?.(); }, 250); document.removeEventListener('keydown', esc_); };
  const esc_ = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc_);
  scrim.addEventListener('click', close);
  d.querySelector('.btn-close').addEventListener('click', close);
  requestAnimationFrame(() => { d.classList.add('open'); scrim.classList.add('open'); d.querySelector('.btn-close').focus(); });
  onMount?.(d.querySelector('.m-drawer-body'), close);
  return { el: d, close };
}

/* ---------------- Image resize (profile photos: small = fast) ---------------- */
export function resizeImage(file, max = 320, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('resize failed'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image')); };
    img.src = url;
  });
}
export const blobToDataUrl = (blob) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });

/** Copy text to clipboard with fallback. */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* */ } ta.remove(); return ok;
  }
}
