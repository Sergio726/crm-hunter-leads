import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const redirectTo = Linking.createURL('auth-callback');

function getParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const [, queryAndHash] = url.split(/[?#]/, 2);
  if (!queryAndHash) return params;
  for (const pair of queryAndHash.split('&')) {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) params[key] = decodeURIComponent(value);
  }
  return params;
}

export async function signInWithGoogle(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return; // usuario canceló

  const params = getParams(result.url);
  if (params.error_description) throw new Error(params.error_description);

  if (params.code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
    if (exchangeError) throw exchangeError;
  } else if (params.access_token && params.refresh_token) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (sessionError) throw sessionError;
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
