import { requireSuperadmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { ExportButton } from '@/components/reportes/ExportButton';
import { STATUS_LABELS, type ClientStatus, type SellerStats } from '@/lib/types';

const FUNNEL_COLORS: Record<ClientStatus, string> = {
  pending: 'bg-amber-400',
  contacted: 'bg-blue-400',
  won: 'bg-emerald-500',
  lost: 'bg-slate-300',
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

  return (
    <AppShell profile={profile} title="Reportes">
      <div className="space-y-6">
        {/* Embudo */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-700">Embudo de conversión</h2>
          <p className="mt-1 text-xs text-slate-400">Tasa de conversión general: {conv}%</p>
          <div className="mt-4 space-y-3">
            {funnel.map((f) => (
              <div key={f.status}>
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>{f.label}</span>
                  <span>{f.value} ({f.pct}%)</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${FUNNEL_COLORS[f.status]}`} style={{ width: `${f.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Por origen */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {[
            { label: 'Clientes totales', value: total },
            { label: 'Cargados en App/Web', value: fromApp },
            { label: 'Traídos de GHL', value: fromGhl },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">{c.label}</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{c.value}</p>
            </div>
          ))}
        </section>

        {/* Rendimiento por vendedor */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Rendimiento por vendedor</h2>
            <ExportButton rows={sellerRows} filename="rendimiento-vendedores.csv" />
          </div>
          {sellerRows.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Aún no hay datos de vendedores.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
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
                    <tr key={r.vendedor} className="border-b border-slate-50">
                      <td className="px-2 py-2 font-medium text-slate-800">{r.vendedor}</td>
                      <td className="px-2 py-2 text-slate-600">{r.asignados}</td>
                      <td className="px-2 py-2 text-slate-600">{r.pendientes}</td>
                      <td className="px-2 py-2 text-slate-600">{r.ganados}</td>
                      <td className="px-2 py-2 text-slate-600">{r.contactos_hoy}</td>
                      <td className="px-2 py-2 text-slate-600">{r.contactos_semana}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
