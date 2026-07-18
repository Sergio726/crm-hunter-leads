import { requireMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { StatCard } from '@/components/ui/StatCard';
import { SectionCard } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressBanner } from '@/components/vendedor/ProgressBanner';
import { SellerClients } from '@/components/vendedor/SellerClients';
import { TrendChart, type TrendPoint } from '@/components/dashboard/TrendChart';
import { ActivityFeed, type ActivityItem } from '@/components/dashboard/ActivityFeed';
import { Contact, Clock, MessageSquare, CircleCheck, Users, UserPlus, AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { isFollowUpOverdue } from '@/lib/format-dates';
import { CHANNEL_LABELS, type Channel, type Client, type ClientStatus, type MyProgress } from '@/lib/types';

// Días que abarca la tendencia y ancho de la ventana de comparación semanal.
const TREND_DAYS = 30;

/** Fecha (YYYY-MM-DD, UTC) de hace `n` días. Comparables lexicográficamente. */
function dayKeyDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → "dd/mm" para el eje del gráfico. */
function shortDay(key: string): string {
  const [, m, d] = key.split('-');
  return `${d}/${m}`;
}

type FeedInteraction = {
  id: string;
  channel: Channel;
  contacted_at: string;
  clients: { full_name: string } | null;
};

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
  const [{ data: clientsData }, { count: team }, { data: interactionsData }] = await Promise.all([
    supabase.from('clients').select('id, full_name, status, origin, created_at, updated_at, next_follow_up'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    // Solo los últimos ~35 días: cubre la tendencia (30 d), los deltas semanales y el feed.
    supabase
      .from('interactions')
      .select('id, channel, contacted_at, clients(full_name)')
      .gte('contacted_at', dayKeyDaysAgo(35))
      .order('contacted_at', { ascending: false }),
  ]);

  const clients =
    (clientsData as Pick<
      Client,
      'id' | 'full_name' | 'status' | 'origin' | 'created_at' | 'updated_at' | 'next_follow_up'
    >[]) ?? [];
  const interactions = (interactionsData as unknown as FeedInteraction[]) ?? [];
  // Los comentarios rápidos (channel 'note') no son un contacto: se excluyen de métricas.
  const contactInteractions = interactions.filter((it) => it.channel !== 'note');

  const total = clients.length;
  const by = (s: ClientStatus) => clients.filter((c) => c.status === s).length;
  const fromGhl = clients.filter((c) => c.origin === 'ghl').length;
  const won = by('won');
  const conv = total ? Math.round((won / total) * 100) : 0;
  // Vencidos = seguimiento atrasado y el cliente todavía está activo (no won/lost).
  const overdue = clients.filter((c) => isFollowUpOverdue(c.next_follow_up, c.status)).length;

  // ── Tendencia diaria (últimos 30 días), rellenando los días sin datos con 0.
  const newByDay = new Map<string, number>();
  for (const c of clients) {
    const k = c.created_at.slice(0, 10);
    newByDay.set(k, (newByDay.get(k) ?? 0) + 1);
  }
  const contactByDay = new Map<string, number>();
  for (const it of contactInteractions) {
    const k = it.contacted_at.slice(0, 10);
    contactByDay.set(k, (contactByDay.get(k) ?? 0) + 1);
  }
  const trend: TrendPoint[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const key = dayKeyDaysAgo(i);
    trend.push({ day: shortDay(key), nuevos: newByDay.get(key) ?? 0, contactos: contactByDay.get(key) ?? 0 });
  }

  // ── Comparación esta semana (últimos 7 d) vs. la anterior (7 d previos).
  const wkStart = dayKeyDaysAgo(6);
  const prevStart = dayKeyDaysAgo(13);
  const prevEnd = dayKeyDaysAgo(7);
  const inThisWeek = (iso: string) => iso.slice(0, 10) >= wkStart;
  const inPrevWeek = (iso: string) => {
    const k = iso.slice(0, 10);
    return k >= prevStart && k <= prevEnd;
  };
  const newThisWeek = clients.filter((c) => inThisWeek(c.created_at)).length;
  const newPrevWeek = clients.filter((c) => inPrevWeek(c.created_at)).length;
  const contactsThisWeek = contactInteractions.filter((it) => inThisWeek(it.contacted_at)).length;
  const contactsPrevWeek = contactInteractions.filter((it) => inPrevWeek(it.contacted_at)).length;

  // ── Feed de actividad reciente (mezcla de eventos, más nuevo primero).
  const feed: ActivityItem[] = [];
  for (const c of clients) {
    feed.push({ id: `add-${c.id}`, kind: 'added', text: `Nuevo cliente: ${c.full_name}`, at: c.created_at });
    // updated_at es una aproximación de "cuándo se ganó" (cambia con cualquier edición),
    // suficiente para un feed; por eso "ganados" no entra en la línea de tendencia.
    if (c.status === 'won') {
      feed.push({ id: `won-${c.id}`, kind: 'won', text: `Cliente ganado: ${c.full_name}`, at: c.updated_at });
    }
  }
  for (const it of contactInteractions) {
    const name = it.clients?.full_name ?? 'un cliente';
    feed.push({
      id: `ct-${it.id}`,
      kind: 'contacted',
      text: `Contacto con ${name} · ${CHANNEL_LABELS[it.channel]}`,
      at: it.contacted_at,
    });
  }
  feed.sort((a, b) => (a.at < b.at ? 1 : -1));
  const recentActivity = feed.slice(0, 10);

  const iconCls = 'h-4 w-4';
  const pending = by('pending');
  // UXR-5: cada card de estado linkea a la lista de clientes filtrada por ese estado.
  const cards: { label: string; value: number; hint?: string; icon: ReactNode; tone: 'default' | 'warning' | 'danger'; href?: string }[] = [
    { label: 'Clientes totales', value: total, hint: `${fromGhl} desde GHL`, icon: <Contact className={iconCls} />, tone: 'default', href: '/clientes' },
    { label: 'Pendientes', value: pending, icon: <Clock className={iconCls} />, tone: pending > 0 ? 'warning' : 'default', href: '/clientes?status=pending' },
    { label: 'Vencidos', value: overdue, hint: 'seguimientos atrasados', icon: <AlertTriangle className={iconCls} />, tone: overdue > 0 ? 'danger' : 'default', href: '/clientes?overdue=1' },
    { label: 'Contactados', value: by('contacted'), icon: <MessageSquare className={iconCls} />, tone: 'default', href: '/clientes?status=contacted' },
    { label: 'Ganados', value: won, hint: `${conv}% conversión`, icon: <CircleCheck className={iconCls} />, tone: 'default', href: '/clientes?status=won' },
    { label: 'Vendedores', value: team ?? 0, icon: <Users className={iconCls} />, tone: 'default' },
  ];

  return (
    <AppShell profile={profile} title="Inicio">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} hint={c.hint} icon={c.icon} tone={c.tone} href={c.href} />
        ))}
      </div>

      <h2 className="mt-6 mb-3 text-sm font-medium text-muted-foreground">Esta semana</h2>
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Clientes nuevos"
          value={newThisWeek}
          delta={newThisWeek - newPrevWeek}
          deltaLabel="vs. semana anterior"
          icon={<UserPlus className={iconCls} />}
        />
        <StatCard
          label="Contactos"
          value={contactsThisWeek}
          delta={contactsThisWeek - contactsPrevWeek}
          deltaLabel="vs. semana anterior"
          icon={<MessageSquare className={iconCls} />}
        />
      </div>

      <SectionCard title="Tendencia" description="Clientes nuevos y contactos por día (últimos 30 días)." className="mt-6">
        {total === 0 && contactInteractions.length === 0 ? (
          <EmptyState title="Todavía no hay datos para graficar" />
        ) : (
          <TrendChart data={trend} />
        )}
      </SectionCard>

      <SectionCard title="Actividad reciente" className="mt-6">
        <ActivityFeed items={recentActivity} />
      </SectionCard>
    </AppShell>
  );
}
