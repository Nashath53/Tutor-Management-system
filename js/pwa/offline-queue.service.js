/**
 * Offline draft queue (IndexedDB).
 * Used for: attendance drafts, cash-payment drafts and public enquiry drafts.
 * Rules:
 *  - Each draft has a client UUID; the server uses it to ignore duplicates (idempotent sync).
 *  - Drafts sync ONLY when online (and signed in for staff drafts).
 *  - A cash draft is NOT a receipt. The official receipt number comes from the server after sync.
 */
const DB_NAME = 'mentora-offline';
const STORE = 'drafts';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB not supported'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('type', 'type');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const result = fn(s);
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

export async function addDraft(type, payload, label = '') {
  const draft = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), type, payload, label, status: 'pending', error: null, created_at: new Date().toISOString() };
  await tx('readwrite', (s) => s.put(draft));
  notify();
  return draft;
}

export async function listDrafts(type) {
  try {
    const all = await tx('readonly', (s) => s.getAll());
    return (all || []).filter((d) => !type || d.type === type).sort((a, b) => a.created_at.localeCompare(b.created_at));
  } catch { return []; }
}

export async function removeDraft(id) { await tx('readwrite', (s) => s.delete(id)); notify(); }
async function saveDraft(d) { await tx('readwrite', (s) => s.put(d)); }

const handlers = {};
/** Register how a draft type is sent to the server: registerHandler('attendance', async (payload, id) => ...) */
export function registerHandler(type, fn) { handlers[type] = fn; }

let syncing = false;
export async function syncDrafts() {
  if (syncing || !navigator.onLine) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0, failed = 0;
  try {
    for (const d of await listDrafts()) {
      const h = handlers[d.type];
      if (!h) continue;
      try {
        await h(d.payload, d.id);
        await removeDraft(d.id);
        synced++;
      } catch (err) {
        // Network errors stay pending; validation errors are kept for review.
        const msg = err?.message || String(err);
        if (/fetch|network|offline/i.test(msg)) break;
        d.status = 'failed'; d.error = msg;
        await saveDraft(d);
        failed++;
      }
    }
  } finally { syncing = false; notify(); }
  return { synced, failed };
}

function notify() { window.dispatchEvent(new CustomEvent('mentora:queue')); }

export function startAutoSync() {
  window.addEventListener('online', () => syncDrafts().then((r) => r.synced && window.dispatchEvent(new CustomEvent('mentora:synced', { detail: r }))));
  if (navigator.onLine) setTimeout(() => syncDrafts().then((r) => r.synced && window.dispatchEvent(new CustomEvent('mentora:synced', { detail: r }))), 1500);
}
