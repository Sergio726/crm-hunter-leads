import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { generarToken, hashToken } from '@/lib/extension/auth';

/**
 * Los tokens de la extensión, desde el panel (con la sesión de siempre).
 *
 * Esta ruta es la ÚNICA de `/api/extension` que se autentica con cookie: es la
 * que usa Mi perfil para crear y revocar tokens. Las demás se autentican con
 * el token mismo.
 *
 * El token en claro se devuelve **una sola vez**, en el POST. Después solo
 * existe su hash: si se pierde, se genera otro.
 */

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: 'no autorizado' }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('extension_tokens')
    .select('id, label, created_at, last_used_at, revoked_at')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tokens: data ?? [] });
}

export async function POST(request: Request) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: 'no autorizado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 80) : null;

  const token = generarToken();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('extension_tokens')
    .insert({ user_id: profile.id, token_hash: hashToken(token), label: label || null })
    .select('id, label, created_at')
    .single();

  if (error) {
    // El caso más probable: la migración 0055 todavía no está aplicada.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ token, id: data.id, label: data.label, createdAt: data.created_at });
}

export async function DELETE(request: Request) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: 'no autorizado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'Falta indicar el token.' }, { status: 400 });

  // Revocar y no borrar: queda el rastro de que existió y cuándo se anuló.
  const supabase = await createClient();
  const { error } = await supabase
    .from('extension_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', profile.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
