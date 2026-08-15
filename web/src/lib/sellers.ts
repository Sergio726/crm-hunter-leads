import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '@/lib/types';

/** Alguien a quien se le puede asignar un lead. */
export interface Seller {
  id: string;
  name: string;
}

/**
 * Miembros que pueden recibir leads asignados.
 *
 * Incluye a los superadmins además de los vendedores porque en este equipo los
 * superadmins también trabajan leads — es el mismo criterio que usa
 * `promote_prospects` para validar el destinatario (0028:197) y el que usa
 * `notify_lead_assigned` para decidir a quién avisar (0026:46). Si las tres
 * listas se desincronizan, aparece el caso de asignar a alguien que la base
 * rechaza.
 *
 * Estaba duplicado en `clientes/page.tsx` y `prospeccion/page.tsx`; la tercera
 * copia era el momento de sacarlo.
 */
export async function listSellers(supabase: SupabaseClient): Promise<Seller[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['seller', 'superadmin'])
    .order('email');

  return ((data as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []).map((s) => ({
    id: s.id,
    name: s.full_name ?? s.email,
  }));
}
