import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://vghfkcqssvudccsnfwon.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_SsrsraGKKGYk1_iR0UG1VA_wmroxAry';

export const supabase = createClient(url, key, {
  auth: {
    storageKey: `yizhestart_auth_${new URL(url).hostname}`,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function authRedirectUrl(): string {
  return new URL(import.meta.env.BASE_URL, location.origin).href;
}

export async function googleLoginEnabled(): Promise<boolean> {
  const response = await fetch(new URL('/auth/v1/settings', url), {
    headers: { apikey: key }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Unable to read login providers');
  const settings = await response.json();
  return settings.external?.google === true;
}
