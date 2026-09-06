import { redirect } from 'next/navigation';
import { requireAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { SectionCard } from '@/components/ui/Card';
import { ProspectTabs } from '@/components/prospeccion/ProspectTabs';
import { RequestLog, type RequestLogRow } from '@/components/prospeccion/RequestLog';

/**
 * Historial de solicitudes de búsqueda.
 *
 * Subruta de /prospeccion a propósito, igual que `guardados`: no agrega una
 * sección nueva, así que no hay que tocar la matriz de permisos ni
 * `sections.ts`.
 *
 * Solo superadmin: es una pantalla de diagnóstico, con el input crudo que se le
 * manda a cada proveedor. Un vendedor no tiene nada que hacer acá.
 */
export default async function HistorialPage() {
  const { profile, sections } = await requireAccess('prospeccion');
  if (profile.role !== 'superadmin') redirect('/prospeccion');

  const supabase = await createClient();

  // El RLS ya recorta (0039); para el superadmin devuelve todo.
  const { data, error } = await supabase
    .from('prospect_request_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (data as RequestLogRow[]) ?? [];

  // Quién guardó cada una, solo cuando hay filas de varias personas.
  const ownerIds = Array.from(
    new Set(
      rows
        .map((r) => (r as RequestLogRow & { created_by?: string }).created_by)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (ownerIds.length > 0) {
    const { data: perfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', ownerIds);
    const porId = new Map((perfiles ?? []).map((p) => [p.id as string, p.full_name as string]));
    for (const r of rows) {
      const uid = (r as RequestLogRow & { created_by?: string }).created_by;
      r.owner_name = uid ? (porId.get(uid) ?? null) : null;
    }
  }

  // El contador de la pestaña se cuenta acá para que no baje a cero al entrar:
  // es la misma cuenta que hace la pantalla de guardados.
  const { count } = await supabase
    .from('prospects')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new');
  const savedCount = count ?? 0;

  return (
    <AppShell profile={profile} sections={sections} title="Prospección">
      <div className="space-y-4">
        <ProspectTabs savedCount={savedCount} showHistorial />
        <SectionCard
          title="Historial de búsquedas"
          description="Qué se le pidió a cada proveedor y qué contestó. Tocá una fila para ver el detalle."
        >
          {error ? (
            // El caso más probable: la migración 0039 todavía no se aplicó. Se
            // dice cuál es en vez de mostrar una pantalla vacía sin explicación.
            <p className="text-sm text-muted-foreground">
              No se pudo leer el historial. Si la migración{' '}
              <code className="rounded bg-muted px-1">0039_prospect_request_log</code> todavía no se
              aplicó, esta pantalla queda vacía hasta que se aplique.
            </p>
          ) : (
            <RequestLog rows={rows} showOwner />
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
