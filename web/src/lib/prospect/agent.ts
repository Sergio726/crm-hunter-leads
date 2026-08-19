// Turbo: el agente que descubre a quién le vende el usuario y elige dónde
// cazarlo. SOLO servidor.
//
// Proveedor: OpenRouter (API compatible con OpenAI). La API key se carga desde
// Configuración y se lee con `secrets.ts`; el modelo sale de `app_settings.ai_model`.
//
// Sin key configurada el módulo NO se cae: degrada a un modo guiado determinista
// que arma los filtros con heurísticas simples.
//
// Robustez entre modelos: se pide la propuesta por *tool calling* (lo estándar),
// pero no todos los modelos de OpenRouter lo soportan igual de bien, así que
// también se acepta un bloque ```json en el texto. Con cualquiera de las dos vías
// la propuesta llega.
//
// PROSP-12: Turbo pasa de traducir filtros de Google Places a elegir la fuente.
// Se le declara UNA HERRAMIENTA POR FUENTE y el modelo elige cuál llamar en la
// misma respuesta — no hace falta un subagente enrutador, que pagaría dos veces
// el mismo razonamiento y duplicaría la demora.

import 'server-only';
import { NICHE_PACKS, getNichePack } from './niches';
import { SOURCES } from './sources/catalog';
import type {
  AgentReply,
  ChatTurn,
  CountryCode,
  ProspectFilters,
  SignalField,
  SourceId,
} from './types';
import {
  COUNTRIES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MIN_LIMIT,
  SIGNAL_FIELDS,
  clampLimit,
  mobileDetectable,
} from './types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Si no se eligió modelo, OpenRouter rutea solo.
 *
 * El riesgo de `auto` era caer en un modelo sin tool calling justo en la
 * conversación que importa. No se resuelve fijando un modelo a mano — un id
 * hardcodeado envejece y un día deja de existir — sino con
 * `provider.require_parameters`, que le prohíbe a OpenRouter rutear a un
 * proveedor que no soporte los parámetros del pedido, `tools` incluido.
 */
export const DEFAULT_MODEL = 'openrouter/auto';

const DEFAULT_FILTERS: ProspectFilters = {
  source: 'google_places',
  queries: [],
  areas: [],
  country: 'AR',
  niche: 'generico',
  // `requireNoWebsite` arranca APAGADO. Era `true` por costumbre —el producto
  // nació para vender páginas web— y eso borraba en silencio prospectos válidos
  // para cualquier otra oferta. Ahora lo enciende Turbo si la oferta lo pide.
  requireNoWebsite: false,
  requireInstagram: false,
  requireLinkedin: false,
  requireWhatsapp: true,
  minRating: null,
  limit: DEFAULT_LIMIT,
};

/** La herramienta con la que Turbo pregunta ofreciendo opciones clickeables. */
const ASK_TOOL_NAME = 'preguntar';

/** Nombre de la herramienta de cada fuente. */
function toolNameFor(source: SourceId): string {
  return `buscar_en_${source}`;
}

function sourceFromToolName(name: string): SourceId | null {
  const match = (Object.keys(SOURCES) as SourceId[]).find((id) => toolNameFor(id) === name);
  return match ?? null;
}

/**
 * Lo que Turbo puede VER además de la conversación.
 *
 * Hasta ahora solo podía proponer: no tenía forma de mirar cómo salió la última
 * búsqueda ni cuánta plata quedaba, así que ante un cero decía "no encontré
 * nada" y ahí terminaba.
 *
 * Va inyectado en la instrucción y no como herramientas, aunque el plan las
 * proponía. Son dos o tres líneas de texto que casi siempre importan: una
 * herramienta costaría una llamada entera al modelo —tokens y demora— para
 * traer lo mismo que entra gratis acá. Las herramientas rinden cuando el dato es
 * grande o caro de conseguir, y este no es el caso.
 */
export interface AgentContext {
  /** El presupuesto en una frase. Ver `budget.ts`. */
  budget?: string | null;
  /** Cómo salió la última búsqueda, en una frase. */
  lastRun?: string | null;
}

function contextBlock(ctx: AgentContext): string {
  if (!ctx.budget && !ctx.lastRun) return '';

  const partes = ['\n## Lo que está pasando ahora\n'];
  if (ctx.lastRun) {
    partes.push(`**Última búsqueda**: ${ctx.lastRun}`);
    partes.push(
      '\nSi volvió vacía y **todos los descartes están en cero**, el problema NO son los ' +
        'filtros: el proveedor no devolvió a nadie. Casi siempre es la zona (en LinkedIn es ' +
        'coincidencia exacta) o cargos demasiado específicos. Decilo así, con esa certeza, y ' +
        'proponé la búsqueda corregida — no repitas la misma.\n' +
        'Si trajo menos de lo pedido, **decilo vos antes de que lo note el vendedor**, y decí ' +
        'por qué.',
    );
  }
  if (ctx.budget) {
    partes.push(`\n**Presupuesto**: ${ctx.budget}`);
    partes.push(
      '\nNunca propongas una búsqueda que no entre en lo que queda. Si el vendedor pide algo ' +
        'que no entra, decíselo y ofrecé una versión más chica que sí entre.',
    );
  }
  return partes.join('\n');
}

function systemPrompt(sources: SourceId[], ctx: AgentContext = {}): string {
  const packs = NICHE_PACKS.filter((p) => p.id !== 'generico')
    .map((p) => `- ${p.id}: ${p.label} (ej. ${p.queries.slice(0, 3).join(', ')})`)
    .join('\n');

  const fuentes = sources
    .map((id) => `- **${SOURCES[id].label}** (\`${toolNameFor(id)}\`): ${SOURCES[id].whenToUse}`)
    .join('\n');

  return `Te llamás Turbo y sos el agente de IA de Hunter Leads, el CRM de prospección de ST Labs.

No sos un buscador. Sos un experto en procesos de venta y en armado de oferta, y tu trabajo con el vendedor tiene tres momentos, en este orden:

**1. La oferta.** Qué vende, y sobre todo QUÉ PROBLEMA RESUELVE. Si te dice "vendo páginas web", eso es el producto, no la oferta: la oferta es "consigo que una inmobiliaria deje de perder consultas por no tener dónde mandar a la gente". Ayudalo a llegar ahí. Si todavía no tiene el producto armado, ayudalo a armarlo.

**2. El dolor y quién lo tiene.** A quién le duele ese problema lo suficiente como para pagar por sacárselo. Y —esto es lo que hace la búsqueda posible— **cómo se reconoce a esa persona o negocio desde afuera**: qué se ve en su ficha de Google, en su perfil, en su cargo. Un avatar que no se puede reconocer desde afuera no se puede buscar.

**3. Dónde está.** Recién con lo anterior claro, elegís la fuente y proponés la búsqueda.

No hagas los tres pasos como un interrogatorio. **Avanzá con hipótesis**: si el vendedor dice "vendo páginas web a inmobiliarias", ya podés deducir la oferta y el dolor — decíselos y pedile que te confirme o te corrija. Una pregunta por turno como máximo, y solo cuando la respuesta cambia lo que vas a hacer.

Si el vendedor te apura ("buscame inmobiliarias en Córdoba y listo"), no lo trabes: proponé la búsqueda y hacé la pregunta que más valor agrega, una sola.

Cómo trabajás:
- Hablás en español rioplatense, breve y concreto. Nada de listas largas ni preámbulos.
- **Recomendás siempre.** No preguntes lo que podés proponer: llegá con una recomendación armada y el motivo, y dejá que el vendedor la edite.
- Sos honesto: si una señal filtra tan fuerte que va a devolver cero, decilo antes y no después.
- La decisión final es siempre del vendedor. Proponés, no imponés.
- No te presentes por tu nombre en cada mensaje ni saludes de más: la interfaz ya muestra quién sos.
- Nunca inventes resultados ni digas que ya buscaste: vos definís la búsqueda, la ejecuta el sistema cuando el vendedor la aprueba.
- **Emojis: uno por mensaje como máximo, y solo cuando aporta** — marcar un hallazgo, una advertencia, un resultado. Nunca decorativos, nunca dos seguidos, nunca en cada frase.

## Cuando preguntes, ofrecé opciones

Si necesitás que el vendedor elija entre alternativas, usá la herramienta \`${ASK_TOOL_NAME}\`: el mensaje más 2 a 4 opciones cortas. Se le muestran como botones y le ahorran escribir. Usala para elegir entre caminos ("¿por zona o por rubro?"), no para preguntas abiertas.

## Elegir la fuente

Antes de proponer nada, decidí DÓNDE está el cliente del vendedor:

${fuentes}

La regla es el tipo de cliente, no el rubro del vendedor: alguien que vende software puede necesitar Google Maps si su cliente es una cadena de locales. Cuando propongas, **decí en una frase por qué elegiste esa fuente** — es lo que le permite al vendedor corregirte si conoce su mercado mejor que vos.

Si el vendedor pide una fuente que no está en la lista de arriba, decile que todavía no está disponible y ofrecé la más parecida.

### Cómo escribir las zonas

En **LinkedIn** la zona es un filtro de coincidencia exacta: tiene que ser el nombre del lugar tal como lo escribiría LinkedIn — \`Colombia\`, \`Bogotá\`, \`Buenos Aires\`. **Nada de aclaraciones entre paréntesis** ("Colombia (todo el país)" devuelve CERO) y **un lugar por entrada**, nunca "Bogotá - Medellín" en la misma línea: si son dos ciudades, van como dos zonas.

En **Google Maps** la zona es texto libre y conviene que sea específica: \`Palermo, Buenos Aires\` rinde más que \`Argentina\`.

## Cuántos

Si el vendedor dice cuántos quiere ("buscame 2", "10 leads", "unos pocos para probar"), respetalo tal cual en \`limit\`, aunque sea un número chico. No lo redondees para arriba. Si no dijo nada, usá ${DEFAULT_LIMIT}.

## Criterio para los filtros de Google Maps

Las señales las elegís vos **a partir de la oferta**, no por costumbre. Cada una que activás achica el embudo, así que activala solo si se justifica con lo que el vendedor vende.

- \`requireNoWebsite\`: **NO es un default**. Solo tiene sentido si lo que vende tiene que ver con la presencia web (páginas, tiendas online, SEO). Si vende mentorías, seguros, insumos o un producto físico, que el negocio tenga web no dice nada — y activarlo te borra justo los prospectos con más datos de contacto. Si su "web" es Instagram o un portal del rubro, cuenta como sin web.
- \`requireWhatsapp=true\` cuando el vendedor va a contactar por WhatsApp (lo habitual). Ojo: en México, República Dominicana y Puerto Rico no se puede distinguir móvil de fijo por el número, así que ahí esa señal no filtra nada.
- \`requireInstagram=true\` solo si su oferta depende de que el prospecto tenga presencia en redes; achica bastante el embudo.
- \`requireLinkedin=true\` **nunca** en Google. Google publica un único enlace por negocio y prácticamente nunca es LinkedIn: exigirlo devuelve cero. Si el vendedor quiere gente de LinkedIn, la respuesta es buscar EN LinkedIn.
- Si el rubro coincide con un pack conocido, usá su id. Si no, usá "generico" y escribí vos las queries.

**Por cada señal que activás, escribí el motivo en \`signalReasons\`.** Media frase, en segunda persona, atada a lo que vende: "porque vendés páginas web y el que ya tiene una no te necesita". El vendedor no ve casillas: ve tus exigencias con tu razón al lado. Una exigencia sin motivo parece una casilla marcada por costumbre y la va a sacar sin pensar — y si no se te ocurre el motivo, es que esa señal no va.

Packs disponibles:
${packs}

Países disponibles: ${Object.entries(COUNTRIES)
    .map(([code, c]) => `${code} (${c.name})`)
    .join(', ')}.

Si por algún motivo no podés usar una herramienta, devolvé la propuesta como un bloque \`\`\`json con las mismas claves más \`"source"\`.
${contextBlock(ctx)}`;
}

/** Campos que toda propuesta comparte, sea de la fuente que sea. */
const COMMON_PROPS = {
  icpSummary: {
    type: 'string',
    description: 'El avatar en una línea, ej. "Inmobiliarias chicas de CABA sin web propia".',
  },
  reason: {
    type: 'string',
    description: 'Por qué esta fuente y no otra, en una frase. Se le muestra al vendedor.',
  },
  niche: {
    type: 'string',
    description:
      'El rubro o segmento en una o dos palabras, en minúsculas y en plural: ' +
      '"inmobiliarias", "gimnasios", "dueños de pyme". Es la etiqueta con la ' +
      'que va a nacer el cliente cuando el vendedor lo guarde, y lo que después ' +
      'le permite separar una lista de otra. Ponelo siempre.',
  },
  offer: {
    type: 'string',
    description:
      'Qué vende el vendedor y qué problema resuelve, en una frase. Se guarda y se reusa para redactar el primer mensaje a cada prospecto, así no hay que volver a preguntarlo.',
  },
  areas: {
    type: 'array',
    items: { type: 'string' },
    description: 'Zonas a recorrer, ej. ["Palermo, Buenos Aires"].',
  },
  country: { type: 'string', enum: Object.keys(COUNTRIES) },
  limit: {
    type: 'integer',
    minimum: MIN_LIMIT,
    maximum: MAX_LIMIT,
    description: `Cuántos resultados devolver como máximo (${MIN_LIMIT} a ${MAX_LIMIT}). Si el vendedor pidió una cantidad concreta ("buscame 2", "unos 10"), poné exactamente ese número. Si no dijo nada, poné ${DEFAULT_LIMIT}.`,
  },
} as const;

/** Herramienta de Google Maps: negocios con dirección física. */
const GOOGLE_PROPS = {
  niche: {
    type: 'string',
    enum: NICHE_PACKS.map((p) => p.id),
    description: 'Id del pack de nicho, o "generico" si es a medida.',
  },
  queries: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Términos de búsqueda. Si usás un pack conocido podés dejarlo vacío para tomar los suyos.',
  },
  requireNoWebsite: { type: 'boolean' },
  requireInstagram: { type: 'boolean' },
  requireLinkedin: {
    type: 'boolean',
    description:
      'Exigir LinkedIn en la ficha de Google. Hoy devuelve cero casi siempre: si el vendedor quiere gente de LinkedIn, usá la herramienta de LinkedIn.',
  },
  requireWhatsapp: { type: 'boolean' },
  minRating: { type: ['number', 'null'] },
  signalReasons: {
    type: 'object',
    description:
      'Por qué exigís cada señal que activaste. Media frase, en segunda persona y ' +
      'atada a lo que vende: "porque vendés páginas web y el que ya tiene una no te ' +
      'necesita". UNA ENTRADA POR CADA SEÑAL EN true (o con valor, en minRating). ' +
      'No expliques las que dejaste apagadas. Sin el motivo, la exigencia parece una ' +
      'casilla marcada por costumbre y el vendedor la saca sin pensar.',
    properties: {
      requireNoWebsite: { type: 'string' },
      requireInstagram: { type: 'string' },
      requireLinkedin: { type: 'string' },
      requireWhatsapp: { type: 'string' },
      minRating: { type: 'string' },
    },
  },
} as const;

/**
 * Preguntar ofreciendo opciones clickeables.
 *
 * Es una herramienta y no un formato de texto a parsear porque así el modelo no
 * puede equivocarse en la forma: o llama a la herramienta con opciones, o
 * escribe texto normal. Al tocarlas se envía ese texto como si el vendedor lo
 * hubiera escrito — no ejecutan nada por su cuenta.
 */
const ASK_TOOL = {
  type: 'function' as const,
  function: {
    name: ASK_TOOL_NAME,
    description:
      'Hacele una pregunta al vendedor ofreciéndole opciones para tocar. Usala cuando hay que elegir entre caminos concretos, no para preguntas abiertas.',
    parameters: {
      type: 'object',
      properties: {
        mensaje: { type: 'string', description: 'La pregunta, en una o dos frases.' },
        opciones: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 4,
          description: 'Respuestas posibles, cortas (2 a 5 palabras). Se muestran como botones.',
        },
      },
      required: ['mensaje', 'opciones'],
    },
  },
};

/** Herramienta de LinkedIn: personas por cargo y empresa. */
const LINKEDIN_PROPS = {
  jobTitles: {
    type: 'array',
    items: { type: 'string' },
    description: 'Cargos a buscar, ej. ["director comercial", "gerente de ventas"].',
  },
  industries: {
    type: 'array',
    items: { type: 'string' },
    description: 'Industrias, ej. ["real estate", "software"].',
  },
  seniority: {
    type: 'array',
    items: { type: 'string' },
    description: 'Nivel, ej. ["owner", "director", "manager"].',
  },
  companySizes: {
    type: 'array',
    items: { type: 'string' },
    description: 'Tamaño de empresa, ej. ["1-10", "11-50"].',
  },
} as const;

function toolFor(source: SourceId) {
  const extra =
    source === 'google_places' ? GOOGLE_PROPS : source === 'linkedin' ? LINKEDIN_PROPS : {};
  const required =
    source === 'google_places'
      ? ['icpSummary', 'reason', 'niche', 'areas', 'country', 'limit']
      : ['icpSummary', 'reason', 'areas', 'country', 'limit'];

  return {
    type: 'function' as const,
    function: {
      name: toolNameFor(source),
      description: `Propone una búsqueda en ${SOURCES[source].label}. ${SOURCES[source].whenToUse} El vendedor la ve y la aprueba antes de que se ejecute.`,
      parameters: {
        type: 'object',
        properties: { ...COMMON_PROPS, ...extra },
        // `limit` va en required a propósito: siendo opcional, omitirlo era el
        // camino de menor esfuerzo para el modelo y la cantidad pedida por el
        // vendedor se perdía siempre contra el default.
        required,
      },
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Normaliza lo que propuso el modelo: nunca confiamos en que venga completo o en rango. */
export function toFilters(source: SourceId, input: Record<string, unknown>): ProspectFilters {
  const niche = typeof input.niche === 'string' ? input.niche : 'generico';
  const pack = getNichePack(niche);
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
      : [];

  const rawQueries = strings(input.queries);
  const areas = strings(input.areas);
  const country =
    typeof input.country === 'string' && input.country in COUNTRIES
      ? (input.country as CountryCode)
      : DEFAULT_FILTERS.country;

  // En LinkedIn los "términos" son los cargos: se reusa `queries` para no
  // duplicar la forma de los filtros en toda la cañería.
  const jobTitles = strings(input.jobTitles);
  const queries =
    source === 'linkedin'
      ? jobTitles
      : rawQueries.length > 0
        ? rawQueries
        : pack.queries;

  return {
    source,
    queries,
    areas,
    country,
    // En Google el rubro TIENE que ser un pack conocido: de ahí salen los
    // términos de búsqueda y los nombres a excluir. En LinkedIn e Instagram no
    // hay packs, y el rubro es solo la etiqueta con la que va a nacer el
    // cliente al promoverlo (`promote_prospects` copia `niche` a `tags`).
    //
    // Forzarlo a un pack lo colapsaba a "generico" SIEMPRE, porque
    // `getNichePack` cae al primero cuando no encuentra el id. Resultado: todo
    // lo que salía de LinkedIn o Instagram llegaba a Clientes sin rubro, y no
    // se podía separar una lista de otra.
    niche: source === 'google_places' ? pack.id : niche.trim() || 'generico',
    requireNoWebsite:
      typeof input.requireNoWebsite === 'boolean'
        ? input.requireNoWebsite
        : DEFAULT_FILTERS.requireNoWebsite,
    requireInstagram:
      typeof input.requireInstagram === 'boolean'
        ? input.requireInstagram
        : DEFAULT_FILTERS.requireInstagram,
    requireLinkedin:
      typeof input.requireLinkedin === 'boolean'
        ? input.requireLinkedin
        : DEFAULT_FILTERS.requireLinkedin,
    // Si en ese país la señal no discrimina, no tiene sentido exigirla.
    requireWhatsapp:
      mobileDetectable(country) &&
      (typeof input.requireWhatsapp === 'boolean'
        ? input.requireWhatsapp
        : DEFAULT_FILTERS.requireWhatsapp),
    minRating: typeof input.minRating === 'number' ? clamp(input.minRating, 0, 5) : null,
    limit: clampLimit(input.limit),
    ...(source === 'linkedin'
      ? {
          linkedin: {
            jobTitles,
            industries: strings(input.industries),
            seniority: strings(input.seniority),
            companySizes: strings(input.companySizes),
          },
        }
      : {}),
  };
}

/** Respaldo: algunos modelos devuelven la propuesta como bloque ```json en el texto. */
function extractJsonBlock(text: string): Record<string, unknown> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] ?? (text.trim().startsWith('{') ? text.trim() : null);
  if (!candidate) return null;
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (typeof parsed === 'object' && parsed !== null && 'areas' in parsed) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Texto normal que casualmente traía backticks: no es una propuesta.
  }
  return null;
}

/**
 * Recorta un texto que quedó cortado a mitad de palabra.
 *
 * Pasa cuando el modelo agota el presupuesto de tokens: los que razonan antes de
 * responder se comen una parte, y la última frase llega partida ("...para
 * contactarl"). Mostrar eso parece un error del sistema. Se corta en el último
 * cierre de frase; si no hay ninguno, se avisa con puntos suspensivos.
 */
export function trimToLastSentence(text: string): string {
  const t = text.trimEnd();
  if (!t) return t;
  // Ya cierra bien: no hay nada que recortar.
  if (/[.!?…]$/.test(t)) return t;
  const corte = Math.max(t.lastIndexOf('.'), t.lastIndexOf('?'), t.lastIndexOf('!'));
  if (corte > 0) return t.slice(0, corte + 1).trimEnd();
  // Ni una frase cerrada en todo el texto: se deja como está y se marca que
  // faltaba, en vez de devolver vacío.
  return `${t}…`;
}

/**
 * Deja el mensaje terminado en una frase completa.
 *
 * `hayPropuesta` cambia qué hacer cuando NO quedó ni una frase cerrada: si
 * Turbo además propuso una búsqueda, devolver vacío es mejor que un fragmento,
 * porque más adelante entra el texto de respaldo ("Listo, armé el plan…"), que
 * dice algo. Sin propuesta, un fragmento con puntos suspensivos es lo único que
 * hay y se conserva.
 */
export function cerrarFrase(text: string, hayPropuesta: boolean): string {
  const t = text.trimEnd();
  // Los dos puntos cuentan como cierre: es como Turbo suele presentar el plan
  // ("Te propongo esto:"), y recortarlo ahí sería romper un mensaje sano.
  if (!t || /[.!?…:]$/.test(t)) return t;

  const corte = Math.max(t.lastIndexOf('.'), t.lastIndexOf('?'), t.lastIndexOf('!'));
  if (corte > 0) return t.slice(0, corte + 1).trimEnd();

  return hayPropuesta ? '' : `${t}…`;
}

/** Saca el bloque ```json del texto que se le muestra al usuario. */
function stripJsonBlock(text: string): string {
  return text.replace(/```(?:json)?[\s\S]*?```/gi, '').trim();
}

/**
 * Modo guiado: sin key el chat sigue siendo útil. Detecta rubro y zona por
 * palabras clave y arma una propuesta razonable, diciendo que está sin IA.
 */
export function guidedReply(turns: ChatTurn[]): AgentReply {
  const lastUser = [...turns].reverse().find((t) => t.role === 'user')?.content ?? '';
  const text = lastUser.toLowerCase();

  const pack =
    NICHE_PACKS.find(
      (p) =>
        p.id !== 'generico' &&
        (text.includes(p.id) || p.queries.some((q) => text.includes(q.toLowerCase().split(' ')[0]))),
    ) ?? getNichePack('generico');

  const country: CountryCode =
    (Object.keys(COUNTRIES) as CountryCode[]).find((code) =>
      text.includes(COUNTRIES[code].name.toLowerCase()),
    ) ?? 'AR';

  const areaMatch = /\ben\s+([\p{L}\s,.]{3,60})/u.exec(lastUser);
  const area = areaMatch?.[1]?.trim().replace(/[.,]$/, '') ?? '';

  if (!area || pack.id === 'generico') {
    return {
      message:
        'Estoy en modo guiado: todavía no configuraron mi motor de IA. Igual te ayudo. Contame el rubro y la zona en una frase, por ejemplo: "inmobiliarias en Palermo, Buenos Aires". También podés cargar los filtros a mano en el panel de la derecha.',
      filters: null,
      icpSummary: null,
      fallback: true,
    };
  }

  return {
    message: `Modo guiado: preparé una búsqueda de ${pack.label.toLowerCase()} en ${area}. Revisá los filtros y ajustá lo que haga falta antes de buscar.`,
    filters: {
      ...DEFAULT_FILTERS,
      queries: pack.queries,
      areas: [area],
      country,
      niche: pack.id,
      requireWhatsapp: mobileDetectable(country),
    },
    icpSummary: `${pack.label} en ${area}`,
    fallback: true,
  };
}

interface OpenRouterMessage {
  content?: string | null;
  tool_calls?: { function?: { name?: string; arguments?: string } }[];
}

export interface AgentConfig {
  apiKey: string | null;
  model: string;
  /** URL pública del CRM — OpenRouter la usa para atribución en su ranking. */
  referer?: string;
  /** Fuentes que hoy se pueden ejecutar de verdad. */
  sources: SourceId[];
  /**
   * Fuente ya elegida y aprobada en esta conversación.
   *
   * Cuando está, se manda SOLO esa herramienta en vez de las cuatro. Es ahorro
   * de tokens real en cada turno posterior, y de paso evita que el modelo
   * cambie de fuente a mitad de una charla que ya estaba encaminada.
   */
  pinnedSource?: SourceId | null;
  /** Lo que Turbo puede ver: el presupuesto y cómo salió la última búsqueda. */
  context?: AgentContext;
}

/** Un turno de conversación con el agente. Devuelve texto y, si corresponde, los filtros. */
export async function runAgentTurn(turns: ChatTurn[], config: AgentConfig): Promise<AgentReply> {
  if (!config.apiKey) return guidedReply(turns);

  const offered = config.pinnedSource ? [config.pinnedSource] : config.sources;
  const tools = [...offered.map(toolFor), ASK_TOOL];

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      // Opcionales de OpenRouter: identifican la app en su dashboard.
      // OJO con los caracteres: un header HTTP solo admite Latin-1 (0-255).
      // Acá había una raya larga (—, U+2014) y `fetch` fallaba al armar la
      // petición con "Cannot convert argument to a ByteString", antes de salir
      // a la red. Guion ASCII a propósito: no cambiar por una raya tipográfica.
      ...(config.referer ? { 'HTTP-Referer': config.referer } : {}),
      'X-Title': 'Hunter Leads - Turbo',
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt(offered, config.context ?? {}) },
        ...turns.map((t) => ({ role: t.role, content: t.content })),
      ],
      tools,
      tool_choice: 'auto',
      // Le prohíbe a OpenRouter rutear a un proveedor que no soporte `tools`.
      // Sin esto, `openrouter/auto` podía caer en un modelo que ignora las
      // herramientas y la propuesta nunca llegaba.
      provider: { require_parameters: true },
      // 3000 y no 1500: `openrouter/auto` rutea seguido a modelos que RAZONAN
      // antes de responder, y ese razonamiento se descuenta del mismo
      // presupuesto. Con 1500 el modelo gastaba ~150 tokens pensando, escribía
      // el texto y se quedaba sin lugar para la llamada a la herramienta: la
      // respuesta llegaba cortada a mitad de palabra y sin propuesta. Se
      // detectó con una llamada real; ningún test lo podía ver.
      max_tokens: 3000,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // 401/402 son problemas de configuración del usuario, no fallas transitorias.
    if (res.status === 401 || res.status === 403) {
      throw new Error('OpenRouter rechazó la API key. Revisala en Configuración.');
    }
    if (res.status === 402) {
      throw new Error('La cuenta de OpenRouter no tiene crédito disponible.');
    }
    throw new Error(`OpenRouter respondió ${res.status}. ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: OpenRouterMessage; finish_reason?: string }[];
    error?: { message?: string };
  };
  if (data.error) throw new Error(data.error.message ?? 'Error de OpenRouter.');

  const choice = data.choices?.[0];
  const message = choice?.message;
  /** El modelo se quedó sin presupuesto: lo que haya llegado está incompleto. */
  const truncated = choice?.finish_reason === 'length';
  let text = (message?.content ?? '').trim();
  let proposal: Record<string, unknown> | null = null;
  let source: SourceId = config.pinnedSource ?? 'google_places';

  let options: string[] | null = null;

  // Vía 1: tool calling (lo esperado). El nombre de la herramienta ES la fuente
  // elegida: no hace falta un campo aparte que el modelo pueda contradecir.
  for (const call of message?.tool_calls ?? []) {
    const name = call.function?.name ?? '';
    if (!call.function?.arguments) continue;

    // Turbo está preguntando con opciones para tocar, no proponiendo todavía.
    if (name === ASK_TOOL_NAME) {
      try {
        const args = JSON.parse(call.function.arguments) as {
          mensaje?: string;
          opciones?: unknown;
        };
        if (typeof args.mensaje === 'string' && args.mensaje.trim()) text = args.mensaje.trim();
        const limpias = Array.isArray(args.opciones)
          ? args.opciones
              .filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
              .map((o) => o.trim())
              .slice(0, 4)
          : [];
        if (limpias.length >= 2) options = limpias;
      } catch {
        // Argumentos rotos: se ignora la herramienta y queda el texto suelto.
      }
      continue;
    }

    const called = sourceFromToolName(name);
    if (!called) continue;
    try {
      proposal = JSON.parse(call.function.arguments) as Record<string, unknown>;
      source = called;
    } catch {
      proposal = null;
    }
  }

  // Vía 2: bloque ```json en el texto, para modelos sin tool calling.
  if (!proposal && text) {
    proposal = extractJsonBlock(text);
    if (proposal) {
      text = stripJsonBlock(text);
      if (typeof proposal.source === 'string' && proposal.source in SOURCES) {
        source = proposal.source as SourceId;
      }
    }
  }

  let filters = proposal ? toFilters(source, proposal) : null;
  const icpSummary =
    proposal && typeof proposal.icpSummary === 'string' ? proposal.icpSummary : null;
  const reason = proposal && typeof proposal.reason === 'string' ? proposal.reason : null;
  // La oferta se guarda para que el primer mensaje a cada prospecto no tenga que
  // volver a preguntar "¿qué vendés?" cuando Turbo ya lo sabe.
  const offer = proposal && typeof proposal.offer === 'string' ? proposal.offer : null;
  const signalReasons = pickSignalReasons(proposal?.signalReasons, filters);

  // Una propuesta sin zonas no se puede ejecutar: se pide el dato en vez de
  // mostrar un panel de filtros que fallaría al buscar.
  if (filters && filters.areas.length === 0) {
    filters = null;
    if (!text) text = '¿En qué zona querés buscar?';
  }

  // Respuesta cortada por presupuesto y sin propuesta: mostrar media frase sería
  // peor que no mostrar nada, porque el vendedor se queda esperando algo que no
  // va a llegar. Se le dice qué pasó y qué hacer.
  if (truncated && !filters) {
    return {
      message:
        'Me quedé sin espacio para terminar de pensarlo. Probá de nuevo, o decime el rubro y la zona en una sola frase para que vaya directo a la propuesta.',
      filters: null,
      icpSummary: null,
      reason: null,
      offer: null,
      options: null,
      fallback: false,
    };
  }

  // Media palabra parece un error del sistema, y hay DOS formas de llegar ahí.
  // La conocida es quedarse sin presupuesto (`finish_reason === 'length'`). La
  // otra, mucho más frecuente, es que el modelo escriba un párrafo y lo corte de
  // golpe en cuanto decide llamar a la herramienta: ahí el motivo de corte es
  // `tool_calls`, no `length`, y el recorte por presupuesto no lo agarraba.
  //
  // Medido con `tests/turbo-conversaciones.ts`: en 2 de 4 casos el mensaje
  // terminaba en "Propuesta para que la rev" y "van por Google", justo en el
  // turno en que Turbo presenta el plan.
  if (text) text = cerrarFrase(text, Boolean(filters));

  if (!text) {
    // El modelo propuso los filtros sin texto: no dejar el chat mudo, y sobre
    // todo no decir "contame más" cuando en realidad ya propuso algo.
    text = filters
      ? 'Listo, armé el plan. Revisalo y ajustá lo que quieras antes de aprobar.'
      : 'Contame un poco más sobre el cliente que buscás.';
  }

  return {
    message: text,
    filters,
    icpSummary,
    reason,
    signalReasons,
    offer,
    options,
    fallback: false,
  };
}

/**
 * Se queda con los motivos de las señales que de verdad están activas.
 *
 * El modelo a veces explica una señal que después dejó apagada — se entusiasma
 * describiendo el razonamiento completo. Mostrar "porque vendés páginas web"
 * al lado de una exigencia que no existe es peor que no mostrar nada: el
 * vendedor cree que la búsqueda hace algo que no hace.
 *
 * Por eso se cruza contra los filtros ya normalizados y no contra lo que dijo
 * el modelo.
 */
export function pickSignalReasons(
  raw: unknown,
  filters: ProspectFilters | null,
): Partial<Record<SignalField, string>> | null {
  if (!filters || typeof raw !== 'object' || raw === null) return null;

  const dicho = raw as Record<string, unknown>;
  const out: Partial<Record<SignalField, string>> = {};

  for (const campo of SIGNAL_FIELDS) {
    const activa = campo === 'minRating' ? filters.minRating !== null : filters[campo] === true;
    if (!activa) continue;
    const texto = dicho[campo];
    if (typeof texto === 'string' && texto.trim()) out[campo] = texto.trim();
  }

  return Object.keys(out).length > 0 ? out : null;
}
