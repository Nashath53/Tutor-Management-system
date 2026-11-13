/**
 * Student profile photo.
 * Live: private bucket "student-photos/<student_id>/avatar-<time>.jpg" → short-lived signed URL.
 * Demo: the small resized image is stored as a data URL in students.photo_path.
 */
import { api } from '../../services/api.js';

export async function photoUrl(student) {
  const p = student?.photo_path;
  if (!p) return '';
  if (p.startsWith('data:')) return p;
  return (await api.signedUrl('student-photos', p, 3600)) || '';
}

export async function uploadPhoto(student, blob, dataUrl) {
  if (api.mode === 'demo') return dataUrl;
  const path = `${student.id}/avatar-${Date.now()}.jpg`;
  await api.upload('student-photos', path, new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
  return path;
}
