'use client';

import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { problemFrom } from '@/lib/prospect/provider-problem';

/**
 * El aviso de que el proveedor no pudo ejecutar la búsqueda.
 *
 * Panel y no un toast: el error viajaba como `toast.error` y desaparecía a los
 * segundos, justo el aviso que hay que leer entero y sobre el que hay que
 * decidir algo.
 *
 * ⚠️ LOS DOS CASOS NO SE ARREGLAN IGUAL, y confundirlos sería repetir el error
 * que este trabajo vino a corregir:
 *
 *   · Sin crédito       → bajar la cantidad de resultados SÍ ayuda: cada
 *                         resultado se paga, y una búsqueda más chica entra.
 *   · Tope de corridas  → bajar la cantidad NO sirve para NADA. El plan gratis
 *                         limita cuántas veces se puede correr el actor, no
 *                         cuántos resultados trae. Ofrecer "reducí la cantidad"
 *                         acá sería mandar al vendedor a probar algo que no
 *                         puede funcionar.
 */
export function ProviderNotice({
  message,
  onReducirCantidad,
  onDismiss,
}: {
  /** El texto que devolvió el servidor, ya en castellano. */
  message: string;
  /** Bajar el límite a la mitad. Solo se ofrece cuando de verdad ayuda. */
  onReducirCantidad?: () => void;
  onDismiss?: () => void;
}) {
  const problema = problemFrom(message);
  const reducirSirve = problema === 'sin-credito' || problema === 'desconocido';

  return (
    <div
      role="alert"
      className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <p className="font-medium text-foreground">La búsqueda no llegó a ejecutarse</p>
          <p className="text-muted-foreground">{message}</p>

          {problema === 'tope-corridas' && (
            <p className="text-xs text-muted-foreground">
              Bajar la cantidad de resultados no cambia nada en este caso: el tope es de{' '}
              <strong className="text-foreground">cuántas veces</strong> se puede buscar, no de
              cuántos resultados trae cada búsqueda.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {reducirSirve && onReducirCantidad && (
              <Button variant="outline" onClick={onReducirCantidad}>
                Buscar la mitad
              </Button>
            )}
            <a
              href="https://console.apify.com/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary-deep hover:underline"
            >
              Ver mi cuenta de Apify <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              >
                cerrar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
