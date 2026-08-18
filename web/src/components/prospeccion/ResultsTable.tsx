'use client';

import { ExternalLink, Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { labelsFor, visibleColumns } from '@/lib/prospect/columns';
import type { ProspectResult } from '@/lib/prospect/types';
import { ContactCell } from './ContactCell';
import { QualityCell, QualityHeader } from './Quality';

/**
 * Los candidatos de una búsqueda.
 *
 * Las columnas **se deciden por lo que hay**, no están fijas. Antes eran las de
 * Google Maps para todo el mundo: buscando personas en LinkedIn, la columna del
 * nombre decía "Negocio", las de "Teléfono" y "Zona" salían vacías, y el cargo,
 * la empresa y el email —lo que se paga por traer— no se mostraban en ningún
 * lado. Ver `lib/prospect/columns.ts`.
 */
export function ResultsTable({
  results,
  selected,
  taken,
  onToggle,
  onToggleAll,
}: {
  results: ProspectResult[];
  selected: Set<string>;
  /** sourceRef → nombre de quien ya lo tiene guardado (por RPC, atraviesa RLS). */
  taken: Map<string, string>;
  onToggle: (sourceRef: string) => void;
  onToggleAll: () => void;
}) {
  if (results.length === 0) {
    return (
      <EmptyState
        icon={<Search className="h-5 w-5" />}
        title="Todavía no hay resultados"
        description="Definí el avatar con Turbo y ejecutá la búsqueda para ver candidatos acá."
      />
    );
  }

  const selectable = results.filter((r) => !taken.has(r.sourceRef));
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.sourceRef));

  const labels = labelsFor(results[0]?.kind);
  const col = visibleColumns(results);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
            <th className="px-3 py-2.5">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                disabled={selectable.length === 0}
                aria-label="Seleccionar todos los nuevos"
              />
            </th>
            <th className="px-3 py-2.5 font-medium">{labels.nombre}</th>
            <th className="px-3 py-2.5 font-medium">
              <QualityHeader source={results[0]?.source} />
            </th>
            {col.contacto && <th className="px-3 py-2.5 font-medium">Contacto</th>}
            {col.senales && <th className="px-3 py-2.5 font-medium">Señales</th>}
            {col.zona && <th className="px-3 py-2.5 font-medium">Zona</th>}
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const isTaken = taken.has(r.sourceRef);
            const isSelected = selected.has(r.sourceRef);
            // Para una persona, el cargo y la empresa dicen más que la dirección
            // —que LinkedIn ni siquiera da— y son lo primero que mira el vendedor.
            const subtitulo =
              labels.subtitulo === 'cargo'
                ? [r.roleTitle, r.companyName].filter(Boolean).join(' · ')
                : r.address;

            return (
              <tr
                key={r.sourceRef}
                onClick={() => !isTaken && onToggle(r.sourceRef)}
                className={`border-b border-border/60 transition-colors ${
                  isTaken
                    ? 'bg-muted/20 opacity-75'
                    : `cursor-pointer hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`
                }`}
              >
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isTaken}
                    onChange={() => onToggle(r.sourceRef)}
                    aria-label={`Seleccionar ${r.businessName}`}
                  />
                </td>

                <td className="px-3 py-2.5">
                  <div className="font-medium text-foreground">{r.businessName}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {subtitulo && <span>{subtitulo}</span>}
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
                  {isTaken && (
                    <Badge tone="neutral" className="mt-1">
                      Ya guardado · {taken.get(r.sourceRef)}
                    </Badge>
                  )}
                </td>

                <td className="px-3 py-2.5">
                  <QualityCell score={r.score} reasons={r.reasons} />
                </td>

                {col.contacto && (
                  <td className="px-3 py-2.5">
                    <ContactCell
                      email={r.email}
                      whatsappPhone={r.whatsappPhone}
                      phone={r.phone}
                      instagram={r.instagram}
                      linkedin={r.linkedin}
                    />
                  </td>
                )}

                {col.senales && (
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {r.hasOwnWebsite ? (
                        <span className="rounded bg-muted px-1.5 py-0.5">tiene web</span>
                      ) : (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary-deep">
                          sin web
                        </span>
                      )}
                      {r.rating !== null && <span>★ {r.rating}</span>}
                      {r.reviewsCount > 0 && <span>{r.reviewsCount} reseñas</span>}
                    </div>
                  </td>
                )}

                {col.zona && <td className="px-3 py-2.5 text-muted-foreground">{r.area || '—'}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
