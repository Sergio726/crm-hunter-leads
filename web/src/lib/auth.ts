import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

/** Perfil del usuario logueado (o null si no hay sesión). */
export async function getSessionProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return (data as Profile) ?? null;
}

/** Exige superadmin: redirige a /login si no hay sesión, o a /no-autorizado si no es superadmin. */
export async function requireSuperadmin(): Promise<Profile> {
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'superadmin') redirect('/no-autorizado');
  return profile;
}
