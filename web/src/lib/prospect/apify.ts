// Enriquecimiento de prospectos con datos reales de Instagram, vía Apify.
// SOLO servidor.
//
// Usa el mismo actor que el pipeline de clinicas-hunter
// (`apify/instagram-profile-scraper`), con `run-sync-get-dataset-items`: se
// manda la lista de handles y se espera el resultado en la misma llamada.
//
// Un run puede resolver varios handles a la vez, así que se enriquece en lote:
// es más barato y más rápido que un run por prospecto.

import 'server-only';

const APIFY_URL =
  'https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items';

/** Tope de perfiles por lote. Cada run se paga; esto evita una factura sorpresa. */
export const MAX_PROFILES_PER_RUN = 25;

/** Umbrales de "cuenta viva", en días desde la última publicación. */
const ACTIVE_DAYS = 60;
const WARM_DAYS = 180;

export type IgActivity = 'activo' | 'tibio' | 'dormido';
export type EnrichmentStatus = 'ok' | 'not_found' | 'private' | 'error';

export interface EnrichedProfile {
  handle: string;
  status: EnrichmentStatus;
  followers: number | null;
  postsCount: number | null;
  lastPostAt: string | null;
  bio: string | null;
  isBusiness: boolean | null;
  activity: IgActivity | null;
}

interface ApifyPost {
  timestamp?: string;
}

interface ApifyProfile {
  username?: string;
  followersCount?: number;
  postsCount?: number;
  biography?: string;
  isBusinessAccount?: boolean;
  private?: boolean;
  error?: string;
  latestPosts?: ApifyPost[];
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

function emptyResult(handle: string, status: EnrichmentStatus): EnrichedProfile {
  return {
    handle,
    status,
    followers: null,
    postsCount: null,
    lastPostAt: null,
    bio: null,
    isBusiness: null,
    activity: null,
  };
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

  let items: ApifyProfile[];
  try {
    const res = await fetch(`${APIFY_URL}?token=${encodeURIComponent(apiToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: unique }),
      cache: 'no-store',
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error('Apify rechazó el token. Revisalo en Configuración.');
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Apify respondió ${res.status}. ${detail.slice(0, 200)}`);
    }

    items = (await res.json()) as ApifyProfile[];
  } catch (error) {
    // Un fallo del run entero no debe romper el flujo: se devuelve todo como
    // error y el usuario puede reintentar sobre esos mismos prospectos.
    if (error instanceof Error && error.message.includes('Apify')) throw error;
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
    // Una cuenta privada devuelve el perfil pero sin publicaciones: se marca
    // aparte para no confundirla con una cuenta muerta.
    if (profile.private) {
      return {
        ...emptyResult(handle, 'private'),
        followers: profile.followersCount ?? null,
        postsCount: profile.postsCount ?? null,
        bio: profile.biography ?? null,
        isBusiness: profile.isBusinessAccount ?? null,
      };
    }

    const lastPostAt = latestPostDate(profile.latestPosts);
    return {
      handle,
      status: 'ok',
      followers: profile.followersCount ?? null,
      postsCount: profile.postsCount ?? null,
      lastPostAt,
      bio: profile.biography ?? null,
      isBusiness: profile.isBusinessAccount ?? null,
      activity: classifyActivity(lastPostAt),
    };
  });
}
