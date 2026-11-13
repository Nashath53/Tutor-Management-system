import { initAdminPage } from '../../components/admin-shell.js';
import { lookups } from './admin-common.js';
import { qs } from '../../utils/dom.js';
import { mountTimetable } from '../shared/timetable-board.js';

const { content, profile } = await initAdminPage({ page: 'timetable', title: 'Timetable' });
const L = await lookups('classes', 'teachers');
await mountTimetable(content, { role: profile.role, classes: L.classes.filter((c) => c.is_active), teachers: L.teachers, initialClass: qs('class') || '' });
