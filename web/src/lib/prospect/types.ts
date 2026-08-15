// Tipos del módulo de prospección (PROSP-1).
// El flujo tiene tres objetos: el AVATAR (qué buscamos, definido con el agente),
// los FILTROS (el avatar traducido a parámetros de búsqueda) y los RESULTADOS
// (lo que devuelve Places, todavía sin guardar).

/** Países soportados por la búsqueda. Define la región de Places y cómo se reconoce un móvil. */
export type CountryCode =
  | 'AR'
  | 'UY'
  | 'CL'
  | 'MX'
  | 'ES'
  | 'CO'
  | 'PE'
  | 'EC'
  | 'BO'
  | 'PY'
  | 'VE'
  | 'BR'
  | 'CR'
  | 'PA'
  | 'GT'
  | 'SV'
  | 'HN'
  | 'NI'
  | 'DO'
  | 'PR';

export interface CountryConfig {
  name: string;
  region: string;
  /**
   * Patrón de número móvil en formato internacional.
   * `null` = en ese país no se puede distinguir móvil de fijo por el prefijo
   * (México usa el mismo formato para ambos desde 2019), así que exigir
   * "celular" ahí filtraría a ciegas. Ver `mobileDetectable`.
   */
  mobilePattern: RegExp | null;
}

export const COUNTRIES: Record<CountryCode, CountryConfig> = {
  // AR: el móvil es +54 9…, pero Google publica muchos sin el 9 (+5411…).
  // El caso general se completa con códigos de área en `looksLikeMobile`.
  AR: { name: 'Argentina', region: 'AR', mobilePattern: /^\+549/ },
  UY: { name: 'Uruguay', region: 'UY', mobilePattern: /^\+5989/ },
  CL: { name: 'Chile', region: 'CL', mobilePattern: /^\+569/ },
  // MX: desde 2019 móvil y fijo comparten formato (+52 + 10 dígitos).
  MX: { name: 'México', region: 'MX', mobilePattern: null },
  // ES: los móviles empiezan con 6 o 7.
  ES: { name: 'España', region: 'ES', mobilePattern: /^\+34[67]/ },
  // CO: móviles de 10 dígitos que empiezan con 3.
  CO: { name: 'Colombia', region: 'CO', mobilePattern: /^\+573/ },

  // --- Resto de LATAM ---
  // Donde el patrón es `null` no es que falte cargarlo: es que en ese país el
  // móvil no se distingue del fijo por el prefijo, así que exigir "celular"
  // filtraría a ciegas. La interfaz lo avisa (ver `mobileDetectable`).
  PE: { name: 'Perú', region: 'PE', mobilePattern: /^\+519/ },
  EC: { name: 'Ecuador', region: 'EC', mobilePattern: /^\+5939/ },
  BO: { name: 'Bolivia', region: 'BO', mobilePattern: /^\+591[67]/ },
  PY: { name: 'Paraguay', region: 'PY', mobilePattern: /^\+5959/ },
  VE: { name: 'Venezuela', region: 'VE', mobilePattern: /^\+584/ },
  // BR: el móvil suma un 9 delante del número, después de los dos dígitos de DDD.
  BR: { name: 'Brasil', region: 'BR', mobilePattern: /^\+55\d{2}9/ },
  CR: { name: 'Costa Rica', region: 'CR', mobilePattern: /^\+506[678]/ },
  PA: { name: 'Panamá', region: 'PA', mobilePattern: /^\+5076/ },
  GT: { name: 'Guatemala', region: 'GT', mobilePattern: /^\+502[345]/ },
  SV: { name: 'El Salvador', region: 'SV', mobilePattern: /^\+503[67]/ },
  HN: { name: 'Honduras', region: 'HN', mobilePattern: /^\+504[3789]/ },
  NI: { name: 'Nicaragua', region: 'NI', mobilePattern: /^\+505[578]/ },
  // DO y PR usan el plan de numeración de EE.UU.: móvil y fijo comparten formato.
  DO: { name: 'República Dominicana', region: 'DO', mobilePattern: null },
  PR: { name: 'Puerto Rico', region: 'PR', mobilePattern: null },
};

/** ¿En este país sirve de algo exigir "teléfono celular"? */
export function mobileDetectable(country: CountryCode): boolean {
  return COUNTRIES[country].mobilePattern !== null;
}

// --- Límite de resultados ---------------------------------------------------
// Único lugar donde se decide cuántos resultados devuelve una búsqueda. Antes
// el rango estaba escrito a mano en cuatro archivos y el piso era 5: pedir 2
// devolvía 5 sin avisar. Si esto vuelve a duplicarse, el bug vuelve.

/** Mínimo real: si el vendedor pide 1, recibe 1. */
export const MIN_LIMIT = 1;
export const MAX_LIMIT = 60;
/** Lo que se usa cuando nadie pidió una cantidad. */
export const DEFAULT_LIMIT = 30;

/** Límite efectivo. Cualquier cosa que no sea un número usable cae al default. */
export function clampLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.round(value)));
}

/** Filtros efectivos de una búsqueda. Es lo que el agente propone y el usuario puede editar. */
export interface ProspectFilters {
  /** Términos de búsqueda para Places, ej. ["inmobiliaria", "corredor inmobiliario"]. */
  queries: string[];
  /** Zonas a recorrer, ej. ["Palermo, Buenos Aires"]. */
  areas: string[];
  country: CountryCode;
  /** Id del pack de nicho usado como base (o 'generico' si el avatar es a medida). */
  niche: string;
  /** Descartar los que ya tienen web propia (el mejor prospecto es el que no tiene). */
  requireNoWebsite: boolean;
  /** Exigir Instagram detectable en la ficha. */
  requireInstagram: boolean;
  /** Exigir que el teléfono parezca celular (proxy de WhatsApp). */
  requireWhatsapp: boolean;
  /** Score mínimo 0–100 para que el resultado se muestre. */
  minScore: number;
  /** Rating mínimo de Google; null = sin piso. */
  minRating: number | null;
  /** Cantidad máxima de resultados a devolver. */
  limit: number;
}

/** Un candidato encontrado. Vive en memoria hasta que el usuario decide guardarlo. */
export interface ProspectResult {
  googlePlaceId: string;
  businessName: string;
  address: string | null;
  area: string;
  phone: string | null;
  whatsappPhone: string | null;
  website: string | null;
  instagram: string | null;
  mapsUrl: string | null;
  rating: number | null;
  reviewsCount: number;
  photosCount: number;
  hasOwnWebsite: boolean;
  score: number;
  /** Motivos legibles de por qué puntuó así — se muestran en la tabla. */
  reasons: string[];
}

/** Fila de `prospects` tal como vuelve de Supabase. */
export interface Prospect {
  id: string;
  business_name: string;
  address: string | null;
  area: string | null;
  country: string;
  niche: string;
  phone: string | null;
  whatsapp_phone: string | null;
  website: string | null;
  instagram: string | null;
  maps_url: string | null;
  google_place_id: string;
  rating: number | null;
  reviews_count: number;
  photos_count: number;
  has_own_website: boolean;
  score: number | null;
  status: 'new' | 'promoted' | 'discarded';
  search_id: string | null;
  created_by: string | null;
  promoted_client_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Enriquecimiento con Instagram (Apify) — null hasta que se corre el paso.
  ig_followers: number | null;
  ig_posts_count: number | null;
  ig_last_post_at: string | null;
  ig_bio: string | null;
  ig_is_business: boolean | null;
  ig_activity: 'activo' | 'tibio' | 'dormido' | null;
  enriched_at: string | null;
  enrichment_status: 'ok' | 'not_found' | 'private' | 'error' | null;
}

/** Lo mínimo que la pantalla necesita de un prospecto ya guardado. */
export interface SavedProspect {
  id: string;
  businessName: string;
  instagram: string | null;
  score: number | null;
  igFollowers: number | null;
  igActivity: 'activo' | 'tibio' | 'dormido' | null;
  enrichmentStatus: 'ok' | 'not_found' | 'private' | 'error' | null;
}

export const IG_ACTIVITY_LABELS: Record<'activo' | 'tibio' | 'dormido', string> = {
  activo: 'Activo',
  tibio: 'Tibio',
  dormido: 'Dormido',
};

export const PROSPECT_STATUS_LABELS: Record<Prospect['status'], string> = {
  new: 'Nuevo',
  promoted: 'Promovido',
  discarded: 'Descartado',
};

/** Turno del chat con el agente de avatar. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Respuesta del endpoint de chat: texto + (cuando el avatar está listo) los filtros. */
export interface AgentReply {
  message: string;
  /** Presente solo cuando el agente considera que ya puede buscar. */
  filters: ProspectFilters | null;
  /** Resumen del avatar en una línea, para guardar junto a la búsqueda. */
  icpSummary: string | null;
  /** true cuando el chat corre en modo guiado porque no hay API key de OpenRouter. */
  fallback: boolean;
}
