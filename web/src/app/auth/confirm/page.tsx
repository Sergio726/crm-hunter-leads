'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/brand/Logo';

/**
 * Aterrizaje de los links que llegan por email (invitación / enlace de acceso).
 * A diferencia del OAuth (?code=), estos links traen la sesión en el hash
 * (#access_token=...), que solo es visible en el navegador.
 */
export default function ConfirmPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const errorDescription = params.get('error_description');
    if (errorDescription) {
      setError(errorDescription.replace(/\+/g, ' '));
      return;
    }
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
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
      <div className="pointer-events-none absolute -top-40 left-1/2 hidden h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl md:block" />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        <div className="mb-4 flex justify-center">
          <Logo />
        </div>
        {error ? (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <Link
              href="/login"
              className="mt-4 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
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
