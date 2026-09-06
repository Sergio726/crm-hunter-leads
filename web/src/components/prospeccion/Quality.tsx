'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { GRADE_LABELS, SCORE_EXPLANATION, gradeFor, type Grade, type SourceId } from '@/lib/prospect/types';

/**
 * La calificación de un prospecto, en palabras.
 *
 * Antes acá había un número solo: "72". El usuario lo dijo con todas las letras
 * — no sabía qué era. Un número no significa nada hasta que se sabe contra qué
 * se compara; la palabra sí. Y los motivos ya se calculaban desde el principio,
 * pero vivían en el `title` del badge: un tooltip que en el teléfono no existe.
 */

/**
 * Cómo se ve cada escalón.
 *
 * Antes esto eran cuatro colores: verde de **estado** para "muy bueno" y verde
 * de **marca** para "bueno", en escalones contiguos. Son dos verdes casi
 * iguales —D21 los corrió de hue justamente para que no compitan— y medidos
 * quedaban a una distancia de 58 cuando los otros saltos rondaban 250: en la
 * columna se leían como el mismo.
 *
 * La escala ahora **se apaga** en vez de cambiar de color. El verde queda solo
 * para lo único que hay que mirar, y de ahí para abajo cada escalón pierde
 * intensidad: pastilla con texto pleno, pastilla apagada, y sin pastilla. Se
 * lee de arriba abajo y respeta la regla del manual —una pastilla de color por
 * fila, el verde para lo que importa (D55)—. Además el peso visual **baja** con
 * la calidad: pintar "regular" de ámbar lo hacía gritar más que "bueno", que es
 * al revés de para lo que sirve la columna.
 *
 * El número exacto va al lado, así que el color no tiene que decir cuánto: solo
 * ayudar a barrer la lista.
 */
const GRADE_ESTILO: Record<Grade, { tone: 'success' | 'neutral'; className?: string } | null> = {
  muy_bueno: { tone: 'success' },
  bueno: { tone: 'neutral', className: 'text-foreground' },
  regular: { tone: 'neutral' },
  // Sin pastilla: es el escalón que no necesita que nadie lo mire.
  flojo: null,
};

export function QualityCell({
  score,
  reasons = [],
  /** Cuántos motivos mostrar antes de resumir el resto. */
  maxReasons = 2,
}: {
  score: number | null;
  reasons?: string[];
  maxReasons?: number;
}) {
  const grade = gradeFor(score);
  if (grade === null) {
    return <span className="text-xs text-muted-foreground">Sin calificar</span>;
  }

  const estilo = GRADE_ESTILO[grade];
  const shown = reasons.slice(0, maxReasons);
  const rest = reasons.length - shown.length;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {estilo ? (
          <Badge tone={estilo.tone} className={estilo.className}>
            {GRADE_LABELS[grade]}
          </Badge>
        ) : (
          // Mismo tipo y tamaño que la pastilla para que la columna no salte.
          <span className="px-2 py-0.5 font-mono text-[0.6875rem] font-bold tracking-wide text-muted-foreground">
            {GRADE_LABELS[grade]}
          </span>
        )}
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{score}</span>
      </div>
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-1 text-[0.6875rem] leading-tight text-muted-foreground">
          {shown.map((r) => (
            <span key={r} className="rounded bg-muted px-1 py-0.5">
              {r}
            </span>
          ))}
          {rest > 0 && <span className="px-1 py-0.5">+{rest}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * El "¿qué es esto?" del encabezado.
 *
 * Va por fuente porque el mismo número mide cosas distintas según de dónde vino
 * el lead: en Google son fotos y reseñas, en LinkedIn es el cargo. Mostrar una
 * sola explicación genérica sería mentir apenas entre la segunda fuente.
 */
export function QualityHeader({ source = 'google_places' }: { source?: SourceId }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 font-medium uppercase hover:text-foreground"
      >
        Calificación
        <HelpCircle className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">Qué significa la calificación</span>
      </button>
      {open && (
        <div
          role="note"
          className="absolute top-full left-0 z-20 mt-1 w-72 rounded-md border border-border bg-card p-3 text-xs leading-relaxed font-normal normal-case shadow-lg"
        >
          <p className="text-foreground">{SCORE_EXPLANATION[source]}</p>
          <p className="mt-2 text-muted-foreground">
            Estima <strong className="text-foreground">si vale la pena llamarlo</strong>, no si te
            va a comprar. Va de 0 a 100: 75 o más es muy bueno, 55 bueno, 35 regular.
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-primary-deep hover:underline"
          >
            Entendido
          </button>
        </div>
      )}
    </div>
  );
}
