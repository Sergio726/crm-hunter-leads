import { requireAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { listSellers } from '@/lib/sellers';
import { AppShell } from '@/components/AppShell';
import { ProspectTabs } from '@/components/prospeccion/ProspectTabs';
import { SavedProspectsView } from '@/components/prospeccion/SavedProspectsView';
import { toSavedProspect, type Prospect } from '@/lib/prospect/types';
import type { Profile } from '@/lib/types';

/**
 * PROSP-2: los prospectos guardados vivían solo en el estado de la corrida.
 * Al recargar la página desaparecían de la vista aunque siguieran en la base,
 * y no había forma de asignarlos. Esta pantalla es la que faltaba.
 *
 * Es subruta de /prospeccion a propósito: no agrega una sección nueva, así que
 * no hay que tocar la matriz de permisos ni `sections.ts`.
 */
export default async function ProspectosGuardadosPage() {
  const { profile, sections } = await requireAccess('prospeccion');
  const supabase = await createClient();
  const isSuperadmin = profile.role === 'superadmin';

  // El RLS de prospects ya recorta a lo propio para un vendedor (0028:116),
  // así que es la misma query para todos.
  const { data } = await supabase
    .from('prospects')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  const rows = (data as Prospect[]) ?? [];

  // "Guardado por" solo se muestra al superadmin, que es el único que ve
  // prospectos de otras personas.
  let ownerById = new Map<string, string>();
  if (isSuperadmin) {
    const ownerIds = Array.from(
      new Set(rows.map((r) => r.created_by).filter((id): id is string => Boolean(id))),
    );
    if (ownerIds.length > 0) {
      const { data: owners } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ownerIds);
      ownerById = new Map(
        ((owners as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []).map((o) => [
          o.id,
          o.full_name ?? o.email,
        ]),
      );
    }
  }

  const sellers = isSuperadmin ? await listSellers(supabase) : [];
  const savedCount = rows.filter((r) => r.status === 'new').length;

  return (
    <AppShell profile={profile} sections={sections} title="Prospección">
      <div className="space-y-4">
        <ProspectTabs savedCount={savedCount} />
        <SavedProspectsView
          prospects={rows.map((r) =>
            toSavedProspect(r, r.created_by ? ownerById.get(r.created_by) : null),
          )}
          sellers={sellers}
          isSuperadmin={isSuperadmin}
          userId={profile.id}
        />
      </div>
    </AppShell>
  );
}
