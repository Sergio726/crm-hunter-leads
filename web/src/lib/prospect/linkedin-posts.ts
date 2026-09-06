// La última publicación del perfil de LinkedIn — SOLO servidor.
//
// Es lo que más mejora un mensaje frío: referenciar algo que la persona
// escribió esta semana no se parece en nada a "vi tu perfil". El código del
// desafío de Nexum lo usa como pieza central y tiene razón.
//
// Actor `harvestapi/linkedin-profile-posts`, ~US$ 0,002 por post.
//
// Dos decisiones propias, distintas de cómo lo hacen ellos:
//
// 1. **Se guarda en `prospects`**, no se usa y se tira. Un post traído hoy
//    sirve para el primer mensaje, para el seguimiento de la semana que viene y
//    para la ficha del cliente cuando se promueva. Volver a pagarlo cada vez
//    sería tirar plata.
//
// 2. **Un post viejo no se ofrece.** Referenciar algo de hace ocho meses delata
//    el bot más que no referenciar nada: nadie comenta hoy una publicación de
//    otro semestre. Ver `POST_FRESCO_DIAS`.

import 'server-only';
import { ApifyError, apifyErrorFor } from './apify';

const POSTS_ACTOR = 'harvestapi~linkedin-profile-posts';
const APIFY_BASE = 'https://api.apify.com/v2/acts';

/** Tope de perfiles por corrida. Mismo criterio de tiempo que el resto. */
export const MAX_PERFILES_POR_CORRIDA = 20;

/** Techo de gasto por corrida, aplicado por Apify. */
export const MAX_COST_PER_RUN_USD = 1;

/** Lo que cobra el actor por post. Medido de la tabla de precios del desafío. */
export const COSTO_POR_POST_USD = 0.002;

/**
 * Hasta cuándo un post sirve para romper el hielo.
 *
 * Sesenta días es el límite de lo que una persona recuerda haber publicado. Más
 * viejo que eso, mencionarlo suena a que alguien revisó su historial — que es
 * exactamente la sensación que hay que evitar.
 */
export const POST_FRESCO_DIAS = 60;

export interface PostDePerfil {
  /** El slug pedido, para mapear de vuelta al prospecto. */
  linkedin: string;
  texto: string | null;
  fecha: string | null;
  url: string | null;
}

interface PostItem {
  // El actor cambió nombres entre versiones: se aceptan los dos.
  content?: string;
  text?: string;
  postedAt?: string;
  publishedAt?: string;
  postUrl?: string;
  url?: string;
  authorProfileUrl?: string;
  profileUrl?: string;
  linkedinUrl?: string;
}

export function costoDeTraerPosts(perfiles: number): number {
  return Math.max(0, perfiles) * COSTO_POR_POST_USD;
}

/** ¿Este post todavía sirve para mencionarlo? */
export function postEsFresco(fecha: string | null, hoy: Date = new Date()): boolean {
  if (!fecha) return false;
  const t = new Date(fecha).getTime();
  if (Number.isNaN(t)) return false;
  const dias = (hoy.getTime() - t) / 86_400_000;
  return dias >= 0 && dias <= POST_FRESCO_DIAS;
}

/** `in/juan-perez` → `https://www.linkedin.com/in/juan-perez` */
function urlDePerfil(slug: string): string {
  return `https://www.linkedin.com/${slug.replace(/^\/+/, '')}`;
}

/** Del texto crudo del post, lo que se le puede mostrar al modelo. */
export function recortarPost(texto: string | null | undefined, max = 400): string | null {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < 15) return null;
  if (t.length <= max) return t;
  // Se corta en la última oración completa que entre; si no hay ninguna, en la
  // última palabra. Un post cortado a mitad de palabra dentro del prompt hace
  // que el modelo lo complete inventando.
  const recorte = t.slice(0, max);
  const punto = Math.max(recorte.lastIndexOf('.'), recorte.lastIndexOf('!'), recorte.lastIndexOf('?'));
  if (punto > max / 2) return recorte.slice(0, punto + 1);
  return recorte.slice(0, recorte.lastIndexOf(' ')) + '…';
}

/** Del ítem del actor, el slug del perfil al que pertenece. */
export function slugDelItem(item: PostItem): string | null {
  const url = item.authorProfileUrl ?? item.profileUrl ?? item.linkedinUrl ?? '';
  const m = url.match(/linkedin\.com\/((?:in|company)\/[^/?#]+)/i);
  return m ? m[1] : null;
}

/**
 * Trae la última publicación propia de cada perfil.
 *
 * `maxPosts: 1` es la protección de gasto: un post por perfil, nunca más. Los
 * reposts y las citas van apagados porque un repost no dice nada de la persona
 * —no lo escribió— y mencionarlo como suyo es el tipo de error que arruina el
 * mensaje.
 */
export async function traerUltimosPosts(
  slugs: string[],
  apiToken: string,
): Promise<PostDePerfil[]> {
  const unicos = [...new Set(slugs.filter((s) => s && s.trim()))].slice(
    0,
    MAX_PERFILES_POR_CORRIDA,
  );
  if (unicos.length === 0) return [];

  const url = new URL(`${APIFY_BASE}/${POSTS_ACTOR}/run-sync-get-dataset-items`);
  url.searchParams.set('token', apiToken);
  url.searchParams.set('maxTotalChargeUsd', String(MAX_COST_PER_RUN_USD));

  let items: PostItem[];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrls: unicos.map(urlDePerfil),
        maxPosts: 1,
        includeReposts: false,
        includeQuotePosts: false,
      }),
      cache: 'no-store',
    });
    if (!res.ok) throw apifyErrorFor(res.status, await res.text().catch(() => ''));
    items = (await res.json()) as PostItem[];
  } catch (error) {
    if (error instanceof ApifyError) throw error;
    return unicos.map((linkedin) => ({ linkedin, texto: null, fecha: null, url: null }));
  }

  const porSlug = new Map<string, PostItem>();
  for (const item of items ?? []) {
    const slug = slugDelItem(item);
    if (slug && !porSlug.has(slug.toLowerCase())) porSlug.set(slug.toLowerCase(), item);
  }

  return unicos.map((linkedin) => {
    const item = porSlug.get(linkedin.toLowerCase());
    return {
      linkedin,
      texto: recortarPost(item?.content ?? item?.text),
      fecha: item?.postedAt ?? item?.publishedAt ?? null,
      url: item?.postUrl ?? item?.url ?? null,
    };
  });
}
