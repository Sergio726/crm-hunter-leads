import { requireAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { listSellers } from '@/lib/sellers';
import { AppShell } from '@/components/AppShell';
import { ProspectStudio } from '@/components/prospeccion/ProspectStudio';
import { ProspectTabs } from '@/components/prospeccion/ProspectTabs';

export default async function ProspeccionPage() {
  const { profile, sections } = await requireAccess('prospeccion');
  const supabase = await createClient();

  const isSuperadmin = profile.role === 'superadmin';
  const sellers = isSuperadmin ? await listSellers(supabase) : [];

  // El contador de guardados sale del servidor a propósito: es lo que hace que
  // en una sesión nueva, sin haber buscado nada, se vea "Guardados (50)".
  // Sin esta señal los prospectos guardados quedaban invisibles (PROSP-2).
  const { count } = await supabase
    .from('prospects')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new');

  return (
    <AppShell profile={profile} sections={sections} title="Prospección">
      <div className="space-y-4">
        <ProspectTabs savedCount={count ?? 0} />
        <ProspectStudio userId={profile.id} isSuperadmin={isSuperadmin} sellers={sellers} />
      </div>
    </AppShell>
  );
}
