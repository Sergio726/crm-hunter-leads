'use client';

import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { labelsFor } from '@/lib/prospect/columns';
import { ACTIVITY_LABELS, PROSPECT_STATUS_LABELS, type SavedProspect } from '@/lib/prospect/types';
import { ContactCell } from './ContactCell';
import { QualityCell } from './Quality';

/**
 * Un prospecto guardado, en pantalla angosta.
 *
 * La tabla de guardados llega a 8 columnas —nombre, estado, calificación,
 * contacto, seguidores, actividad, zona y quién lo guardó— y en un teléfono eso
 * es media pantalla de contenido y otra media de desplazamiento lateral. Misma
 * decisión que en los resultados de búsqueda: dejar de ser una tabla.
 *
 * Va aparte de `ProspectCard` y no unificado con props: los dos muestran cosas
 * distintas —acá importan el estado y la audiencia, allá los motivos del puntaje
 * y la ficha de Google— y unirlos daría un componente con media docena de
 * banderas que nadie entiende después.
 */
function formatFollowers(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(value);
}

export function SavedProspectCard({
  p,
  isSelected,
  showOwner,
  onToggle,
  onOpen,
}: {
  p: SavedProspect;
  /** `undefined` cuando la tabla es de solo lectura. */
  isSelected?: boolean;
  showOwner?: boolean;
  onToggle?: () => void;
  onOpen: () => void;
}) {
  const labels = labelsFor(p.kind);
  const subtitulo =
    labels.subtitulo === 'cargo'
      ? [p.roleTitle, p.companyName].filter(Boolean).join(' · ')
      : p.address;
  const seguidores = formatFollowers(p.audienceSize);

  return (
    <div
      onClick={onToggle}
      className={`rounded-xl border p-3 transition-colors ${
        onToggle ? 'cursor-pointer' : ''
      } ${isSelected ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40'}`}
    >
      <div className="flex items-start gap-3">
        {onToggle && (
          // Área de toque grande: un checkbox de 16px suelto se falla más de lo
          // que se acierta en un teléfono.
          <label className="-m-1 shrink-0 p-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isSelected ?? false}
              onChange={onToggle}
              aria-label={`Seleccionar ${p.businessName}`}
              className="h-4 w-4"
            />
          </label>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
                className="text-left font-medium text-foreground hover:text-primary-deep hover:underline"
              >
                {p.businessName}
              </button>
              {subtitulo && <p className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</p>}
            </div>
            {p.status && (
              <Badge tone={p.status === 'promoted' ? 'success' : 'neutral'}>
                {PROSPECT_STATUS_LABELS[p.status]}
              </Badge>
            )}
          </div>

          <QualityCell score={p.score} />

          <ContactCell
            email={p.email}
            whatsappPhone={p.whatsappPhone}
            phone={p.phone}
            instagram={p.instagram}
            linkedin={p.linkedin}
          />

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {p.area && <span>{p.area}</span>}
            {seguidores && <span>{seguidores} seguidores</span>}
            {p.audienceActivity && <span>{ACTIVITY_LABELS[p.audienceActivity]}</span>}
            {showOwner && p.ownerName && <span>· {p.ownerName}</span>}
            {p.mapsUrl && (
              <a
                href={p.mapsUrl}
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
