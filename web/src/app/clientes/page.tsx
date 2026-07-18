import { requireMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { ClientsView } from '@/components/clientes/ClientsView';
import { ImportCsvDialog } from '@/components/clientes/ImportCsv';
import { AddClientDialog } from '@/components/clientes/AddClientDialog';
import { ClientesStats } from '@/components/clientes/ClientesStats';
import type { Client, Profile } from '@/lib/types';

export default async function ClientesPage() {
  const profile = await requireMember();
  const supabase = await createClient();
  const isAdmin = profile.role === 'superadmin';

  // El RLS de clients ya recorta a lo propio para un vendedor — misma query para todos.
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });

  // WEB-23: "Contactados esta semana" fusionado como filtro (antes página aparte del vendedor).
  const weekStart = new Date();
  const day = (weekStart.getDay() + 6) % 7; // lunes = 0
  weekStart.setDate(weekStart.getDate() - day);
  weekStart.setHours(0, 0, 0, 0);
  const { data: recentInteractions } = await supabase
    .from('interactions')
    .select('client_id')
    .gte('contacted_at', weekStart.toISOString());
  const contactedThisWeekIds = Array.from(
    new Set((recentInteractions ?? []).map((i) => i.client_id as string)),
  );

  const { data: sellersData } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['seller', 'superadmin'])
    .order('email');

  const sellers = ((sellersData as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []).map((s) => ({
    id: s.id,
    name: s.full_name ?? s.email,
  }));

  const list = (clients as Client[]) ?? [];

  return (
    <AppShell profile={profile} title="Clientes">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* En móvil las tarjetas y el CSV se ocultan: los contadores viven en los chips de filtro */}
          <div className="hidden sm:block">
            <ClientesStats clients={list} />
          </div>
          <div className="flex w-full shrink-0 flex-wrap justify-end gap-2 sm:w-auto">
            {isAdmin && (
              <div className="hidden sm:block">
                <ImportCsvDialog sellers={sellers} existingClients={list} />
              </div>
            )}
            {profile.role !== 'viewer' && (
              <AddClientDialog sellers={sellers} defaultAssignedTo={isAdmin ? undefined : profile.id} />
            )}
          </div>
        </div>
        <ClientsView
          clients={list}
          sellers={sellers}
          role={profile.role}
          currentUserId={profile.id}
          contactedThisWeekIds={contactedThisWeekIds}
        />
      </div>
    </AppShell>
  );
}
