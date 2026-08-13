import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { runAgentTurn } from '@/lib/prospect/agent';
import type { ChatTurn } from '@/lib/prospect/types';

/** Tope de turnos que se mandan al modelo: una charla de configuración es corta. */
const MAX_TURNS = 24;

function parseTurns(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (t): t is ChatTurn =>
        typeof t === 'object' &&
        t !== null &&
        (t as ChatTurn).role !== undefined &&
        ((t as ChatTurn).role === 'user' || (t as ChatTurn).role === 'assistant') &&
        typeof (t as ChatTurn).content === 'string' &&
        (t as ChatTurn).content.trim().length > 0,
    )
    .slice(-MAX_TURNS);
}

export async function POST(request: Request) {
  const profile = await getSessionProfile();
  if (profile?.role !== 'superadmin' && profile?.role !== 'seller') {
    return NextResponse.json({ error: 'no autorizado' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const turns = parseTurns(body?.turns);
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'falta el mensaje del usuario' }, { status: 400 });
  }

  try {
    const reply = await runAgentTurn(turns);
    return NextResponse.json(reply);
  } catch (error) {
    console.error('[prospect/chat]', error);
    return NextResponse.json(
      { error: 'El asistente no está disponible en este momento. Probá de nuevo en un rato.' },
      { status: 502 },
    );
  }
}
