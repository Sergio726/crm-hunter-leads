// Qué columnas mostrar según a QUIÉN se está mostrando — módulo PURO.
//
// El problema que resuelve: la tabla se escribió cuando la única fuente era
// Google Maps, así que la columna del nombre dice "Negocio" y hay columnas fijas
// de "Teléfono" y "Zona". Buscando personas en LinkedIn eso queda mal de dos
// maneras a la vez: **miente** (una persona no es un negocio, y LinkedIn no da
// teléfono, así que la columna sale vacía) y **esconde** lo que sí trajo — cargo,
// empresa, antigüedad, email y bio, que es justamente por lo que se pagó.
//
// La decisión tiene dos capas, y las dos importan:
//
//   1. La IDENTIDAD sale del tipo: un negocio se muestra distinto de una persona
//      o de una cuenta de red. Eso lo define la fuente y no cambia fila a fila.
//   2. Los DATOS salen de lo que realmente hay. Una columna se dibuja solo si
//      al menos una fila la tiene. Así no vuelve a aparecer una columna de
//      guiones cuando entre la próxima fuente, sin tener que acordarse de esto.

import type { ProspectKind } from './sources/catalog';

export interface KindLabels {
  /** Cómo se llama la columna del nombre. */
  nombre: string;
  /** Qué se muestra debajo del nombre. */
  subtitulo: 'direccion' | 'cargo';
  /** Texto del estado vacío, cuando todavía no se buscó. */
  vacio: string;
}

const POR_TIPO: Record<ProspectKind, KindLabels> = {
  business: {
    nombre: 'Negocio',
    subtitulo: 'direccion',
    vacio: 'negocios',
  },
  person: {
    nombre: 'Persona',
    subtitulo: 'cargo',
    vacio: 'personas',
  },
  account: {
    nombre: 'Cuenta',
    subtitulo: 'direccion',
    vacio: 'cuentas',
  },
};

export function labelsFor(kind: ProspectKind | undefined): KindLabels {
  return POR_TIPO[kind ?? 'business'];
}

/** Lo mínimo que una fila necesita tener para decidir qué columnas hay. */
export interface RowLike {
  kind?: ProspectKind;
  roleTitle?: string | null;
  companyName?: string | null;
  email?: string | null;
  whatsappPhone?: string | null;
  phone?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  area?: string | null;
  rating?: number | null;
  // `null` además de `undefined`: en la base la columna existe y puede venir
  // vacía. `algo()` los trata igual, así que la distinción no cambia nada acá.
  reviewsCount?: number | null;
  audienceSize?: number | null;
  audienceActivity?: string | null;
}

export interface VisibleColumns {
  /** Cargo y empresa, debajo del nombre. */
  cargo: boolean;
  /** Email, teléfono, redes: todo junto en una columna. */
  contacto: boolean;
  /** Señales de Google: web propia, rating, reseñas. */
  senales: boolean;
  zona: boolean;
  /** Seguidores y actividad, del enriquecimiento social. */
  audiencia: boolean;
}

const algo = <T>(filas: T[], tiene: (f: T) => unknown) => filas.some((f) => Boolean(tiene(f)));

/**
 * Qué columnas tienen sentido para ESTE conjunto de filas.
 *
 * Se mira el contenido y no solo la fuente: un negocio de Google enriquecido con
 * Instagram sí tiene audiencia, y uno recién buscado no. Preguntarle a los datos
 * es más barato que mantener una tabla de qué fuente da qué.
 */
export function visibleColumns(filas: RowLike[]): VisibleColumns {
  return {
    cargo: algo(filas, (f) => f.roleTitle ?? f.companyName),
    contacto: algo(filas, (f) => f.email ?? f.whatsappPhone ?? f.phone ?? f.instagram ?? f.linkedin),
    senales: algo(filas, (f) => f.rating ?? (f.reviewsCount ? f.reviewsCount : null)),
    zona: algo(filas, (f) => f.area),
    audiencia: algo(filas, (f) => f.audienceSize ?? f.audienceActivity),
  };
}
