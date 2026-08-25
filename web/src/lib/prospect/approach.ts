// Redacta el primer mensaje para un prospecto concreto — SOLO servidor.
//
// Es lo único de todo el sistema que se paga POR LEAD en vez de por lote, así
// que corre **a pedido, de a uno**. Hacerlo automático sobre 100 prospectos
// multiplicaría por cien el costo del modelo para mensajes que nadie va a leer:
// el vendedor contacta a unos pocos por día, no a la lista entera.
//
// Usa lo que el enriquecimiento ya trajo (bio, actividad, seguidores, rubro
// declarado, titular de LinkedIn). Sin eso el mensaje sería genérico y no valdría
// la pena — un genérico lo escribe cualquiera sin gastar.

import 'server-only';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type Channel = 'whatsapp' | 'email' | 'linkedin';

export interface ApproachInput {
  /** Nombre del negocio o de la persona. */
  name: string;
  kind: 'business' | 'person' | 'account';
  channel: Channel;
  /** Qué vende el usuario. Sin esto el mensaje no puede proponer nada. */
  offer: string;
  area?: string | null;
  niche?: string | null;
  roleTitle?: string | null;
  companyName?: string | null;
  igBio?: string | null;
  igCategory?: string | null;
  audienceSize?: number | null;
  audienceActivity?: 'activo' | 'tibio' | 'dormido' | null;
  hasOwnWebsite?: boolean | null;
  rating?: number | null;
  reviewsCount?: number | null;
}

export const CHANNEL_RULES: Record<Channel, string> = {
  whatsapp:
    'WhatsApp. Máximo 45 palabras, en un solo párrafo, sin asunto y sin firma. ' +
    'Tuteo rioplatense. Tiene que poder leerse entero en la notificación.',
  email:
    'Email. Un asunto de menos de 8 palabras en la primera línea con el prefijo "Asunto:", ' +
    'después el cuerpo en 60 a 90 palabras y dos párrafos como mucho.',
  linkedin:
    'Mensaje de LinkedIn. Máximo 60 palabras, tono profesional pero humano, ' +
    'sin "espero que estés muy bien" ni fórmulas de plantilla.',
};

function contextLines(input: ApproachInput): string {
  const lines: string[] = [`Nombre: ${input.name}`];
  if (input.roleTitle) lines.push(`Cargo: ${input.roleTitle}`);
  if (input.companyName) lines.push(`Empresa: ${input.companyName}`);
  if (input.niche) lines.push(`Rubro: ${input.niche}`);
  if (input.igCategory) lines.push(`Rubro que declara en Instagram: ${input.igCategory}`);
  if (input.area) lines.push(`Zona: ${input.area}`);
  if (input.igBio) lines.push(`Bio de Instagram: ${input.igBio}`);
  if (typeof input.audienceSize === 'number') {
    lines.push(`Seguidores: ${input.audienceSize}`);
  }
  if (input.audienceActivity) {
    const texto = {
      activo: 'publica seguido',
      tibio: 'publica de vez en cuando',
      dormido: 'hace mucho que no publica',
    }[input.audienceActivity];
    lines.push(`Actividad en redes: ${texto}`);
  }
  if (input.hasOwnWebsite === false) lines.push('No tiene sitio web propio');
  if (typeof input.rating === 'number') {
    lines.push(`Calificación en Google: ${input.rating} (${input.reviewsCount ?? 0} reseñas)`);
  }
  return lines.join('\n');
}

/** Solo para los tests: fijar que la regla del rubro siga estando. */
export function systemPromptParaTest(): string {
  return systemPrompt();
}

function systemPrompt(): string {
  return `Sos Turbo, el copiloto de ventas de Hunter Leads. Escribís el PRIMER mensaje de un vendedor a un prospecto que no lo conoce.

Reglas que no se negocian:
- Arrancás con algo REAL y específico del prospecto, sacado de los datos que te doy. Si no hay nada específico, decilo en vez de inventar: no te inventes premios, clientes, años de trayectoria ni nada que no esté en los datos.
- Una sola idea y una sola pregunta al final. La pregunta pide una respuesta corta, no una reunión.
- Nada de "espero que estés bien", "me encantó tu perfil", "somos líderes en", ni signos de admiración.
- El rubro del prospecto sale SOLO de sus datos. Lo que vende el vendedor no dice a qué se dedica él: si la oferta menciona un rubro y el prospecto es de otro, mandan los datos del prospecto. Si no sabés a qué se dedica, no lo deduzcas de la oferta ni lo menciones.
- No prometas resultados con números si no te los dieron.
- Escribís el mensaje y nada más: sin explicaciones, sin comillas, sin alternativas.

Si el prospecto hace mucho que no publica o no tiene web, eso es una oportunidad concreta: mencionala con tacto, nunca como un reproche.`;
}

/**
 * Devuelve el texto del mensaje, listo para copiar.
 *
 * `max_tokens` NO se puede usar para forzar brevedad: `openrouter/auto` rutea
 * seguido a modelos que razonan antes de responder, y ese razonamiento se
 * descuenta del mismo presupuesto. Con 400 el modelo gastaba todo pensando y
 * devolvía **vacío** — verificado con una llamada real. El largo se controla
 * con la instrucción, que es donde corresponde; el tope solo evita un desborde.
 */
export async function draftApproach(
  input: ApproachInput,
  config: { apiKey: string; model: string; referer?: string },
): Promise<string> {
  return pedirTexto(
    systemPrompt(),
    `Canal: ${CHANNEL_RULES[input.channel]}

Lo que vende el vendedor: ${input.offer}

Datos del prospecto:
${contextLines(input)}`,
    config,
  );
}

/**
 * El transporte: una llamada a OpenRouter que devuelve texto limpio.
 *
 * Vive acá y no en cada redactor porque el manejo de errores —y sobre todo la
 * lección del `max_tokens` de arriba— vale para todos por igual.
 */
export async function pedirTexto(
  system: string,
  user: string,
  config: { apiKey: string; model: string; referer?: string },
): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.referer ? { 'HTTP-Referer': config.referer } : {}),
      'X-Title': 'Hunter Leads - Turbo',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 1500,
      temperature: 0.7,
      // Que el router no caiga en un proveedor que ignore `temperature`.
      provider: { require_parameters: true },
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('OpenRouter rechazó la API key. Revisala en Configuración.');
    }
    if (res.status === 402) {
      throw new Error('La cuenta de OpenRouter no tiene crédito disponible.');
    }
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenRouter respondió ${res.status}. ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
    error?: { message?: string };
  };
  if (data.error) throw new Error(data.error.message ?? 'Error de OpenRouter.');

  const text = (data.choices?.[0]?.message?.content ?? '').trim();
  if (!text) throw new Error('El modelo no devolvió ningún mensaje. Probá de nuevo.');
  // Algunos modelos envuelven la respuesta en comillas pese a la instrucción.
  return text.replace(/^["'«]|["'»]$/g, '').trim();
}
