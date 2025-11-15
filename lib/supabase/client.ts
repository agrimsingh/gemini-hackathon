import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: {
      Accept: 'application/json',
    },
  },
  postgrest: {
    headers: {
      Accept: 'application/json',
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

