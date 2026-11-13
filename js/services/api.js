/**
 * Data access layer.
 * Every service talks to `api` — never to Supabase directly.
 *  - LIVE mode: Supabase (Auth + PostgreSQL + RLS + RPC functions).
 *  - DEMO mode: a browser-only copy that imitates the same tables and RPC functions,
 *    so the whole app can be tested before the backend is configured.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from '../config/supabase.js';
import { APP } from '../config/app.config.js';

function friendlyError(error) {
  const msg = error?.message || String(error);
  const e = new Error(msg.replace(/^.*?ERROR:\s*/, ''));
  e.code = error?.code;
  e.details = error?.details;
  return e;
}

function applyFilters(q, o = {}) {
  for (const [k, v] of Object.entries(o.eq || {})) q = q.eq(k, v);
  for (const [k, v] of Object.entries(o.neq || {})) q = q.neq(k, v);
  for (const [k, v] of Object.entries(o.in || {})) q = q.in(k, v);
  for (const [k, v] of Object.entries(o.gte || {})) q = q.gte(k, v);
  for (const [k, v] of Object.entries(o.lt || {})) q = q.lt(k, v);
  for (const [k, v] of Object.entries(o.lte || {})) q = q.lte(k, v);
  if (o.order) q = q.order(o.order[0], { ascending: o.order[1] !== 'desc' });
  if (o.limit) q = q.limit(o.limit);
  return q;
}

function liveApi(sb) {
  const unwrap = ({ data, error }) => { if (error) throw friendlyError(error); return data; };
  return {
    mode: 'live',
    client: sb,
    async select(table, o = {}) {
      // Supabase returns max 1000 rows per request by default; page through larger tables.
      if (o.limit) return unwrap(await applyFilters(sb.from(table).select(o.columns || '*'), o));
      const pageSize = 1000; let from = 0; const all = [];
      for (;;) {
        const rows = unwrap(await applyFilters(sb.from(table).select(o.columns || '*'), o).range(from, from + pageSize - 1));
        all.push(...rows);
        if (rows.length < pageSize) return all;
        from += pageSize;
      }
    },
    async get(table, id, key = 'id') { return unwrap(await sb.from(table).select('*').eq(key, id).maybeSingle()); },
    async insert(table, row) { return unwrap(await sb.from(table).insert(row).select()); },
    async update(table, id, patch, key = 'id') { return unwrap(await sb.from(table).update(patch).eq(key, id).select().single()); },
    async upsert(table, row, onConflict) { return unwrap(await sb.from(table).upsert(row, onConflict ? { onConflict } : undefined).select()); },
    async remove(table, id, key = 'id') { return unwrap(await sb.from(table).delete().eq(key, id)); },
    async rpc(name, args = {}) { return unwrap(await sb.rpc(name, args)); },
    async upload(bucket, path, file) { return unwrap(await sb.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type })); },
    publicUrl(bucket, path) { return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl; },
    async signedUrl(bucket, path) { return unwrap(await sb.storage.from(bucket).createSignedUrl(path, 300)).signedUrl; },
    auth: {
      async session() { return (await sb.auth.getSession()).data.session; },
      async signIn(email, password) { return unwrap(await sb.auth.signInWithPassword({ email, password })); },
      async signOut() { await sb.auth.signOut(); },
      async profile() {
        const s = (await sb.auth.getSession()).data.session;
        if (!s) return null;
        return unwrap(await sb.from('profiles').select('*').eq('id', s.user.id).maybeSingle());
      },
      async resetPassword(email, redirectTo) { return unwrap(await sb.auth.resetPasswordForEmail(email, { redirectTo })); },
      async updatePassword(password) { return unwrap(await sb.auth.updateUser({ password })); }
    }
  };
}

async function createApi() {
  if (isSupabaseConfigured() && !APP.forceDemo) {
    try {
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      return liveApi(createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      }));
    } catch (err) {
      console.error('Could not load Supabase client (offline?)', err);
      const offline = liveApi(null);
      offline.mode = 'live-offline';
      const fail = async () => { throw new Error('You are offline. Please reconnect and try again.'); };
      Object.assign(offline, { select: fail, get: fail, insert: fail, update: fail, upsert: fail, remove: fail, rpc: fail, upload: fail });
      offline.auth = { session: async () => null, profile: async () => null, signIn: fail, signOut: async () => {}, resetPassword: fail, updatePassword: fail };
      return offline;
    }
  }
  const { createDemoApi } = await import('./demo/demo-api.js');
  return createDemoApi();
}

export const api = await createApi();
export const isDemo = () => api.mode === 'demo';
