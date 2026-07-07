import { requireSuperadmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';

export default async function DashboardPage() {
  const profile = await requireSuperadmin();
  const supabase = await createClient();

  const { data: clients } = await supabase.from('clients').select('status, origin');
  const { count: team } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  const rows = clients ?? [];
  const total = rows.length;
  const by = (s: string) => rows.filter((c) => c.status === s).length;
  const fromGhl = rows.filter((c) => c.origin === 'ghl').length;
  const won = by('won');
  const conv = total ? Math.round((won / total) * 100) : 0;

  const cards = [
    { label: 'Clientes totales', value: total, hint: `${fromGhl} desde GHL` },
    { label: 'Pendientes', value: by('pending'), hint: null as string | null },
    { label: 'Contactados', value: by('contacted'), hint: null as string | null },
    { label: 'Ganados', value: won, hint: `${conv}% conversión` },
    { label: 'Vendedores', value: team ?? 0, hint: null as string | null },
  ];

  return (
    <AppShell profile={profile} title="Inicio">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{c.value}</p>
            {c.hint && <p className="mt-1 text-xs text-slate-400">{c.hint}</p>}
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-700">Resumen</h2>
        <p className="mt-2 text-sm text-slate-500">
          {total === 0
            ? 'Todavía no hay clientes cargados. Cuando los vendedores usen la app y traigas contactos de GHL, este panel muestra el resumen en vivo.'
            : `Hay ${total} clientes en total, ${fromGhl} traídos desde GHL.`}
        </p>
      </div>
    </AppShell>
  );
}
