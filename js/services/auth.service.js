import { api } from './api.js';

let cachedProfile;

export async function getProfile(force = false) {
  if (cachedProfile !== undefined && !force) return cachedProfile;
  try { cachedProfile = await api.auth.profile(); } catch { cachedProfile = null; }
  return cachedProfile;
}

export async function signIn(email, password) {
  await api.auth.signIn(email.trim(), password);
  return getProfile(true);
}

export async function signOut() {
  await api.auth.signOut();
  cachedProfile = null;
}

/** Permission switches the admin controls in Settings → Access & roles. Admins have everything. */
let cachedPerms;
export async function getPermissions(force = false) {
  if (cachedPerms && !force) return cachedPerms;
  try { cachedPerms = (await api.rpc('get_my_permissions')) || {}; } catch { cachedPerms = {}; }
  return cachedPerms;
}
export const can = (perms, key) => !!(perms?.all || perms?.[key]);

export const isStaffRole = (role) => ['admin', 'cashier'].includes(role);

/** Where each role lands after login. */
export function homeFor(profile, base = '') {
  if (!profile) return base + 'login.html';
  if (isStaffRole(profile.role)) return base + 'admin/index.html';
  if (profile.role === 'teacher') return base + 'teacher/index.html';
  return base + 'portal/index.html';
}

/**
 * Page guard. Redirects to login when not signed in or the role is not allowed.
 * NOTE: this is only for user experience. Real protection is Row Level Security in the database.
 */
export async function requireRole(roles, base = '') {
  const profile = await getProfile();
  if (!profile) {
    location.replace(`${base}login.html?next=${encodeURIComponent(location.pathname.split('/').slice(-2).join('/'))}`);
    return null;
  }
  if (!roles.includes(profile.role)) {
    location.replace(homeFor(profile, base));
    return null;
  }
  return profile;
}
