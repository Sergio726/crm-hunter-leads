'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/brand/Logo';

/**
 * Aterrizaje de los links que llegan por email (invitación / enlace de acceso).
 *
 * Hay dos formatos posibles y esta página tiene que aguantar los dos:
 *
 * 1. `?code=…` — el flujo PKCE, que es el que usa Supabase hoy con
 *    `@supabase/ssr`. El canje se hace en el servidor, en `/auth/callback`,
 *    porque el verificador vive en una cookie httpOnly que el navegador no ve.
 * 2. `#access_token=…` — el flujo implícito, más viejo. Sigue soportado por si
 *    quedan links emitidos antes o el proyecto se configura en ese modo.
 *
 * Antes solo se leía el hash, así que un link con `?code=` caía en el mensaje
 * de "enlace inválido" aunque estuviera perfecto.
 */
export default function ConfirmPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // Leer la URL del navegador necesita un efecto: en el servidor no existe
  // `window`. La regla apunta a los efectos que derivan estado de props, y acá
  // el estado sale de un sistema externo.
  useEffect(() => {
    const url = new URL(window.location.href);

    // Supabase puede devolver el error por query (PKCE) o por hash (implícito).
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const errorDescription =
      url.searchParams.get('error_description') ?? hashParams.get('error_description');
    if (errorDescription) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(errorDescription.replace(/\+/g, ' '));
      return;
    }

    // Caso 1 (el actual): delegamos en la ruta de servidor, que ya sabe canjear
    // el código y dejar la sesión en cookies.
    const code = url.searchParams.get('code');
    if (code) {
      window.location.replace(`/auth/callback?code=${encodeURIComponent(code)}`);
      return;
    }

    // Caso 2 (legado): la sesión viene entera en el hash.
    const access_token = hashParams.get('access_token');
    const refresh_token = hashParams.get('refresh_token');
    if (!access_token || !refresh_token) {
      setError('El enlace no es válido o ya se usó. Pedí uno nuevo desde la pantalla de ingreso.');
      return;
    }
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) setError(error.message);
        else router.replace('/');
      });
  }, [router]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      <div className="pointer-events-none absolute -top-40 left-1/2 hidden h-[280px] w-[480px] -translate-x-1/2 rounded-full bg-primary/6 blur-3xl md:block" />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        <div className="mb-4 flex justify-center">
          <Logo />
        </div>
        {error ? (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <Link
              href="/login"
              className="mt-4 inline-block text-sm font-medium text-primary-deep underline-offset-4 hover:underline"
            >
              Volver a ingresar
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Entrando…</p>
        )}
      </div>
    </main>
  );
}
