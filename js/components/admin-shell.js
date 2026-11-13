/** Admin dashboard frame: sidebar, top bar, role guard, offline queue indicator. */
import { href, brandHtml, bootCommon, offlinePill, BASE } from './common.js';
import { requireRole, signOut, getPermissions, can } from '../services/auth.service.js';
import { themeToggleHtml, bindThemeToggles } from './ui.js';
import { dashboardStats } from '../services/report.service.js';
import { esc } from '../utils/dom.js';
import { initials } from '../utils/format.js';
import { listDrafts, startAutoSync, syncDrafts } from '../pwa/offline-queue.service.js';
import { registerDraftHandlers } from '../pages/admin/draft-handlers.js';
import { showToast } from './toast.js';
import { api } from '../services/api.js';
import { confirmDialog } from './modal.js';

const ADMIN = ['admin'];
const STAFF = ['admin', 'cashier'];
const TEACHER = ['teacher'];
// [page, label, icon, roles, countKey, cashierPermission]
export const NAV = [
  ['Overview', [
    ['index', 'Dashboard', 'bi-grid-1x2', STAFF],
    ['requests', 'Approvals inbox', 'bi-inboxes', ADMIN, 'pending_requests']
  ]],
  ['People', [
    ['students', 'Students', 'bi-people', STAFF],
    ['enquiries', 'Enquiries', 'bi-chat-left-text', STAFF, 'new_enquiries'],
    ['teachers', 'Teachers', 'bi-person-badge', ADMIN],
    ['teacher-applications', 'Teacher applications', 'bi-person-plus', ADMIN, 'new_applications'],
    ['feedback', 'Feedback & reviews', 'bi-chat-heart', ADMIN, 'pending_reviews']
  ]],
  ['Academics', [
    ['subjects', 'Subjects', 'bi-journal-bookmark', ADMIN],
    ['classes', 'Classes', 'bi-easel', ADMIN],
    ['timetable', 'Timetable', 'bi-calendar-week', STAFF, null, 'timetable_view'],
    ['enrollments', 'Enrolments', 'bi-person-check', STAFF, 'admission_requests', 'enrollments_manage'],
    ['attendance', 'Attendance', 'bi-calendar-check', STAFF, null, 'attendance_mark'],
    ['content', 'Notices & learning', 'bi-collection-play', ADMIN]
  ]],
  ['Finance', [
    ['fees', 'Fees & balances', 'bi-wallet2', STAFF],
    ['payments', 'Payments', 'bi-cash-coin', STAFF, 'payments_to_verify', 'payments_record'],
    ['receipts', 'Receipts', 'bi-receipt', STAFF],
    ['teacher-finance', 'Teacher earnings', 'bi-graph-up-arrow', ADMIN],
    ['settlements', 'Settlements', 'bi-bank', ADMIN]
  ]],
  ['Insights', [
    ['reports', 'Reports', 'bi-bar-chart', STAFF, null, 'reports_view'],
    ['settings', 'Settings', 'bi-gear', ADMIN]
  ]]
];
// Teacher panel (/teacher/*). Access switches live in Settings → Access & roles.
export const TEACHER_NAV = [
  ['My work', [
    ['index', 'Dashboard', 'bi-grid-1x2', TEACHER],
    ['timetable', 'Timetable', 'bi-calendar-week', TEACHER],
    ['classes', 'My classes', 'bi-easel', TEACHER],
    ['attendance', 'Attendance', 'bi-calendar-check', TEACHER, null, 'attendance_mark']
  ]],
  ['Learning', [
    ['content', 'Recordings & resources', 'bi-collection-play', TEACHER, null, 'content_submit']
  ]],
  ['Me', [
    ['earnings', 'Earnings', 'bi-graph-up-arrow', TEACHER, null, 'earnings_view'],
    ['reviews', 'Reviews', 'bi-star', TEACHER, null, 'reviews_view'],
    ['profile', 'Profile', 'bi-person-circle', TEACHER]
  ]]
];

/**
 * initAdminPage({ page: 'students', title: 'Students', roles })
 * returns { profile, content } where content is the <main> element to render into.
 */
export async function initAdminPage({ page, title, intro, roles, area = 'admin' }) {
  const nav = area === 'teacher' ? TEACHER_NAV : NAV;
  const item = nav.flatMap(([, items]) => items).find((i) => i[0] === page);
  const allowed = roles || item?.[3] || ADMIN;
  const profile = await requireRole(area === 'teacher' ? TEACHER : STAFF, BASE);
  if (!profile) return new Promise(() => {});
  const perms = await getPermissions();
  const visibleItem = (i) => i[3].includes(profile.role) && (profile.role === 'admin' || !i[5] || can(perms, i[5]));
  if (!allowed.includes(profile.role) || (item && !visibleItem(item))) { location.replace(href(`${area}/index.html`)); return new Promise(() => {}); }

  document.title = `${title} · Mentora ${area === 'teacher' ? 'Teacher' : 'Admin'}`;
  const sidebar = document.getElementById('admin-sidebar');
  sidebar.innerHTML = `${brandHtml(`${area}/index.html`)}
    <nav aria-label="${area === 'teacher' ? 'Teacher' : 'Admin'}">${nav.map(([group, items]) => {
      const visible = items.filter(visibleItem);
      if (!visible.length) return '';
      return `<div class="side-group"><div class="side-group-title">${group}</div>${visible.map(([p, label, icon, , countKey]) =>
        `<a class="side-link ${p === page ? 'active' : ''}" ${p === page ? 'aria-current="page"' : ''} href="${href(`${area}/${p}.html`)}"><i class="bi ${icon}" aria-hidden="true"></i><span>${label}</span>${countKey ? `<span class="count" data-count="${countKey}" hidden></span>` : ''}</a>`).join('')}</div>`;
    }).join('')}</nav>
    <div class="side-foot"><a class="side-link px-0" href="${href('index.html')}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>View public website</a>
    <div class="mt-2">${api.mode === 'demo' ? 'Demo mode · data in this browser' : 'Connected to Supabase'}</div></div>`;

  document.getElementById('admin-topbar').innerHTML = `
    <button class="btn btn-ghost d-lg-none" type="button" id="sbToggle" aria-label="Open menu"><i class="bi bi-list fs-5" aria-hidden="true"></i></button>
    <h1>${esc(title)}</h1>
    <div class="tb-right">
      ${offlinePill()}
      ${themeToggleHtml()}
      <button type="button" class="btn btn-sm btn-outline-primary" id="queueBtn" hidden><i class="bi bi-cloud-upload me-1" aria-hidden="true"></i><span id="queueCount">0</span> drafts</button>
      <div class="user-chip"><span class="avatar avatar-sm">${esc(initials(profile.full_name || profile.email))}</span>
        <span class="who d-none d-sm-flex flex-column lh-sm"><span>${esc(profile.full_name || profile.email || 'Staff')}</span><span class="role">${esc(profile.role)}</span></span></div>
      <button type="button" class="btn btn-sm btn-ghost" id="signOutBtn" title="Sign out" aria-label="Sign out"><i class="bi bi-box-arrow-right" aria-hidden="true"></i></button>
    </div>`;

  const scrim = document.createElement('div');
  scrim.className = 'sidebar-scrim';
  document.body.appendChild(scrim);
  const toggle = (open) => { sidebar.classList.toggle('open', open); scrim.classList.toggle('show', open); };
  document.getElementById('sbToggle').addEventListener('click', () => toggle(true));
  scrim.addEventListener('click', () => toggle(false));

  document.getElementById('signOutBtn').addEventListener('click', async () => {
    const pending = await listDrafts();
    if (pending.length && !(await confirmDialog({ title: 'Unsynced drafts', message: `You have ${pending.length} offline draft(s) that are not synced yet. They stay on this device. Sign out anyway?`, confirmLabel: 'Sign out' }))) return;
    await signOut();
    location.href = href('login.html');
  });

  registerDraftHandlers();
  const refreshQueue = async () => {
    const drafts = await listDrafts();
    const btn = document.getElementById('queueBtn');
    btn.hidden = !drafts.length;
    document.getElementById('queueCount').textContent = drafts.length;
  };
  document.getElementById('queueBtn').addEventListener('click', async () => {
    const r = await syncDrafts();
    showToast(navigator.onLine ? `Synced ${r.synced} draft(s)${r.failed ? `, ${r.failed} need review` : ''}.` : 'You are offline. Drafts will sync when you reconnect.', r.failed ? 'warning' : 'info');
  });
  window.addEventListener('mentora:queue', refreshQueue);
  window.addEventListener('mentora:synced', (e) => showToast(`Synced ${e.detail.synced} offline draft(s).`, 'success'));
  refreshQueue();
  startAutoSync();

  bindThemeToggles(document.getElementById('admin-topbar'));
  // "+2" chips in tables expand in place
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-chip-more]'); if (!b) return;
    e.stopPropagation();
    const list = JSON.parse(b.dataset.chipMore);
    b.parentElement.innerHTML = list.map((x) => `<span class="chip chip-primary">${esc(x)}</span>`).join('');
  }, true);

  if (area === 'admin') dashboardStats().then((s) => {
    document.querySelectorAll('[data-count]').forEach((el) => {
      const v = s?.[el.dataset.count];
      if (v) { el.textContent = v; el.hidden = false; }
    });
  }).catch(() => {});

  bootCommon();
  const content = document.getElementById('admin-content');
  if (intro) content.insertAdjacentHTML('beforebegin', '');
  return { profile, content, perms, isAdmin: profile.role === 'admin', can: (k) => profile.role === 'admin' || can(perms, k) };
}
