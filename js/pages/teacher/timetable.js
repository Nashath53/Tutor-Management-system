import { initAdminPage } from '../../components/admin-shell.js';
import { qs } from '../../utils/dom.js';
import { mountTimetable } from '../shared/timetable-board.js';
import { loadTeacherCtx, notLinkedHtml } from './teacher-common.js';

const { content, profile, can } = await initAdminPage({ page: 'timetable', title: 'Timetable', area: 'teacher' });
const T = await loadTeacherCtx(profile);
if (!T.teacher) content.innerHTML = notLinkedHtml();
else {
  await mountTimetable(content, { role: 'teacher', canRequest: can('timetable_request'), classes: T.allClasses, teachers: [T.teacher], myClassIds: T.myClassIds, initialClass: qs('class') || '' });
}
