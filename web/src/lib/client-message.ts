// El mensaje para escribirle a un CLIENTE — SOLO servidor.
//
// Dos mensajes distintos, no uno con variantes:
//
// - **El rompehielo**, cuando nunca se lo contactó. Es el mismo trabajo que ya
//   hace el redactor de prospección, así que lo reusa tal cual.
// - **El de seguimiento**, cuando ya hubo contactos. Este es el difícil, y el
//   que no existía en ningún lado: "le escribí hace ocho días y no contestó,
//   ¿qué le digo ahora?". Su regla dura es no repetir el ángulo anterior, y
//   para eso necesita el historial — que es justo lo que el sistema ya guarda
//   y una persona no tiene a mano al momento de escribir.
//
// Los datos salen de `client_message_context` (migración 0048), que resuelve
// algo que desde acá no se puede: el prospecto de origen suele ser del
// superadmin, así que el vendedor no puede leerlo con sus propios permisos.

import 'server-only';
import { sanitizarMensaje } from './sanitizar-mensaje';
import { separarNotas } from './notas-prospecto';
import { rubroDeTags } from './offers';
import {
  CHANNEL_RULES,
  draftApproach,
  pedirTexto,
  type ApproachInput,
  type Channel,
} from './prospect/approach';

export type { Channel };

/** Lo que devuelve `client_message_context`. */
export interface ContextoCliente {
  client: {
    id: string;
    full_name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    next_follow_up: string | null;
    tags: string[];
    notes: string | null;
    created_at: string;
  };
  prospect: {
    source: string | null;
    kind: string | null;
    niche: string | null;
    area: string | null;
    role_title: string | null;
    company_name: string | null;
    website: string | null;
    has_own_website: boolean | null;
    instagram: string | null;
    linkedin: string | null;
    ig_bio: string | null;
    ig_category: string | null;
    audience_size: number | null;
    audience_activity: 'activo' | 'tibio' | 'dormido' | null;
    rating: number | null;
    reviews_count: number | null;
    score: number | null;
    // Opcionales a propósito: entre desplegar el código y correr la `0052`,
    // la función no devuelve estos campos y Supabase los omite.
    last_post_text?: string | null;
    last_post_at?: string | null;
  } | null;
  history: {
    total: number;
    last_contact_at: string | null;
    last_channel: string | null;
    last_outcome: string | null;
    recent: {
      contacted_at: string;
      channel: string;
      outcome: string | null;
      notes: string | null;
    }[];
  };
}

/**
 * ¿Va el rompehielo o el de seguimiento?
 *
 * Se mira si hubo un **contacto** real, no si hay historial: un comentario
 * suelto ("me lo pasó Juan") no es haberle escrito, y tratarlo como tal haría
 * que el primer mensaje nunca se ofrezca.
 */
export function esPrimerContacto(ctx: ContextoCliente): boolean {
  return !ctx.history.last_contact_at;
}

/** Días desde el último contacto. `null` si nunca se lo contactó. */
export function diasDesdeUltimoContacto(
  ctx: ContextoCliente,
  hoy: Date = new Date(),
): number | null {
  if (!ctx.history.last_contact_at) return null;
  const desde = new Date(ctx.history.last_contact_at).getTime();
  const dias = Math.floor((hoy.getTime() - desde) / 86_400_000);
  return Math.max(0, dias);
}

const RESULTADOS: Record<string, string> = {
  answered: 'atendió',
  no_answer: 'no atendió',
  interested: 'se mostró interesado',
  not_interested: 'dijo que no le interesa',
  wrong_number: 'el número estaba equivocado',
  follow_up_scheduled: 'quedaron en volver a hablar',
  other: 'otro resultado',
};

const CANALES: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'email',
  call: 'llamada',
  sms: 'SMS',
  note: 'comentario interno',
};

/**
 * A qué rubro pertenece este lead, con el vocabulario de los packs de nicho.
 *
 * Es lo que permite elegirle la oferta correcta sin preguntarle nada al
 * vendedor. Primero el rubro que trajo la búsqueda; si el cliente no vino de
 * una, se busca entre sus etiquetas alguna que sea un rubro conocido — las que
 * no lo son (una zona, una etiqueta propia) se ignoran en silencio.
 */
export function rubroDelLead(ctx: ContextoCliente): string | null {
  const porBusqueda = ctx.prospect?.niche?.trim();
  if (porBusqueda) return porBusqueda;
  return rubroDeTags(ctx.client.tags);
}

/** El cliente contado en texto, que es lo que el modelo puede leer. */
export function lineasDeContexto(ctx: ContextoCliente): string {
  const l: string[] = [`Nombre: ${ctx.client.full_name}`];
  const p = ctx.prospect;
  // Los clientes que ya existían guardan lo que sabía la búsqueda como texto
  // plano dentro de las notas (ver `notas-prospecto.ts`). Sin esto el modelo
  // recibía ese bloque crudo, mezclado con las notas de la persona, y el
  // usuario lo reportó como "no lee los datos de los clientes actuales".
  const { datos, libres } = separarNotas(ctx.client.notes);
  if (ctx.client.company) l.push(`Empresa: ${ctx.client.company}`);
  const cargo = p?.role_title ?? datos?.cargo;
  if (cargo) l.push(`Cargo: ${cargo}`);
  if (p?.niche) {
    l.push(`Rubro: ${p.niche}`);
  } else if (ctx.client.tags.length > 0) {
    // Sin prospecto de origen —cliente cargado a mano, importado por CSV o
    // traído de GHL— el rubro no llegaba, y el modelo terminaba deduciéndolo de
    // lo que vende el vendedor: así un gimnasio recibía un mensaje para
    // inmobiliarias. Los tags SÍ suelen tenerlo (`promote_prospects` copia
    // rubro y zona), pero en un importado pueden ser cualquier cosa, así que se
    // ofrecen como lo que son y no afirmando que el primero es el rubro.
    l.push(`Etiquetas de la ficha: ${ctx.client.tags.join(', ')}`);
  }
  if (p?.ig_category) l.push(`Rubro que declara en Instagram: ${p.ig_category}`);
  if (p?.area) l.push(`Zona: ${p.area}`);
  if (p?.ig_bio) l.push(`Bio de Instagram: ${p.ig_bio}`);
  if (typeof p?.audience_size === 'number') l.push(`Seguidores: ${p.audience_size}`);
  if (p?.audience_activity) {
    const texto = {
      activo: 'publica seguido',
      tibio: 'publica de vez en cuando',
      dormido: 'hace mucho que no publica',
    }[p.audience_activity];
    l.push(`Actividad en redes: ${texto}`);
  }
  const instagram = p?.instagram ?? datos?.instagram;
  if (instagram) l.push(`Instagram: @${instagram}`);
  const sitio = p?.website ?? datos?.website;
  if (sitio) l.push(`Sitio web: ${sitio}`);
  if (p?.has_own_website === false) l.push('No tiene sitio web propio');
  if (typeof p?.rating === 'number') {
    l.push(`Calificación en Google: ${p.rating} (${p.reviews_count ?? 0} reseñas)`);
  }
  // Solo lo que escribió una persona: el bloque automático ya se repartió en
  // las líneas de arriba, y mandarlo entero además lo haría competir con ellas.
  if (libres) l.push(`Notas del vendedor: ${libres}`);

  // Lo que falta se declara, para que el modelo no lo invente. Ver el mismo
  // criterio en `approach.ts`.
  const faltan: string[] = [];
  if (!rubroDelLead(ctx)) faltan.push('a qué se dedica');
  if (!p?.area) faltan.push('en qué zona está');
  if (faltan.length > 0) {
    l.push(
      `NO sabemos ${faltan.join(', ni ')}. No lo deduzcas ni lo menciones: ` +
        'escribí con lo que sí está arriba.',
    );
  }

  return l.join('\n');
}

/** El historial contado en texto, para que el modelo no repita lo ya dicho. */
export function lineasDeHistorial(ctx: ContextoCliente, hoy: Date = new Date()): string {
  const dias = diasDesdeUltimoContacto(ctx, hoy);
  const l: string[] = [];
  if (dias !== null) {
    l.push(
      dias === 0
        ? 'Último contacto: hoy'
        : `Último contacto: hace ${dias} ${dias === 1 ? 'día' : 'días'}`,
    );
  }
  l.push(`Veces que se lo contactó: ${ctx.history.total}`);
  for (const i of ctx.history.recent) {
    const fecha = i.contacted_at.slice(0, 10);
    const canal = CANALES[i.channel] ?? i.channel;
    const res = i.outcome ? ` — ${RESULTADOS[i.outcome] ?? i.outcome}` : '';
    const nota = i.notes ? `: "${i.notes.slice(0, 160)}"` : '';
    l.push(`- ${fecha}, por ${canal}${res}${nota}`);
  }
  return l.join('\n');
}

/** Solo para los tests: fijar que la regla del rubro siga estando. */
export function promptDeSeguimientoParaTest(): string {
  return promptDeSeguimiento();
}

function promptDeSeguimiento(): string {
  return `Sos Turbo, el copiloto de ventas de Hunter Leads. Escribís un mensaje de SEGUIMIENTO: el vendedor ya contactó a esta persona y vuelve a escribirle.

Reglas que no se negocian:
- NO repitas el ángulo del mensaje anterior. Te doy el historial justamente para eso: si ya se ofreció X, esta vez entrá por otro lado.
- No reproches el silencio. Nada de "no tuve respuesta", "te escribí y no me contestaste", "hago el seguimiento".
- Una sola idea y **una sola pregunta al final, que empuja a una llamada corta**.
- Si te doy un link de agenda, ofrecelo; si no, no inventes horarios ni fechas.
- Si el resultado del último contacto fue que no le interesa, no insistas con lo mismo: proponé algo distinto o preguntá si cambió algo, con tacto.
- El rubro del destinatario sale SOLO de sus datos. Lo que vende el vendedor no dice a qué se dedica él: si la oferta menciona un rubro y el destinatario es de otro, mandan los datos del destinatario. Si no sabés a qué se dedica, no lo deduzcas de la oferta ni lo menciones.
- Nada de "espero que estés bien", "retomo el contacto", ni signos de admiración.
- Escribís el mensaje y nada más: sin explicaciones, sin comillas, sin alternativas.

Si ya se lo contactó DOS veces sin respuesta, este mensaje es el último: se despide sin reproche, deja la puerta abierta y no vuelve a insistir. Perseguir a alguien que no contesta quema el contacto y la cuenta.

Si el lead pidió algo que no podés responder con lo que te di —un precio cerrado, un detalle técnico fino, algo legal— no lo inventes: decí que lo consultás y que le respondés enseguida.

Si pasó mucho tiempo, un motivo real para volver a escribir vale más que una excusa: algo del rubro, de la zona o de lo que la persona hace.`;
}

/** Los datos del cliente, con la forma que espera el redactor de prospección. */
export function comoProspecto(
  ctx: ContextoCliente,
  channel: Channel,
  offer: string,
  agendaUrl: string | null = null,
): ApproachInput {
  const p = ctx.prospect;
  return {
    name: ctx.client.full_name,
    kind: p?.kind === 'person' || p?.kind === 'account' ? p.kind : 'business',
    channel,
    offer,
    area: p?.area ?? null,
    niche: p?.niche ?? null,
    roleTitle: p?.role_title ?? null,
    companyName: ctx.client.company ?? p?.company_name ?? null,
    igBio: p?.ig_bio ?? null,
    igCategory: p?.ig_category ?? null,
    audienceSize: p?.audience_size ?? null,
    audienceActivity: p?.audience_activity ?? null,
    hasOwnWebsite: p?.has_own_website ?? null,
    rating: p?.rating ?? null,
    reviewsCount: p?.reviews_count ?? null,
    agendaUrl,
    ultimoPost: p?.last_post_text ?? null,
    ultimoPostAt: p?.last_post_at ?? null,
  };
}

/**
 * Redacta el mensaje que corresponda según si ya se lo contactó o no.
 *
 * Devuelve también `tipo`, porque la pantalla tiene que poder decir cuál de los
 * dos escribió: no es lo mismo revisar un rompehielo que un re-contacto.
 */
export async function draftClientMessage(
  ctx: ContextoCliente,
  channel: Channel,
  offer: string,
  config: { apiKey: string; model: string; referer?: string },
  hoy: Date = new Date(),
  /** Dónde reservar la llamada. Sin esto el mensaje la pide sin proponer nada. */
  agendaUrl: string | null = null,
): Promise<{ tipo: 'primer_contacto' | 'seguimiento'; texto: string }> {
  if (esPrimerContacto(ctx)) {
    const texto = await draftApproach(comoProspecto(ctx, channel, offer, agendaUrl), config);
    return { tipo: 'primer_contacto', texto };
  }

  const texto = await pedirTexto(
    promptDeSeguimiento(),
    `Canal: ${CHANNEL_RULES[channel]}

Lo que vende el vendedor: ${offer}
${agendaUrl ? `Link de agenda para ofrecer: ${agendaUrl}` : 'No hay link de agenda: pedí la llamada sin proponer horarios.'}

Quién es:
${lineasDeContexto(ctx)}

Lo que ya pasó con esta persona:
${lineasDeHistorial(ctx, hoy)}`,
    config,
  );
  return { tipo: 'seguimiento', texto: sanitizarMensaje(texto, channel) };
}
