// Agente que ayuda a definir el avatar (ICP) y traduce esa charla a filtros.
// SOLO servidor: usa ANTHROPIC_API_KEY, que nunca se expone al browser.
//
// El agente conversa en español, hace pocas preguntas y en cuanto tiene lo
// mínimo (qué rubro y dónde) propone una búsqueda concreta llamando a la
// herramienta `propose_search`. La propuesta es editable: el usuario siempre
// ve y puede cambiar los filtros antes de ejecutar.
//
// Sin ANTHROPIC_API_KEY el módulo NO se cae: degrada a un modo guiado
// determinista que arma los filtros con heurísticas simples.

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { NICHE_PACKS, getNichePack } from './niches';
import type { AgentReply, ChatTurn, CountryCode, ProspectFilters } from './types';
import { COUNTRIES } from './types';

const MODEL = 'claude-opus-5';

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

  return `Sos el asistente de prospección de un CRM. Tu trabajo es ayudar a un vendedor a definir su avatar de cliente ideal y convertirlo en una búsqueda concreta de negocios reales.

La búsqueda corre contra Google Places, así que los filtros tienen que ser cosas que Places pueda responder: un rubro, una o varias zonas geográficas y un país.

Cómo trabajás:
- Hablás en español rioplatense, breve y concreto. Nada de listas largas ni preámbulos.
- Necesitás dos cosas para poder buscar: QUÉ rubro y DÓNDE. Si el usuario ya las dio, no preguntes más: proponé la búsqueda.
- Si falta una sola de las dos, hacé UNA pregunta corta para conseguirla.
- Cuando tengas rubro y zona, llamá a la herramienta propose_search y en el texto explicá en una o dos frases qué vas a buscar y por qué elegiste esos filtros.
- Recomendá activamente: sugerí zonas parecidas, señales que conviene exigir y un umbral de score razonable. El usuario puede editar todo después.

Criterio para recomendar filtros:
- requireNoWebsite=true es el default y el caso más común: un negocio sin web propia es mejor prospecto. Si su "web" es Instagram o un portal del rubro, cuenta como sin web.
- requireWhatsapp=true cuando el vendedor va a contactar por WhatsApp (lo habitual). Si lo activás, se pierden los que solo publican teléfono fijo.
- requireInstagram=true solo si el usuario dice que le importa que tengan Instagram; achica bastante el embudo.
- minScore entre 30 y 50 para una búsqueda amplia; 60+ solo si el usuario pide calidad por encima de cantidad.
- Si el rubro coincide con un pack conocido, usá su id. Si no, usá "generico" y escribí vos las queries.

Packs disponibles:
${packs}

Países disponibles: ${Object.entries(COUNTRIES)
    .map(([code, c]) => `${code} (${c.name})`)
    .join(', ')}.

Nunca inventes resultados ni digas que ya buscaste: vos solo definís la búsqueda, la ejecuta el sistema cuando el usuario aprieta el botón.`;
}

const PROPOSE_SEARCH_TOOL: Anthropic.Tool = {
  name: 'propose_search',
  description:
    'Propone una búsqueda concreta de prospectos. Llamala en cuanto tengas rubro y zona; el usuario puede editar todo antes de ejecutarla.',
  input_schema: {
    type: 'object',
    properties: {
      icpSummary: {
        type: 'string',
        description: 'El avatar en una línea, ej. "Inmobiliarias chicas de CABA sin web propia".',
      },
      niche: {
        type: 'string',
        description: `Id del pack de nicho, o "generico" si es a medida. Opciones: ${NICHE_PACKS.map((p) => p.id).join(', ')}.`,
      },
      queries: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Términos de búsqueda para Places, ej. ["inmobiliaria", "corredor inmobiliario"]. Si usás un pack conocido podés dejarlo vacío para tomar los suyos.',
      },
      areas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Zonas a recorrer, ej. ["Palermo, Buenos Aires", "Recoleta, Buenos Aires"].',
      },
      country: {
        type: 'string',
        enum: Object.keys(COUNTRIES),
        description: 'País de la búsqueda.',
      },
      requireNoWebsite: { type: 'boolean', description: 'Descartar los que ya tienen web propia.' },
      requireInstagram: { type: 'boolean', description: 'Exigir Instagram en la ficha.' },
      requireWhatsapp: { type: 'boolean', description: 'Exigir teléfono celular (proxy de WhatsApp).' },
      minScore: { type: 'integer', description: 'Score mínimo 0–100.' },
      minRating: { type: ['number', 'null'], description: 'Rating mínimo de Google, o null.' },
      limit: { type: 'integer', description: 'Máximo de resultados a devolver (10–60).' },
    },
    required: ['icpSummary', 'niche', 'areas', 'country'],
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
    requireWhatsapp:
      typeof input.requireWhatsapp === 'boolean'
        ? input.requireWhatsapp
        : DEFAULT_FILTERS.requireWhatsapp,
    minScore:
      typeof input.minScore === 'number' ? clamp(Math.round(input.minScore), 0, 100) : DEFAULT_FILTERS.minScore,
    minRating: typeof input.minRating === 'number' ? clamp(input.minRating, 0, 5) : null,
    limit: typeof input.limit === 'number' ? clamp(Math.round(input.limit), 5, 60) : DEFAULT_FILTERS.limit,
  };
}

export function isAgentConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Modo guiado: sin API key el chat sigue siendo útil. Detecta rubro y zona por
 * palabras clave y arma una propuesta razonable, diciendo con todas las letras
 * que está en modo sin IA.
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

  const country: CountryCode = (Object.keys(COUNTRIES) as CountryCode[]).find((code) =>
    text.includes(COUNTRIES[code].name.toLowerCase()),
  ) ?? 'AR';

  // "en Palermo" / "en Pocitos, Montevideo" → zona
  const areaMatch = /\ben\s+([\p{L}\s,.]{3,60})/u.exec(lastUser);
  const area = areaMatch?.[1]?.trim().replace(/[.,]$/, '') ?? '';

  if (!area || pack.id === 'generico') {
    return {
      message:
        'Estoy en modo guiado (sin IA configurada). Contame el rubro y la zona en una frase, por ejemplo: "inmobiliarias en Palermo, Buenos Aires". También podés cargar los filtros a mano en el panel de la derecha.',
      filters: null,
      icpSummary: null,
      fallback: true,
    };
  }

  return {
    message: `Modo guiado: preparé una búsqueda de ${pack.label.toLowerCase()} en ${area}. Revisá los filtros y ajustá lo que haga falta antes de buscar.`,
    filters: { ...DEFAULT_FILTERS, queries: pack.queries, areas: [area], country, niche: pack.id },
    icpSummary: `${pack.label} en ${area}`,
    fallback: true,
  };
}

/** Un turno de conversación con el agente. Devuelve texto y, si corresponde, los filtros. */
export async function runAgentTurn(turns: ChatTurn[]): Promise<AgentReply> {
  if (!isAgentConfigured()) return guidedReply(turns);

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    // Effort bajo: es una charla corta de configuración, no un problema difícil.
    // Se deja el thinking en su default (adaptivo) a propósito: desactivarlo en
    // Opus 5 puede hacer que una llamada a herramienta salga como texto plano.
    output_config: { effort: 'low' },
    system: systemPrompt(),
    tools: [PROPOSE_SEARCH_TOOL],
    messages: turns.map((t) => ({ role: t.role, content: t.content })),
  });

  let message = '';
  let filters: ProspectFilters | null = null;
  let icpSummary: string | null = null;

  for (const block of response.content) {
    if (block.type === 'text') {
      message += block.text;
    } else if (block.type === 'tool_use' && block.name === 'propose_search') {
      const input = block.input as Record<string, unknown>;
      filters = toFilters(input);
      icpSummary = typeof input.icpSummary === 'string' ? input.icpSummary : null;
    }
  }

  // Una propuesta sin zonas no se puede ejecutar: se pide el dato en vez de
  // mostrar un panel de filtros que fallaría al buscar.
  if (filters && filters.areas.length === 0) {
    filters = null;
    if (!message) message = '¿En qué zona querés buscar?';
  }

  return {
    message: message.trim() || 'Contame un poco más sobre el cliente que buscás.',
    filters,
    icpSummary,
    fallback: false,
  };
}
