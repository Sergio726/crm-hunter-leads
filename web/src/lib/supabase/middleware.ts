import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabasePublicEnv } from './env';

/** Refresca la sesión en cada request y protege las rutas privadas. */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url, key } = supabasePublicEnv();

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // `/api/cron` entra sin sesión a propósito: lo dispara la tarea programada de
  // Vercel, que no es una persona logueada. Sin esto, el proxy la redirigía a
  // /login y el recordatorio no se enviaba nunca — y encima sin error visible,
  // porque un 307 a la pantalla de login parece una respuesta exitosa.
  // La ruta se protege sola con `CRON_SECRET`; ver `api/cron/recordatorios`.
  const isPublic =
    path.startsWith('/login') || path.startsWith('/auth') || path.startsWith('/api/cron');

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
