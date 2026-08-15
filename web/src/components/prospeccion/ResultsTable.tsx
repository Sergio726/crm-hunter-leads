'use client';

import { AtSign, Briefcase, ExternalLink, Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { linkedinLabel, linkedinUrl, type ProspectResult } from '@/lib/prospect/types';

function scoreTone(score: number): 'success' | 'warning' | 'neutral' {
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'neutral';
}

export function ResultsTable({
  results,
  selected,
  taken,
  onToggle,
  onToggleAll,
}: {
  results: ProspectResult[];
  selected: Set<string>;
  /** place_id → nombre de quien ya lo tiene guardado (por RPC, atraviesa RLS). */
  taken: Map<string, string>;
  onToggle: (placeId: string) => void;
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

  const selectable = results.filter((r) => !taken.has(r.googlePlaceId));
  const allSelected =
    selectable.length > 0 && selectable.every((r) => selected.has(r.googlePlaceId));

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
            <th className="px-3 py-2.5 font-medium">Negocio</th>
            <th className="px-3 py-2.5 font-medium">Score</th>
            <th className="px-3 py-2.5 font-medium">Señales</th>
            <th className="px-3 py-2.5 font-medium">Teléfono</th>
            <th className="px-3 py-2.5 font-medium">Zona</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const isTaken = taken.has(r.googlePlaceId);
            const isSelected = selected.has(r.googlePlaceId);

            return (
              <tr
                key={r.googlePlaceId}
                onClick={() => !isTaken && onToggle(r.googlePlaceId)}
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
                    onChange={() => onToggle(r.googlePlaceId)}
                    aria-label={`Seleccionar ${r.businessName}`}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-foreground">{r.businessName}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {r.address ?? '—'}
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
                      Ya guardado · {taken.get(r.googlePlaceId)}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={scoreTone(r.score)} title={r.reasons.join(' · ')}>
                    {r.score}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {r.hasOwnWebsite ? (
                      <span className="rounded bg-muted px-1.5 py-0.5">tiene web</span>
                    ) : (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary-deep">sin web</span>
                    )}
                    {r.instagram && (
                      <a
                        href={`https://instagram.com/${r.instagram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        <AtSign className="h-3 w-3" />
                        {r.instagram}
                      </a>
                    )}
                    {/* Se podía filtrar por LinkedIn pero no se veía en ninguna
                        parte: exigir una señal y después ocultarla deja al
                        vendedor sin poder confirmar qué encontró. */}
                    {r.linkedin && (
                      <a
                        href={linkedinUrl(r.linkedin)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={`LinkedIn: ${r.linkedin}`}
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        <Briefcase className="h-3 w-3" />
                        {linkedinLabel(r.linkedin)}
                      </a>
                    )}
                    {r.rating !== null && <span>★ {r.rating}</span>}
                    <span>{r.reviewsCount} reseñas</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {r.whatsappPhone ? (
                    <span title="Parece celular — sirve para WhatsApp">{r.whatsappPhone}</span>
                  ) : (
                    (r.phone ?? '—')
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{r.area}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
