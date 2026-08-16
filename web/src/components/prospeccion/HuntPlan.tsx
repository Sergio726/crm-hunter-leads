'use client';

import { Clock, Coins, MapPin, Target, Users } from 'lucide-react';
import { COUNTRIES, SOURCES, estimate, type ProspectFilters } from '@/lib/prospect/types';

/**
 * El Plan de Caza: qué se va a hacer, dónde, cuánto cuesta y cuánto tarda,
 * antes de gastar un peso.
 *
 * Hasta ahora lo único que veía el usuario era un panel de filtros técnicos
 * (score mínimo, rating, banderitas) y un botón Buscar. Podía apretarlo sin
 * tener idea de que cada corrida son hasta 24 consultas facturadas.
 *
 * El costo se muestra como TECHO, no como promedio: prometer poco y gastar más
 * sería peor que no mostrar nada.
 */

/** Cuántas consultas facturadas va a consumir esta búsqueda, como techo. */
function unitsFor(filters: ProspectFilters): number {
  if (filters.source === 'google_places') {
    // Cada zona × término puede pedir hasta 3 páginas; el tope de la corrida
    // manda por encima. Mismo cálculo que el runner del servidor.
    const combos = Math.max(1, filters.areas.length) * Math.max(1, filters.queries.length);
    return Math.min(24, combos * 3);
  }
  return filters.limit;
}

export function HuntPlan({ filters, icpSummary }: { filters: ProspectFilters; icpSummary?: string | null }) {
  const source = SOURCES[filters.source];
  const est = estimate(filters.source, unitsFor(filters));
  const zonas = filters.areas.length > 0 ? filters.areas.join(' · ') : 'sin zona definida';

  const rows = [
    {
      icon: <Target className="h-3.5 w-3.5" aria-hidden="true" />,
      label: 'A quién',
      value: icpSummary ?? filters.queries.slice(0, 3).join(', ') ?? 'sin definir',
    },
    {
      icon: <MapPin className="h-3.5 w-3.5" aria-hidden="true" />,
      label: 'Dónde',
      value: `${source.label} · ${zonas} (${COUNTRIES[filters.country].name})`,
    },
    {
      icon: <Users className="h-3.5 w-3.5" aria-hidden="true" />,
      label: 'Cuántos',
      value: `hasta ${filters.limit}`,
    },
    {
      icon: <Coins className="h-3.5 w-3.5" aria-hidden="true" />,
      label: 'Cuánto cuesta',
      value: est.costLabel,
    },
    {
      icon: <Clock className="h-3.5 w-3.5" aria-hidden="true" />,
      label: 'Cuánto tarda',
      value: est.timeLabel,
    },
  ];

  return (
    <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3">
      <p className="eyebrow mb-2 text-muted-foreground">/ plan de caza</p>
      <dl className="grid gap-1.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[7.5rem_1fr] items-start gap-2">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {r.icon}
              {r.label}
            </dt>
            <dd className="text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        Podés editar cualquier filtro de abajo antes de aprobar. El costo es un techo: casi siempre
        sale menos.
      </p>
    </div>
  );
}
