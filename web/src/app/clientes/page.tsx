import { requireSuperadmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { ClientsTable } from '@/components/clientes/ClientsTable';
import { ImportCsv } from '@/components/clientes/ImportCsv';
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

  return (
    <AppShell profile={profile} title="Clientes">
      <div className="space-y-4">
        <ImportCsv sellers={sellers} />
        <ClientsTable clients={(clients as Client[]) ?? []} sellers={sellers} />
      </div>
    </AppShell>
  );
}
