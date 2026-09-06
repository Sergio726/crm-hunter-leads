// Cómo se identifica la extensión de Chrome ante el CRM — SOLO servidor.
//
// La extensión no puede usar la sesión del panel: vive en otro origen
// (`chrome-extension://…`) y el navegador trata esas cookies como de terceros.
// Así que lleva un token por vendedor, generado una vez desde Mi perfil y
// pegado en la extensión al instalarla. Mismo criterio que con n8n: un secreto
// propio por integración en vez de reutilizar la sesión de una persona.
//
// El token se guarda HASHEADO (sha256). El valor en claro se muestra una sola
// vez, al generarlo. Si alguien lee la tabla no obtiene nada que sirva.

import 'server-only';
import { after, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PREFIJO_TOKEN, extraerBearer, hashToken } from './auth-puro';

export { PREFIJO_TOKEN, generarToken, hashToken } from './auth-puro';

export type PuertaExtension =
  | { ok: true; userId: string; tokenId: string; admin: SupabaseClient }
  | { ok: false; response: NextResponse };

/**
 * Valida el token del pedido y devuelve en nombre de quién actúa la extensión.
 *
 * Devuelve también el cliente administrativo, porque todo lo que sigue tiene
 * que consultar sin sesión — y por eso mismo **todo lo que sigue tiene que
 * filtrar por `userId`**: con esa clave no aplica el RLS.
 */
export async function puertaDeExtension(request: Request): Promise<PuertaExtension> {
  const token = extraerBearer(request.headers.get('authorization'));
  if (!token || !token.startsWith(PREFIJO_TOKEN)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Falta el token de la extensión.' }, { status: 401 }),
    };
  }

  const admin = adminClient();
  if (!admin) {
    // Sin la clave de servicio no hay forma de validar un token sin sesión.
    // Se dice claro: es configuración del servidor, no culpa del vendedor.
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'El servidor no tiene SUPABASE_SERVICE_ROLE_KEY: la extensión no puede autenticarse.' },
        { status: 503 },
      ),
    };
  }

  const { data, error } = await admin
    .from('extension_tokens')
    .select('id, user_id, revoked_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  if (error) {
    console.error('[extension/auth] no se pudo validar el token', error.message);
    return {
      ok: false,
      response: NextResponse.json({ error: 'No se pudo validar el token.' }, { status: 500 }),
    };
  }
  if (!data || data.revoked_at) {
    // Mismo mensaje para "no existe" y "revocado": no hace falta distinguirlos
    // y distinguirlos le diría a un tercero qué tokens existieron.
    return {
      ok: false,
      response: NextResponse.json({ error: 'Token inválido o revocado.' }, { status: 401 }),
    };
  }

  // Cuándo se usó por última vez, para poder ver desde Mi perfil si un token
  // sigue vivo. Después de responder: no tiene por qué hacer esperar.
  const tokenId = data.id as string;
  after(async () => {
    await admin
      .from('extension_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenId);
  });

  return { ok: true, userId: data.user_id as string, tokenId, admin };
}
