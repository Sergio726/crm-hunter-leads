import { after } from 'next/server';
import { requireAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { listSellers } from '@/lib/sellers';
import { AppShell } from '@/components/AppShell';
import { ClientsView } from '@/components/clientes/ClientsView';
import type { Client, ClientStatus } from '@/lib/types';

const STATUSES: ClientStatus[] = ['pending', 'contacted', 'won', 'lost'];

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; overdue?: string }>;
}) {
  const { profile, sections } = await requireAccess('clientes');
  const supabase = await createClient();

  // UXR-5: filtro inicial desde la URL (llegando desde una tarjeta del Inicio).
  const sp = await searchParams;
  const initialStatus = STATUSES.includes(sp.status as ClientStatus) ? (sp.status as ClientStatus) : undefined;
  const initialOverdue = sp.overdue === '1' || sp.overdue === 'true';

  // Entrar a Clientes marca como vistas las novedades propias (0043).
  //
  // Es lo que hace que el badge del menú signifique algo: se apaga solo cuando
  // la persona miró, sin un botón de "marcar como leído" que nadie aprieta. La
  // función solo toca las del usuario de la sesión.
  //
  // No se hace esperar a la página ni se corta si falla: es un detalle de
  // presentación, no puede impedir ver los clientes.
  //
  // Pero `void` no alcanzaba. Es el mismo bug que dejó el log de búsquedas casi
  // vacío (PROSP-21, D70): una escritura que nadie espera se pierde cuando el
  // entorno serverless congela la función al terminar la respuesta. Acá la
  // consecuencia se ve — el badge del menú **puede no apagarse nunca**, y como
  // falla en silencio se lee como "el badge está roto". `after()` corre igual
  // después de responder, pero mantiene viva la función hasta que termina.
  after(() => supabase.rpc('marcar_notificaciones_vistas'));

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

  const sellers = await listSellers(supabase);

  const list = (clients as Client[]) ?? [];

  return (
    <AppShell profile={profile} sections={sections} title="Clientes">
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
