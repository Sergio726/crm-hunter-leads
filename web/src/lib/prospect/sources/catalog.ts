// Catálogo de fuentes de prospección — módulo PURO.
//
// Sin `server-only` a propósito: la interfaz necesita los rótulos, el criterio
// de cuándo usar cada fuente y la estimación de costo para dibujar el Plan de
// Caza. Los ejecutores viven en `sources/index.ts`, que sí es server-only.
//
// Precios verificados en la documentación de cada proveedor (agosto 2026). Están
// acá y en un solo lugar porque el Plan de Caza le promete un número al usuario
// antes de gastar: si el precio vive duplicado, la promesa se desactualiza.

/** De dónde salió el prospecto. Coincide con el CHECK de `prospects.source`. */
export type SourceId = 'google_places' | 'linkedin' | 'instagram' | 'tiktok' | 'import';

/** Qué clase de cosa es el prospecto. Coincide con el CHECK de `prospects.kind`. */
export type ProspectKind = 'business' | 'person' | 'account';

export interface SourceMeta {
  id: SourceId;
  /** Nombre para el usuario. */
  label: string;
  kind: ProspectKind;
  /** Criterio para que Turbo elija. Se inyecta en su instrucción. */
  whenToUse: string;
  /** Qué cuenta como una unidad facturada, en singular. */
  unit: string;
  /** Precio por unidad, en dólares. */
  costPerUnitUsd: number;
  /** Si se puede buscar con ella, o solo enriquecer / importar. */
  searchable: boolean;
  /** Segundos estimados por unidad, para avisar cuánto va a tardar. */
  secondsPerUnit: number;
}

export const SOURCES: Record<SourceId, SourceMeta> = {
  google_places: {
    id: 'google_places',
    label: 'Google Maps',
    kind: 'business',
    whenToUse:
      'negocios con local a la calle, o cuando importa la cercanía geográfica: ' +
      'comercios, consultorios, inmobiliarias, talleres. Es la única fuente que ' +
      'sabe dirección, teléfono y reputación por reseñas.',
    unit: 'consulta',
    // US$ 40 por cada 1.000 consultas: es el escalón "Enterprise + Atmosphere",
    // en el que caemos por pedir las reseñas. Cada consulta trae hasta 20
    // negocios. Las primeras 1.000 consultas del mes son gratis.
    costPerUnitUsd: 0.04,
    searchable: true,
    secondsPerUnit: 1.5,
  },
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    kind: 'person',
    whenToUse:
      'personas por su cargo o su empresa: venta B2B, mentorías, servicios ' +
      'profesionales, software. Es la única fuente que sabe a qué se dedica ' +
      'alguien y en qué empresa. No sirve para comercios de barrio.',
    unit: 'perfil',
    // US$ 0,10 por página de 25 perfiles.
    costPerUnitUsd: 0.004,
    searchable: true,
    secondsPerUnit: 2,
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    kind: 'account',
    whenToUse:
      'marcas de consumo, creadores y negocios que viven de su vidriera visual: ' +
      'gastronomía, moda, estética, fitness. Dice si la cuenta está viva.',
    unit: 'perfil',
    costPerUnitUsd: 0.0026,
    searchable: true,
    secondsPerUnit: 2,
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    kind: 'account',
    whenToUse:
      'audiencia joven y contenido corto. Mercado más chico para venta B2B, ' +
      'así que conviene solo si el usuario lo pide o su cliente vive ahí.',
    unit: 'perfil',
    costPerUnitUsd: 0.0003,
    searchable: true,
    secondsPerUnit: 1.5,
  },
  import: {
    id: 'import',
    label: 'Importado',
    kind: 'business',
    whenToUse: 'no se busca: son leads cargados desde una planilla.',
    unit: 'fila',
    costPerUnitUsd: 0,
    searchable: false,
    secondsPerUnit: 0,
  },
};

/** Las fuentes con las que sí se puede salir a buscar. */
export const SEARCHABLE_SOURCES = Object.values(SOURCES).filter((s) => s.searchable);

export interface Estimate {
  /** Cuántas unidades facturadas, como TECHO y no como promedio. */
  units: number;
  costUsd: number;
  seconds: number;
  /** Texto listo para mostrar, ej. "hasta US$ 0,96". */
  costLabel: string;
  timeLabel: string;
}

/** Redondeo a dos decimales sin notación científica. */
function money(value: number): string {
  if (value === 0) return 'gratis';
  if (value < 0.01) return 'menos de US$ 0,01';
  return `US$ ${value.toFixed(2).replace('.', ',')}`;
}

function duration(seconds: number): string {
  if (seconds < 60) return `~${Math.max(5, Math.round(seconds))} segundos`;
  const min = Math.round(seconds / 60);
  return `~${min} ${min === 1 ? 'minuto' : 'minutos'}`;
}

/**
 * Estimación para el Plan de Caza.
 *
 * Se calcula como TECHO, no como promedio: prometer poco y gastar más sería
 * exactamente el problema que este plan viene a resolver. Para Google se cuenta
 * en consultas facturadas (cada una trae hasta 20 negocios); para el resto, en
 * perfiles.
 */
export function estimate(source: SourceId, units: number): Estimate {
  const meta = SOURCES[source];
  const safeUnits = Math.max(0, Math.round(units));
  const costUsd = safeUnits * meta.costPerUnitUsd;
  const seconds = safeUnits * meta.secondsPerUnit;
  return {
    units: safeUnits,
    costUsd,
    seconds,
    costLabel: costUsd === 0 ? 'gratis' : `hasta ${money(costUsd)}`,
    timeLabel: duration(seconds),
  };
}

// --- Calificación -----------------------------------------------------------
// El puntaje crudo no le dice nada a nadie: "72" no significa bueno ni malo
// hasta que se sabe contra qué se compara. La palabra sí. Cada fuente calcula
// su score con sus propios factores, pero todas terminan en esta misma escala,
// que es lo que permite mirar una lista mezclada.

export type Grade = 'muy_bueno' | 'bueno' | 'regular' | 'flojo';

export const GRADE_LABELS: Record<Grade, string> = {
  muy_bueno: 'Muy bueno',
  bueno: 'Bueno',
  regular: 'Regular',
  flojo: 'Flojo',
};

export function gradeFor(score: number | null): Grade | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= 75) return 'muy_bueno';
  if (score >= 55) return 'bueno';
  if (score >= 35) return 'regular';
  return 'flojo';
}

/**
 * Qué mide el puntaje en cada fuente. Se muestra en el "¿qué es esto?" de la
 * tabla: el mismo número significa cosas distintas según de dónde vino el lead.
 */
export const SCORE_EXPLANATION: Record<SourceId, string> = {
  google_places:
    'Mide qué tan trabajable se ve el negocio en Google: cuántas fotos tiene, ' +
    'cuántas reseñas, qué calificación, si se le detectó Instagram y si las ' +
    'reseñas son recientes (señal de que sigue abierto).',
  linkedin:
    'Mide qué tan cerca está la persona del avatar que definiste: si el cargo ' +
    'coincide, cuánta antigüedad tiene en él y el tamaño de su empresa.',
  instagram:
    'Mide qué tan viva está la cuenta: tamaño de la audiencia, con qué ' +
    'frecuencia publica y si es una cuenta de empresa.',
  tiktok:
    'Mide qué tan viva está la cuenta: tamaño de la audiencia y con qué ' +
    'frecuencia publica.',
  import: 'Viene calculado en la planilla de origen.',
};
