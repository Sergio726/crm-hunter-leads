'use client';

import { AlertTriangle, CheckCircle2, Coins } from 'lucide-react';
import { summarizeRun, type RunFacts } from '@/lib/prospect/run-summary';

/**
 * Qué pasó en la búsqueda, dicho de frente.
 *
 * Hasta ahora una corrida que traía menos de lo prometido se veía EXACTAMENTE
 * IGUAL que una perfecta: la pantalla mostraba el número que llegó y se callaba.
 * Si pedías 50 y traía 44, nadie te decía que faltaban seis ni por qué.
 *
 * Los números los calcula `run-summary.ts` y no el modelo: sumar es gratis y
 * confiable. Lo que aporta Turbo es la interpretación, en el chat.
 */
export function RunReport({
  facts,
  costUsd,
  remainingUsd,
}: {
  facts: RunFacts;
  costUsd?: number | null;
  /** Saldo de Apify después de esta corrida, si se pudo leer. */
  remainingUsd?: number | null;
}) {
  const s = summarizeRun(facts);
  const completa = facts.returned >= facts.requested;

  return (
    <div
      className={`mb-3 rounded-lg border p-3 text-sm ${
        s.shortfall ? 'border-warning/40 bg-warning/5' : 'border-border bg-muted/30'
      }`}
    >
      <div className="flex items-start gap-2">
        {/* `text-success` y no el verde de marca: es un estado, y su hermano de
            al lado ya usa la familia de estado (`text-warning`). El verde de marca
            está corrido de hue justamente para no competir con el de estado
            (D21) — usarlo acá los volvía a mezclar. */}
        {completa ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        )}
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-foreground">{s.headline}</p>

          {/* Lo más importante del informe: qué faltó y de quién es la culpa. */}
          {s.shortfall && <p className="text-muted-foreground">{s.shortfall}</p>}

          {s.detail.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Descartados en el camino: {s.detail.join(' · ')}.
            </p>
          )}

          {facts.truncated && !s.shortfall && (
            <p className="text-xs text-muted-foreground">
              Se alcanzó el tope de consultas por corrida: quedaron zonas sin recorrer.
            </p>
          )}

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Coins className="h-3 w-3" aria-hidden="true" />
              {typeof costUsd === 'number'
                ? `Costó US$ ${costUsd.toFixed(2)}`
                : `${facts.requestsUsed} consultas facturadas`}
            </span>
            {typeof remainingUsd === 'number' && (
              <span>
                Quedan <strong className="text-foreground">US$ {remainingUsd.toFixed(2)}</strong> este
                mes
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
