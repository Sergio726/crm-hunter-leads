import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';
import { ApifyError } from '@/lib/prospect/apify';
import { evaluarPresupuesto, readBudget } from '@/lib/prospect/budget';
import {
  MAX_PERFILES_POR_CORRIDA,
  costoDeTraerPosts,
  postEsFresco,
  traerUltimosPosts,
} from '@/lib/prospect/linkedin-posts';
import { getSecret } from '@/lib/prospect/secrets';

/**
 * Trae la última publicación de los prospectos que tienen LinkedIn.
 *
 * Ruta aparte y no un modo de `/enrich`: son corridas que se pagan por separado
 * y juntarlas obligaría a pagar Instagram para traer un post, o al revés.
 *
 * Se corre **después** de guardar, igual que el resto de los enriquecimientos:
 * pagar el post de cien prospectos para escribirle a tres es tirar plata.
 */
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

  // Solo los que tienen perfil de LinkedIn: sin eso no hay nada que consultar.
  const { data: rows, error } = await supabase
    .from('prospects')
    .select('id, linkedin')
    .in('id', ids)
    .not('linkedin', 'is', null);

  if (error) {
    console.error('[prospect/enrich-posts] no se pudieron leer los prospectos', error);
    return NextResponse.json({ error: 'No se pudieron leer los prospectos.' }, { status: 500 });
  }

  type Row = { id: string; linkedin: string };
  const candidatos = (rows ?? []).filter(
    (r): r is Row => typeof r.linkedin === 'string' && r.linkedin.length > 0,
  );
  const targets = candidatos.slice(0, MAX_PERFILES_POR_CORRIDA);
  const overflow = candidatos.length - targets.length;

  if (targets.length === 0) {
    return NextResponse.json({
      enriched: 0,
      skipped: ids.length,
      overflow: 0,
      maxPerRun: MAX_PERFILES_POR_CORRIDA,
      updated: [],
      message: 'Ninguno de los prospectos seleccionados tiene perfil de LinkedIn.',
    });
  }

  // Frenar antes de gastar, igual que la búsqueda y la lectura de sitios.
  const costoEstimado = costoDeTraerPosts(targets.length);
  const presupuesto = await readBudget(apiToken, supabase).catch(() => null);
  const veredicto = presupuesto
    ? evaluarPresupuesto(presupuesto, 'linkedin_posts', costoEstimado, 0, 'traer estas publicaciones')
    : null;
  if (veredicto?.nivel === 'agotado' && gate.profile.role !== 'superadmin') {
    return NextResponse.json({ error: veredicto.mensaje, budgetExhausted: true }, { status: 402 });
  }

  try {
    const posts = await traerUltimosPosts(
      targets.map((t) => t.linkedin),
      apiToken,
    );
    const porSlug = new Map(posts.map((p) => [p.linkedin.toLowerCase(), p]));
    const consultadoEn = new Date().toISOString();

    let conPost = 0;
    let frescos = 0;

    const updates = await Promise.all(
      targets.map(async (t) => {
        const post = porSlug.get(t.linkedin.toLowerCase());
        // `posts_enriched_at` se escribe SIEMPRE, haya post o no: es lo que
        // evita volver a pagar por un perfil que ya se consultó y no publica.
        const patch: Record<string, unknown> = { posts_enriched_at: consultadoEn };
        if (post?.texto) {
          patch.last_post_text = post.texto;
          patch.last_post_at = post.fecha;
          patch.last_post_url = post.url;
          conPost += 1;
          if (postEsFresco(post.fecha)) frescos += 1;
        }

        const { error: e } = await supabase.from('prospects').update(patch).eq('id', t.id);
        if (e) {
          console.error('[prospect/enrich-posts] update falló', t.id, e.message);
          return null;
        }
        return {
          id: t.id,
          texto: post?.texto ?? null,
          fecha: post?.fecha ?? null,
          fresco: postEsFresco(post?.fecha ?? null),
        };
      }),
    );

    const updated = updates.filter((u) => u !== null);

    return NextResponse.json({
      enriched: updated.length,
      skipped: ids.length - targets.length,
      overflow,
      maxPerRun: MAX_PERFILES_POR_CORRIDA,
      /** Lo que importa no es cuántos se consultaron sino cuántos publican, y
       *  cuántos lo hicieron hace poco: un post viejo no se usa. */
      conPost,
      frescos,
      updated,
      budgetWarning: veredicto && veredicto.nivel !== 'ok' ? veredicto.mensaje : null,
    });
  } catch (err) {
    console.error('[prospect/enrich-posts]', err);
    if (err instanceof ApifyError) {
      const status = err.reason === 'token' || err.reason === 'credit' ? 400 : 502;
      return NextResponse.json({ error: err.message, reason: err.reason }, { status });
    }
    const message = err instanceof Error ? err.message : 'No se pudieron traer las publicaciones.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
