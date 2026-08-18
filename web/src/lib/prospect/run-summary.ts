// Qué pasó en una búsqueda, contado como se lo cuenta a una persona.
//
// Módulo PURO: lo usan las dos puntas. La interfaz lo dibuja como informe
// después de la corrida, y el chat se lo inyecta a Turbo para que pueda
// diagnosticar en vez de decir "no encontré nada".
//
// El problema que resuelve: hoy una corrida que trae menos de lo prometido se ve
// EXACTAMENTE IGUAL que una que salió perfecta. Si pedís 50 y trae 44, la
// pantalla muestra 44 y se calla. El que tuvo que decir "faltan 6 y este es el
// motivo" fue una persona mirando los números a mano.

import { SOURCES, type SourceId } from './sources/catalog';

export interface DiscardCounts {
  withWebsite: number;
  noInstagram: number;
  noLinkedin: number;
  noWhatsapp: number;
  lowRating: number;
  excludedName: number;
}

export interface RunFacts {
  source: SourceId;
  /** Cuántos pidió el vendedor. */
  requested: number;
  /** Cuántos terminó recibiendo. */
  returned: number;
  /** Cuántos candidatos pasaron los filtros antes de recortar al límite. */
  totalMatched: number;
  discarded: DiscardCounts;
  requestsUsed: number;
  truncated: boolean;
}

/** Cuánto se descartó en total, por cualquier motivo. */
export function totalDiscarded(d: DiscardCounts): number {
  return Object.values(d).reduce((a, b) => a + b, 0);
}

const MOTIVOS: { campo: keyof DiscardCounts; texto: string }[] = [
  { campo: 'noLinkedin', texto: 'no publican LinkedIn' },
  { campo: 'withWebsite', texto: 'ya tienen web propia' },
  { campo: 'noInstagram', texto: 'no se les detectó Instagram' },
  { campo: 'noWhatsapp', texto: 'su teléfono no parece celular' },
  { campo: 'lowRating', texto: 'quedaron bajo el rating mínimo' },
  { campo: 'excludedName', texto: 'son de otro rubro' },
];

/** El motivo de descarte que se llevó más puestos. */
export function topDiscard(d: DiscardCounts): { texto: string; n: number } | null {
  const conteo = MOTIVOS.map((m) => ({ ...m, n: d[m.campo] })).filter((m) => m.n > 0);
  if (conteo.length === 0) return null;
  const peor = conteo.reduce((a, b) => (b.n > a.n ? b : a));
  return { texto: peor.texto, n: peor.n };
}

export interface RunSummary {
  /** El titular: qué se pidió y qué llegó. */
  headline: string;
  /** Por qué faltaron, cuando faltaron. `null` si vino completa. */
  shortfall: string | null;
  /** Detalle del embudo, una línea por motivo con descartes. */
  detail: string[];
  /** true cuando el proveedor no devolvió nada y NO fue por nuestros filtros. */
  providerEmpty: boolean;
}

/**
 * El resumen de una corrida.
 *
 * La distinción que importa: **vacío por filtros** no es lo mismo que **vacío
 * porque el proveedor no devolvió nada**. Se reconocen porque en el segundo caso
 * todos los descartes están en cero — fue exactamente lo que permitió descubrir
 * que una búsqueda de LinkedIn fallaba por la zona y no por las señales.
 */
export function summarizeRun(facts: RunFacts): RunSummary {
  const { requested, returned, totalMatched, discarded } = facts;
  const descartados = totalDiscarded(discarded);
  const providerEmpty = returned === 0 && totalMatched === 0 && descartados === 0;

  const headline =
    returned >= requested
      ? `Pediste ${requested} y traje ${returned}.`
      : `Pediste ${requested} y traje ${returned}.`;

  let shortfall: string | null = null;
  if (providerEmpty) {
    shortfall =
      facts.source === 'linkedin'
        ? 'No fue por tus filtros: no descarté a nadie. LinkedIn no devolvió a nadie, y eso casi ' +
          'siempre es la zona — es coincidencia exacta, tiene que ser un lugar tal cual, como ' +
          '"Colombia" o "Bogotá".'
        : 'No fue por tus filtros: no descarté a nadie. El proveedor no devolvió resultados para ' +
          'esa consulta. Probá con otra zona o con otros términos.';
  } else if (returned < requested) {
    const peor = topDiscard(discarded);
    if (peor) {
      shortfall = `Faltaron ${requested - returned}. El filtro que más descartó: ${peor.n} porque ${peor.texto}.`;
    } else if (facts.truncated) {
      shortfall = `Faltaron ${requested - returned}: se alcanzó el tope de consultas por corrida y quedaron zonas sin recorrer.`;
    } else {
      shortfall = `Faltaron ${requested - returned}: la fuente no tenía más que coincidieran.`;
    }
  }

  const detail = MOTIVOS.map((m) => ({ ...m, n: discarded[m.campo] }))
    .filter((m) => m.n > 0)
    .map((m) => `${m.n} ${m.texto}`);

  return { headline, shortfall, detail, providerEmpty };
}

/**
 * El mismo resumen, en una línea, para inyectárselo a Turbo.
 *
 * Se le dan los números crudos además del texto: la interpretación la hace él,
 * pero necesita el dato exacto para no inventar.
 */
export function describeRunForAgent(facts: RunFacts, costUsd?: number | null): string {
  const s = summarizeRun(facts);
  const partes = [
    `fuente ${SOURCES[facts.source].label}`,
    `pedidos ${facts.requested}`,
    `devueltos ${facts.returned}`,
    `descartados ${totalDiscarded(facts.discarded)}`,
  ];
  if (s.detail.length > 0) partes.push(`(${s.detail.join(', ')})`);
  if (facts.requestsUsed > 0) partes.push(`${facts.requestsUsed} consultas facturadas`);
  if (typeof costUsd === 'number') partes.push(`costó US$ ${costUsd.toFixed(2)}`);
  if (s.providerEmpty) partes.push('EL PROVEEDOR NO DEVOLVIÓ NADA y ningún filtro descartó');
  return partes.join(' · ');
}
