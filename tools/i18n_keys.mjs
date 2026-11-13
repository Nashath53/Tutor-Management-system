// Lists every translation key used in HTML/JS and checks en.js / ta.js cover them.
import fs from 'fs'; import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (['node_modules', '.git', 'tools', 'supabase'].includes(f)) continue; if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(js|html)$/.test(f) && !p.includes('/i18n/')) files.push(p); } })(root);
const keys = new Set();
const PRE = 'nav|footer|home|courses|trial|teachers|join|teach|form|validation|contact|login|portal|fees|att|notices|rec|profile|common|demo|pwa|brand|privacy|role|status|opt|ledger|method|theme|badge|faq|review|survey|complaint|tp|poll|res';
const re = [new RegExp(`['"\`]((?:${PRE})\\.[a-zA-Z0-9_.]*[a-zA-Z0-9_])['"\`]`, 'g'), /\bt\(\s*'([a-zA-Z0-9_.]+)'/g, /data-i18n(?:-placeholder|-aria|-title)?="([a-zA-Z0-9_.]+)"/g, /\bt\(\s*"([a-zA-Z0-9_.]+)"/g];
for (const f of files) { const s = fs.readFileSync(f, 'utf8'); for (const r of re) for (const m of s.matchAll(r)) if (m[1].includes('.') && !m[1].endsWith('.') && !m[1].endsWith('.html')) keys.add(m[1]); }
const { OPTIONS } = { OPTIONS: { mediums: ['english', 'tamil', 'sinhala'], modes: ['physical', 'online', 'hybrid'], classTypes: ['group', 'individual', 'revision', 'paper_class', 'free_trial'], days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], times: ['morning', 'afternoon', 'evening', 'weekend'], referral: ['social_media', 'google', 'whatsapp', 'friends', 'other'] } };
const map = { medium: 'mediums', mode: 'modes', classType: 'classTypes', day: 'days', time: 'times', referral: 'referral' };
for (const [g, k] of Object.entries(map)) OPTIONS[k].forEach((v) => keys.add(`opt.${g}.${v}`));
['present', 'late', 'absent', 'excused', 'trial', 'cancelled', 'trial_completed', 'admission_requested', 'approved', 'suspended', 'withdrawn', 'rejected', 'receipt_sent', 'pending', 'verified', 'reversed', 'new', 'contacted', 'converted', 'closed', 'active', 'paid', 'draft', 'finalised', 'under_review', 'completed', 'removed', 'expired', 'in_progress', 'resolved', 'reviewed', 'scheduled', 'held'].forEach((s) => keys.add('status.' + s));
['session_charge', 'admission_fee', 'adjustment', 'reversal', 'payment'].forEach((s) => keys.add('ledger.' + s));
['bank_transfer', 'cash', 'representative_cash'].forEach((s) => keys.add('method.' + s));
['admin', 'cashier', 'student', 'teacher'].forEach((s) => keys.add('role.' + s));
const sorted = [...keys].sort();
const mode = process.argv[2];
if (mode === 'list') { console.log(sorted.join('\n')); process.exit(0); }
const en = (await import(path.join(root, 'js/i18n/en.js'))).default; const ta = (await import(path.join(root, 'js/i18n/ta.js'))).default;
const miss = (d) => sorted.filter((k) => !(k in d));
const extra = (d) => Object.keys(d).filter((k) => !keys.has(k));
console.log('keys', sorted.length, '| missing en', miss(en), '| missing ta', miss(ta), '| unused en', extra(en).length);
const vars = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join();
const bad = sorted.filter((k) => en[k] && ta[k] && vars(en[k]) !== vars(ta[k])); if (bad.length) console.log('placeholder mismatch', bad);
process.exit(miss(en).length || miss(ta).length || bad.length ? 1 : 0);
