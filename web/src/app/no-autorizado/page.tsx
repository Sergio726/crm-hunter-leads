import { Clock } from 'lucide-react';
import { LogoutButton } from '@/components/LogoutButton';

export default function NoAutorizadoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
          <Clock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Esperando autorización</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tu cuenta todavía no está habilitada. Pedile a un administrador que te dé acceso; cuando lo
          haga, ingresá de nuevo.
        </p>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
