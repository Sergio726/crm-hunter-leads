'use client';

import { AtSign, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { IG_ACTIVITY_LABELS, type SavedProspect } from '@/lib/prospect/types';

function activityTone(activity: SavedProspect['igActivity']): 'success' | 'warning' | 'danger' {
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

export function SavedProspects({ prospects }: { prospects: SavedProspect[] }) {
  const withInstagram = prospects.filter((p) => p.instagram).length;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Negocio</th>
              <th className="px-3 py-2 font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Instagram</th>
              <th className="px-3 py-2 font-medium">Seguidores</th>
              <th className="px-3 py-2 font-medium">Actividad</th>
            </tr>
          </thead>
          <tbody>
            {prospects.map((p) => (
              <tr key={p.id} className="border-b border-border/60">
                <td className="px-3 py-2 font-medium text-foreground">{p.businessName}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.score ?? '—'}</td>
                <td className="px-3 py-2">
                  {p.instagram ? (
                    <a
                      href={`https://instagram.com/${p.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
                    >
                      <AtSign className="h-3 w-3" />
                      {p.instagram}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatFollowers(p.igFollowers)}
                </td>
                <td className="px-3 py-2">
                  {p.igActivity ? (
                    <Badge tone={activityTone(p.igActivity)}>
                      {IG_ACTIVITY_LABELS[p.igActivity]}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {withInstagram > 0
            ? `${withInstagram} de ${prospects.length} tienen Instagram. Enriquecer trae seguidores y última publicación: sirve para separar una cuenta viva de una abandonada. Cada consulta se paga en Apify, así que conviene hacerlo solo sobre los que te interesan.`
            : 'Ninguno de estos prospectos tiene Instagram detectado, así que no hay nada que enriquecer.'}
        </span>
      </p>
    </div>
  );
}
