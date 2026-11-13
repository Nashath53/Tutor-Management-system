/**
 * WhatsApp click-to-chat helpers.
 * IMPORTANT: Opening WhatsApp does NOT prove a message was sent.
 * The user must press "Send" inside WhatsApp. We only record "WhatsApp opened".
 */
export function waLink(number, text) {
  const n = String(number || '').replace(/\D/g, '');
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

const line = (label, value) => `${label}: ${Array.isArray(value) ? value.join(', ') : value || '-'}`;

export function studentEnquiryMessage(d) {
  return [
    'Hello Mentora Learning Centre,',
    '',
    'I would like to enquire about joining a class.',
    '',
    line('Student name', d.student_name),
    line('Parent/Guardian', d.guardian_name),
    line('Contact number', d.phone),
    '',
    line('Subject', d.subject_label),
    line('Grade', d.grade),
    line('Medium', d.medium_label),
    line('Preferred class mode', d.mode_label),
    line('Class type', d.type_label),
    line('Preferred joining date', d.preferred_join_date),
    '',
    line('How did I hear about Mentora?', [...(d.referral_labels || []), d.referral_note].filter(Boolean)),
    line('Additional requirements', d.requirements),
    '',
    'Please contact me with the available class details and admission information.',
    '',
    'Thank you.'
  ].join('\n');
}

export function teacherApplicationMessage(d) {
  return [
    'Hello Mentora Learning Centre,',
    '',
    'I am interested in joining your teaching team.',
    '',
    line('Full name', d.full_name),
    line('Contact number', d.phone),
    line('WhatsApp number', d.whatsapp),
    line('Living place', d.living_place),
    '',
    line('Subjects I can teach', d.subject_labels),
    line('Grades', d.grades),
    line('Teaching medium', d.medium_labels),
    line('Class types', d.type_labels),
    line('Preferred class modes', d.mode_labels),
    '',
    line('Qualifications', d.qualifications),
    line('Teaching experience', `${d.experience_years || 0} years. ${d.experience_details || ''}`.trim()),
    line('Available days and times', [d.day_labels?.join(', '), d.time_labels?.join(', ')].filter(Boolean).join(' | ')),
    '',
    line('Additional information', d.additional_info),
    '',
    'I would appreciate an opportunity to discuss possible teaching opportunities with Mentora.',
    '',
    'Thank you.'
  ].join('\n');
}

export function bankReceiptMessage(d) {
  return [
    'Hello Mentora Learning Centre,',
    '',
    'I have made a bank transfer. I am attaching the receipt image to this message.',
    '',
    line('Student ID', d.student_code),
    line('Student name', d.student_name),
    line('Payment reference', d.payment_ref),
    line('Amount transferred', d.amount),
    line('Transfer date', d.paid_on),
    '',
    'Please verify and confirm my payment.',
    '',
    'Thank you.'
  ].join('\n');
}

export function openWhatsApp(url) {
  const w = window.open(url, '_blank', 'noopener');
  if (!w) location.href = url;
}
