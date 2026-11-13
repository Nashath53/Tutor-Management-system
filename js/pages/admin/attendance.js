import { initAdminPage } from '../../components/admin-shell.js';
import { lookups, classLabel } from './admin-common.js';
import { qs } from '../../utils/dom.js';
import { mountAttendance } from '../shared/attendance-board.js';

const { content } = await initAdminPage({ page: 'attendance', title: 'Attendance' });
const L = await lookups('classes');
await mountAttendance(content, {
  classes: L.classes.filter((c) => c.is_active), classLabel, initialClass: qs('class'), initialDate: /^\d{4}-\d{2}-\d{2}$/.test(qs('date') || '') ? qs('date') : undefined,
  intro: 'Pick a day on the calendar. <b>Yellow</b> = scheduled, <b>green</b> = held, <b>red</b> = cancelled. Marking a day that is not on the timetable asks for a reason. Works offline — drafts sync with a unique ID so nothing is charged twice.'
});
