/**
 * Mentora app configuration (safe, public values only).
 * Contact details and bank details shown here are DEFAULTS.
 * Once Supabase is connected, values saved in Admin → Settings override them.
 */
export const APP = {
  name: 'Mentora Learning Centre',
  shortName: 'Mentora',
  version: '1.0.0',

  // WhatsApp number in international format WITHOUT "+" or spaces (Sri Lanka = 94...)
  whatsappNumber: '94770000000',
  phoneDisplay: '+94 77 000 0000',
  email: 'hello@mentora.lk',
  address: 'Main Street, Negombo, Sri Lanka',
  hours: 'Mon–Sat · 8:00 AM – 8:00 PM',

  bank: {
    bankName: 'Your Bank Name',
    accountName: 'Mentora Learning Centre',
    accountNumber: '0000 0000 0000',
    branch: 'Negombo'
  },

  // Set to true to force demo mode even when Supabase keys are filled in.
  forceDemo: false,

  // Supabase Storage buckets (created by supabase/migrations/003_storage.sql)
  buckets: { teacherDocuments: 'teacher-documents', teacherPhotos: 'teacher-photos' },

  maxUploadMb: 5
};

export const OPTIONS = {
  grades: ['6', '7', '8', '9', '10', '11', '12', '13'],
  mediums: ['english', 'tamil', 'sinhala'],
  modes: ['physical', 'online', 'hybrid'],
  classTypes: ['group', 'individual', 'revision', 'paper_class'],
  enquiryClassTypes: ['free_trial', 'group', 'individual', 'revision', 'paper_class'],
  days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  times: ['morning', 'afternoon', 'evening', 'weekend'],
  referral: ['social_media', 'google', 'whatsapp', 'friends', 'other'],
  attendance: ['present', 'late', 'absent', 'excused']
};
