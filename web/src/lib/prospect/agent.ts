// Agente que ayuda a definir el avatar (ICP) y traduce esa charla a filtros.
// SOLO servidor.
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

import 'server-only';
import { NICHE_PACKS, getNichePack } from './niches';
import type { AgentReply, ChatTurn, CountryCode, ProspectFilters } from './types';
import { COUNTRIES, mobileDetectable } from './types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Si no se eligió modelo, OpenRouter rutea solo. */
export const DEFAULT_MODEL = 'openrouter/auto';

const DEFAULT_FILTERS: ProspectFilters = {
  queries: [],
  areas: [],
  country: 'AR',
  niche: 'generico',
  requireNoWebsite: true,
  requireInstagram: false,
  requireWhatsapp: true,
  minScore: 35,
  minRating: null,
  limit: 30,
};

function systemPrompt(): string {
  const packs = NICHE_PACKS.filter((p) => p.id !== 'generico')
    .map((p) => `- ${p.id}: ${p.label} (ej. ${p.queries.slice(0, 3).join(', ')})`)
    .join('\n');

  return `Te llamás Turbo y sos el agente de prospección de ST Labs dentro de CRM Lite. Ayudás a un vendedor a definir su avatar de cliente ideal y lo convertís en una búsqueda concreta de negocios reales.

La búsqueda corre contra Google Places, así que los filtros tienen que ser cosas que Places pueda responder: un rubro, una o varias zonas geográficas y un país.

Cómo trabajás:
- Hablás en español rioplatense, breve y concreto. Nada de listas largas ni preámbulos.
- Sos claro, útil y honesto: pedís lo justo, explicás por qué recomendás cada filtro y decís las cosas como son cuando algo no se puede.
- La decisión final es siempre del vendedor. Proponés, no imponés: dejá explícito que puede editar todo antes de buscar.
- No te presentes por tu nombre en cada mensaje ni saludes de más: la interfaz ya muestra quién sos.
- Necesitás dos cosas para poder buscar: QUÉ rubro y DÓNDE. Si el usuario ya las dio, no preguntes más: proponé la búsqueda.
- Si falta una sola de las dos, hacé UNA pregunta corta para conseguirla.
- Cuando tengas rubro y zona, llamá a la herramienta propose_search y en el texto explicá en una o dos frases qué vas a buscar y por qué esos filtros.
- Recomendá activamente: sugerí zonas parecidas, señales que conviene exigir y un umbral de score razonable. El usuario puede editar todo después.

Criterio para recomendar filtros:
- requireNoWebsite=true es el default y el caso más común: un negocio sin web propia es mejor prospecto. Si su "web" es Instagram o un portal del rubro, cuenta como sin web.
- requireWhatsapp=true cuando el vendedor va a contactar por WhatsApp (lo habitual). Ojo: en México no se puede distinguir móvil de fijo por el número, así que ahí esa señal no filtra nada.
- requireInstagram=true solo si al usuario le importa; achica bastante el embudo.
- minScore entre 30 y 50 para una búsqueda amplia; 60+ solo si pide calidad por encima de cantidad.
- Si el rubro coincide con un pack conocido, usá su id. Si no, usá "generico" y escribí vos las queries.

Packs disponibles:
${packs}

Países disponibles: ${Object.entries(COUNTRIES)
    .map(([code, c]) => `${code} (${c.name})`)
    .join(', ')}.

Nunca inventes resultados ni digas que ya buscaste: vos solo definís la búsqueda, la ejecuta el sistema cuando el usuario aprieta el botón.

Si por algún motivo no podés usar la herramienta propose_search, devolvé la propuesta como un bloque \`\`\`json con las mismas claves.`;
}

/** Esquema de la propuesta, en formato de function calling de OpenAI. */
const PROPOSE_SEARCH_FUNCTION = {
  type: 'function' as const,
  function: {
    name: 'propose_search',
    description:
      'Propone una búsqueda concreta de prospectos. Llamala en cuanto tengas rubro y zona; el usuario puede editar todo antes de ejecutarla.',
    parameters: {
      type: 'object',
      properties: {
        icpSummary: {
          type: 'string',
          description: 'El avatar en una línea, ej. "Inmobiliarias chicas de CABA sin web propia".',
        },
        niche: {
          type: 'string',
          enum: NICHE_PACKS.map((p) => p.id),
          description: 'Id del pack de nicho, o "generico" si es a medida.',
        },
        queries: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Términos de búsqueda para Places. Si usás un pack conocido podés dejarlo vacío para tomar los suyos.',
        },
        areas: {
          type: 'array',
          items: { type: 'string' },
          description: 'Zonas a recorrer, ej. ["Palermo, Buenos Aires"].',
        },
        country: { type: 'string', enum: Object.keys(COUNTRIES) },
        requireNoWebsite: { type: 'boolean' },
        requireInstagram: { type: 'boolean' },
        requireWhatsapp: { type: 'boolean' },
        minScore: { type: 'integer' },
        minRating: { type: ['number', 'null'] },
        limit: { type: 'integer' },
      },
      required: ['icpSummary', 'niche', 'areas', 'country'],
    },
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Normaliza lo que propuso el modelo: nunca confiamos en que venga completo o en rango. */
function toFilters(input: Record<string, unknown>): ProspectFilters {
  const niche = typeof input.niche === 'string' ? input.niche : 'generico';
  const pack = getNichePack(niche);
  const rawQueries = Array.isArray(input.queries)
    ? input.queries.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    : [];
  const areas = Array.isArray(input.areas)
    ? input.areas.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    : [];
  const country =
    typeof input.country === 'string' && input.country in COUNTRIES
      ? (input.country as CountryCode)
      : DEFAULT_FILTERS.country;

  return {
    queries: rawQueries.length > 0 ? rawQueries : pack.queries,
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
    limit:
      typeof input.limit === 'number' ? clamp(Math.round(input.limit), 5, 60) : DEFAULT_FILTERS.limit,
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
}

/** Un turno de conversación con el agente. Devuelve texto y, si corresponde, los filtros. */
export async function runAgentTurn(turns: ChatTurn[], config: AgentConfig): Promise<AgentReply> {
  if (!config.apiKey) return guidedReply(turns);

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      // Opcionales de OpenRouter: identifican la app en su dashboard.
      ...(config.referer ? { 'HTTP-Referer': config.referer } : {}),
      'X-Title': 'Turbo — CRM Lite de ST Labs',
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt() },
        ...turns.map((t) => ({ role: t.role, content: t.content })),
      ],
      tools: [PROPOSE_SEARCH_FUNCTION],
      tool_choice: 'auto',
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

  // Vía 1: tool calling (lo esperado).
  const toolCall = message?.tool_calls?.find((c) => c.function?.name === 'propose_search');
  if (toolCall?.function?.arguments) {
    try {
      proposal = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    } catch {
      proposal = null;
    }
  }

  // Vía 2: bloque ```json en el texto, para modelos sin tool calling.
  if (!proposal && text) {
    proposal = extractJsonBlock(text);
    if (proposal) text = stripJsonBlock(text);
  }

  let filters = proposal ? toFilters(proposal) : null;
  const icpSummary =
    proposal && typeof proposal.icpSummary === 'string' ? proposal.icpSummary : null;

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
      ? 'Listo, armé la búsqueda. Revisá los filtros de la derecha y ajustá lo que quieras antes de buscar.'
      : 'Contame un poco más sobre el cliente que buscás.';
  }

  return { message: text, filters, icpSummary, fallback: false };
}
