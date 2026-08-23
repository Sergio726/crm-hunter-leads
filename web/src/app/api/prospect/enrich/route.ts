import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';
import { ApifyError, MAX_PROFILES_PER_RUN, enrichInstagramProfiles } from '@/lib/prospect/apify';
import { evaluarPresupuesto, readBudget } from '@/lib/prospect/budget';
import { estimate } from '@/lib/prospect/sources/catalog';
import { getSecret } from '@/lib/prospect/secrets';

/**
 * Enriquece prospectos ya guardados con datos reales de su Instagram.
 *
 * Es un paso posterior al guardado a propósito: cada scrape se paga, así que
 * solo se corre sobre los prospectos que el usuario decidió conservar.
 */
// Declaraba 300 s, que es MÁS de lo que permite el plan Hobby de Vercel (60 s):
// la ruta se cortaba antes de terminar y el usuario no se enteraba. El techo
// real lo levanta la Fase 3 (ejecución asíncrona), no un número más grande acá.
export const maxDuration = 60;

export async function POST(request: Request) {
  const gate = await apiSectionGuard('prospeccion');
  if (!gate.ok) return gate.response;

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
    // `website` se lee para no pisarlo: si el prospecto ya tenía sitio, el de la
    // bio de Instagram no lo reemplaza.
    .select('id, instagram, website')
    .in('id', ids)
    .not('instagram', 'is', null);

  if (error) {
    console.error('[prospect/enrich] no se pudieron leer los prospectos', error);
    return NextResponse.json({ error: 'No se pudieron leer los prospectos.' }, { status: 500 });
  }

  const candidates = (rows ?? []).filter(
    (r): r is { id: string; instagram: string; website: string | null } =>
      typeof r.instagram === 'string',
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

  // Mismo freno que la búsqueda y que la lectura de sitios: los tres gastan del
  // mismo saldo de Apify, y hasta acá el enriquecimiento se colaba sin pasar
  // por la caja.
  const costoEstimado = estimate('instagram', targets.length).costUsd;
  const presupuesto = await readBudget(apiToken, supabase).catch(() => null);
  const veredicto = presupuesto
    ? evaluarPresupuesto(presupuesto, 'instagram', costoEstimado, 0, 'esta consulta')
    : null;
  if (veredicto?.nivel === 'agotado' && gate.profile.role !== 'superadmin') {
    return NextResponse.json({ error: veredicto.mensaje, budgetExhausted: true }, { status: 402 });
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
            // Espejo genérico de la señal social: permite ordenar y filtrar una
            // lista que mezcla Instagram con TikTok sin preguntar de qué red vino.
            audience_size: found.followers,
            audience_activity: found.activity,
            // El sitio de la bio es un dato que Google no tiene: si el prospecto
            // no traía web, esto la completa y habilita buscarle el email.
            ...(found.externalUrl && !target.website ? { website: found.externalUrl } : {}),
            // Cuatro campos que venían en el mismo resultado ya facturado y se
            // descartaban. `followsCount` importa más de lo que parece: 5.000
            // seguidores con 4.900 seguidos es una cuenta comprada.
            source_data: {
              ig_verified: found.verified,
              ig_category: found.category,
              ig_follows: found.follows,
              ig_external_url: found.externalUrl,
            },
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
      /** Aviso de saldo bajo. No frena: solo se muestra. */
      budgetWarning: veredicto && veredicto.nivel !== 'ok' ? veredicto.mensaje : null,
    });
  } catch (err) {
    console.error('[prospect/enrich]', err);
    if (err instanceof ApifyError) {
      // Token y crédito los arregla el usuario (400); un timeout o una caída de
      // Apify no (502). Antes se decidía buscando la palabra "token" en el
      // mensaje, así que quedarse sin crédito se reportaba como culpa nuestra.
      const status = err.reason === 'token' || err.reason === 'credit' ? 400 : 502;
      return NextResponse.json({ error: err.message, reason: err.reason }, { status });
    }
    const message = err instanceof Error ? err.message : 'No se pudo enriquecer.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
