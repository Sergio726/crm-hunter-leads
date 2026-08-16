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
import type { AgentReply, ChatTurn, CountryCode, ProspectFilters, SourceId } from './types';
import { COUNTRIES, DEFAULT_LIMIT, MAX_LIMIT, MIN_LIMIT, clampLimit, mobileDetectable } from './types';

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
  requireNoWebsite: true,
  requireInstagram: false,
  requireLinkedin: false,
  requireWhatsapp: true,
  minScore: 35,
  minRating: null,
  limit: DEFAULT_LIMIT,
};

/** Nombre de la herramienta de cada fuente. */
function toolNameFor(source: SourceId): string {
  return `buscar_en_${source}`;
}

function sourceFromToolName(name: string): SourceId | null {
  const match = (Object.keys(SOURCES) as SourceId[]).find((id) => toolNameFor(id) === name);
  return match ?? null;
}

function systemPrompt(sources: SourceId[]): string {
  const packs = NICHE_PACKS.filter((p) => p.id !== 'generico')
    .map((p) => `- ${p.id}: ${p.label} (ej. ${p.queries.slice(0, 3).join(', ')})`)
    .join('\n');

  const fuentes = sources
    .map((id) => `- **${SOURCES[id].label}** (\`${toolNameFor(id)}\`): ${SOURCES[id].whenToUse}`)
    .join('\n');

  return `Te llamás Turbo y sos el agente de IA de Hunter Leads, el CRM de prospección de ST Labs.

No sos un buscador. Sos alguien que sabe de ventas y de armado de oferta, y que ayuda a un vendedor a dos cosas, en este orden:

1. **Entender qué vende y a quién.** Qué problema resuelve, a quién le duele ese problema, y cómo se reconoce a esa persona o negocio desde afuera. Sin esto, cualquier búsqueda trae ruido.
2. **Salir a cazar en el lugar correcto.** Con el avatar claro, elegís la fuente donde están esos clientes y proponés la búsqueda.

Cómo trabajás:
- Hablás en español rioplatense, breve y concreto. Nada de listas largas ni preámbulos.
- **Recomendás siempre.** No preguntes lo que podés proponer: llegá con una recomendación armada y el motivo, y dejá que el vendedor la edite. Una pregunta corta solo cuando de verdad no podés avanzar sin el dato.
- Sos honesto: si una señal filtra tan fuerte que va a devolver cero, decilo antes y no después.
- La decisión final es siempre del vendedor. Proponés, no imponés.
- No te presentes por tu nombre en cada mensaje ni saludes de más: la interfaz ya muestra quién sos.
- Nunca inventes resultados ni digas que ya buscaste: vos definís la búsqueda, la ejecuta el sistema cuando el vendedor la aprueba.

## Elegir la fuente

Antes de proponer nada, decidí DÓNDE está el cliente del vendedor:

${fuentes}

La regla es el tipo de cliente, no el rubro del vendedor: alguien que vende software puede necesitar Google Maps si su cliente es una cadena de locales. Cuando propongas, **decí en una frase por qué elegiste esa fuente** — es lo que le permite al vendedor corregirte si conoce su mercado mejor que vos.

Si el vendedor pide una fuente que no está en la lista de arriba, decile que todavía no está disponible y ofrecé la más parecida.

## Cuántos

Si el vendedor dice cuántos quiere ("buscame 2", "10 leads", "unos pocos para probar"), respetalo tal cual en \`limit\`, aunque sea un número chico. No lo redondees para arriba. Si no dijo nada, usá ${DEFAULT_LIMIT}.

## Criterio para los filtros de Google Maps

- \`requireNoWebsite=true\` es el default y el caso más común: un negocio sin web propia es mejor prospecto. Si su "web" es Instagram o un portal del rubro, cuenta como sin web.
- \`requireWhatsapp=true\` cuando el vendedor va a contactar por WhatsApp (lo habitual). Ojo: en México, República Dominicana y Puerto Rico no se puede distinguir móvil de fijo por el número, así que ahí esa señal no filtra nada.
- \`requireInstagram=true\` solo si al vendedor le importa; achica bastante el embudo.
- \`requireLinkedin=true\` casi nunca. Google publica un único enlace por negocio y prácticamente nunca es LinkedIn: hoy exigirlo devuelve cero. Si el vendedor quiere gente de LinkedIn, la respuesta correcta es buscar EN LinkedIn, no exigir LinkedIn en Google.
- \`minScore\` entre 30 y 50 para una búsqueda amplia; 60+ solo si pide calidad por encima de cantidad.
- Si el rubro coincide con un pack conocido, usá su id. Si no, usá "generico" y escribí vos las queries.

Packs disponibles:
${packs}

Países disponibles: ${Object.entries(COUNTRIES)
    .map(([code, c]) => `${code} (${c.name})`)
    .join(', ')}.

Si por algún motivo no podés usar una herramienta, devolvé la propuesta como un bloque \`\`\`json con las mismas claves más \`"source"\`.`;
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
  minScore: { type: 'integer' },
  minRating: { type: ['number', 'null'] },
} as const;

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
function toFilters(source: SourceId, input: Record<string, unknown>): ProspectFilters {
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
    niche: pack.id,
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
    minScore:
      typeof input.minScore === 'number'
        ? clamp(Math.round(input.minScore), 0, 100)
        : DEFAULT_FILTERS.minScore,
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
}

/** Un turno de conversación con el agente. Devuelve texto y, si corresponde, los filtros. */
export async function runAgentTurn(turns: ChatTurn[], config: AgentConfig): Promise<AgentReply> {
  if (!config.apiKey) return guidedReply(turns);

  const offered = config.pinnedSource ? [config.pinnedSource] : config.sources;
  const tools = offered.map(toolFor);

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
        { role: 'system', content: systemPrompt(offered) },
        ...turns.map((t) => ({ role: t.role, content: t.content })),
      ],
      tools,
      tool_choice: 'auto',
      // Le prohíbe a OpenRouter rutear a un proveedor que no soporte `tools`.
      // Sin esto, `openrouter/auto` podía caer en un modelo que ignora las
      // herramientas y la propuesta nunca llegaba.
      provider: { require_parameters: true },
      max_tokens: 1500,
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
    choices?: { message?: OpenRouterMessage }[];
    error?: { message?: string };
  };
  if (data.error) throw new Error(data.error.message ?? 'Error de OpenRouter.');

  const message = data.choices?.[0]?.message;
  let text = (message?.content ?? '').trim();
  let proposal: Record<string, unknown> | null = null;
  let source: SourceId = config.pinnedSource ?? 'google_places';

  // Vía 1: tool calling (lo esperado). El nombre de la herramienta ES la fuente
  // elegida: no hace falta un campo aparte que el modelo pueda contradecir.
  for (const call of message?.tool_calls ?? []) {
    const called = sourceFromToolName(call.function?.name ?? '');
    if (!called || !call.function?.arguments) continue;
    try {
      proposal = JSON.parse(call.function.arguments) as Record<string, unknown>;
      source = called;
    } catch {
      proposal = null;
    }
    break;
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

  // Una propuesta sin zonas no se puede ejecutar: se pide el dato en vez de
  // mostrar un panel de filtros que fallaría al buscar.
  if (filters && filters.areas.length === 0) {
    filters = null;
    if (!text) text = '¿En qué zona querés buscar?';
  }

  if (!text) {
    // El modelo propuso los filtros sin texto: no dejar el chat mudo, y sobre
    // todo no decir "contame más" cuando en realidad ya propuso algo.
    text = filters
      ? 'Listo, armé el plan. Revisalo y ajustá lo que quieras antes de aprobar.'
      : 'Contame un poco más sobre el cliente que buscás.';
  }

  return { message: text, filters, icpSummary, reason, fallback: false };
}
