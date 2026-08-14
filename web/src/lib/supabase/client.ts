import { createBrowserClient } from '@supabase/ssr';
import { supabasePublicEnv } from './env';

/** Cliente Supabase para componentes del navegador (Client Components). */
export function createClient() {
  const { url, key } = supabasePublicEnv();
  return createBrowserClient(url, key);
}
