/**
 * Tiny SVG charts (no Chart.js download → fast on 3G). Colours follow the brand palette
 * and read CSS variables so they work in light and dark themes.
 *   barChart(el, { labels, series:[{name, data, color}], format, stacked })
 *   lineChart(el, { labels, series:[{name, data, color}], format, area:true })
 *   donutChart(el, { items:[{label, value, color}], center, format })
 *   sparkline(values, color) → svg string
 *   ringHtml(pct, label, color) → html string
 */
import { esc } from '../utils/dom.js';

export const PALETTE = ['#2563EB', '#06B6D4', '#F97316', '#10B981', '#FBBF24', '#6366F1', '#EC4899', '#64748B'];
const fmtDefault = (v) => Number(v).toLocaleString('en-LK');
const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const short = (v) => { const a = Math.abs(v); return a >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : String(Math.round(v)); };

function tip(el) {
  let t = el.querySelector('.chart-tip');
  if (!t) { t = document.createElement('div'); t.className = 'chart-tip'; t.hidden = true; el.appendChild(t); }
  return t;
}
function bindTips(el) {
  const t = tip(el);
  el.querySelectorAll('[data-tip]').forEach((n) => {
    const show = () => { const r = el.getBoundingClientRect(); const b = n.getBoundingClientRect(); t.textContent = n.dataset.tip; t.style.left = `${b.left - r.left + b.width / 2}px`; t.style.top = `${b.top - r.top}px`; t.hidden = false; };
    n.addEventListener('mouseenter', show); n.addEventListener('focus', show); n.addEventListener('touchstart', show, { passive: true });
    n.addEventListener('mouseleave', () => { t.hidden = true; }); n.addEventListener('blur', () => { t.hidden = true; });
  });
}
function legend(series) { return series.length > 1 ? `<div class="legend mt-2">${series.map((s, i) => `<span><i style="background:${s.color || PALETTE[i]}"></i>${esc(s.name)}</span>`).join('')}</div>` : ''; }

export function barChart(el, { labels, series, format = fmtDefault, stacked = false, height = 220 }) {
  const W = 600, H = height, L = 44, B = 26, T = 10;
  const n = labels.length || 1;
  const totals = labels.map((_, i) => (stacked ? series.reduce((s, x) => s + (Number(x.data[i]) || 0), 0) : Math.max(...series.map((x) => Number(x.data[i]) || 0))));
  const max = niceMax(Math.max(1, ...totals));
  const ih = H - B - T, iw = W - L - 6, gw = iw / n;
  const bw = stacked ? Math.min(42, gw * 0.6) : Math.min(28, (gw * 0.7) / series.length);
  let g = '<g class="grid">';
  for (let k = 0; k <= 4; k++) { const y = T + ih - (ih * k) / 4; g += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}"/><text class="lbl" x="${L - 6}" y="${y + 4}" text-anchor="end">${short((max * k) / 4)}</text>`; }
  g += '</g>';
  let bars = '';
  labels.forEach((lab, i) => {
    const cx = L + gw * i + gw / 2;
    let acc = 0;
    series.forEach((s, si) => {
      const v = Number(s.data[i]) || 0; const h = (v / max) * ih;
      const x = stacked ? cx - bw / 2 : cx - (bw * series.length) / 2 + si * bw;
      const y = T + ih - h - (stacked ? acc : 0);
      if (stacked) acc += h;
      bars += `<rect class="bar" tabindex="0" data-tip="${esc(lab)} · ${esc(s.name || '')} ${esc(format(v))}" x="${x + 1}" y="${y}" width="${bw - 2}" height="${Math.max(0, h)}" rx="${Math.min(6, bw / 3)}" fill="${s.color || PALETTE[si]}"/>`;
    });
    bars += `<text class="lbl" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`;
  });
  el.classList.add('chart');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">${g}${bars}</svg>${legend(series)}`;
  bindTips(el);
}

export function lineChart(el, { labels, series, format = fmtDefault, area = true, height = 220, max: fixedMax }) {
  const W = 600, H = height, L = 44, B = 26, T = 12;
  const n = labels.length;
  const max = fixedMax || niceMax(Math.max(1, ...series.flatMap((s) => s.data.map(Number))));
  const ih = H - B - T, iw = W - L - 12;
  const X = (i) => L + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
  const Y = (v) => T + ih - ((Number(v) || 0) / max) * ih;
  let g = '<g class="grid">';
  for (let k = 0; k <= 4; k++) { const y = T + ih - (ih * k) / 4; g += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}"/><text class="lbl" x="${L - 6}" y="${y + 4}" text-anchor="end">${short((max * k) / 4)}</text>`; }
  g += '</g>';
  let paths = '', defs = '';
  series.forEach((s, si) => {
    const c = s.color || PALETTE[si];
    const pts = s.data.map((v, i) => [X(i), Y(v)]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    if (area && pts.length) {
      defs += `<linearGradient id="lg${si}${el.id || ''}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity="0.28"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`;
      paths += `<path d="${d} L${pts.at(-1)[0]},${T + ih} L${pts[0][0]},${T + ih} Z" fill="url(#lg${si}${el.id || ''})"/>`;
    }
    paths += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach((p, i) => { paths += `<circle tabindex="0" data-tip="${esc(labels[i])} · ${esc(s.name || '')} ${esc(format(s.data[i]))}" cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--m-surface)" stroke="${c}" stroke-width="2.5"/>`; });
  });
  const xl = labels.map((lab, i) => `<text class="lbl" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`).join('');
  el.classList.add('chart');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart"><defs>${defs}</defs>${g}${paths}${xl}</svg>${legend(series)}`;
  bindTips(el);
}

export function donutChart(el, { items, center = '', centerSub = '', format = fmtDefault }) {
  const total = items.reduce((s, x) => s + (Number(x.value) || 0), 0);
  const R = 52, C = 2 * Math.PI * R;
  let off = 0, arcs = '';
  items.forEach((x, i) => {
    const v = Number(x.value) || 0; if (!v) return;
    const len = (v / (total || 1)) * C;
    arcs += `<circle tabindex="0" data-tip="${esc(x.label)} · ${esc(format(v))}" r="${R}" cx="70" cy="70" fill="none" stroke="${x.color || PALETTE[i]}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`;
    off += len;
  });
  if (!total) arcs = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--m-offset)" stroke-width="18"/>`;
  el.classList.add('chart');
  el.innerHTML = `<div class="donut-wrap"><div style="position:relative;max-width:150px;width:100%"><svg viewBox="0 0 140 140" role="img" aria-label="Donut chart">${arcs}<text x="70" y="70" text-anchor="middle" font-weight="800" font-size="22" fill="var(--m-ink-strong)">${esc(center || String(total))}</text><text x="70" y="88" text-anchor="middle" font-size="10" fill="var(--m-muted)">${esc(centerSub)}</text></svg></div>
    <div class="legend">${items.map((x, i) => `<span><span class="d-inline-flex align-items-center gap-2"><i style="background:${x.color || PALETTE[i]}"></i>${esc(x.label)}</span><b>${esc(format(x.value || 0))}</b></span>`).join('')}</div></div>`;
  bindTips(el);
}

export function sparkline(values, color = '#2563EB', w = 84, h = 28) {
  const v = values.map(Number); const max = Math.max(1, ...v); const min = Math.min(0, ...v);
  const pts = v.map((x, i) => `${(w * i) / Math.max(1, v.length - 1)},${h - ((x - min) / (max - min || 1)) * (h - 4) - 2}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function ringHtml(pct, label = '', color = '#10B981', size = 120) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const R = 48, C = 2 * Math.PI * R;
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 120 120" width="${size}" height="${size}"><circle r="${R}" cx="60" cy="60" fill="none" stroke="var(--m-offset)" stroke-width="12"/><circle r="${R}" cx="60" cy="60" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(C * p) / 100} ${C}"/></svg><div class="ring-v"><div>${Math.round(p)}%<small>${esc(label)}</small></div></div></div>`;
}
