'use client';

import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { labelsFor } from '@/lib/prospect/columns';
import type { ProspectResult } from '@/lib/prospect/types';
import { ContactCell } from './ContactCell';
import { QualityCell } from './Quality';

/**
 * Un candidato, en pantalla angosta.
 *
 * La tabla de resultados tiene 6 columnas y mide ~950px. Medido en un marco de
 * 390px —el ancho de un teléfono común—: el nombre se parte en cuatro líneas, el
 * teléfono en tres, y la columna "Zona" queda **fuera de la pantalla** detrás de
 * una barra de desplazamiento lateral que nadie descubre.
 *
 * Una tabla angosta no se arregla achicando la tipografía: se arregla dejando de
 * ser una tabla. Acá cada prospecto es una tarjeta y el orden de lectura pasa a
 * ser vertical — nombre, por qué vale la pena, cómo contactarlo.
 *
 * El mismo componente se usa para los resultados de una búsqueda; la tabla sigue
 * existiendo para pantallas anchas, donde comparar filas de un vistazo es
 * justamente lo que sirve.
 */
export function ProspectCard({
  r,
  isTaken,
  isSelected,
  takenBy,
  onToggle,
  onOpen,
}: {
  r: ProspectResult;
  isTaken: boolean;
  isSelected: boolean;
  takenBy?: string;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const labels = labelsFor(r.kind);
  const subtitulo =
    labels.subtitulo === 'cargo'
      ? [r.roleTitle, r.companyName].filter(Boolean).join(' · ')
      : r.address;

  return (
    <div
      onClick={() => !isTaken && onToggle()}
      className={`rounded-xl border p-3 transition-colors ${
        isTaken
          ? 'border-border bg-muted/20 opacity-75'
          : `cursor-pointer ${
              isSelected ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40'
            }`
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Área de toque grande: en un teléfono un checkbox suelto de 16px se
            falla más de lo que se acierta. */}
        <label className="-m-1 shrink-0 p-1" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            disabled={isTaken}
            onChange={onToggle}
            aria-label={`Seleccionar ${r.businessName}`}
            className="h-4 w-4"
          />
        </label>

        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="text-left font-medium text-foreground hover:text-primary-deep hover:underline"
            >
              {r.businessName}
            </button>
            {subtitulo && <p className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</p>}
          </div>

          {isTaken && <Badge tone="neutral">Ya guardado · {takenBy}</Badge>}

          <QualityCell score={r.score} reasons={r.reasons} />

          <ContactCell
            email={r.email}
            whatsappPhone={r.whatsappPhone}
            phone={r.phone}
            instagram={r.instagram}
            linkedin={r.linkedin}
          />

          {/* Zona y señales en una sola línea: en la tabla eran dos columnas, y
              en el teléfono son el detalle que se mira al final. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {r.area && <span>{r.area}</span>}
            {!r.hasOwnWebsite && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary-deep">sin web</span>
            )}
            {r.rating !== null && <span>★ {r.rating}</span>}
            {r.reviewsCount > 0 && <span>{r.reviewsCount} reseñas</span>}
            {r.mapsUrl && (
              <a
                href={r.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-primary-deep hover:underline"
              >
                ficha <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
