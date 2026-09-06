// Enriquecimiento de prospectos con datos reales de Instagram, vía Apify.
// SOLO servidor.
//
// Usa el actor `apify/instagram-profile-scraper` con `run-sync-get-dataset-items`:
// se manda la lista de handles y se espera el resultado en la misma llamada.
//
// Un run puede resolver varios handles a la vez, así que se enriquece en lote:
// es más barato y más rápido que un run por prospecto.
//
// Precio real (documentación de Apify, ago-2026): US$ 1,60 a 2,60 por cada 1.000
// perfiles según el plan. Es decir, centavos. El límite que importa no es el
// dinero sino el tiempo: esta llamada muere a los 300 segundos.

import 'server-only';

const APIFY_BASE = 'https://api.apify.com/v2/acts';
const IG_ACTOR = 'apify~instagram-profile-scraper';

/**
 * Tope de perfiles por lote.
 *
 * No es un tope de gasto — para eso está `MAX_COST_PER_RUN_USD`, que lo aplica
 * el servidor de Apify. Es un tope de TIEMPO: la llamada síncrona se corta a los
 * 300 s y encima Vercel corta a los 60 s en el plan Hobby. La Fase 3 del plan
 * (ejecución asíncrona) es la que levanta este techo de verdad.
 */
export const MAX_PROFILES_PER_RUN = 25;

/**
 * Techo de gasto por corrida, en dólares, aplicado por Apify y no por nosotros.
 * A US$ 0,0026 el perfil, US$ 1 son ~385 perfiles: nunca se alcanza en una
 * corrida normal, y frena en seco cualquier bucle accidental.
 */
export const MAX_COST_PER_RUN_USD = 1;

/** Umbrales de "cuenta viva", en días desde la última publicación. */
const ACTIVE_DAYS = 60;
const WARM_DAYS = 180;

/**
 * Campos que pedimos del dataset.
 *
 * Sin esto el actor devuelve además `relatedProfiles`, `latestIgtvVideos` y los
 * 12 posts completos de cada perfil — la propia documentación advierte que el
 * resultado "puede volverse extenso". Pedir solo lo que se usa hace la respuesta
 * mucho más liviana, que es justo lo que evita el timeout.
 */
const IG_FIELDS = [
  'username',
  'followersCount',
  'followsCount',
  'postsCount',
  'biography',
  'isBusinessAccount',
  'businessCategoryName',
  'verified',
  'externalUrl',
  'private',
  'error',
  'latestPosts',
].join(',');

export type IgActivity = 'activo' | 'tibio' | 'dormido';
export type EnrichmentStatus = 'ok' | 'not_found' | 'private' | 'error';

export interface EnrichedProfile {
  handle: string;
  status: EnrichmentStatus;
  followers: number | null;
  follows: number | null;
  postsCount: number | null;
  lastPostAt: string | null;
  bio: string | null;
  isBusiness: boolean | null;
  /** Rubro que la cuenta declara ("Real Estate Agency"). */
  category: string | null;
  /** Tilde azul. */
  verified: boolean | null;
  /** El sitio que la cuenta linkea en la bio — Google no lo conoce. */
  externalUrl: string | null;
  activity: IgActivity | null;
}

interface ApifyPost {
  timestamp?: string;
}

interface ApifyProfile {
  username?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  biography?: string;
  isBusinessAccount?: boolean;
  businessCategoryName?: string;
  verified?: boolean;
  externalUrl?: string;
  private?: boolean;
  error?: string;
  latestPosts?: ApifyPost[];
}

/** `credit` y `token` los arregla el usuario; `timeout` y `upstream`, no. */
export type ApifyErrorReason = 'token' | 'credit' | 'timeout' | 'upstream';

/** Un fallo de Apify que quien llama puede querer distinguir. */
export class ApifyError extends Error {
  // Campo declarado y asignado a mano, en vez de una propiedad de constructor:
  // esa azúcar de TypeScript no la soporta el lector de tipos de Node, que es
  // con el que corren los tests.
  readonly reason: ApifyErrorReason;

  constructor(message: string, reason: ApifyErrorReason) {
    super(message);
    this.name = 'ApifyError';
    this.reason = reason;
  }
}

/** Clasifica la cuenta según cuán reciente es su última publicación. */
export function classifyActivity(lastPostAt: string | null): IgActivity {
  if (!lastPostAt) return 'dormido';
  const days = (Date.now() - new Date(lastPostAt).getTime()) / 86_400_000;
  if (Number.isNaN(days)) return 'dormido';
  if (days <= ACTIVE_DAYS) return 'activo';
  if (days <= WARM_DAYS) return 'tibio';
  return 'dormido';
}

/** Fecha de la publicación más reciente del perfil. */
function latestPostDate(posts: ApifyPost[] | undefined): string | null {
  const timestamps = (posts ?? [])
    .map((p) => p.timestamp)
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .map((t) => new Date(t).getTime())
    .filter((t) => !Number.isNaN(t));
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

/**
 * El actor devuelve a veces el TEXTO "None" en vez de dejar el campo vacío
 * (se le escapa el `None` de Python). Sin esto guardaríamos el rubro de una
 * cuenta como la palabra "None" y se mostraría tal cual en la tabla.
 * Confirmado en una corrida real: @agogebox_ devolvió `businessCategoryName: "None"`.
 */
export function limpiar(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v || v === 'None' || v === 'null' || v === 'undefined') return null;
  return v;
}

function emptyResult(handle: string, status: EnrichmentStatus): EnrichedProfile {
  return {
    handle,
    status,
    followers: null,
    follows: null,
    postsCount: null,
    lastPostAt: null,
    bio: null,
    isBusiness: null,
    category: null,
    verified: null,
    externalUrl: null,
    activity: null,
  };
}

/**
 * Traduce la respuesta HTTP de Apify a un error que se entienda.
 *
 * El 408 merece trato aparte: la conexión se corta pero **el run sigue
 * corriendo del lado de Apify y se factura igual**. Reintentar a ciegas paga dos
 * veces por el mismo trabajo, así que el mensaje lo dice.
 */
export function apifyErrorFor(status: number, detail: string): ApifyError {
  if (status === 401 || status === 403) {
    return new ApifyError('Apify rechazó el token. Revisalo en Configuración.', 'token');
  }
  if (status === 402) {
    return new ApifyError(
      'La cuenta de Apify se quedó sin crédito. Cargá saldo para seguir enriqueciendo.',
      'credit',
    );
  }
  if (status === 408) {
    return new ApifyError(
      'Apify tardó más de lo permitido. El trabajo sigue corriendo de su lado y se cobra igual, ' +
        'así que conviene esperar y revisar antes de reintentar: volver a lanzarlo lo paga dos veces.',
      'timeout',
    );
  }
  return new ApifyError(`Apify respondió ${status}. ${detail.slice(0, 200)}`, 'upstream');
}

/**
 * Enriquece hasta MAX_PROFILES_PER_RUN handles en un solo run de Apify.
 *
 * Devuelve una entrada por handle pedido, incluso para los que fallaron: quien
 * llama necesita poder marcar el prospecto como intentado y no reintentarlo en
 * loop. Un handle que Apify no devuelve se reporta como `not_found`.
 */
export async function enrichInstagramProfiles(
  handles: string[],
  apiToken: string,
): Promise<EnrichedProfile[]> {
  const unique = [...new Set(handles.map((h) => h.trim().toLowerCase()).filter(Boolean))].slice(
    0,
    MAX_PROFILES_PER_RUN,
  );
  if (unique.length === 0) return [];

  // Los topes van como parámetros de Apify, no como lógica nuestra: los aplica
  // su servidor, así que valen aunque nuestro código tenga un error.
  const url = new URL(`${APIFY_BASE}/${IG_ACTOR}/run-sync-get-dataset-items`);
  url.searchParams.set('token', apiToken);
  url.searchParams.set('fields', IG_FIELDS);
  url.searchParams.set('maxItems', String(unique.length));
  url.searchParams.set('maxTotalChargeUsd', String(MAX_COST_PER_RUN_USD));

  let items: ApifyProfile[];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: unique }),
      cache: 'no-store',
    });

    if (!res.ok) {
      throw apifyErrorFor(res.status, await res.text().catch(() => ''));
    }

    items = (await res.json()) as ApifyProfile[];
  } catch (error) {
    // Los errores de Apify se propagan con su motivo; una caída de red no debe
    // romper el flujo: se devuelve todo como error y se puede reintentar.
    if (error instanceof ApifyError) throw error;
    return unique.map((h) => emptyResult(h, 'error'));
  }

  const byHandle = new Map<string, ApifyProfile>();
  for (const item of items ?? []) {
    const username = item.username?.toLowerCase();
    if (username) byHandle.set(username, item);
  }

  return unique.map((handle) => {
    const profile = byHandle.get(handle);
    if (!profile) return emptyResult(handle, 'not_found');
    if (profile.error) return emptyResult(handle, 'not_found');

    // Datos que vienen en el mismo resultado ya facturado, con o sin perfil
    // público: descartarlos es pagar y tirar.
    const shared = {
      followers: profile.followersCount ?? null,
      follows: profile.followsCount ?? null,
      postsCount: profile.postsCount ?? null,
      bio: limpiar(profile.biography),
      isBusiness: profile.isBusinessAccount ?? null,
      category: limpiar(profile.businessCategoryName),
      verified: profile.verified ?? null,
      externalUrl: limpiar(profile.externalUrl),
    };

    // Una cuenta privada devuelve el perfil pero sin publicaciones: se marca
    // aparte para no confundirla con una cuenta muerta.
    if (profile.private) {
      return { ...emptyResult(handle, 'private'), ...shared };
    }

    const lastPostAt = latestPostDate(profile.latestPosts);
    return {
      handle,
      status: 'ok' as const,
      ...shared,
      lastPostAt,
      activity: classifyActivity(lastPostAt),
    };
  });
}
