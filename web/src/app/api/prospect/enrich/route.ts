import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';
import { MAX_PROFILES_PER_RUN, enrichInstagramProfiles } from '@/lib/prospect/apify';
import { getSecret } from '@/lib/prospect/secrets';

/**
 * Enriquece prospectos ya guardados con datos reales de su Instagram.
 *
 * Es un paso posterior al guardado a propósito: cada scrape se paga, así que
 * solo se corre sobre los prospectos que el usuario decidió conservar.
 */
// Un run de Apify sobre varios perfiles puede tardar bastante.
export const maxDuration = 300;

export async function POST(request: Request) {
  const gate = await apiSectionGuard('prospeccion');
  if (!gate.ok) return gate.response;
  const profile = gate.profile;

  const body = await request.json().catch(() => ({}));
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

  // El RLS de `prospects` ya recorta a los del usuario (o todos, si es
  // superadmin): no hace falta filtrar por created_by acá.
  const { data: rows, error } = await supabase
    .from('prospects')
    .select('id, instagram')
    .in('id', ids)
    .not('instagram', 'is', null);

  if (error) {
    console.error('[prospect/enrich] no se pudieron leer los prospectos', error);
    return NextResponse.json({ error: 'No se pudieron leer los prospectos.' }, { status: 500 });
  }

  const candidates = (rows ?? []).filter(
    (r): r is { id: string; instagram: string } => typeof r.instagram === 'string',
  );
  // El tope por corrida se aplicaba con un .limit() en la consulta, así que
  // seleccionar 50 enriquecía 25 y el resto desaparecía sin dejar rastro. Ahora
  // el recorte es explícito y se informa: un tope silencioso se lee como
  // "ya está todo hecho".
  const targets = candidates.slice(0, MAX_PROFILES_PER_RUN);
  const overflow = candidates.length - targets.length;
  if (targets.length === 0) {
    return NextResponse.json({
      enriched: 0,
      skipped: ids.length,
      profiles: [],
      message: 'Ninguno de los prospectos seleccionados tiene Instagram para consultar.',
    });
  }

  try {
    const profiles = await enrichInstagramProfiles(
      targets.map((t) => t.instagram),
      apiToken,
    );
    const byHandle = new Map(profiles.map((p) => [p.handle, p]));
    const enrichedAt = new Date().toISOString();

    // Un update por fila: los valores difieren entre prospectos y el lote está
    // acotado a MAX_PROFILES_PER_RUN, así que el costo es despreciable.
    const updates = await Promise.all(
      targets.map(async (target) => {
        const found = byHandle.get(target.instagram.trim().toLowerCase());
        if (!found) return false;
        const { error: updateError } = await supabase
          .from('prospects')
          .update({
            ig_followers: found.followers,
            ig_posts_count: found.postsCount,
            ig_last_post_at: found.lastPostAt,
            ig_bio: found.bio,
            ig_is_business: found.isBusiness,
            ig_activity: found.activity,
            enrichment_status: found.status,
            enriched_at: enrichedAt,
          })
          .eq('id', target.id);
        if (updateError) {
          console.error('[prospect/enrich] update falló', target.id, updateError.message);
          return false;
        }
        return true;
      }),
    );

    return NextResponse.json({
      enriched: updates.filter(Boolean).length,
      skipped: ids.length - targets.length,
      /** Tenían Instagram pero quedaron fuera por el tope de la corrida. */
      overflow,
      maxPerRun: MAX_PROFILES_PER_RUN,
      profiles: profiles.map((p) => ({
        handle: p.handle,
        status: p.status,
        followers: p.followers,
        activity: p.activity,
        lastPostAt: p.lastPostAt,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo enriquecer.';
    console.error('[prospect/enrich]', err);
    // Token inválido → 400 (lo arregla el usuario); el resto → 502.
    const isConfig = message.includes('token');
    return NextResponse.json({ error: message }, { status: isConfig ? 400 : 502 });
  }
}
