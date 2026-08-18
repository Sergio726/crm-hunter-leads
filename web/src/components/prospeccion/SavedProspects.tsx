'use client';

import { useState } from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import {
  ACTIVITY_LABELS,
  PROSPECT_STATUS_LABELS,
  type SavedProspect,
} from '@/lib/prospect/types';
import { labelsFor, visibleColumns } from '@/lib/prospect/columns';
import { ContactCell } from './ContactCell';
import { ProspectDetail } from './ProspectDetail';
import { QualityCell, QualityHeader } from './Quality';

function activityTone(activity: SavedProspect['audienceActivity']): 'success' | 'warning' | 'danger' {
  if (activity === 'activo') return 'success';
  if (activity === 'tibio') return 'warning';
  return 'danger';
}

/** Por qué no se pudo enriquecer, en castellano. */
const STATUS_HINT: Record<NonNullable<SavedProspect['enrichmentStatus']>, string> = {
  ok: '',
  not_found: 'La cuenta no existe o cambió de nombre',
  private: 'Cuenta privada: no se ven las publicaciones',
  error: 'No se pudo consultar; se puede reintentar',
};

function formatFollowers(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(value);
}

function statusTone(status: NonNullable<SavedProspect['status']>): 'success' | 'neutral' {
  return status === 'promoted' ? 'success' : 'neutral';
}

export function SavedProspects({
  prospects,
  selected,
  onToggle,
  onToggleAll,
  showOwner = false,
  hideHint = false,
}: {
  prospects: SavedProspect[];
  /** Si no se pasa, la tabla es de solo lectura y no dibuja los checkboxes. */
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
  /** Columna "Guardado por": solo tiene sentido para el superadmin. */
  showOwner?: boolean;
  hideHint?: boolean;
}) {
  const [detalle, setDetalle] = useState<SavedProspect | null>(null);
  const withInstagram = prospects.filter((p) => p.instagram).length;
  const selectable = Boolean(selected && onToggle && onToggleAll);
  // Las columnas extra existen solo cuando el prospecto viene de la base.
  const showStatus = prospects.some((p) => p.status !== undefined);
  const showArea = prospects.some((p) => p.area);
  // Las columnas se deciden por lo que hay, no están fijas: ver
  // `lib/prospect/columns.ts`. Antes eran las de Google para todo el mundo, así
  // que una lista de personas mostraba "Negocio" y escondía cargo, empresa y
  // email — justo lo que se paga por traer.
  const labels = labelsFor(prospects[0]?.kind);
  const col = visibleColumns(prospects);
  const allSelected =
    selectable && prospects.length > 0 && prospects.every((p) => selected!.has(p.id));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
              {selectable && (
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    disabled={prospects.length === 0}
                    aria-label="Seleccionar todos"
                  />
                </th>
              )}
              <th className="px-3 py-2 font-medium">{labels.nombre}</th>
              {showStatus && <th className="px-3 py-2 font-medium">Estado</th>}
              <th className="px-3 py-2 font-medium">
                <QualityHeader source={prospects[0]?.source} />
              </th>
              {col.contacto && <th className="px-3 py-2 font-medium">Contacto</th>}
              {col.audiencia && <th className="px-3 py-2 font-medium">Seguidores</th>}
              {col.audiencia && <th className="px-3 py-2 font-medium">Actividad</th>}
              {showArea && <th className="px-3 py-2 font-medium">Zona</th>}
              {showOwner && <th className="px-3 py-2 font-medium">Guardado por</th>}
            </tr>
          </thead>
          <tbody>
            {prospects.map((p) => {
              const isSelected = selected?.has(p.id) ?? false;
              return (
              <tr
                key={p.id}
                onClick={selectable ? () => onToggle!(p.id) : undefined}
                className={`border-b border-border/60 ${
                  selectable
                    ? `cursor-pointer transition-colors hover:bg-muted/50 ${
                        isSelected ? 'bg-primary/5' : ''
                      }`
                    : ''
                }`}
              >
                {selectable && (
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle!(p.id)}
                      aria-label={`Seleccionar ${p.businessName}`}
                    />
                  </td>
                )}
                <td className="px-3 py-2 font-medium text-foreground">
                  {/* El nombre abre la ficha completa; el resto de la fila sigue
                      seleccionando, para no romper el flujo de asignar en lote. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetalle(p);
                    }}
                    className="text-left font-medium text-foreground hover:text-primary-deep hover:underline"
                  >
                    {p.businessName}
                  </button>
                  {/* Para una persona, el cargo y la empresa dicen más que
                      cualquier otra cosa, y son lo primero que se mira. */}
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground">
                    {labels.subtitulo === 'cargo' &&
                      [p.roleTitle, p.companyName].filter(Boolean).join(' · ')}
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
                </td>
                {showStatus && (
                  <td className="px-3 py-2">
                    {p.status ? (
                      <Badge tone={statusTone(p.status)}>{PROSPECT_STATUS_LABELS[p.status]}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                )}
                <td className="px-3 py-2">
                  {/* Sin `reasons`: la tabla de guardados lee de la base, y los
                      motivos se calculan durante la búsqueda y no se persisten.
                      La palabra sola ya es muchísimo más que el número pelado. */}
                  <QualityCell score={p.score} />
                </td>
                {col.contacto && (
                  <td className="px-3 py-2">
                    {/* Email, WhatsApp y redes juntos. El email es el que nunca
                        se mostraba, aunque se pague por buscarlo. */}
                    <ContactCell
                      email={p.email}
                      whatsappPhone={p.whatsappPhone}
                      instagram={p.instagram}
                      linkedin={p.linkedin}
                    />
                  </td>
                )}
                {col.audiencia && (
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatFollowers(p.audienceSize)}
                  </td>
                )}
                {col.audiencia && (
                <td className="px-3 py-2">
                  {p.audienceActivity ? (
                    <Badge tone={activityTone(p.audienceActivity)}>
                      {ACTIVITY_LABELS[p.audienceActivity]}
                    </Badge>
                  ) : p.enrichmentStatus && p.enrichmentStatus !== 'ok' ? (
                    <span
                      className="text-xs text-muted-foreground"
                      title={STATUS_HINT[p.enrichmentStatus]}
                    >
                      {STATUS_HINT[p.enrichmentStatus]}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin consultar</span>
                  )}
                </td>
                )}
                {showArea && (
                  <td className="px-3 py-2 text-muted-foreground">{p.area ?? '—'}</td>
                )}
                {showOwner && (
                  <td className="px-3 py-2 text-muted-foreground">{p.ownerName ?? '—'}</td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!hideHint && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {withInstagram > 0
              ? `${withInstagram} de ${prospects.length} tienen Instagram. Enriquecer trae seguidores y última publicación: sirve para separar una cuenta viva de una abandonada. Cada consulta se paga en Apify, así que conviene hacerlo solo sobre los que te interesan.`
              : 'Ninguno de estos prospectos tiene Instagram detectado, así que no hay nada que enriquecer.'}
          </span>
        </p>
      )}

      {detalle && (
        <ProspectDetail
          data={{
            nombre: detalle.businessName,
            kind: detalle.kind,
            source: detalle.source,
            roleTitle: detalle.roleTitle,
            companyName: detalle.companyName,
            address: detalle.address,
            area: detalle.area,
            email: detalle.email,
            phone: detalle.phone,
            whatsappPhone: detalle.whatsappPhone,
            website: detalle.website,
            instagram: detalle.instagram,
            linkedin: detalle.linkedin,
            mapsUrl: detalle.mapsUrl,
            rating: detalle.rating,
            reviewsCount: detalle.reviewsCount,
            photosCount: detalle.photosCount,
            hasOwnWebsite: detalle.hasOwnWebsite,
            audienceSize: detalle.audienceSize,
            audienceActivity: detalle.audienceActivity,
            bio: detalle.bio,
            score: detalle.score,
            sourceData: detalle.sourceData,
          }}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}
