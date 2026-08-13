// Packs de nicho: plantillas de arranque para el avatar.
//
// Un pack define qué preguntarle a Places, qué dominios NO cuentan como web
// propia (portales del rubro, redes, link-in-bio) y cómo pesar la señal. El
// agente los usa como punto de partida y después ajusta a lo que pida el
// usuario — un avatar a medida puede quedarse en `generico` con queries libres.

export interface NichePack {
  id: string;
  label: string;
  /** Términos de búsqueda por defecto. */
  queries: string[];
  /** Dominios que NO son web propia (además de los comunes). */
  notOwnWebsite: string[];
  /** Palabras que descalifican por nombre (Places trae mucho ruido). */
  excludeNames: string[];
  /** Pesos de scoring; deben sumar 100. */
  weights: { photos: number; reviews: number; rating: number; instagram: number; activity: number };
}

/** Comunes a todo rubro: redes, link-in-bio, WhatsApp, sitios de Google. */
export const GENERIC_NOT_OWN_WEBSITE = [
  'instagram.com',
  'facebook.com',
  'fb.com',
  'fb.me',
  'linktr.ee',
  'beacons.ai',
  'bio.link',
  'linkin.bio',
  'carrd.co',
  'wa.me',
  'api.whatsapp.com',
  'whatsapp.com',
  'sites.google.com',
  'business.site',
  'negocio.site',
  'tiktok.com',
];

const DEFAULT_WEIGHTS = { photos: 30, reviews: 25, rating: 15, instagram: 20, activity: 10 };

export const NICHE_PACKS: NichePack[] = [
  {
    id: 'generico',
    label: 'A medida (sin pack)',
    queries: [],
    notOwnWebsite: [],
    excludeNames: [],
    weights: DEFAULT_WEIGHTS,
  },
  {
    id: 'estetica',
    label: 'Clínicas y centros de estética',
    queries: [
      'clínica estética',
      'centro de estética',
      'medicina estética',
      'depilación láser',
      'tratamientos faciales',
    ],
    notOwnWebsite: ['doctoralia.com', 'booksy.com', 'fresha.com', 'treatwell.es', 'agendapro.com'],
    excludeNames: ['peluquer', 'barber', 'farmacia', 'veterin', 'gimnasio'],
    weights: DEFAULT_WEIGHTS,
  },
  {
    id: 'inmobiliarias',
    label: 'Inmobiliarias y corredores',
    queries: [
      'inmobiliaria',
      'agencia inmobiliaria',
      'corredor inmobiliario',
      'bienes raíces',
      'martillero inmobiliario',
    ],
    notOwnWebsite: [
      'zonaprop.com',
      'argenprop.com',
      'mercadolibre.com',
      'infocasas.com',
      'properati.com',
      'remax.com',
      'century21.com',
      'gallito.com.uy',
      'navent.com',
      'tokko.com',
      'idealista.com',
    ],
    excludeNames: [
      'escriban',
      'alojamiento',
      'hospedaj',
      'hotel',
      'hostel',
      'cabaña',
      'camping',
      'cowork',
      'complejo',
    ],
    weights: { photos: 30, reviews: 20, rating: 15, instagram: 20, activity: 15 },
  },
  {
    id: 'gastronomia',
    label: 'Gastronomía',
    queries: ['restaurante', 'cafetería', 'bar', 'parrilla', 'pizzería'],
    notOwnWebsite: ['pedidosya.com', 'rappi.com', 'ubereats.com', 'thefork.com', 'tripadvisor.com'],
    excludeNames: ['kiosco', 'supermercado', 'distribuidora'],
    weights: { photos: 35, reviews: 25, rating: 15, instagram: 15, activity: 10 },
  },
  {
    id: 'servicios',
    label: 'Servicios profesionales',
    queries: ['estudio contable', 'estudio jurídico', 'consultora', 'agencia de marketing'],
    notOwnWebsite: ['linkedin.com', 'paginasamarillas.com'],
    excludeNames: [],
    weights: { photos: 20, reviews: 25, rating: 15, instagram: 20, activity: 20 },
  },
];

export function getNichePack(id: string): NichePack {
  return NICHE_PACKS.find((p) => p.id === id) ?? NICHE_PACKS[0];
}

/** Lista completa de dominios que no cuentan como web propia para un pack. */
export function notOwnWebsiteDomains(pack: NichePack): string[] {
  return [...GENERIC_NOT_OWN_WEBSITE, ...pack.notOwnWebsite];
}
