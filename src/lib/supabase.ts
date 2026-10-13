import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://vghfkcqssvudccsnfwon.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_SsrsraGKKGYk1_iR0UG1VA_wmroxAry';

export const supabase = createClient(url, key, {
  auth: {
    storageKey: `yizhestart_auth_${new URL(url).hostname}`,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
