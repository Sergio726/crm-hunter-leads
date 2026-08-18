import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';
import { getNichePack } from '@/lib/prospect/niches';
import { getSecret } from '@/lib/prospect/secrets';
import { SOURCES, estimateRun, getRunner } from '@/lib/prospect/sources';
import {
  COUNTRIES,
  clampLimit,
  type CountryCode,
  type ProspectFilters,
  type SourceId,
} from '@/lib/prospect/types';

/**
 * Ejecuta la búsqueda y devuelve los resultados SIN persistir nada.
 * El guardado es un paso aparte y explícito: el usuario elige cuáles se van a
 * `prospects` desde la pantalla.
 */
export const maxDuration = 60;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseFilters(raw: unknown): ProspectFilters | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;

  const country =
    typeof input.country === 'string' && input.country in COUNTRIES
      ? (input.country as CountryCode)
      : null;
  if (!country) return null;

  const areas = Array.isArray(input.areas)
    ? input.areas
        .filter((a): a is string => typeof a === 'string')
        .map((a) => a.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  if (areas.length === 0) return null;

  const pack = getNichePack(typeof input.niche === 'string' ? input.niche : 'generico');
  const queries = Array.isArray(input.queries)
    ? input.queries
        .filter((q): q is string => typeof q === 'string')
        .map((q) => q.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const source: SourceId =
    typeof input.source === 'string' && input.source in SOURCES
      ? (input.source as SourceId)
      : 'google_places';

  return {
    source,
    queries: queries.length > 0 ? queries : pack.queries,
    areas,
    country,
    niche: pack.id,
    // `=== true` y no `!== false`: si no viene, queda APAGADO. Con el default en
    // true, una búsqueda que no mandara el campo borraba en silencio todos los
    // negocios con web — la misma regla que ya se corrigió en el agente.
    requireNoWebsite: input.requireNoWebsite === true,
    requireInstagram: input.requireInstagram === true,
    requireLinkedin: input.requireLinkedin === true,
    requireWhatsapp: input.requireWhatsapp === true,
    minRating: typeof input.minRating === 'number' ? clamp(input.minRating, 0, 5) : null,
    limit: clampLimit(input.limit),
  };
}

export async function POST(request: Request) {
  const gate = await apiSectionGuard('prospeccion');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => ({}));
  const filters = parseFilters(body?.filters);
  if (!filters) {
    return NextResponse.json(
      { error: 'Faltan datos de la búsqueda: hace falta al menos una zona y un país válido.' },
      { status: 400 },
    );
  }

  // La fuente decide qué credencial hace falta y cómo se ejecuta: la ruta ya no
  // sabe que existe Google Places.
  const runner = getRunner(filters.source);
  if (!runner) {
    return NextResponse.json(
      {
        error: `La fuente "${SOURCES[filters.source].label}" todavía no está disponible para buscar.`,
      },
      { status: 400 },
    );
  }

  if (runner.mode === 'async' || !runner.run) {
    // Se responde con una instrucción y no con un error a secas: es una fuente
    // válida, solo que tarda minutos y va por otra puerta.
    return NextResponse.json(
      {
        error: `Las búsquedas en ${SOURCES[filters.source].label} tardan varios minutos y se ejecutan en segundo plano.`,
        useAsyncRuns: true,
      },
      { status: 409 },
    );
  }

  const secret = await getSecret(runner.secretKey);
  if (!secret) {
    return NextResponse.json({ error: runner.missingSecretMessage }, { status: 400 });
  }

  try {
    const run = await runner.run(filters, secret);
    return NextResponse.json({
      ...run,
      source: filters.source,
      // Lo que se gastó de verdad, para poder contrastarlo con lo prometido.
      estimated: estimateRun(filters.source, filters),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo completar la búsqueda.';
    console.error('[prospect/search]', error);
    // Falta de datos en la búsqueda → 400 (lo arregla el usuario); el resto → 502.
    const isUserFixable = message.includes('necesita');
    return NextResponse.json({ error: message }, { status: isUserFixable ? 400 : 502 });
  }
}
