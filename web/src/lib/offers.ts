// Las ofertas: qué vende el equipo, y a qué rubro le sirve cada una.
//
// Existe por un bug concreto: "qué vendés" era **una sola frase global**
// guardada en el navegador y compartida entre Prospección y Clientes. Si la
// última búsqueda había sido de inmobiliarias, esa oferta quedaba pegada y
// aparecía en el mensaje de un gimnasio. El vendedor tenía que acordarse de
// corregirla a mano en cada lead, y nadie le avisaba.
//
// Con varias ofertas guardadas, cada una declara para qué rubros sirve y el
// sistema elige sola la que corresponde al lead que se está mirando.
//
// Módulo puro a propósito —sin `server-only`—: lo usan los diálogos, que corren
// en el navegador, y también el servidor. La lectura va por `app_settings`, que
// cualquier autenticado puede leer y solo el superadmin escribir (`0001`).

import { NICHE_PACKS } from './prospect/niches';

/**
 * Qué rubro conocido nombran estas etiquetas, si alguna lo hace.
 *
 * Los clientes que vienen de una búsqueda llevan el rubro como primer tag
 * (`promote_prospects` copia rubro y zona), pero un importado puede tener
 * cualquier cosa: se ignora en silencio lo que no sea un pack conocido.
 */
export function rubroDeTags(tags: string[] | null | undefined): string | null {
  for (const tag of tags ?? []) {
    const limpio = tag.trim().toLowerCase();
    const pack = NICHE_PACKS.find((n) => n.id === limpio);
    if (pack && pack.id !== 'generico') return pack.id;
  }
  return null;
}

/** Una oferta guardada. `rubros` vacío = sirve para cualquier lead. */
export interface Offer {
  id: string;
  /** Cómo la reconoce el vendedor en el selector. */
  nombre: string;
  /** Lo que se le manda al modelo como "lo que vende el vendedor". */
  texto: string;
  /** Ids de `NICHE_PACKS` para los que aplica. Vacío = todos. */
  rubros: string[];
}

export const OFFERS_KEY = 'offers';

/** Mínimo para que una oferta sirva: menos que esto no dice nada. */
const MIN_TEXTO = 5;

/**
 * Lo guardado en la base no se confía: puede venir de una versión vieja, de una
 * edición a mano o de un JSON a medio escribir. Misma postura que
 * `normalizePermissions` en `permissions.ts`.
 */
export function normalizeOffers(value: unknown): Offer[] {
  if (!Array.isArray(value)) return [];
  const vistos = new Set<string>();
  const out: Offer[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as Record<string, unknown>;
    const texto = typeof o.texto === 'string' ? o.texto.trim() : '';
    if (texto.length < MIN_TEXTO) continue;
    const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : texto.slice(0, 24);
    if (vistos.has(id)) continue;
    vistos.add(id);
    out.push({
      id,
      nombre: typeof o.nombre === 'string' && o.nombre.trim() ? o.nombre.trim() : texto.slice(0, 40),
      texto,
      rubros: Array.isArray(o.rubros)
        ? o.rubros.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
        : [],
    });
  }
  return out;
}

/**
 * Cuál de las ofertas le corresponde a este lead.
 *
 * Es el corazón del arreglo: en vez de avisarle al vendedor que la oferta no
 * pega con el rubro, el sistema elige la que sí pega. Sin preguntar y sin
 * fricción — el vendedor abre un gimnasio y ve la oferta de gimnasios.
 *
 * 1. La que declara el rubro del lead.
 * 2. Si ninguna, la primera genérica (sin rubros declarados): sirve para todos.
 * 3. Si tampoco, la primera de la lista — algo es mejor que nada, y el vendedor
 *    puede cambiarla en el selector.
 */
export function elegirOferta(offers: Offer[], rubro: string | null): Offer | null {
  if (offers.length === 0) return null;
  if (rubro) {
    const propia = offers.find((o) => o.rubros.includes(rubro));
    if (propia) return propia;
  }
  return offers.find((o) => o.rubros.length === 0) ?? offers[0];
}

/** Un id nuevo, estable y legible. No hace falta que sea único en el mundo. */
export function nuevoOfferId(nombre: string, existentes: Offer[]): string {
  const base =
    nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'oferta';
  if (!existentes.some((o) => o.id === base)) return base;
  let n = 2;
  while (existentes.some((o) => o.id === `${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
