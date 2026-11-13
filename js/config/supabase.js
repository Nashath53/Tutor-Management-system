/**
 * STEP 1 OF BACKEND SETUP
 * -----------------------
 * Paste your Supabase project URL and *anon public* key here.
 * Find them in Supabase Dashboard → Project Settings → API.
 *
 * The anon key is SAFE to put in browser code because Row Level Security (RLS)
 * protects every private table. NEVER paste the "service_role" key here.
 *
 * While these placeholders are unchanged, the app runs in DEMO MODE:
 * it uses sample data saved only in your browser so you can click through everything.
 */
export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-SUPABASE-ANON-PUBLIC-KEY';

export function isSupabaseConfigured() {
  return !SUPABASE_URL.includes('YOUR-') && !SUPABASE_ANON_KEY.includes('YOUR-');
}
