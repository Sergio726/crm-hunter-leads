import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';
import { ApifyError } from '@/lib/prospect/apify';
import { evaluarPresupuesto, readBudget } from '@/lib/prospect/budget';
import { MAX_SITES_PER_RUN, esSitioLeible, scrapeContacts } from '@/lib/prospect/contacts';
import { costoDeLeerSitios } from '@/lib/prospect/sitios';
import { getSecret } from '@/lib/prospect/secrets';

/**
 * Busca email, WhatsApp y redes en el sitio web de los prospectos guardados.
 *
 * Ruta aparte y no un modo dentro de `/api/prospect/enrich`: son dos corridas
 * que se pagan por separado, y juntarlas obligaría a pagar Instagram para
 * negocios que solo interesaban por el email.
 */
// 38 s tardó la corrida de 5 sitios en la validación. 60 s deja margen y además
// mantiene la ruta dentro del tope del plan Hobby de Vercel.
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

  // Solo los que tienen web: sin sitio no hay nada que leer. El RLS ya recorta
  // a los del usuario (o a todos, si es superadmin).
  const { data: rows, error } = await supabase
    .from('prospects')
    .select('id, website, email, whatsapp_phone, phone, instagram, linkedin')
    .in('id', ids)
    .not('website', 'is', null);

  if (error) {
    console.error('[prospect/enrich-contacts] no se pudieron leer los prospectos', error);
    return NextResponse.json({ error: 'No se pudieron leer los prospectos.' }, { status: 500 });
  }

  type Row = {
    id: string;
    website: string;
    email: string | null;
    whatsapp_phone: string | null;
    phone: string | null;
    instagram: string | null;
    linkedin: string | null;
  };

  // No alcanza con "tiene website": en esta base el campo suele traer un
  // `wa.me/...` o el propio Instagram, porque son negocios SIN web propia.
  // Pagar por raspar un link de WhatsApp es tirar plata.
  const candidates = (rows ?? []).filter(
    (r): r is Row =>
      typeof r.website === 'string' && r.website.length > 0 && esSitioLeible(r.website),
  );
  const noLeibles = (rows ?? []).length - candidates.length;
  const targets = candidates.slice(0, MAX_SITES_PER_RUN);
  const overflow = candidates.length - targets.length;

  if (targets.length === 0) {
    return NextResponse.json({
      enriched: 0,
      skipped: ids.length,
      overflow: 0,
      maxPerRun: MAX_SITES_PER_RUN,
      updated: [],
      message:
        noLeibles > 0
          ? `Ninguno tiene un sitio para leer: ${noLeibles} solo tienen un link de WhatsApp o de red social.`
          : 'Ninguno de los prospectos seleccionados tiene sitio web para leer.',
    });
  }

  // Frenar ANTES de gastar, igual que en la búsqueda. Esto también sale de
  // Apify: sin el freno, el saldo se podía terminar por acá y el vendedor se
  // enteraba con un error del proveedor en vez de un aviso en castellano.
  const costoEstimado = costoDeLeerSitios(targets.length);
  const presupuesto = await readBudget(apiToken, supabase).catch(() => null);
  const veredicto = presupuesto
    ? evaluarPresupuesto(presupuesto, 'contact_scraper', costoEstimado, 0, 'buscar estos contactos')
    : null;
  // Al superadmin se le avisa pero no se lo frena: es quien paga y quien tiene
  // que poder diagnosticar. Misma regla que en `/api/prospect/search`.
  if (veredicto?.nivel === 'agotado' && gate.profile.role !== 'superadmin') {
    return NextResponse.json({ error: veredicto.mensaje, budgetExhausted: true }, { status: 402 });
  }

  try {
    const scraped = await scrapeContacts(
      targets.map((t) => t.website),
      apiToken,
    );
    const byWebsite = new Map(scraped.map((s) => [s.website, s]));
    const enrichedAt = new Date().toISOString();

    let withEmail = 0;
    let withInstagram = 0;
    let withLinkedin = 0;

    const updates = await Promise.all(
      targets.map(async (target) => {
        const found = byWebsite.get(target.website);
        if (!found) return null;

        // Regla: completar huecos, nunca pisar. Places es fuente de primera
        // mano; el scraper solo rellena lo que falta.
        const patch: Record<string, unknown> = {
          contact_status: found.status,
          contact_enriched_at: enrichedAt,
        };
        if (!target.email && found.email) {
          patch.email = found.email;
          withEmail += 1;
        }
        if (!target.whatsapp_phone && found.whatsapp) patch.whatsapp_phone = found.whatsapp;
        if (!target.phone && found.phone) patch.phone = found.phone;
        if (!target.instagram && found.instagram) {
          patch.instagram = found.instagram;
          withInstagram += 1;
        }
        if (!target.linkedin && found.linkedin) {
          patch.linkedin = found.linkedin;
          withLinkedin += 1;
        }

        const { error: updateError } = await supabase
          .from('prospects')
          .update(patch)
          .eq('id', target.id);
        if (updateError) {
          console.error('[prospect/enrich-contacts] update falló', target.id, updateError.message);
          return null;
        }

        // Se devuelve el valor que quedó, no el que se encontró: la pantalla
        // que llama desde una lista en memoria necesita reflejar la fila tal
        // como está ahora, y "completar huecos" significa que a veces gana el
        // dato viejo.
        return {
          id: target.id,
          email: target.email ?? found.email,
          whatsappPhone: target.whatsapp_phone ?? found.whatsapp,
          phone: target.phone ?? found.phone,
          instagram: target.instagram ?? found.instagram,
          linkedin: target.linkedin ?? found.linkedin,
          contactStatus: found.status,
        };
      }),
    );

    const updated = updates.filter((u) => u !== null);

    return NextResponse.json({
      enriched: updated.length,
      skipped: ids.length - targets.length,
      /** Tenían web pero quedaron fuera por el tope de la corrida. */
      overflow,
      maxPerRun: MAX_SITES_PER_RUN,
      /** Cuántos huecos se llenaron de verdad, que es lo que importa. */
      filled: { email: withEmail, instagram: withInstagram, linkedin: withLinkedin },
      /** Lo que quedó en cada prospecto, para refrescar sin volver a leer. */
      updated,
      /** Aviso de saldo bajo. No frena: solo se muestra. */
      budgetWarning: veredicto && veredicto.nivel !== 'ok' ? veredicto.mensaje : null,
    });
  } catch (err) {
    console.error('[prospect/enrich-contacts]', err);
    if (err instanceof ApifyError) {
      // token y crédito los arregla el usuario; el resto es del proveedor.
      const status = err.reason === 'token' || err.reason === 'credit' ? 400 : 502;
      return NextResponse.json({ error: err.message, reason: err.reason }, { status });
    }
    const message = err instanceof Error ? err.message : 'No se pudieron buscar los contactos.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
