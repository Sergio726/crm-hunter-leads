import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';
import { ApifyError } from '@/lib/prospect/apify';
import { fetchItems, getRun, isFinished, isSuccess } from '@/lib/prospect/apify-runs';
import { mapIgItems, patchForProfile, type RawIgItem } from '@/lib/prospect/enrich-jobs';
import { mapLinkedinProfiles, type RawLinkedinProfile } from '@/lib/prospect/linkedin';
import { getSecret } from '@/lib/prospect/secrets';
import type { ProspectFilters } from '@/lib/prospect/types';

/**
 * Estado de un trabajo, y cosecha del resultado cuando ya terminó.
 *
 * La pantalla llama a esto cada pocos segundos. Mientras Apify sigue trabajando
 * devuelve el progreso; cuando termina, trae los datos, los aplica a los
 * prospectos y cierra el trabajo. Aplicar acá y no en la ruta que arranca es lo
 * que permite que la corrida dure minutos sin que ninguna petición pase de 60 s.
 */
export const maxDuration = 60;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await apiSectionGuard('prospeccion');
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const supabase = await createClient();

  // El RLS de `prospect_runs` ya recorta a los del usuario (o a todos, si es
  // superadmin): no hace falta filtrar por created_by acá.
  const { data: run, error } = await supabase
    .from('prospect_runs')
    .select(
      'id, job, status, external_run_id, params, items_total, items_done, result, error, cost_usd',
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !run) {
    return NextResponse.json({ error: 'No se encontró ese trabajo.' }, { status: 404 });
  }

  // Ya cerrado: se devuelve lo guardado sin volver a molestar a Apify.
  if (run.status !== 'running') {
    return NextResponse.json({
      status: run.status,
      itemsTotal: run.items_total,
      itemsDone: run.items_done,
      result: run.result,
      error: run.error,
      costUsd: run.cost_usd,
    });
  }

  const apiToken = await getSecret('apify_api_token');
  if (!apiToken) {
    return NextResponse.json({ error: 'Falta el token de Apify.' }, { status: 400 });
  }

  const params = (run.params ?? {}) as {
    datasetId?: string;
    byHandle?: Record<string, string>;
    filters?: ProspectFilters;
    fields?: string;
  };

  try {
    const snapshot = await getRun(run.external_run_id as string, apiToken);

    if (!isFinished(snapshot.status)) {
      // Todavía trabajando: se informa el avance real que reporta Apify.
      await supabase
        .from('prospect_runs')
        .update({ items_done: snapshot.itemCount ?? 0 })
        .eq('id', id);
      return NextResponse.json({
        status: 'running',
        itemsTotal: run.items_total,
        itemsDone: snapshot.itemCount ?? 0,
      });
    }

    if (!isSuccess(snapshot.status)) {
      const message = `El trabajo terminó como ${snapshot.status}. No se aplicó ningún dato.`;
      await supabase
        .from('prospect_runs')
        .update({
          status: 'error',
          error: message,
          finished_at: new Date().toISOString(),
          cost_usd: snapshot.costUsd,
        })
        .eq('id', id);
      return NextResponse.json({ status: 'error', error: message }, { status: 200 });
    }

    // ── Búsqueda de LinkedIn ────────────────────────────────────────────────
    // No toca `prospects`: los resultados de una búsqueda NO se persisten hasta
    // que el usuario elige cuáles guardar, igual que en Google Maps (D14).
    if (run.job === 'search') {
      const filters = params.filters as ProspectFilters;
      const raw = await fetchItems<RawLinkedinProfile>(
        params.datasetId ?? (snapshot.datasetId as string),
        apiToken,
        params.fields,
      );
      const results = mapLinkedinProfiles(raw, filters);
      const payload = {
        results,
        totalMatched: raw.length,
        requestsUsed: Math.max(1, Math.ceil(raw.length / 25)),
        discarded: {
          withWebsite: 0,
          noInstagram: 0,
          noLinkedin: 0,
          noWhatsapp: 0,
          lowRating: 0,
          lowScore: Math.max(0, raw.length - results.length),
          excludedName: 0,
        },
        truncated: false,
      };

      await supabase
        .from('prospect_runs')
        .update({
          status: 'done',
          items_done: results.length,
          result: payload,
          cost_usd: snapshot.costUsd,
          finished_at: new Date().toISOString(),
        })
        .eq('id', id);

      return NextResponse.json({
        status: 'done',
        itemsTotal: run.items_total,
        itemsDone: results.length,
        result: payload,
        costUsd: snapshot.costUsd,
      });
    }

    // Terminó bien: se cosechan los datos y se aplican.
    const byHandle = params.byHandle ?? {};
    const handles = Object.keys(byHandle);
    const items = await fetchItems<RawIgItem>(
      params.datasetId ?? (snapshot.datasetId as string),
      apiToken,
      params.fields,
    );
    const profiles = mapIgItems(handles, items);
    const enrichedAt = new Date().toISOString();

    // Se leen los sitios actuales para no pisarlos con el de la bio.
    const prospectIds = handles.map((h) => byHandle[h]).filter(Boolean);
    const { data: current } = await supabase
      .from('prospects')
      .select('id, website')
      .in('id', prospectIds);
    const websiteById = new Map((current ?? []).map((r) => [r.id as string, r.website as string | null]));

    let applied = 0;
    for (const profile of profiles) {
      const prospectId = byHandle[profile.handle];
      if (!prospectId) continue;
      const { error: updateError } = await supabase
        .from('prospects')
        .update(patchForProfile(profile, websiteById.get(prospectId) ?? null, enrichedAt))
        .eq('id', prospectId);
      if (updateError) {
        console.error('[prospect/runs/:id] update falló', prospectId, updateError.message);
        continue;
      }
      applied += 1;
    }

    const summary = {
      applied,
      activos: profiles.filter((p) => p.activity === 'activo').length,
      tibios: profiles.filter((p) => p.activity === 'tibio').length,
      dormidos: profiles.filter((p) => p.activity === 'dormido').length,
      noEncontrados: profiles.filter((p) => p.status === 'not_found').length,
      privados: profiles.filter((p) => p.status === 'private').length,
    };

    await supabase
      .from('prospect_runs')
      .update({
        status: 'done',
        items_done: applied,
        result: summary,
        cost_usd: snapshot.costUsd,
        finished_at: enrichedAt,
      })
      .eq('id', id);

    return NextResponse.json({
      status: 'done',
      itemsTotal: run.items_total,
      itemsDone: applied,
      result: summary,
      costUsd: snapshot.costUsd,
    });
  } catch (err) {
    console.error('[prospect/runs/:id]', err);
    if (err instanceof ApifyError) {
      // No se marca el trabajo como fallado: puede ser un problema pasajero de
      // red y el run sigue vivo del lado de Apify. Marcarlo perdería el
      // resultado que ya se está pagando.
      return NextResponse.json({ status: 'running', warning: err.message }, { status: 200 });
    }
    return NextResponse.json({ error: 'No se pudo consultar el trabajo.' }, { status: 502 });
  }
}
