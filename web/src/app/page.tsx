import { requireMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { StatCard } from '@/components/ui/StatCard';
import { SectionCard } from '@/components/ui/Card';
import { ProgressBanner } from '@/components/vendedor/ProgressBanner';
import { SellerClients } from '@/components/vendedor/SellerClients';
import { Contact, Clock, MessageSquare, CircleCheck, Users } from 'lucide-react';
import type { Client, ClientStatus, MyProgress } from '@/lib/types';

export default async function DashboardPage() {
  const profile = await requireMember();
  const supabase = await createClient();

  // Vendedor: "Mis pendientes" + banner de meta/racha (WEB-20, antes vivía en /vendedor).
  if (profile.role === 'seller') {
    const { data: clients } = await supabase
      .from('v_pending_clients')
      .select('*')
      .order('next_follow_up', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    const { data: progressData } = await supabase.rpc('my_progress');
    const progress = (Array.isArray(progressData) ? progressData[0] : progressData) as MyProgress | null;

    return (
      <AppShell profile={profile} title="Mis pendientes">
        <div className="space-y-4">
          <ProgressBanner progress={progress} />
          <SellerClients clients={(clients as Client[]) ?? []} sellerId={profile.id} />
        </div>
      </AppShell>
    );
  }

  // superadmin y viewer: dashboard agregado de todo el equipo.
  const { data: clientsData } = await supabase.from('clients').select('status, origin');
  const { count: team } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  const clients = (clientsData as { status: ClientStatus; origin: string }[]) ?? [];
  const total = clients.length;
  const by = (s: ClientStatus) => clients.filter((c) => c.status === s).length;
  const fromGhl = clients.filter((c) => c.origin === 'ghl').length;
  const won = by('won');
  const conv = total ? Math.round((won / total) * 100) : 0;

  const iconCls = 'h-4 w-4';
  const cards = [
    { label: 'Clientes totales', value: total, hint: `${fromGhl} desde GHL`, icon: <Contact className={iconCls} /> },
    { label: 'Pendientes', value: by('pending'), hint: undefined, icon: <Clock className={iconCls} /> },
    { label: 'Contactados', value: by('contacted'), hint: undefined, icon: <MessageSquare className={iconCls} /> },
    { label: 'Ganados', value: won, hint: `${conv}% conversión`, icon: <CircleCheck className={iconCls} /> },
    { label: 'Vendedores', value: team ?? 0, hint: undefined, icon: <Users className={iconCls} /> },
  ];

  return (
    <AppShell profile={profile} title="Inicio">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} hint={c.hint} icon={c.icon} />
        ))}
      </div>

      <SectionCard title="Resumen" className="mt-6">
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? 'Todavía no hay clientes cargados. Cuando los vendedores usen la app y traigas contactos de GHL, este panel muestra el resumen en vivo.'
            : `Hay ${total} clientes en total, ${fromGhl} traídos desde GHL. Tasa de conversión: ${conv}%.`}
        </p>
      </SectionCard>
    </AppShell>
  );
}
