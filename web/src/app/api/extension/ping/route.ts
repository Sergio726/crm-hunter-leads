import { NextResponse } from 'next/server';
import { puertaDeExtension } from '@/lib/extension/auth';

/**
 * "¿Este token sirve, y de quién es?"
 *
 * Lo usa el popup de la extensión al pegar el token, para decir "Conectado
 * como Juan" en vez de dejar al vendedor adivinando si lo copió bien. Es la
 * única forma de saberlo antes de abrir un perfil de LinkedIn.
 */
export async function GET(request: Request) {
  const puerta = await puertaDeExtension(request);
  if (!puerta.ok) return puerta.response;

  const { data } = await puerta.admin
    .from('profiles')
    .select('full_name, email, role')
    .eq('id', puerta.userId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    nombre: data?.full_name ?? data?.email ?? 'vendedor',
    rol: data?.role ?? null,
  });
}
