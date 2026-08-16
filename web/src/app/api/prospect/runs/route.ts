import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';
import { ApifyError, MAX_COST_PER_RUN_USD } from '@/lib/prospect/apify';
import { startRun } from '@/lib/prospect/apify-runs';
import { IG_ACTOR, IG_FIELDS, MAX_PROFILES_PER_ASYNC_RUN } from '@/lib/prospect/enrich-jobs';
import {
  LINKEDIN_ACTOR,
  LINKEDIN_FIELDS,
  PROFILES_PER_PAGE,
  buildLinkedinInput,
  estimatePages,
} from '@/lib/prospect/linkedin';
import { getSecret } from '@/lib/prospect/secrets';
import { estimate, type ProspectFilters } from '@/lib/prospect/types';

/**
 * Arranca un trabajo largo y devuelve enseguida.
 *
 * No espera el resultado a propósito: el plan Hobby de Vercel corta a los 60 s.
 * Acá se le pide a Apify que arranque, se guarda el id del run y la pantalla va
 * preguntando por `/api/prospect/runs/[id]`.
 *
 * Es lo que permite enriquecer 200 perfiles en vez de 25, y lo que evita pagar
 * dos veces cuando la corrida se pasa de tiempo.
 */
export const maxDuration = 60;

/**
 * Arranca una búsqueda de personas en LinkedIn.
 *
 * Google Maps sigue corriendo por `/api/prospect/search`, que termina dentro de
 * la misma petición. LinkedIn no puede: una búsqueda de varias páginas tarda
 * minutos.
 */
async function startSearch(body: Record<string, unknown>, userId: string) {
  const filters = body.filters as ProspectFilters | undefined;
  if (!filters || filters.source !== 'linkedin') {
    return NextResponse.json(
      { error: 'Esta ruta solo ejecuta búsquedas de LinkedIn.' },
      { status: 400 },
    );
  }
  if (!Array.isArray(filters.areas) || filters.areas.length === 0) {
    return NextResponse.json(
      { error: 'La búsqueda necesita al menos una ubicación.' },
      { status: 400 },
    );
  }

  const apiToken = await getSecret('apify_api_token');
  if (!apiToken) {
    return NextResponse.json(
      {
        error:
          'Falta el token de Apify. Cargalo en Configuración → Prospección (o como APIFY_API_TOKEN en el entorno).',
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  try {
    const started = await startRun(LINKEDIN_ACTOR, buildLinkedinInput(filters), apiToken, {
      maxItems: filters.limit,
      maxCostUsd: MAX_COST_PER_RUN_USD,
      timeoutSecs: 900,
    });

    const { data: run, error } = await supabase
      .from('prospect_runs')
      .insert({
        created_by: userId,
        source: 'linkedin',
        job: 'search',
        status: 'running',
        external_run_id: started.runId,
        // Los filtros viajan con el trabajo: la cosecha ocurre en otra petición
        // y necesita saber contra qué avatar puntuar.
        params: { datasetId: started.datasetId, filters, fields: LINKEDIN_FIELDS },
        items_total: filters.limit,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[prospect/runs] no se pudo registrar la búsqueda', error);
      return NextResponse.json(
        { error: 'La búsqueda arrancó en Apify pero no se pudo registrar.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      runId: run.id,
      itemsTotal: filters.limit,
      estimated: estimate('linkedin', estimatePages(filters) * PROFILES_PER_PAGE),
    });
  } catch (err) {
    console.error('[prospect/runs] search', err);
    if (err instanceof ApifyError) {
      const status = err.reason === 'token' || err.reason === 'credit' ? 400 : 502;
      return NextResponse.json({ error: err.message, reason: err.reason }, { status });
    }
    return NextResponse.json({ error: 'No se pudo arrancar la búsqueda.' }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const gate = await apiSectionGuard('prospeccion');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => ({}));

  // Dos trabajos distintos comparten esta ruta porque comparten el mecanismo:
  // arrancar en Apify, guardar el id, cosechar después.
  if (body?.job === 'search') {
    return startSearch(body, gate.profile.id);
  }

  const ids: string[] = Array.isArray(body?.prospectIds)
    ? body.prospectIds.filter((id: unknown): id is string => typeof id === 'string')
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'No se indicaron prospectos.' }, { status: 400 });
  }

  const apiToken = await getSecret('apify_api_token');
  if (!apiToken) {
    return NextResponse.json(
      {
        error:
          'Falta el token de Apify. Cargalo en Configuración → Prospección (o como APIFY_API_TOKEN en el entorno).',
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from('prospects')
    .select('id, instagram')
    .in('id', ids)
    .not('instagram', 'is', null);

  if (error) {
    console.error('[prospect/runs] no se pudieron leer los prospectos', error);
    return NextResponse.json({ error: 'No se pudieron leer los prospectos.' }, { status: 500 });
  }

  const targets = (rows ?? [])
    .filter((r): r is { id: string; instagram: string } => typeof r.instagram === 'string')
    .slice(0, MAX_PROFILES_PER_ASYNC_RUN);
  const overflow = (rows ?? []).length - targets.length;

  if (targets.length === 0) {
    return NextResponse.json(
      { error: 'Ninguno de los prospectos seleccionados tiene Instagram para consultar.' },
      { status: 400 },
    );
  }

  // El mapa handle → prospecto se guarda con el run: cuando el resultado llegue
  // (en otra petición, minutos después) no hay forma de reconstruirlo.
  const byHandle: Record<string, string> = {};
  for (const t of targets) byHandle[t.instagram.trim().toLowerCase()] = t.id;
  const handles = Object.keys(byHandle);

  try {
    const started = await startRun(
      IG_ACTOR,
      { usernames: handles },
      apiToken,
      { maxItems: handles.length, maxCostUsd: MAX_COST_PER_RUN_USD, timeoutSecs: 900 },
    );

    const { data: run, error: insertError } = await supabase
      .from('prospect_runs')
      .insert({
        created_by: gate.profile.id,
        source: 'instagram',
        job: 'enrich',
        status: 'running',
        external_run_id: started.runId,
        params: { datasetId: started.datasetId, byHandle, fields: IG_FIELDS },
        items_total: handles.length,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[prospect/runs] no se pudo registrar el trabajo', insertError);
      return NextResponse.json(
        { error: 'El trabajo arrancó en Apify pero no se pudo registrar. Revisá en un momento.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ runId: run.id, itemsTotal: handles.length, overflow });
  } catch (err) {
    console.error('[prospect/runs]', err);
    if (err instanceof ApifyError) {
      const status = err.reason === 'token' || err.reason === 'credit' ? 400 : 502;
      return NextResponse.json({ error: err.message, reason: err.reason }, { status });
    }
    return NextResponse.json({ error: 'No se pudo arrancar el trabajo.' }, { status: 502 });
  }
}
