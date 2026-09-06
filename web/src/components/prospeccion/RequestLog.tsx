'use client';

import { Fragment, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FileSearch } from 'lucide-react';
import { SOURCES, type SourceId } from '@/lib/prospect/types';

/**
 * El historial de solicitudes: qué se pidió, qué volvió y por qué no.
 *
 * Existe porque un cero no se podía diagnosticar. La búsqueda de LinkedIn que
 * devolvió 0 tenía la causa en el log del actor de Apify y no quedaba en ningún
 * lado; reconstruirlo costó cuatro corridas de sondeo contra el proveedor.
 *
 * Lo que hace útil a esta pantalla es `provider_input`: es lo EXACTO que se le
 * mandó al proveedor. Sin eso no se puede separar "el filtro lo mató" de "el
 * proveedor no devolvió nada", que se arreglan de formas opuestas.
 */
export interface RequestLogRow {
  id: string;
  created_at: string;
  source: SourceId;
  job: string;
  outcome: 'ok' | 'empty' | 'provider_skipped' | 'error';
  returned_count: number;
  matched_count: number;
  filters: Record<string, unknown> | null;
  provider_input: Record<string, unknown> | null;
  discarded: Record<string, number> | null;
  relaxed: string | null;
  provider_status: string | null;
  provider_message: string | null;
  cost_usd: number | null;
  error: string | null;
  duration_ms: number | null;
  owner_name?: string | null;
}

const OUTCOME: Record<
  RequestLogRow['outcome'],
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; ayuda: string }
> = {
  ok: { label: 'Trajo resultados', tone: 'success', ayuda: '' },
  empty: {
    label: 'Sin resultados',
    tone: 'warning',
    // La distinción que importa: acá SÍ tiene sentido tocar los filtros.
    ayuda: 'Buscó de verdad y no encontró a nadie. Acá sí sirve aflojar los filtros.',
  },
  provider_skipped: {
    label: 'No llegó a buscar',
    tone: 'danger',
    ayuda:
      'El proveedor nunca ejecutó la búsqueda (tope del plan o sin crédito). ' +
      'Tocar los filtros no cambia nada.',
  },
  error: { label: 'Falló', tone: 'danger', ayuda: '' },
};

function cuando(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Lo que se pidió, en una línea legible. */
function pedido(filters: Record<string, unknown> | null): string {
  if (!filters) return '—';
  const f = filters as {
    areas?: string[];
    queries?: string[];
    limit?: number;
    linkedin?: { jobTitles?: string[] };
  };
  const que = f.linkedin?.jobTitles?.length ? f.linkedin.jobTitles : (f.queries ?? []);
  const partes = [que.slice(0, 3).join(', '), (f.areas ?? []).join(' · ')].filter(Boolean);
  return partes.length > 0 ? `${partes.join(' en ')} (hasta ${f.limit ?? '?'})` : '—';
}

export function RequestLog({ rows, showOwner }: { rows: RequestLogRow[]; showOwner?: boolean }) {
  const [abierta, setAbierta] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<FileSearch className="h-5 w-5" />}
        title="Todavía no hay búsquedas registradas"
        description="Cada búsqueda que se ejecute va a quedar acá, con lo que se pidió y lo que contestó el proveedor."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
            <th className="px-3 py-2 font-medium">Cuándo</th>
            <th className="px-3 py-2 font-medium">Fuente</th>
            <th className="px-3 py-2 font-medium">Qué se pidió</th>
            <th className="px-3 py-2 font-medium">Cómo salió</th>
            <th className="px-3 py-2 font-medium">Trajo</th>
            {showOwner && <th className="px-3 py-2 font-medium">Quién</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const o = OUTCOME[r.outcome];
            const open = abierta === r.id;
            return (
              // La key va en el Fragment: es el elemento que devuelve el map.
              <Fragment key={r.id}>
                <tr
                  onClick={() => setAbierta(open ? null : r.id)}
                  className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50"
                >
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {cuando(r.created_at)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{SOURCES[r.source]?.label ?? r.source}</td>
                  <td className="px-3 py-2 text-foreground">{pedido(r.filters)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={o.tone}>{o.label}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                    {r.returned_count}
                    {r.matched_count !== r.returned_count && ` / ${r.matched_count}`}
                  </td>
                  {showOwner && (
                    <td className="px-3 py-2 text-muted-foreground">{r.owner_name ?? '—'}</td>
                  )}
                </tr>
                {open && (
                  <tr className="border-b border-border/60 bg-muted/20">
                    <td colSpan={showOwner ? 6 : 5} className="px-3 py-3">
                      <div className="space-y-3 text-xs">
                        {o.ayuda && <p className="text-muted-foreground">{o.ayuda}</p>}
                        {r.error && <p className="text-foreground">{r.error}</p>}
                        {r.relaxed && (
                          <p className="text-muted-foreground">Se ensanchó: {r.relaxed}</p>
                        )}
                        {r.provider_message && (
                          <div>
                            <p className="mb-1 font-medium text-foreground">Dijo el proveedor</p>
                            {/* Crudo a propósito: es la evidencia. */}
                            <code className="block rounded bg-card px-2 py-1 break-all text-muted-foreground">
                              {r.provider_message}
                            </code>
                          </div>
                        )}
                        {r.provider_input && (
                          <div>
                            <p className="mb-1 font-medium text-foreground">
                              Lo que se le mandó al proveedor
                            </p>
                            <pre className="overflow-x-auto rounded bg-card px-2 py-1 text-muted-foreground">
                              {JSON.stringify(r.provider_input, null, 2)}
                            </pre>
                          </div>
                        )}
                        {r.discarded && Object.values(r.discarded).some((n) => n > 0) && (
                          <div>
                            <p className="mb-1 font-medium text-foreground">Descartes</p>
                            <code className="block rounded bg-card px-2 py-1 text-muted-foreground">
                              {Object.entries(r.discarded)
                                .filter(([, n]) => n > 0)
                                .map(([k, n]) => `${k}: ${n}`)
                                .join(' · ')}
                            </code>
                          </div>
                        )}
                        <p className="text-muted-foreground">
                          {r.cost_usd !== null && `US$ ${r.cost_usd} · `}
                          {r.duration_ms !== null && `${(r.duration_ms / 1000).toFixed(1)} s · `}
                          estado {r.provider_status ?? '—'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
