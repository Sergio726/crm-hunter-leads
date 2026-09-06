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

  let secciones = allowedSections(profile.role, perms);

  // Con la sincronización de GHL apagada, "Contactos GHL" sale del menú.
  //
  // ⚠️ Esto CAMBIA la D12, que decía que los contactos manuales quedaban fuera
  // del interruptor a propósito. Decisión del usuario, y tiene sentido: si
  // apagaste GHL no querés seguir viéndolo en el menú, y una pantalla que
  // depende de una integración pausada solo genera dudas.
  //
  // Se oculta, no se bloquea: entrar por la URL directa sigue funcionando, que
  // es lo que permite revisar algo puntual sin tener que reactivar la sync.
  if (!(await isCrmSyncEnabled())) {
    secciones = secciones.filter((s) => s !== 'contactos-ghl');
  }

  return { profile, sections: secciones };
}

/**
 * ¿Está encendida la sincronización con el CRM?
 *
 * Consulta propia y no dentro de `getPermissions` porque son dos cosas
 * distintas: una es quién puede entrar, la otra si la integración está viva.
 * Ante cualquier duda devuelve `true` — si falta la fila o falla la lectura,
 * esconder una sección del menú sería peor que mostrarla de más.
 */
export async function isCrmSyncEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'crm_sync_enabled')
      .maybeSingle();
    if (error || !data) return true;
    return Boolean(data.value);
  } catch {
    return true;
  }
}
