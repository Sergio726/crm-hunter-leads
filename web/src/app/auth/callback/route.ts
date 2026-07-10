import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Intercambia el código de OAuth por una sesión y vuelve al panel. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  // Detrás de un proxy (Docker/Traefik) request.url trae el host interno
  // (0.0.0.0:3000); el dominio público viaja en x-forwarded-*.
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  const publicOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${publicOrigin}${next}`);
  }

  return NextResponse.redirect(`${publicOrigin}/login?error=auth`);
}
