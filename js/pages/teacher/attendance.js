import { initAdminPage } from '../../components/admin-shell.js';
import { qs } from '../../utils/dom.js';
import { mountAttendance } from '../shared/attendance-board.js';
import { loadTeacherCtx, notLinkedHtml, classLabel } from './teacher-common.js';

const { content, profile } = await initAdminPage({ page: 'attendance', title: 'Attendance', area: 'teacher' });
const T = await loadTeacherCtx(profile);
if (!T.teacher) content.innerHTML = notLinkedHtml();
else await mountAttendance(content, {
  classes: T.classes.filter((c) => c.is_active), classLabel, initialClass: qs('class'), canCancel: false,
  intro: 'Mark attendance for <b>your own classes</b>. Yellow = scheduled, green = held, red = cancelled. If you teach on a day that is not on the timetable you must give a reason. To cancel a session, contact the admin.'
});
