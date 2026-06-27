import { createClient } from '@supabase/supabase-js';

const fallbackSupabaseUrl = 'https://jozkatvurojtajcxjmet.supabase.co';
const fallbackPublishableKey = 'sb_publishable__KCVSGfedr7Z8AdVOTvCfw_rBu7giXu';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || fallbackSupabaseUrl;
const supabaseKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || fallbackPublishableKey;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
