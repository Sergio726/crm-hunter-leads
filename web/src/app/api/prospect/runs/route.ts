import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';
import { ApifyError, MAX_COST_PER_RUN_USD } from '@/lib/prospect/apify';
import { evaluarPresupuesto, readBudget } from '@/lib/prospect/budget';
import { startRun } from '@/lib/prospect/apify-runs';
import { IG_ACTOR, IG_FIELDS, MAX_PROFILES_PER_ASYNC_RUN } from '@/lib/prospect/enrich-jobs';
import {
  IG_SEARCH_ACTOR,
  IG_SEARCH_FIELDS,
  buildIgSearchInput,
  estimateIgUnits,
} from '@/lib/prospect/instagram-search';
import {
  LINKEDIN_ACTOR,
  LINKEDIN_FIELDS,
  PROFILES_PER_PAGE,
  buildLinkedinInput,
  estimatePages,
} from '@/lib/prospect/linkedin';
import { logRequestAfter } from '@/lib/prospect/request-log';
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
 * Las fuentes que se buscan en segundo plano, y cómo.
 *
 * Google Maps no está acá porque termina dentro de la misma petición. Tener la
 * tabla en un solo lugar es lo que evita que arrancar y cosechar se
 * desincronicen: son dos peticiones distintas separadas por minutos.
 */
const ASYNC_SEARCHES = {
  linkedin: {
    actor: LINKEDIN_ACTOR,
    fields: LINKEDIN_FIELDS,
    buildInput: buildLinkedinInput,
    units: (f: ProspectFilters) => estimatePages(f) * PROFILES_PER_PAGE,
  },
  instagram: {
    actor: IG_SEARCH_ACTOR,
    fields: IG_SEARCH_FIELDS,
    buildInput: buildIgSearchInput,
    units: estimateIgUnits,
  },
} as const;

/**
 * Arranca una búsqueda que corre en segundo plano.
 *
 * Google Maps sigue corriendo por `/api/prospect/search`, que termina dentro de
 * la misma petición. LinkedIn no puede: una búsqueda de varias páginas tarda
 * minutos.
 */
async function startSearch(body: Record<string, unknown>, userId: string, esSuperadmin: boolean) {
  const filters = body.filters as ProspectFilters | undefined;
  const plan = filters ? ASYNC_SEARCHES[filters.source as 'linkedin' | 'instagram'] : undefined;

  if (!filters || !plan) {
    return NextResponse.json(
      { error: 'Esta ruta solo ejecuta las búsquedas que corren en segundo plano.' },
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

  // Mismo freno que en `/api/prospect/search`, y hace más falta acá: estas
  // corridas son las que gastan el saldo de Apify. Al superadmin se lo deja
  // pasar, porque es quien carga la plata.
  const presupuesto = await readBudget(apiToken, supabase).catch(() => null);
  const veredicto = presupuesto
    ? evaluarPresupuesto(
        presupuesto,
        filters.source,
        // Mismo cálculo que se le promete al vendedor unas líneas más abajo, en
        // la respuesta: se frena por el número que se le mostró, no por otro.
        estimate(filters.source, plan.units(filters)).costUsd,
      )
    : null;
  if (veredicto?.nivel === 'agotado' && !esSuperadmin) {
    return NextResponse.json({ error: veredicto.mensaje, budgetExhausted: true }, { status: 402 });
  }

  // Se declara afuera para que el catch pueda registrar lo que se le mandó al
  // proveedor: sin eso, una búsqueda que no arranca queda sin el único dato que
  // sirve para diagnosticarla.
  let input: Record<string, unknown> | null = null;

  try {
    input = plan.buildInput(filters);
    const started = await startRun(plan.actor, input, apiToken, {
      maxItems: plan.units(filters),
      maxCostUsd: MAX_COST_PER_RUN_USD,
      timeoutSecs: 900,
    });

    const { data: run, error } = await supabase
      .from('prospect_runs')
      .insert({
        created_by: userId,
        source: filters.source,
        job: 'search',
        status: 'running',
        external_run_id: started.runId,
        // Los filtros viajan con el trabajo: la cosecha ocurre en otra petición
        // y necesita saber contra qué avatar puntuar. El `input` viaja para
        // poder reintentar más ancho si vuelve vacío, sin rearmarlo de memoria.
        params: { datasetId: started.datasetId, filters, fields: plan.fields, input },
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
      estimated: estimate(filters.source, plan.units(filters)),
    });
  } catch (err) {
    console.error('[prospect/runs] search', err);
    const message = err instanceof Error ? err.message : 'No se pudo arrancar la búsqueda.';

    // Una búsqueda que ni siquiera arranca —token vencido, sin crédito, Apify
    // caída— no dejaba NADA: no hay `prospect_runs` porque la fila se inserta
    // después de que el run arranca, y hasta acá tampoco había log. Desde el
    // panel se veía un cartel rojo y ningún rastro de que se hubiera intentado.
    logRequestAfter(supabase, {
      userId,
      source: filters.source,
      job: 'search',
      filters,
      providerInput: input,
      outcome: 'error',
      error: message,
    });

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
    return startSearch(body, gate.profile.id, gate.profile.role === 'superadmin');
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
