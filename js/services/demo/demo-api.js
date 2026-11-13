/**
 * DEMO MODE backend (browser only).
 * Mirrors the Supabase tables and RPC functions in supabase/migrations so the
 * front end behaves the same way. Data is stored in this browser only.
 * Nothing here is used once real Supabase keys are configured.
 */
import { store } from '../../utils/storage.js';
import { uuid } from '../../utils/ids.js';
import { createDemoRpc } from './demo-rpc.js';
import { createDemoRpcV2 } from './demo-rpc-v2.js';
import { seedDemo } from './demo-seed.js';

const DB_KEY = 'mentora-demo-db-v3';
const SESSION_KEY = 'mentora-demo-session';

export const TABLES = [
  'app_settings', 'code_counters', 'subjects', 'teachers', 'teacher_qualifications', 'teacher_subjects',
  'teacher_applications', 'classes', 'class_private', 'class_teachers', 'students', 'student_enquiries',
  'enrollments', 'class_sessions', 'attendance', 'attendance_batches', 'fee_ledger', 'payments',
  'payment_allocations', 'receipts', 'payment_reversals', 'cash_reconciliations', 'teacher_settlements',
  'notices', 'recordings', 'profiles', 'audit_log', 'rate_limits',
  // version 2
  'resources', 'community_links', 'teacher_media', 'reviews', 'audience_feedback', 'complaints',
  'timetable_slots', 'timetable_change_requests', 'attendance_disputes', 'profile_change_requests', 'class_poll_responses'
];

const PK = { app_settings: 'key', code_counters: 'prefix', class_private: 'class_id', attendance_batches: 'client_uuid' };

export const DEMO_ACCOUNTS = [
  { email: 'admin@mentora.demo', password: 'demo1234', profile: { id: 'demo-admin', role: 'admin', full_name: 'Demo Administrator', email: 'admin@mentora.demo' } },
  { email: 'cashier@mentora.demo', password: 'demo1234', profile: { id: 'demo-cashier', role: 'cashier', full_name: 'Demo Cashier', email: 'cashier@mentora.demo' } },
  { email: 'teacher@mentora.demo', password: 'demo1234', profile: { id: 'demo-teacher', role: 'teacher', full_name: 'Demo Teacher', email: 'teacher@mentora.demo', teacher_ref: 'MT-001' } },
  { email: 'student@mentora.demo', password: 'demo1234', profile: { id: 'demo-student', role: 'student', full_name: 'Demo Student', email: 'student@mentora.demo', student_ref: 'MA-0001' } }
];

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

function makeDb(tables) {
  const db = {
    t: tables,
    save() { store.set(DB_KEY, tables); },
    pk(table) { return PK[table] || 'id'; },
    nextSerial(prefix) {
      let c = tables.code_counters.find((r) => r.prefix === prefix);
      if (!c) { c = { prefix, last_value: 0 }; tables.code_counters.push(c); }
      c.last_value += 1;
      return c.last_value;
    },
    insert(table, row) {
      const key = db.pk(table);
      const r = { ...row };
      if (key === 'id' && !r.id) r.id = uuid();
      r.created_at = r.created_at || new Date().toISOString();
      if (table === 'students' && !r.student_code) r.student_code = 'MA-' + pad(db.nextSerial('STUDENT'), 4);
      if (table === 'teachers' && !r.teacher_code) r.teacher_code = 'MT-' + pad(db.nextSerial('TEACHER'), 3);
      if (tables[table].some((x) => x[key] === r[key])) throw new Error(`Duplicate ${key} in ${table}`);
      tables[table].push(r);
      return r;
    },
    update(table, id, patch) {
      const key = db.pk(table);
      const r = tables[table].find((x) => x[key] === id);
      if (!r) throw new Error('Record not found');
      Object.assign(r, patch, { updated_at: new Date().toISOString() });
      return r;
    },
    find(table, id) { const key = db.pk(table); return tables[table].find((x) => x[key] === id); },
    where(table, fn) { return tables[table].filter(fn); }
  };
  return db;
}

export const pad = (n, w) => (String(n).length >= w ? String(n) : String(n).padStart(w, '0'));

function matches(row, o) {
  for (const [k, v] of Object.entries(o.eq || {})) if (row[k] !== v) return false;
  for (const [k, v] of Object.entries(o.neq || {})) if (row[k] === v) return false;
  for (const [k, v] of Object.entries(o.in || {})) if (!v.includes(row[k])) return false;
  for (const [k, v] of Object.entries(o.gte || {})) if (!(row[k] >= v)) return false;
  for (const [k, v] of Object.entries(o.lt || {})) if (!(row[k] < v)) return false;
  for (const [k, v] of Object.entries(o.lte || {})) if (!(row[k] <= v)) return false;
  return true;
}

export function createDemoApi() {
  let tables = store.get(DB_KEY);
  let fresh = false;
  if (!tables || !tables.__v) { tables = { __v: 1 }; fresh = true; }
  TABLES.forEach((n) => { tables[n] = tables[n] || []; });
  const db = makeDb(tables);

  let session = store.get(SESSION_KEY);
  const ctx = {
    profile: () => session?.profile || null,
    setProfile: (p) => { session = p ? { profile: p } : null; }
  };
  const base = createDemoRpc(db, ctx);
  const rpc = { ...base, ...createDemoRpcV2(db, ctx, base) };

  if (fresh) {
    const prev = session;
    ctx.setProfile(DEMO_ACCOUNTS[0].profile);
    seedDemo(db, rpc);
    session = prev;
    db.save();
  }

  const guardWrite = () => {
    const p = ctx.profile();
    if (!p || !['admin', 'cashier'].includes(p.role)) throw new Error('Only staff can change this record. Sign in as admin (demo).');
  };

  const delay = (v) => new Promise((r) => setTimeout(() => r(v), 60));

  return {
    mode: 'demo',
    db,
    async select(table, o = {}) {
      let rows = tables[table].filter((r) => matches(r, o));
      if (o.order) {
        const [k, dir] = o.order;
        rows = [...rows].sort((a, b) => (a[k] ?? '') > (b[k] ?? '') ? 1 : (a[k] ?? '') < (b[k] ?? '') ? -1 : 0);
        if (dir === 'desc') rows.reverse();
      }
      if (o.limit) rows = rows.slice(0, o.limit);
      return delay(clone(rows));
    },
    async get(table, id, key) { return delay(clone(key ? tables[table].find((r) => r[key] === id) : db.find(table, id)) || null); },
    async insert(table, row) {
      guardWrite();
      const rows = (Array.isArray(row) ? row : [row]).map((r) => db.insert(table, r));
      db.save();
      return delay(clone(rows));
    },
    async update(table, id, patch, key) {
      guardWrite();
      let r;
      if (key && key !== db.pk(table)) {
        r = tables[table].find((x) => x[key] === id);
        if (!r) throw new Error('Record not found');
        Object.assign(r, patch);
      } else r = db.update(table, id, patch);
      db.save();
      return delay(clone(r));
    },
    async upsert(table, row) {
      guardWrite();
      const key = db.pk(table);
      const rows = (Array.isArray(row) ? row : [row]).map((r) => (db.find(table, r[key]) ? db.update(table, r[key], r) : db.insert(table, r)));
      db.save();
      return delay(clone(rows));
    },
    async remove(table, id, key) {
      guardWrite();
      const k = key || db.pk(table);
      const allowed = ['class_teachers', 'teacher_subjects', 'teacher_qualifications', 'notices', 'recordings',
        'resources', 'community_links', 'teacher_media', 'timetable_slots', 'reviews', 'audience_feedback'];
      if (!allowed.includes(table)) throw new Error('Records in this table cannot be deleted.');
      tables[table] = tables[table].filter((r) => r[k] !== id);
      db.t[table] = tables[table];
      db.save();
      return delay(null);
    },
    async rpc(name, args = {}) {
      const fn = rpc[name];
      if (!fn) throw new Error(`Function ${name} is not available in demo mode.`);
      const result = fn(args);
      db.save();
      return delay(clone(result));
    },
    async upload(bucket, path, file) { return delay({ path, demo: true, name: file?.name }); },
    publicUrl() { return ''; },
    async signedUrl() { return '#'; },
    reset() { store.remove(DB_KEY); store.remove(SESSION_KEY); },
    auth: {
      demoAccounts: DEMO_ACCOUNTS,
      async session() { return session ? { user: { id: session.profile.id, email: session.profile.email } } : null; },
      async signIn(email, password) {
        const acc = DEMO_ACCOUNTS.find((a) => a.email === String(email).trim().toLowerCase() && a.password === password);
        if (!acc) throw new Error('Invalid login credentials. Use one of the demo accounts shown below.');
        const profile = { ...acc.profile };
        if (acc.profile.student_ref) {
          const s = tables.students.find((x) => x.student_code === acc.profile.student_ref) || tables.students[0];
          profile.student_id = s?.id;
          profile.full_name = s?.full_name || profile.full_name;
        }
        if (acc.profile.teacher_ref) {
          const t = tables.teachers.find((x) => x.teacher_code === acc.profile.teacher_ref) || tables.teachers[0];
          profile.teacher_id = t?.id;
          profile.full_name = t?.display_name || profile.full_name;
        }
        session = { profile };
        store.set(SESSION_KEY, session);
        return delay({ user: { id: profile.id, email } });
      },
      async signOut() { session = null; store.remove(SESSION_KEY); },
      async profile() { return clone(session?.profile || null); },
      async resetPassword() { return delay({}); },
      async updatePassword() { return delay({}); }
    }
  };
}
