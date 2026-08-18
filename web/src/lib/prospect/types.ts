// Tipos del módulo de prospección (PROSP-1, ampliado a multi-fuente en PROSP-12).
// El flujo tiene tres objetos: el AVATAR (qué buscamos, definido con el agente),
// los FILTROS (el avatar traducido a parámetros de búsqueda) y los RESULTADOS
// (lo que devuelve la fuente, todavía sin guardar).

import type { ProspectKind, SourceId } from './sources/catalog';

export type { ProspectKind, SourceId };
export {
  GRADE_LABELS,
  SCORE_EXPLANATION,
  SEARCHABLE_SOURCES,
  SOURCES,
  estimate,
  gradeFor,
  type Grade,
} from './sources/catalog';

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
  /**
   * Dónde buscar. Antes no existía porque siempre era Google Maps.
   * Los campos de abajo que hablan de rating o de "web propia" solo tienen
   * sentido para `google_places`; cada fuente usa los que le sirven.
   */
  source: SourceId;
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
  /**
   * Exigir LinkedIn detectable en la ficha.
   * Ojo con las expectativas: Places solo expone un enlace por negocio, y en un
   * comercio local casi nunca es LinkedIn, así que esta señal filtra muy fuerte.
   * Rinde en rubros B2B (consultoras, estudios) y, sobre todo, cuando esté el
   * enriquecimiento de contacto de PROSP-6, que sí lee las redes del sitio.
   */
  requireLinkedin: boolean;
  /** Exigir que el teléfono parezca celular (proxy de WhatsApp). */
  requireWhatsapp: boolean;
  /**
   * Rating mínimo de Google; null = sin piso.
   *
   * Ya no hay `minScore`: el puntaje **ordena, no filtra**. Era la forma más
   * silenciosa de llegar a cero resultados — un número calibrado con las fotos y
   * reseñas de Google que se aplicaba también a LinkedIn, donde la escala mide
   * cosas completamente distintas. El corte real lo da `limit`, que sí es una
   * idea que el vendedor entiende ("traeme 10").
   */
  minRating: number | null;
  /** Cantidad máxima de resultados a devolver. */
  limit: number;
  /**
   * Parámetros propios de LinkedIn. Solo presentes cuando `source` es
   * `linkedin`: una búsqueda de personas se acota por cargo y empresa, no por
   * rating ni por "tiene web propia".
   */
  linkedin?: LinkedinParams;
}

/** Filtros que solo tienen sentido buscando personas. */
export interface LinkedinParams {
  /** Cargos. Se espejan en `queries` para no duplicar la forma de los filtros. */
  jobTitles: string[];
  industries: string[];
  /** Nivel jerárquico, ej. "owner", "director". */
  seniority: string[];
  /** Tamaño de empresa en rangos, ej. "11-50". */
  companySizes: string[];
}

/** Un candidato encontrado. Vive en memoria hasta que el usuario decide guardarlo. */
export interface ProspectResult {
  /** De dónde salió. Antes se asumía Google y por eso la clave era el place_id. */
  source: SourceId;
  /**
   * Identidad dentro de esa fuente: el place_id de Google, el slug de LinkedIn,
   * el handle de Instagram. Reemplaza a `googlePlaceId`, que no existía para
   * ninguna fuente que no fuera Maps.
   */
  sourceRef: string;
  kind: ProspectKind;
  businessName: string;
  address: string | null;
  area: string;
  phone: string | null;
  whatsappPhone: string | null;
  website: string | null;
  instagram: string | null;
  /** Slug de LinkedIn (empresa o persona), sin el dominio. */
  linkedin: string | null;
  mapsUrl: string | null;
  rating: number | null;
  reviewsCount: number;
  photosCount: number;
  hasOwnWebsite: boolean;
  score: number;
  /** Motivos legibles de por qué puntuó así — se muestran en la tabla. */
  reasons: string[];
  /** Solo cuando el resultado es una persona: su titular y dónde trabaja. */
  roleTitle?: string | null;
  companyName?: string | null;
  /** Texto que la persona o cuenta escribió sobre sí: el "Acerca de", la bio. */
  bio?: string | null;
  /**
   * Email, cuando la fuente lo trae. Hoy solo LinkedIn en el modo con búsqueda
   * de email: es lo que permite escribirle sin depender de que acepte la
   * solicitud.
   */
  email?: string | null;
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
  /** Slug de LinkedIn detectado (0031). `undefined` mientras esa migración no esté aplicada. */
  linkedin: string | null;
  maps_url: string | null;
  /** Identidad multi-fuente (0036). Reemplaza a `google_place_id`. */
  source: SourceId;
  source_ref: string;
  kind: ProspectKind;
  /** Se conserva por compatibilidad; es null para todo lo que no sea Google. */
  google_place_id: string | null;
  /** Datos de una persona (LinkedIn). Null para negocios. */
  role_title: string | null;
  company_name: string | null;
  /** 0036 — antes el email nunca llegaba al vendedor porque no había columna. */
  email: string | null;
  /** Audiencia sin importar la red, para ordenar una lista mezclada. */
  audience_size: number | null;
  audience_activity: 'activo' | 'tibio' | 'dormido' | null;
  /** Lo propio de cada fuente: verificado, rubro declarado, seguidos, etc. */
  source_data: Record<string, unknown> | null;
  contact_enriched_at: string | null;
  contact_status: 'ok' | 'not_found' | 'unreachable' | 'error' | null;
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

/**
 * Lo que la tabla de guardados necesita de un prospecto.
 *
 * Los campos opcionales existen porque la misma tabla se usa en dos contextos:
 * justo después de guardar dentro de una corrida (donde solo se conoce lo
 * mínimo) y en la pantalla de guardados (donde viene la fila completa de la
 * base). Cada columna extra se dibuja solo si el dato está.
 */
export interface SavedProspect {
  id: string;
  businessName: string;
  source?: SourceId;
  kind?: ProspectKind;
  /** Cargo y empresa: solo tienen valor cuando el prospecto es una persona. */
  roleTitle?: string | null;
  companyName?: string | null;
  email?: string | null;
  instagram: string | null;
  /** Slug de LinkedIn. Si la búsqueda lo exigió, tiene que poder verse. */
  linkedin?: string | null;
  score: number | null;
  audienceSize: number | null;
  audienceActivity: 'activo' | 'tibio' | 'dormido' | null;
  enrichmentStatus: 'ok' | 'not_found' | 'private' | 'error' | null;
  // --- Solo presentes cuando el prospecto viene de la base ---
  area?: string | null;
  whatsappPhone?: string | null;
  status?: Prospect['status'];
  createdAt?: string;
  mapsUrl?: string | null;
  /** Nombre de quien lo guardó. Solo se completa para el superadmin. */
  ownerName?: string | null;

  // --- Para la ficha de detalle ---------------------------------------------
  // No los dibuja la tabla (no entran, y no ayudan a decidir de un vistazo),
  // pero se pagan en cada búsqueda y en cada enriquecimiento. Hasta que existió
  // la ficha, quedaban guardados en la base sin que nadie pudiera verlos.
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  bio?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  photosCount?: number | null;
  hasOwnWebsite?: boolean | null;
  /** Lo propio de cada fuente: verificado, rubro declarado, seguidos, etc. */
  sourceData?: Record<string, unknown> | null;
}

/** Fila de `prospects` → lo que la tabla sabe dibujar. */
export function toSavedProspect(row: Prospect, ownerName?: string | null): SavedProspect {
  return {
    id: row.id,
    businessName: row.business_name,
    // `?? …` en las columnas de la 0036 por la misma razón que en `linkedin`:
    // si la migración todavía no corrió, Supabase no devuelve la columna.
    source: row.source ?? 'google_places',
    kind: row.kind ?? 'business',
    roleTitle: row.role_title ?? null,
    companyName: row.company_name ?? null,
    email: row.email ?? null,
    instagram: row.instagram,
    // `?? null` a propósito: mientras la 0031 no esté aplicada la columna no
    // existe y Supabase no la devuelve, así que acá llega `undefined`.
    linkedin: row.linkedin ?? null,
    score: row.score,
    // Se prefiere la columna genérica: cuando el prospecto venga de TikTok, las
    // `ig_*` van a estar vacías y la audiencia igual tiene que verse.
    audienceSize: row.audience_size ?? row.ig_followers,
    audienceActivity: row.audience_activity ?? row.ig_activity,
    enrichmentStatus: row.enrichment_status,
    area: row.area,
    whatsappPhone: row.whatsapp_phone ?? row.phone,
    status: row.status,
    createdAt: row.created_at,
    mapsUrl: row.maps_url,
    ownerName: ownerName ?? null,
    address: row.address,
    phone: row.phone,
    website: row.website,
    // La bio de Instagram es la única que hoy se persiste; la de LinkedIn se ve
    // durante la búsqueda pero todavía no tiene columna propia.
    bio: row.ig_bio ?? null,
    rating: row.rating,
    reviewsCount: row.reviews_count,
    photosCount: row.photos_count,
    hasOwnWebsite: row.has_own_website,
    sourceData: row.source_data ?? null,
  };
}

// --- LinkedIn ---------------------------------------------------------------
// El valor guardado incluye el tipo (`company/acme`, `in/juan-perez`), que es
// lo que permite rearmar la URL. Estos dos helpers viven acá y no en
// `places.ts` porque ese módulo es `server-only` y los usa la tabla.

/** URL del perfil a partir del valor guardado. */
export function linkedinUrl(value: string): string {
  return `https://www.linkedin.com/${value}`;
}

/** Solo el nombre, para no llenar la tabla con el prefijo `company/`. */
export function linkedinLabel(value: string): string {
  const [, slug] = value.split('/');
  return slug || value;
}

export const ACTIVITY_LABELS: Record<'activo' | 'tibio' | 'dormido', string> = {
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
  /**
   * Cuándo se dijo, en milisegundos. Lo pone el navegador y **no viaja al
   * modelo**: la ruta de chat arma los mensajes con `role` y `content` nada más.
   * Existe solo para mostrar la hora al pie de cada burbuja.
   */
  at?: number;
}

/** Respuesta del endpoint de chat: texto + (cuando el avatar está listo) los filtros. */
/** Las exigencias que Turbo puede activar, y que tiene que justificar. */
export type SignalField =
  | 'requireNoWebsite'
  | 'requireInstagram'
  | 'requireLinkedin'
  | 'requireWhatsapp'
  | 'minRating';

export const SIGNAL_FIELDS: SignalField[] = [
  'requireNoWebsite',
  'requireInstagram',
  'requireLinkedin',
  'requireWhatsapp',
  'minRating',
];

export interface AgentReply {
  message: string;
  /** Presente solo cuando el agente considera que ya puede buscar. */
  filters: ProspectFilters | null;
  /** Resumen del avatar en una línea, para guardar junto a la búsqueda. */
  icpSummary: string | null;
  /**
   * Por qué Turbo eligió esa fuente y no otra.
   * Se muestra en el Plan de Caza: es lo que le permite al vendedor corregirlo
   * si conoce su mercado mejor que el agente.
   */
  reason?: string | null;
  /**
   * Por qué exigió CADA señal, en media frase y en segunda persona.
   *
   * `reason` explica la fuente ("LinkedIn es la única que conoce el cargo"),
   * que es otra decisión. Esto explica las exigencias: sin el motivo, "Solo
   * negocios sin web propia" parece una casilla que alguien dejó marcada, y lo
   * primero que hace el vendedor es ir a buscar dónde destildarla. Con el
   * motivo —"porque vendés páginas web"— se lee como una decisión.
   *
   * La clave es el campo de `ProspectFilters` (`requireNoWebsite`, `minRating`…).
   * Solo vienen las señales que Turbo activó.
   */
  signalReasons?: Partial<Record<SignalField, string>> | null;
  /**
   * Qué vende el usuario, en una frase, tal como lo entendió Turbo.
   * Se guarda para que el primer mensaje a cada prospecto no vuelva a
   * preguntarlo: Turbo ya lo sabe de la entrevista.
   */
  offer?: string | null;
  /**
   * Respuestas sugeridas para tocar, cuando Turbo hace una pregunta cerrada.
   * Al tocarlas se envía ese texto como si el vendedor lo hubiera escrito: no
   * ejecutan nada por su cuenta.
   */
  options?: string[] | null;
  /** true cuando el chat corre en modo guiado porque no hay API key de OpenRouter. */
  fallback: boolean;
}
