'use client';

import { Clock, Coins, MapPin, Target, Users } from 'lucide-react';
import { COUNTRIES, SOURCES, estimate, type ProspectFilters } from '@/lib/prospect/types';

/**
 * El Plan de Caza: qué se va a hacer, dónde, cuánto cuesta y cuánto tarda,
 * antes de gastar un peso.
 *
 * Hasta hace poco lo único que veía el usuario era un panel de filtros técnicos
 * (score mínimo, rating, banderitas) y un botón Buscar. Podía apretarlo sin
 * tener idea de que cada corrida son hasta 24 consultas facturadas.
 *
 * Las señales ahora se leen como frases, no como casillas: quién las eligió fue
 * Turbo, a partir de lo que el vendedor vende, y lo que el vendedor necesita es
 * **entender qué se va a excluir** y poder sacarlo de un toque. Un filtro que no
 * se entiende es la forma más silenciosa de terminar con cero resultados.
 */

/** Cuántas unidades facturadas va a consumir, como techo. */
function unitsFor(filters: ProspectFilters): number {
  if (filters.source === 'google_places') {
    // Cada zona × término puede pedir hasta 3 páginas; el tope de la corrida
    // manda por encima. Mismo cálculo que el runner del servidor.
    const combos = Math.max(1, filters.areas.length) * Math.max(1, filters.queries.length);
    return Math.min(24, combos * 3);
  }
  if (filters.source === 'instagram') return filters.limit * 6;
  return filters.limit;
}

interface Signal {
  /** La frase, tal como la lee el vendedor. */
  texto: string;
  /** Qué apagar si la quiere sacar. */
  campo: keyof ProspectFilters;
  valor: boolean | null;
}

/**
 * Las señales activas, en castellano y solo las de la fuente que corresponde.
 *
 * Antes se mostraban siempre las de Google: buscando personas en LinkedIn, el
 * panel pedía "sin web propia" y "rating mínimo", que para una persona no
 * significan nada.
 */
function signalsFor(filters: ProspectFilters): Signal[] {
  if (filters.source !== 'google_places') {
    const li = filters.linkedin;
    const señales: Signal[] = [];
    if (li?.jobTitles?.length) {
      señales.push({
        texto: `Solo cargos como ${li.jobTitles.join(' o ')}`,
        campo: 'linkedin',
        valor: null,
      });
    }
    if (li?.industries?.length) {
      señales.push({ texto: `En ${li.industries.join(' o ')}`, campo: 'linkedin', valor: null });
    }
    return señales;
  }

  const señales: Signal[] = [];
  if (filters.requireNoWebsite) {
    señales.push({
      texto: 'Solo negocios sin web propia',
      campo: 'requireNoWebsite',
      valor: false,
    });
  }
  if (filters.requireWhatsapp) {
    señales.push({
      texto: 'Que el teléfono sea celular, para WhatsApp',
      campo: 'requireWhatsapp',
      valor: false,
    });
  }
  if (filters.requireInstagram) {
    señales.push({ texto: 'Que tengan Instagram', campo: 'requireInstagram', valor: false });
  }
  if (filters.requireLinkedin) {
    señales.push({
      // Se dice el riesgo acá y no después: es la señal que en Google devuelve
      // cero prácticamente siempre.
      texto: 'Que tengan LinkedIn — ojo, en Google casi ninguno lo publica',
      campo: 'requireLinkedin',
      valor: false,
    });
  }
  if (filters.minRating !== null) {
    señales.push({
      texto: `Calificación de ${filters.minRating} o más en Google`,
      campo: 'minRating',
      valor: null,
    });
  }
  return señales;
}

export function HuntPlan({
  filters,
  icpSummary,
  reason,
  remainingUsd,
  onChange,
}: {
  filters: ProspectFilters;
  icpSummary?: string | null;
  /** Por qué Turbo eligió esta fuente. */
  reason?: string | null;
  /** Saldo de Apify. Prometer un costo sin decir cuánto queda es media verdad. */
  remainingUsd?: number | null;
  onChange?: (next: ProspectFilters) => void;
}) {
  const source = SOURCES[filters.source];
  const est = estimate(filters.source, unitsFor(filters));
  const zonas = filters.areas.length > 0 ? filters.areas.join(' · ') : 'sin zona definida';
  const señales = signalsFor(filters);

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
      // El saldo va PEGADO al costo: prometer "sale US$ 0,12" sin decir que el
      // mes tiene un techo y que puede estar por agotarse es media verdad.
      value:
        typeof remainingUsd === 'number'
          ? `${est.costLabel} · quedan US$ ${remainingUsd.toFixed(2)} este mes`
          : est.costLabel,
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

      {reason && <p className="mt-2 text-xs text-muted-foreground italic">{reason}</p>}

      {señales.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="mb-1.5 text-xs text-muted-foreground">Además, exijo que:</p>
          <ul className="space-y-1 text-sm">
            {señales.map((s) => (
              <li key={s.texto} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-foreground">· {s.texto}</span>
                {onChange && s.campo !== 'linkedin' && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...filters, [s.campo]: s.valor })}
                    className="text-xs text-primary-deep hover:underline"
                  >
                    sacar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Que no entre en el presupuesto es la única advertencia que frena. */}
      {typeof remainingUsd === 'number' && est.costUsd > remainingUsd && (
        <p className="mt-2 rounded bg-warning/10 px-2 py-1.5 text-xs text-warning">
          ⚠️ Esta búsqueda puede no entrar en lo que queda del mes. Bajá la cantidad o esperá a que
          se renueve el ciclo.
        </p>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        El costo es un techo: casi siempre sale menos. Podés editar todo abajo antes de aprobar.
      </p>
    </div>
  );
}
