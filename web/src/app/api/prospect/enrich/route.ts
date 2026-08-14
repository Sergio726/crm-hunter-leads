import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
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
  const profile = await getSessionProfile();
  if (profile?.role !== 'superadmin' && profile?.role !== 'seller') {
    return NextResponse.json({ error: 'no autorizado' }, { status: 403 });
  }

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
    .not('instagram', 'is', null)
    .limit(MAX_PROFILES_PER_RUN);

  if (error) {
    console.error('[prospect/enrich] no se pudieron leer los prospectos', error);
    return NextResponse.json({ error: 'No se pudieron leer los prospectos.' }, { status: 500 });
  }

  const targets = (rows ?? []).filter(
    (r): r is { id: string; instagram: string } => typeof r.instagram === 'string',
  );
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
