// Lo que comparten la ruta que arranca un trabajo y la que lo cosecha.
//
// Vive aparte porque las dos rutas corren en peticiones distintas, separadas por
// minutos: si el actor, los campos o el mapeo estuvieran duplicados, un cambio
// en una sola se manifestaría como resultados que no se aplican, en silencio.

import 'server-only';
import { classifyActivity, limpiar, type EnrichedProfile, type EnrichmentStatus } from './apify';

export const IG_ACTOR = 'apify~instagram-profile-scraper';

/**
 * Tope de perfiles por trabajo asíncrono.
 *
 * Ocho veces el tope síncrono (25). Ya no lo limita el tiempo de la petición
 * sino el sentido común: a US$ 0,0026 el perfil, 200 son 52 centavos.
 */
export const MAX_PROFILES_PER_ASYNC_RUN = 200;

/** Campos del dataset. Sin esto vienen los 12 posts y videos de cada cuenta. */
export const IG_FIELDS = [
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

export interface RawIgItem {
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
  latestPosts?: { timestamp?: string }[];
}

function latestPostDate(posts: { timestamp?: string }[] | undefined): string | null {
  const times = (posts ?? [])
    .map((p) => p.timestamp)
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .map((t) => new Date(t).getTime())
    .filter((t) => !Number.isNaN(t));
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

function empty(handle: string, status: EnrichmentStatus): EnrichedProfile {
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
 * Traduce lo que devolvió el dataset a un perfil por handle pedido.
 *
 * Se devuelve una entrada por cada handle, incluso los que no volvieron: sin eso
 * quedarían marcados como "sin consultar" para siempre y se pagarían de nuevo en
 * cada corrida.
 */
export function mapIgItems(handles: string[], items: RawIgItem[]): EnrichedProfile[] {
  const byUsername = new Map<string, RawIgItem>();
  for (const item of items ?? []) {
    const u = item.username?.toLowerCase();
    if (u) byUsername.set(u, item);
  }

  return handles.map((handle) => {
    const p = byUsername.get(handle);
    if (!p || p.error) return empty(handle, 'not_found');

    const shared = {
      followers: p.followersCount ?? null,
      follows: p.followsCount ?? null,
      postsCount: p.postsCount ?? null,
      // `limpiar` y no `?? null`: el actor devuelve a veces el TEXTO "None".
      // Verificado en una corrida real. Ver `apify.ts`.
      bio: limpiar(p.biography),
      isBusiness: p.isBusinessAccount ?? null,
      category: limpiar(p.businessCategoryName),
      verified: p.verified ?? null,
      externalUrl: limpiar(p.externalUrl),
    };

    if (p.private) return { ...empty(handle, 'private'), ...shared };

    const lastPostAt = latestPostDate(p.latestPosts);
    return {
      handle,
      status: 'ok' as const,
      ...shared,
      lastPostAt,
      activity: classifyActivity(lastPostAt),
    };
  });
}

/** El parche que se aplica a `prospects` con lo que trajo el perfil. */
export function patchForProfile(
  profile: EnrichedProfile,
  currentWebsite: string | null,
  enrichedAt: string,
): Record<string, unknown> {
  return {
    ig_followers: profile.followers,
    ig_posts_count: profile.postsCount,
    ig_last_post_at: profile.lastPostAt,
    ig_bio: profile.bio,
    ig_is_business: profile.isBusiness,
    ig_activity: profile.activity,
    audience_size: profile.followers,
    audience_activity: profile.activity,
    ...(profile.externalUrl && !currentWebsite ? { website: profile.externalUrl } : {}),
    source_data: {
      ig_verified: profile.verified,
      ig_category: profile.category,
      ig_follows: profile.follows,
      ig_external_url: profile.externalUrl,
    },
    enrichment_status: profile.status,
    enriched_at: enrichedAt,
  };
}
