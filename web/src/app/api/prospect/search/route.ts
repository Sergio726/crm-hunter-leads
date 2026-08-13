import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { getNichePack } from '@/lib/prospect/niches';
import { runProspectSearch } from '@/lib/prospect/places';
import { COUNTRIES, type CountryCode, type ProspectFilters } from '@/lib/prospect/types';

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

  return {
    queries: queries.length > 0 ? queries : pack.queries,
    areas,
    country,
    niche: pack.id,
    requireNoWebsite: input.requireNoWebsite !== false,
    requireInstagram: input.requireInstagram === true,
    requireWhatsapp: input.requireWhatsapp === true,
    minScore: typeof input.minScore === 'number' ? clamp(Math.round(input.minScore), 0, 100) : 0,
    minRating: typeof input.minRating === 'number' ? clamp(input.minRating, 0, 5) : null,
    limit: typeof input.limit === 'number' ? clamp(Math.round(input.limit), 5, 60) : 30,
  };
}

export async function POST(request: Request) {
  const profile = await getSessionProfile();
  if (profile?.role !== 'superadmin' && profile?.role !== 'seller') {
    return NextResponse.json({ error: 'no autorizado' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const filters = parseFilters(body?.filters);
  if (!filters) {
    return NextResponse.json(
      { error: 'Faltan datos de la búsqueda: hace falta al menos una zona y un país válido.' },
      { status: 400 },
    );
  }

  try {
    const run = await runProspectSearch(filters);
    return NextResponse.json(run);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo completar la búsqueda.';
    console.error('[prospect/search]', error);
    // Falta de configuración → 400 (lo arregla el usuario); el resto → 502.
    const isConfig = message.includes('GOOGLE_PLACES_API_KEY') || message.includes('necesita');
    return NextResponse.json({ error: message }, { status: isConfig ? 400 : 502 });
  }
}
