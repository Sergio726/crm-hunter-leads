import { NextResponse } from 'next/server';
import { puertaDeExtension } from '@/lib/extension/auth';
import { PROXIMO_POR_DEFECTO, fechaDeProximo } from '@/lib/seguimiento';

/**
 * La extensión avisa que el vendedor mandó el mensaje.
 *
 * Es la mitad del circuito que hoy falta cuando se escribe desde LinkedIn a
 * mano: el contacto queda en el historial, el lead pasa a Contactado y se
 * programa el próximo seguimiento — sin que nadie vuelva al panel a anotarlo.
 *
 * Lo que NO hace: mandar nada. El envío lo apretó una persona en LinkedIn; acá
 * solo se registra que pasó. Por eso el resultado queda como `other` con la
 * nota de qué fue: "mandé el primer mensaje" no es "contestó" ni "no contestó",
 * es antes de eso. Cuando el lead responda, el vendedor registra el siguiente
 * contacto desde la ficha, como siempre.
 *
 * ⚠️ Clave de servicio: cada consulta filtra por el vendedor del token.
 */
export async function POST(request: Request) {
  const puerta = await puertaDeExtension(request);
  if (!puerta.ok) return puerta.response;

  const body = await request.json().catch(() => ({}));
  const draftId = typeof body?.draftId === 'string' ? body.draftId : null;
  if (!draftId) {
    return NextResponse.json({ error: 'Falta indicar qué borrador se mandó.' }, { status: 400 });
  }

  const { admin, userId } = puerta;

  // El borrador tiene que ser del vendedor y estar pendiente. Las dos cosas
  // en la misma consulta: si no coincide, no existe para quien pregunta.
  const { data: draft, error: e1 } = await admin
    .from('outbound_drafts')
    .select('id, client_id, channel, body')
    .eq('id', draftId)
    .eq('created_by', userId)
    .is('sent_at', null)
    .maybeSingle();

  if (e1) {
    console.error('[extension/enviado] leer borrador', e1.message);
    return NextResponse.json({ error: 'No se pudo leer el borrador.' }, { status: 500 });
  }
  if (!draft) {
    return NextResponse.json({ error: 'Ese borrador no existe o ya se mandó.' }, { status: 404 });
  }

  const ahora = new Date().toISOString();

  // 1. Marcarlo enviado. Primero esto: si algo después falla, la extensión no
  //    lo vuelve a ofrecer y no se manda dos veces.
  const { error: e2 } = await admin
    .from('outbound_drafts')
    .update({ sent_at: ahora, sent_via: 'extension' })
    .eq('id', draft.id)
    .eq('created_by', userId);
  if (e2) {
    console.error('[extension/enviado] marcar', e2.message);
    return NextResponse.json({ error: 'No se pudo marcar el borrador como enviado.' }, { status: 500 });
  }

  // 2. Que quede en el historial, como cualquier contacto.
  const { error: e3 } = await admin.from('interactions').insert({
    client_id: draft.client_id,
    user_id: userId,
    channel: draft.channel,
    outcome: 'other',
    notes: `[Enviado desde la extensión de Chrome]\n${draft.body}`,
    contacted_at: ahora,
  });
  if (e3) {
    console.error('[extension/enviado] interacción', e3.message);
    return NextResponse.json(
      { error: 'Se marcó como enviado pero no se pudo anotar en el historial.', marcado: true },
      { status: 500 },
    );
  }

  // 3. Mover el lead. Solo de Pendiente a Contactado: uno Ganado o Perdido no
  //    vuelve atrás por un mensaje. Y el próximo seguimiento, si no tenía.
  const { data: lead } = await admin
    .from('clients')
    .select('status, next_follow_up')
    .eq('id', draft.client_id)
    .maybeSingle();

  const patch: Record<string, unknown> = {};
  if (lead?.status === 'pending') patch.status = 'contacted';
  if (lead && !lead.next_follow_up) patch.next_follow_up = fechaDeProximo(PROXIMO_POR_DEFECTO);

  if (Object.keys(patch).length > 0) {
    const { error: e4 } = await admin.from('clients').update(patch).eq('id', draft.client_id);
    if (e4) console.error('[extension/enviado] mover el lead', e4.message);
  }

  return NextResponse.json({
    ok: true,
    estado: (patch.status as string | undefined) ?? lead?.status ?? null,
    proximoSeguimiento: (patch.next_follow_up as string | undefined) ?? lead?.next_follow_up ?? null,
  });
}
