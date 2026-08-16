// Instagram como fuente de DESCUBRIMIENTO — SOLO servidor.
//
// Distinto del enriquecimiento (`apify.ts`): allá partimos de un handle que ya
// teníamos; acá buscamos cuentas que todavía no conocemos, por palabra clave.
//
// Actor `apify/instagram-scraper` con `searchType: "profile"`. Ojo con la forma
// de la respuesta: el actor devuelve **una fila por publicación**, con los datos
// del dueño repetidos en cada una. Hay que agrupar por cuenta — si no, la misma
// cuenta aparece doce veces como doce prospectos distintos.
//
// Corre asíncrono: una búsqueda con varias cuentas y sus publicaciones tarda
// más de los 60 s que permite Vercel.

import 'server-only';
import { classifyActivity } from './apify';
import type { ProspectFilters, ProspectResult } from './types';

export const IG_SEARCH_ACTOR = 'apify~instagram-scraper';

/** Publicaciones que se piden por cuenta: alcanzan para saber si está viva. */
const POSTS_PER_PROFILE = 6;

export const IG_SEARCH_FIELDS = [
  'ownerUsername',
  'ownerFullName',
  'followersCount',
  'biography',
  'verified',
  'url',
  'timestamp',
  'likesCount',
  'commentsCount',
].join(',');

export interface RawIgSearchItem {
  ownerUsername?: string;
  ownerFullName?: string;
  followersCount?: number;
  biography?: string;
  verified?: boolean;
  url?: string;
  timestamp?: string;
  likesCount?: number;
  commentsCount?: number;
}

export function buildIgSearchInput(filters: ProspectFilters): Record<string, unknown> {
  // La zona entra en el término de búsqueda: Instagram no tiene filtro
  // geográfico para cuentas, así que "inmobiliaria córdoba" es lo mejor que hay.
  // Se dice tal cual en la interfaz para no vender una precisión que no existe.
  const terms = filters.queries
    .map((q) => (filters.areas[0] ? `${q} ${filters.areas[0].split(',')[0].trim()}` : q))
    .slice(0, 5);

  return {
    search: terms.join(', '),
    searchType: 'profile',
    searchLimit: filters.limit,
    resultsType: 'posts',
    resultsLimit: POSTS_PER_PROFILE,
    addParentData: true,
  };
}

/** Cuántos resultados facturados va a consumir, como techo. */
export function estimateIgUnits(filters: ProspectFilters): number {
  return filters.limit * POSTS_PER_PROFILE;
}

interface Aggregated {
  username: string;
  fullName: string | null;
  followers: number | null;
  biography: string | null;
  verified: boolean;
  lastPostAt: string | null;
  posts: number;
  engagement: number;
}

/** Junta las publicaciones de cada cuenta en una sola fila. */
export function aggregateByAccount(items: RawIgSearchItem[]): Aggregated[] {
  const map = new Map<string, Aggregated>();

  for (const item of items ?? []) {
    const username = item.ownerUsername?.trim().toLowerCase();
    if (!username) continue;

    const current = map.get(username) ?? {
      username,
      fullName: item.ownerFullName ?? null,
      followers: item.followersCount ?? null,
      biography: item.biography ?? null,
      verified: Boolean(item.verified),
      lastPostAt: null,
      posts: 0,
      engagement: 0,
    };

    current.posts += 1;
    current.engagement += (item.likesCount ?? 0) + (item.commentsCount ?? 0);
    // Los datos de la cuenta pueden venir solo en algunas filas.
    current.followers ??= item.followersCount ?? null;
    current.biography ??= item.biography ?? null;
    current.fullName ??= item.ownerFullName ?? null;

    const ts = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
    if (!Number.isNaN(ts)) {
      const prev = current.lastPostAt ? new Date(current.lastPostAt).getTime() : 0;
      if (ts > prev) current.lastPostAt = new Date(ts).toISOString();
    }

    map.set(username, current);
  }

  return [...map.values()];
}

/**
 * Puntaje de una cuenta.
 *
 * Acá sí la actividad pesa fuerte, al revés que en Google: una cuenta muerta no
 * sirve de nada aunque tenga muchos seguidores, y el dato de "cuándo publicó por
 * última vez" viene en la misma respuesta ya paga.
 */
export function scoreAccount(account: Aggregated): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const followers = account.followers ?? 0;
  if (followers >= 10_000) {
    score += 30;
    reasons.push('Audiencia grande');
  } else if (followers >= 1_000) {
    score += 22;
    reasons.push('Audiencia mediana');
  } else if (followers >= 200) {
    score += 12;
    reasons.push('Audiencia chica');
  } else {
    reasons.push('Casi sin seguidores');
  }

  const activity = classifyActivity(account.lastPostAt);
  if (activity === 'activo') {
    score += 35;
    reasons.push('Publica seguido');
  } else if (activity === 'tibio') {
    score += 18;
    reasons.push('Publica de vez en cuando');
  } else {
    reasons.push('Hace mucho que no publica');
  }

  if (account.biography) {
    score += 15;
    reasons.push('Bio completa');
  }
  if (account.verified) {
    score += 10;
    reasons.push('Cuenta verificada');
  }

  // Interacción por publicación: separa una audiencia real de una comprada.
  const perPost = account.posts > 0 ? account.engagement / account.posts : 0;
  if (followers > 0 && perPost / followers > 0.02) {
    score += 10;
    reasons.push('Audiencia que interactúa');
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

export function mapIgSearchResults(
  items: RawIgSearchItem[],
  filters: ProspectFilters,
): ProspectResult[] {
  const accounts = aggregateByAccount(items);
  const results: ProspectResult[] = [];

  for (const account of accounts) {
    const { score, reasons } = scoreAccount(account);
    if (score < filters.minScore) continue;

    const activity = classifyActivity(account.lastPostAt);
    results.push({
      source: 'instagram',
      sourceRef: account.username,
      kind: 'account',
      businessName: account.fullName || `@${account.username}`,
      address: null,
      area: filters.areas[0] ?? '',
      phone: null,
      whatsappPhone: null,
      website: null,
      instagram: account.username,
      linkedin: null,
      mapsUrl: null,
      rating: null,
      reviewsCount: 0,
      photosCount: account.posts,
      // Igual que en LinkedIn: es una señal de Google que acá no se midió.
      hasOwnWebsite: false,
      score,
      reasons: [...reasons, activity === 'activo' ? 'Cuenta viva' : `Actividad: ${activity}`],
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, filters.limit);
}
