import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enviarMail } from '@/lib/recordatorios/enviar';
import {
  armarRecordatorio,
  type RecordatorioDestinatario,
} from '@/lib/recordatorios/mensaje';

/**
 * Recordatorios de seguimientos vencidos, una vez por día.
 *
 * La dispara la tarea programada de Vercel (`vercel.json`). No pasa por n8n ni
 * por GHL: el camino viejo mandaba todo por la API de GHL —incluido el respaldo
 * por email— así que un cliente sin GHL se quedaba sin recordatorios. Y encima
 * el interruptor `crm_sync_enabled` de Configuración los apagaba en silencio,
 * porque `n8n_list_overdue_followups` devuelve una lista vacía cuando está en
 * `false`. Corría todos los días, recibía cero y terminaba sin error.
 *
 * Acá se usa `recordatorios_pendientes()` (migración 0042), que **no mira ese
 * interruptor**: apagar la sincronización con un CRM externo no tiene por qué
 * apagar los avisos internos del equipo.
 */
export const maxDuration = 60;

/** El cliente con clave de servidor: acá no hay sesión de usuario. */
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

  const { data, error } = await admin.rpc('recordatorios_pendientes');
  if (error) {
    console.error('[cron/recordatorios] no se pudo leer', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const destinatarios = (data ?? []) as RecordatorioDestinatario[];
  const hoy = new Date().toISOString().slice(0, 10);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const urlClientes = `${base}/clientes`;

  let enviados = 0;
  const fallas: string[] = [];

  for (const d of destinatarios) {
    if (!d.email || d.clientes.length === 0) continue;

    const mail = armarRecordatorio(d, hoy, urlClientes);
    const envio = await enviarMail({
      para: d.email,
      asunto: mail.asunto,
      texto: mail.texto,
      html: mail.html,
    });

    if (!envio.ok) {
      // Se anota y se sigue: que le falle el mail a una persona no puede dejar
      // sin aviso al resto del equipo.
      fallas.push(`${d.email}: ${envio.error}`);
      continue;
    }

    // Se marca DESPUÉS de enviar. Al revés, un fallo de envío dejaría el
    // recordatorio marcado como hecho y esa persona no se enteraría nunca.
    const { error: marcaError } = await admin.rpc('marcar_recordatorios', {
      p_user_id: d.user_id,
      p_client_ids: d.clientes.map((c) => c.id),
    });
    if (marcaError) fallas.push(`marcar ${d.email}: ${marcaError.message}`);
    enviados += 1;
  }

  if (fallas.length > 0) console.error('[cron/recordatorios]', fallas.join(' | '));

  return NextResponse.json({
    destinatarios: destinatarios.length,
    enviados,
    fallas: fallas.length,
  });
}
