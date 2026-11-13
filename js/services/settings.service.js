import { api } from './api.js';
import { APP } from '../config/app.config.js';

export const DEFAULT_SETTINGS = {
  admission_fee: { enabled: true, amount: 250 },
  trial: { sessions: 2 },
  billing: { billable_statuses: ['present', 'late'], min_payment_percent: 50, allow_partial: true },
  commission: { intro_rate: 0, intro_student_cap: 20, standard_rate: 5 },
  tax: { wht_enabled: false, wht_rate: 5, wht_threshold: 100000 },
  bank: { bank_name: APP.bank.bankName, account_name: APP.bank.accountName, account_number: APP.bank.accountNumber, branch: APP.bank.branch },
  contact: { whatsapp: APP.whatsappNumber, phone: APP.phoneDisplay, email: APP.email, address: APP.address, hours: APP.hours },
  social: { facebook: '', instagram: '', youtube: '', tiktok: '', telegram: '' },
  map: { lat: 7.2083, lng: 79.8358, zoom: 15, label: 'Mentora Learning Centre, Negombo' },
  poll: { enabled: true, hours_before: 24 },
  permissions: {
    cashier: { students_edit: true, enrollments_manage: true, attendance_mark: true, payments_record: true, timetable_view: true, reports_view: true },
    teacher: { attendance_mark: false, roster_view: true, student_contacts_view: false, earnings_view: true, content_submit: true, timetable_request: true, poll_view: true, reviews_view: true }
  }
};
/** Settings that anonymous visitors may read (RLS: app_settings.is_public). Never put secrets here. */
export const PUBLIC_KEYS = ['admission_fee', 'trial', 'bank', 'contact', 'social', 'map', 'poll'];

let cache;
export async function getSettings(force = false) {
  if (cache && !force) return cache;
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  try {
    const rows = await api.select('app_settings');
    rows.forEach((r) => { out[r.key] = { ...(out[r.key] || {}), ...(r.value || {}) }; });
  } catch (e) { console.warn('Settings unavailable, using defaults', e); }
  cache = out;
  return out;
}

export async function saveSetting(key, value) {
  cache = undefined;
  return api.upsert('app_settings', { key, value, is_public: PUBLIC_KEYS.includes(key) }, 'key');
}
