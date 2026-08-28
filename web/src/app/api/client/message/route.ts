import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';
import { AGENDA_KEY, normalizeAgendaUrl } from '@/lib/agenda';
import { esCanal, type Channel } from '@/lib/canales';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_MODEL } from '@/lib/prospect/agent';
import { getSecret } from '@/lib/prospect/secrets';
import {
  draftClientMessage,
  esPrimerContacto,
  type ContextoCliente,
} from '@/lib/client-message';

/**
 * Redacta el mensaje para escribirle a UN cliente.
 *
 * Guardado bajo la sección `clientes` y no `prospeccion`: quien trabaja la
 * ficha es el vendedor, y puede no tener acceso a prospección.
 *
 * De a uno y a pedido, igual que en prospección: se paga por mensaje.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const gate = await apiSectionGuard('clientes');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => ({}));
  const clientId = typeof body?.clientId === 'string' ? body.clientId : null;
  const offer = typeof body?.offer === 'string' ? body.offer.trim() : '';
  const channel: Channel = esCanal(body?.channel) ? body.channel : 'whatsapp';

  if (!clientId) {
    return NextResponse.json({ error: 'Falta indicar el cliente.' }, { status: 400 });
  }
  if (offer.length < 5) {
    // Sin saber qué vende el vendedor el mensaje sería un saludo vacío: mejor
    // pedirlo que pagar por algo inservible. Misma regla que en prospección.
    return NextResponse.json(
      { error: 'Contame en una frase qué vendés, si no el mensaje sale genérico.' },
      { status: 400 },
    );
  }

  const apiKey = await getSecret('openrouter_api_key');
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Falta la API key de OpenRouter. Cargala en Configuración → Prospección (o como OPENROUTER_API_KEY en el entorno).',
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // La RPC resuelve de una: verifica que el cliente sea de quien pregunta,
  // trae el prospecto del que salió —que el vendedor no podría leer por su
  // cuenta— y el historial reciente. Ver migración 0048.
  const { data, error } = await supabase.rpc('client_message_context', {
    p_client_id: clientId,
  });

  // El link de agenda del equipo, si hay uno cargado.
  const { data: ajusteAgenda } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', AGENDA_KEY)
    .maybeSingle();
  const agendaUrl = normalizeAgendaUrl(ajusteAgenda?.value);

  if (error) {
    // El "no encontrado o sin permiso" de la función es un 404 para quien
    // pregunta: no hace falta distinguirlos, y distinguirlos filtraría qué
    // clientes existen.
    if (error.message.includes('not found or not allowed')) {
      return NextResponse.json({ error: 'Ese cliente no está en tu lista.' }, { status: 404 });
    }
    if (error.message.includes('client_message_context')) {
      return NextResponse.json(
        { error: 'Falta aplicar la migración 0048 en la base.' },
        { status: 503 },
      );
    }
    console.error('[client/message] contexto', error);
    // El detalle va en el mensaje a propósito. "No se pudo leer el cliente" no
    // le sirve a nadie: la primera vez que falló —una columna que la función
    // creía que existía— hubo que reproducirlo contra un Postgres aparte para
    // saber qué pasaba. Es un panel interno y el texto de Postgres no trae
    // datos de nadie.
    const detalle = error.message.slice(0, 200);
    const pareceEsquema =
      error.message.includes('has no field') ||
      error.message.includes('does not exist') ||
      error.message.includes('column');
    return NextResponse.json(
      {
        error: pareceEsquema
          ? `La base no coincide con lo que espera el panel: ${detalle}. Suele arreglarse aplicando la última migración.`
          : `No se pudo leer el cliente: ${detalle}`,
      },
      { status: 500 },
    );
  }

  const ctx = data as unknown as ContextoCliente;

  try {
    const { tipo, texto } = await draftClientMessage(
      ctx,
      channel,
      offer,
      {
        apiKey,
        model: DEFAULT_MODEL,
        referer: request.headers.get('origin') ?? undefined,
      },
      new Date(),
      agendaUrl,
    );
    return NextResponse.json({
      tipo,
      message: texto,
      /** Para que la pantalla explique de dónde salió lo que se escribió. */
      contexto: {
        vieneDeProspeccion: ctx.prospect !== null,
        contactosPrevios: ctx.history.total,
        esPrimerContacto: esPrimerContacto(ctx),
      },
    });
  } catch (err) {
    console.error('[client/message]', err);
    const message = err instanceof Error ? err.message : 'No se pudo redactar el mensaje.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
