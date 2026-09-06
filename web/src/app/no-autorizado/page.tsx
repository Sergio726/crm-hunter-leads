import Link from 'next/link';
import { Clock, Lock } from 'lucide-react';
import { LogoutButton } from '@/components/LogoutButton';

/**
 * Esta pantalla atiende dos situaciones muy distintas y antes las mezclaba:
 *
 * - Cuenta creada pero todavía sin autorizar (rol `pending`).
 * - Miembro con cuenta válida que abrió una sección que su rol no tiene
 *   habilitada, normalmente por pegar una URL. Llega con `?motivo=seccion`.
 *
 * Al segundo, el mensaje de "esperando autorización" lo hacía pensar que su
 * cuenta estaba rota, y encima lo único que se le ofrecía era cerrar sesión.
 */
export default async function NoAutorizadoPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  const seccionBloqueada = motivo === 'seccion';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
          {seccionBloqueada ? <Lock className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
        </div>

        {seccionBloqueada ? (
          <>
            <h1 className="text-xl font-semibold text-foreground">Esta sección no está habilitada</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tu cuenta funciona bien, pero tu rol no tiene acceso a esta pantalla. Si la necesitás,
              pedile a un administrador que te la habilite.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <Link
                href="/"
                className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
              >
                Volver al inicio
              </Link>
              <LogoutButton />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-foreground">Esperando autorización</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tu cuenta todavía no está habilitada. Pedile a un administrador que te dé acceso;
              cuando lo haga, ingresá de nuevo.
            </p>
            <div className="mt-6">
              <LogoutButton />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
