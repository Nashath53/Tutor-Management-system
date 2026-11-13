/**
 * Safe key/value storage. Uses localStorage when available.
 * Falls back to window.name (survives page navigation in the same tab) and memory,
 * because some embedded previews block localStorage.
 */
const memory = {};
let ls = null;
try {
  const k = '__mentora_test';
  window.localStorage.setItem(k, '1');
  window.localStorage.removeItem(k);
  ls = window.localStorage;
} catch { ls = null; }

function readName() {
  try {
    const o = JSON.parse(window.name || '{}');
    return o && typeof o === 'object' && o.__mentora ? o : { __mentora: true };
  } catch { return { __mentora: true }; }
}

export const store = {
  available: !!ls,
  get(key, fallback = null) {
    try {
      if (ls) {
        const v = ls.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      }
      const o = readName();
      if (key in o) return o[key];
      return key in memory ? memory[key] : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    try {
      if (ls) { ls.setItem(key, JSON.stringify(value)); return; }
      const o = readName();
      o[key] = value;
      window.name = JSON.stringify(o);
    } catch { memory[key] = value; }
  },
  remove(key) {
    try {
      if (ls) { ls.removeItem(key); return; }
      const o = readName();
      delete o[key];
      window.name = JSON.stringify(o);
    } catch { delete memory[key]; }
  }
};
