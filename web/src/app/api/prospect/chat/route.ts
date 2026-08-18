import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_MODEL, guidedReply, runAgentTurn } from '@/lib/prospect/agent';
import { describeBudget, readBudget } from '@/lib/prospect/budget';
import { describeRunForAgent, type RunFacts } from '@/lib/prospect/run-summary';
import { getSecret } from '@/lib/prospect/secrets';
import { availableSources } from '@/lib/prospect/sources';
import { SOURCES, type ChatTurn, type SourceId } from '@/lib/prospect/types';

/**
 * Sin declararlo, Vercel corta la función a los 10 s por defecto, y una
 * respuesta de modelo puede tardar más — sobre todo con `openrouter/auto`, que
 * primero rutea a un proveedor, y en la primera llamada tras un arranque en
 * frío. Era la única de las tres rutas de prospección sin límite propio.
 *
 * 60 s y no más: es el techo del plan gratuito de Vercel. Ver DEPLOY-VERCEL.md.
 */
export const maxDuration = 60;

/** Tope de turnos que se mandan al modelo: una charla de configuración es corta. */
const MAX_TURNS = 24;

/**
 * Cómo salió la última búsqueda, si el panel la manda.
 *
 * Viene del cliente y no de la base a propósito: los resultados de una corrida
 * NO se persisten hasta que el vendedor los guarda (D14), así que la base no
 * sabe nada de la búsqueda que acaba de fallar — que es justamente sobre la que
 * hay que diagnosticar.
 */
function parseLastRun(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<RunFacts> & { costUsd?: number };
  if (typeof v.returned !== 'number' || typeof v.requested !== 'number') return null;
  if (!v.source || !(v.source in SOURCES)) return null;

  try {
    return describeRunForAgent(
      {
        source: v.source,
        requested: v.requested,
        returned: v.returned,
        totalMatched: typeof v.totalMatched === 'number' ? v.totalMatched : v.returned,
        requestsUsed: typeof v.requestsUsed === 'number' ? v.requestsUsed : 0,
        truncated: Boolean(v.truncated),
        discarded: {
          withWebsite: 0,
          noInstagram: 0,
          noLinkedin: 0,
          noWhatsapp: 0,
          lowRating: 0,
          excludedName: 0,
          ...(v.discarded ?? {}),
        },
      },
      v.costUsd,
    );
  } catch {
    // Un resumen mal formado no puede tumbar el chat.
    return null;
  }
}

function parseTurns(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (t): t is ChatTurn =>
        typeof t === 'object' &&
        t !== null &&
        ((t as ChatTurn).role === 'user' || (t as ChatTurn).role === 'assistant') &&
        typeof (t as ChatTurn).content === 'string' &&
        (t as ChatTurn).content.trim().length > 0,
    )
    .slice(-MAX_TURNS);
}

/** Modelo e interruptor viven en app_settings (no son secretos). */
async function readAgentSettings(): Promise<{ model: string; enabled: boolean }> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['ai_model', 'ai_enabled']);
    const map = new Map((data ?? []).map((r) => [r.key as string, r.value]));
    const model = typeof map.get('ai_model') === 'string' ? (map.get('ai_model') as string) : '';
    return {
      model: model.trim() || DEFAULT_MODEL,
      // Si falta la fila (migración sin aplicar), se asume habilitado.
      enabled: map.has('ai_enabled') ? Boolean(map.get('ai_enabled')) : true,
    };
  } catch {
    return { model: DEFAULT_MODEL, enabled: true };
  }
}

export async function POST(request: Request) {
  const gate = await apiSectionGuard('prospeccion');
  if (!gate.ok) return gate.response;
  const profile = gate.profile;

  const body = await request.json().catch(() => ({}));
  const turns = parseTurns(body?.turns);
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'falta el mensaje del usuario' }, { status: 400 });
  }

  const settings = await readAgentSettings();
  // Interruptor apagado → modo guiado, sin gastar en el proveedor.
  if (!settings.enabled) {
    return NextResponse.json(guidedReply(turns));
  }

  // Solo se le ofrecen a Turbo las fuentes que de verdad se pueden ejecutar:
  // proponer una búsqueda que después no corre sería peor que no ofrecerla.
  const sources = availableSources();
  const pinnedSource =
    typeof body?.source === 'string' && sources.includes(body.source as SourceId)
      ? (body.source as SourceId)
      : null;

  // Lo que Turbo puede VER. Antes solo tenía la conversación, así que ante una
  // búsqueda vacía decía "no encontré nada" y ahí terminaba: no sabía cómo había
  // salido ni cuánta plata quedaba.
  const supabase = await createClient();
  const apifyToken = await getSecret('apify_api_token');
  const [budget, lastRun] = await Promise.all([
    readBudget(apifyToken, supabase).then(describeBudget).catch(() => null),
    Promise.resolve(parseLastRun(body?.lastRun)),
  ]);

  try {
    const apiKey = await getSecret('openrouter_api_key');
    const reply = await runAgentTurn(turns, {
      apiKey,
      model: settings.model,
      referer: process.env.NEXT_PUBLIC_SITE_URL,
      sources,
      pinnedSource,
      context: { budget, lastRun },
    });
    return NextResponse.json(reply);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Turbo no está disponible.';
    console.error('[prospect/chat]', error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
