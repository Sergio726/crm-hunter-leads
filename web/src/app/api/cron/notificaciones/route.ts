import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enviarMail } from '@/lib/recordatorios/enviar';
import { armarAviso, type Destinatario } from '@/lib/recordatorios/mensaje';

/**
 * Entrega las notificaciones pendientes. Una vez por día.
 *
 * Es el ÚNICO entregador, y sustituye al camino viejo —disparador de base →
 * n8n → GHL— que estaba mal planteado: un sistema que opera independiente de un
 * CRM no puede depender de ese CRM para avisar cosas suyas.
 *
 * El reparto de responsabilidades (migración 0043):
 *
 *   detectar  → el disparador de la base, que ahora SOLO anota
 *   registrar → `notifications`, que es una cola (`sent_at` nulo = pendiente)
 *   entregar  → esto
 *   mostrar   → el badge del panel, que no depende de que el mail salga
 *
 * Nada de esto mira `crm_sync_enabled`: apagar la sincronización con un CRM
 * externo no puede dejar al equipo sin sus avisos.
 */
export const maxDuration = 60;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(request: Request) {
  // Vercel manda `Authorization: Bearer $CRON_SECRET`. Sin esto, cualquiera con
  // la URL podría disparar los mails.
  const esperado = process.env.CRON_SECRET;
  if (!esperado || request.headers.get('authorization') !== `Bearer ${esperado}`) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 });
  }

  const admin = adminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Falta la configuración de Supabase.' }, { status: 500 });
  }

  // 1. Los vencidos se encolan acá y no con un disparador: "venció" no es un
  //    cambio en una fila, es el paso del tiempo. Nadie escribe nada cuando una
  //    fecha queda atrás.
  const { data: encolados, error: errEncolar } = await admin.rpc(
    'encolar_seguimientos_vencidos',
  );
  if (errEncolar) {
    console.error('[cron/notificaciones] no se pudo encolar', errEncolar.message);
    return NextResponse.json({ error: errEncolar.message }, { status: 500 });
  }

  // 2. Todo lo pendiente, ya agrupado por persona.
  const { data, error } = await admin.rpc('notificaciones_pendientes');
  if (error) {
    console.error('[cron/notificaciones] no se pudo leer', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const destinatarios = (data ?? []) as Destinatario[];
  const hoy = new Date().toISOString().slice(0, 10);
  const urlClientes = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/clientes`;

  let enviados = 0;
  let conError = 0;

  for (const d of destinatarios) {
    if (!d.email || d.items.length === 0) continue;

    const aviso = armarAviso(d, hoy, urlClientes);
    const envio = await enviarMail({
      para: d.email,
      asunto: aviso.asunto,
      texto: aviso.texto,
      html: aviso.html,
    });

    const ids = d.items.map((i) => i.id);

    // Se marca DESPUÉS de enviar. Al revés, un fallo dejaría la notificación
    // como entregada y esa persona no se enteraría nunca.
    //
    // Con error, `sent_at` queda nulo: sigue pendiente y se reintenta mañana.
    // Antes esto no existía — si el envío fallaba, no quedaba ni rastro.
    const { error: marcaError } = await admin.rpc('marcar_entregadas', {
      p_ids: ids,
      p_error: envio.ok ? null : (envio.error ?? 'error desconocido'),
    });

    if (!envio.ok) {
      // Se anota y se sigue: que le falle el mail a una persona no puede dejar
      // sin aviso al resto del equipo.
      conError += 1;
      console.error(`[cron/notificaciones] ${d.email}: ${envio.error}`);
    } else {
      enviados += 1;
    }
    if (marcaError) console.error('[cron/notificaciones] marcar:', marcaError.message);
  }

  return NextResponse.json({
    encolados: encolados ?? 0,
    destinatarios: destinatarios.length,
    enviados,
    conError,
  });
}
