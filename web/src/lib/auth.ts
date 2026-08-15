import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPermissions } from '@/lib/permissions';
import { allowedSections, canAccess, type SectionId } from '@/lib/sections';
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

export interface Access {
  profile: Profile;
  /** Secciones a las que este usuario puede entrar. Alimenta el menú lateral. */
  sections: SectionId[];
}

/**
 * Guarda única de las páginas del panel.
 *
 * Reemplaza a los viejos `requireMember` / `requireSuperadmin`: ahora el acceso
 * sale de la matriz que el admin edita en Configuración, no de una lista escrita
 * en cada página. Devuelve además las secciones permitidas, para que el shell
 * arme el menú sin una segunda consulta y sin poder desincronizarse de la guarda.
 *
 * `section = null` exige solamente ser miembro activo — es el caso de Mi perfil,
 * que no está en el menú y no tiene sentido negar.
 */
export async function requireAccess(section: SectionId | null): Promise<Access> {
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  if (profile.role === 'pending') redirect('/no-autorizado');

  const perms = await getPermissions();

  if (section && !canAccess(profile.role, section, perms)) {
    redirect('/no-autorizado?motivo=seccion');
  }

  return { profile, sections: allowedSections(profile.role, perms) };
}
