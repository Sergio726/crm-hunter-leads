import { redirect } from 'next/navigation';
import { requireAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { SectionCard } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Handshake } from 'lucide-react';
import type { Client } from '@/lib/types';

/**
 * Clientes: los leads que compraron.
 *
 * **Está en definición**, y por eso el menú lo muestra apagado: todavía no se
 * decidió qué tiene que hacer un cliente además de aparecer en una lista
 * —renovaciones, facturación, historial de compra, cartera por vendedor—.
 *
 * Lo que hay hoy es el punto de partida que se desprende de la propia
 * definición del negocio (D73): **un cliente es un lead en estado Ganado**. Se
 * muestran así, sin inventar comportamiento, para poder mirar el módulo con
 * datos reales y decidir sobre eso.
 *
 * Solo entra un administrador, aunque la sección figure en la matriz de
 * permisos: mientras no esté definida, mostrarle a un vendedor una pantalla a
 * medias solo genera preguntas. Mismo criterio que el historial de búsquedas.
 */
export default async function CarteraPage() {
  const { profile, sections } = await requireAccess('cartera');
  if (profile.role !== 'superadmin') redirect('/leads');

  const supabase = await createClient();

  // El RLS ya recorta lo que cada uno puede ver; acá solo se pide el estado.
  const { data } = await supabase
    .from('clients')
    .select('id, full_name, company, phone, email, updated_at, assigned_to')
    .eq('status', 'won')
    .order('updated_at', { ascending: false });

  const clientes = (data ?? []) as Pick<
    Client,
    'id' | 'full_name' | 'company' | 'phone' | 'email' | 'updated_at' | 'assigned_to'
  >[];

  return (
    <AppShell profile={profile} sections={sections} title="Clientes">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Los leads que compraron. Hoy se listan los que están en estado{' '}
          <strong>Ganado</strong>.
        </p>

        {/* Se dice de entrada y sin vueltas: es un módulo sin terminar. Que
            alguien saque conclusiones de una pantalla a medias es el riesgo
            que este cartel evita. */}
        <div className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">Este módulo está en definición</p>
          <p className="mt-1 text-muted-foreground">
            Está apagado en el menú y solo entra un administrador por esta dirección. Falta
            decidir qué hace un cliente además de figurar en la lista: renovaciones,
            facturación, historial de compra, cartera por vendedor. Cuando eso esté definido se
            enciende.
          </p>
        </div>

        <SectionCard title={`${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}`}>
          {clientes.length === 0 ? (
            <EmptyState
              icon={<Handshake className="h-5 w-5" />}
              title="Todavía no hay ninguno"
              description="Un lead pasa a ser cliente cuando se lo marca como Ganado desde su ficha."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left font-mono text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2">Empresa</th>
                    <th className="px-3 py-2">Contacto</th>
                    <th className="px-3 py-2">Cliente desde</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c) => (
                    <tr key={c.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-medium text-foreground">{c.full_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.company ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {c.email ?? c.phone ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {/* `updated_at` es una aproximación honesta: no se guarda
                            cuándo pasó a Ganado. Registrar esa fecha es una de
                            las cosas a definir. */}
                        {new Date(c.updated_at).toLocaleDateString('es-AR')}
                      </td>
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
