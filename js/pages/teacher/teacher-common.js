/**
 * Data a signed-in teacher is allowed to read (Row Level Security limits the rest):
 * their own teacher row, their class assignments, their classes, sessions, and all timetable slots.
 */
import { api } from '../../services/api.js';
import { indexBy } from '../../utils/dom.js';
import { humanize } from '../../utils/format.js';

export const classLabel = (c) => (c ? `${c.title_en} · G${c.grade} · ${humanize(c.medium)}` : '—');

export async function loadTeacherCtx(profile) {
  const tid = profile.teacher_id;
  if (!tid) return { teacher: null, links: [], classes: [], myClassIds: [], allClasses: [], subjects: [] };
  const [teachers, links, allClasses, subjects] = await Promise.all([
    api.select('teachers', { eq: { id: tid } }),
    api.select('class_teachers', { eq: { teacher_id: tid } }),
    api.select('classes'),
    api.select('subjects')
  ]);
  const myClassIds = links.map((l) => l.class_id);
  return {
    teacher: teachers[0] || null, links, myClassIds, subjects, subjectsById: indexBy(subjects),
    allClasses: allClasses.filter((c) => c.is_active), classes: allClasses.filter((c) => myClassIds.includes(c.id)), classesById: indexBy(allClasses)
  };
}

export const notLinkedHtml = () => `<div class="m-card"><div class="empty-state"><i class="bi bi-link-45deg" aria-hidden="true"></i><h3>Your login is not linked to a teacher profile yet</h3><p>Ask the admin to open <b>Teachers → ⋮ → Link login</b> and enter your email address.</p></div></div>`;
