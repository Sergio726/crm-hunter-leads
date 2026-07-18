import { requireMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { ClientsView } from '@/components/clientes/ClientsView';
import type { Client, ClientStatus, Profile } from '@/lib/types';

const STATUSES: ClientStatus[] = ['pending', 'contacted', 'won', 'lost'];

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; overdue?: string }>;
}) {
  const profile = await requireMember();
  const supabase = await createClient();

  // UXR-5: filtro inicial desde la URL (llegando desde una tarjeta del Inicio).
  const sp = await searchParams;
  const initialStatus = STATUSES.includes(sp.status as ClientStatus) ? (sp.status as ClientStatus) : undefined;
  const initialOverdue = sp.overdue === '1' || sp.overdue === 'true';

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
        <ClientsView
          clients={list}
          sellers={sellers}
          role={profile.role}
          currentUserId={profile.id}
          contactedThisWeekIds={contactedThisWeekIds}
          initialStatus={initialStatus}
          initialOverdue={initialOverdue}
        />
      </div>
    </AppShell>
  );
}
