import { requireSuperadmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { SectionCard } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ExportButton } from '@/components/reportes/ExportButton';
import { SellerChart } from '@/components/reportes/SellerChart';
import { STATUS_LABELS, type ClientStatus, type SellerStats } from '@/lib/types';

// SEM-1: mismo semáforo que STATUS_TONE (pending ámbar, contacted naranja, won verde,
// lost rojo). Acá son fondos sólidos (barras del embudo), no badges.
const FUNNEL_COLORS: Record<ClientStatus, string> = {
  pending: 'bg-warning',
  contacted: 'bg-orange',
  won: 'bg-success',
  lost: 'bg-destructive',
};

export default async function ReportesPage() {
  const profile = await requireSuperadmin();
  const supabase = await createClient();

  const { data: clientsData } = await supabase.from('clients').select('status, origin');
  const { data: statsData } = await supabase
    .from('v_seller_stats')
    .select('*')
    .order('contacts_this_week', { ascending: false });

  const clients = (clientsData as { status: ClientStatus; origin: 'app' | 'ghl' }[]) ?? [];
  const stats = (statsData as SellerStats[]) ?? [];

  const total = clients.length;
  const count = (s: ClientStatus) => clients.filter((c) => c.status === s).length;
  const funnel = (['pending', 'contacted', 'won', 'lost'] as ClientStatus[]).map((s) => ({
    status: s,
    label: STATUS_LABELS[s],
    value: count(s),
    pct: total ? Math.round((count(s) / total) * 100) : 0,
  }));
  const fromApp = clients.filter((c) => c.origin === 'app').length;
  const fromGhl = clients.filter((c) => c.origin === 'ghl').length;
  const conv = total ? Math.round((count('won') / total) * 100) : 0;

  const sellerRows = stats.map((s) => ({
    vendedor: s.full_name ?? s.email,
    asignados: s.clients_assigned,
    pendientes: s.clients_pending,
    ganados: s.clients_won,
    contactos_hoy: s.contacts_today,
    contactos_semana: s.contacts_this_week,
  }));

  const chartData = stats
    .map((s) => ({ name: (s.full_name ?? s.email).split(' ')[0], semana: s.contacts_this_week }))
    .slice(0, 8);

  return (
    <AppShell profile={profile} title="Reportes">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatCard label="Clientes totales" value={total} />
          <StatCard label="Cargados en App/Web" value={fromApp} />
          <StatCard label="Traídos de GHL" value={fromGhl} />
        </div>

        <SectionCard title="Embudo de conversión" description={`Tasa de conversión general: ${conv}%`}>
          <div className="space-y-3">
            {funnel.map((f) => (
              <div key={f.status}>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>{f.label}</span>
                  <span>{f.value} ({f.pct}%)</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${FUNNEL_COLORS[f.status]}`} style={{ width: `${f.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Contactos por vendedor (esta semana)"
          description="Top vendedores por actividad reciente."
        >
          {chartData.length === 0 ? (
            <EmptyState title="Aún no hay actividad para graficar" />
          ) : (
            <SellerChart data={chartData} />
          )}
        </SectionCard>

        <SectionCard
          title="Rendimiento por vendedor"
          action={<ExportButton rows={sellerRows} filename="rendimiento-vendedores.csv" />}
        >
          {sellerRows.length === 0 ? (
            <EmptyState title="Aún no hay datos de vendedores" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
                    <th className="px-2 py-2 font-medium">Vendedor</th>
                    <th className="px-2 py-2 font-medium">Asignados</th>
                    <th className="px-2 py-2 font-medium">Pendientes</th>
                    <th className="px-2 py-2 font-medium">Ganados</th>
                    <th className="px-2 py-2 font-medium">Hoy</th>
                    <th className="px-2 py-2 font-medium">Semana</th>
                  </tr>
                </thead>
                <tbody>
                  {sellerRows.map((r) => (
                    <tr key={r.vendedor} className="border-b border-border/60">
                      <td className="px-2 py-2 font-medium text-foreground">{r.vendedor}</td>
                      <td className="px-2 py-2 text-muted-foreground">{r.asignados}</td>
                      <td className="px-2 py-2 text-muted-foreground">{r.pendientes}</td>
                      <td className="px-2 py-2 text-muted-foreground">{r.ganados}</td>
                      <td className="px-2 py-2 text-muted-foreground">{r.contactos_hoy}</td>
                      <td className="px-2 py-2 text-muted-foreground">{r.contactos_semana}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
