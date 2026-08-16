import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_MODEL } from '@/lib/prospect/agent';
import { draftApproach, type Channel } from '@/lib/prospect/approach';
import { getSecret } from '@/lib/prospect/secrets';

/**
 * Redacta el primer mensaje para UN prospecto.
 *
 * De a uno a propósito: es lo único del sistema que se paga por lead. El
 * vendedor contacta a unos pocos por día, no a la lista entera, así que
 * generarlo en lote sería pagar cien mensajes para usar tres.
 */
export const maxDuration = 60;

const CHANNELS: Channel[] = ['whatsapp', 'email', 'linkedin'];

export async function POST(request: Request) {
  const gate = await apiSectionGuard('prospeccion');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => ({}));
  const prospectId = typeof body?.prospectId === 'string' ? body.prospectId : null;
  const offer = typeof body?.offer === 'string' ? body.offer.trim() : '';
  const channel: Channel = CHANNELS.includes(body?.channel) ? body.channel : 'whatsapp';

  if (!prospectId) {
    return NextResponse.json({ error: 'Falta indicar el prospecto.' }, { status: 400 });
  }
  if (offer.length < 5) {
    // Sin saber qué vende el vendedor, el mensaje sería un saludo vacío. Es
    // mejor pedirlo que gastar en algo inservible.
    return NextResponse.json(
      { error: 'Contame en una frase qué vendés, si no el mensaje sale genérico.' },
      { status: 400 },
    );
  }

  const apiKey = await getSecret('openrouter_api_key');
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Falta la API key de OpenRouter. Cargala en Configuración → Prospección (o como OPENROUTER_API_KEY en el entorno).',
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // El RLS recorta a los prospectos del usuario: si pide uno ajeno, no aparece.
  const { data: p, error } = await supabase
    .from('prospects')
    .select(
      'business_name, kind, area, niche, role_title, company_name, ig_bio, audience_size, audience_activity, has_own_website, rating, reviews_count, source_data',
    )
    .eq('id', prospectId)
    .maybeSingle();

  if (error || !p) {
    return NextResponse.json({ error: 'No se encontró ese prospecto.' }, { status: 404 });
  }

  const model = (
    await supabase.from('app_settings').select('value').eq('key', 'ai_model').maybeSingle()
  ).data?.value;

  try {
    const message = await draftApproach(
      {
        name: p.business_name as string,
        kind: (p.kind as 'business' | 'person' | 'account') ?? 'business',
        channel,
        offer,
        area: p.area as string | null,
        niche: p.niche as string | null,
        roleTitle: p.role_title as string | null,
        companyName: p.company_name as string | null,
        igBio: p.ig_bio as string | null,
        igCategory:
          ((p.source_data as Record<string, unknown> | null)?.ig_category as string) ?? null,
        audienceSize: p.audience_size as number | null,
        audienceActivity: p.audience_activity as 'activo' | 'tibio' | 'dormido' | null,
        hasOwnWebsite: p.has_own_website as boolean | null,
        rating: p.rating as number | null,
        reviewsCount: p.reviews_count as number | null,
      },
      {
        apiKey,
        model: typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_MODEL,
        referer: process.env.NEXT_PUBLIC_SITE_URL,
      },
    );

    return NextResponse.json({ message, channel });
  } catch (err) {
    console.error('[prospect/approach]', err);
    const detail = err instanceof Error ? err.message : 'No se pudo redactar el mensaje.';
    // Key y crédito los arregla el usuario; el resto es del proveedor.
    const isConfig = detail.includes('API key') || detail.includes('crédito');
    return NextResponse.json({ error: detail }, { status: isConfig ? 400 : 502 });
  }
}
