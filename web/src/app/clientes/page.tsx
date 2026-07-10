import { requireSuperadmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { ClientsTable } from '@/components/clientes/ClientsTable';
import { ImportCsvDialog } from '@/components/clientes/ImportCsv';
import { AddClientDialog } from '@/components/clientes/AddClientDialog';
import { ClientesStats } from '@/components/clientes/ClientesStats';
import type { Client, Profile } from '@/lib/types';

export default async function ClientesPage() {
  const profile = await requireSuperadmin();
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });
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
            <div className="hidden sm:block">
              <ImportCsvDialog sellers={sellers} existingClients={list} />
            </div>
            <AddClientDialog sellers={sellers} />
          </div>
        </div>
        <ClientsTable clients={list} sellers={sellers} />
      </div>
    </AppShell>
  );
}
