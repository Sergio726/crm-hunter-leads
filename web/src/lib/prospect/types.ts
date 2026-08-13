// Tipos del módulo de prospección (PROSP-1).
// El flujo tiene tres objetos: el AVATAR (qué buscamos, definido con el agente),
// los FILTROS (el avatar traducido a parámetros de búsqueda) y los RESULTADOS
// (lo que devuelve Places, todavía sin guardar).

/** Países soportados por la búsqueda. Define la región de Places y cómo se reconoce un móvil. */
export type CountryCode = 'AR' | 'UY' | 'CL' | 'MX' | 'ES' | 'CO';

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
};

/** ¿En este país sirve de algo exigir "teléfono celular"? */
export function mobileDetectable(country: CountryCode): boolean {
  return COUNTRIES[country].mobilePattern !== null;
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
}

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
  /** true cuando el chat corre en modo guiado porque no hay ANTHROPIC_API_KEY. */
  fallback: boolean;
}
