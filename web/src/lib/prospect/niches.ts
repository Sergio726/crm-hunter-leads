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
  {
    id: 'belleza',
    label: 'Peluquerías y barberías',
    // Pack propio y no parte de 'estetica': ese rubro las excluye por nombre,
    // porque mezclarlas ensucia las dos búsquedas. Acá son el objetivo.
    queries: ['peluquería', 'barbería', 'salón de belleza', 'uñas esculpidas', 'centro de manicura'],
    notOwnWebsite: ['booksy.com', 'fresha.com', 'agendapro.com', 'treatwell.es'],
    excludeNames: ['mayorista', 'distribuidora', 'insumos'],
    // Rubro muy visual: la foto y el Instagram pesan más que la reseña.
    weights: { photos: 35, reviews: 15, rating: 10, instagram: 30, activity: 10 },
  },
  {
    id: 'salud',
    label: 'Consultorios y salud',
    queries: [
      'consultorio odontológico',
      'dentista',
      'kinesiología',
      'consultorio médico',
      'nutricionista',
      'psicólogo',
    ],
    notOwnWebsite: ['doctoralia.com', 'turnosya.com', 'agendapro.com', 'zocdoc.com'],
    excludeNames: ['hospital', 'sanatorio', 'obra social', 'farmacia', 'laboratorio'],
    // La confianza manda: reseñas y puntaje por encima de lo visual.
    weights: { photos: 15, reviews: 35, rating: 25, instagram: 15, activity: 10 },
  },
  {
    id: 'fitness',
    label: 'Gimnasios y estudios',
    queries: ['gimnasio', 'estudio de pilates', 'yoga', 'crossfit', 'entrenamiento funcional'],
    notOwnWebsite: ['sportclub.com', 'gympass.com', 'mindbodyonline.com'],
    excludeNames: ['club deportivo', 'polideportivo', 'municipal'],
    weights: { photos: 30, reviews: 20, rating: 15, instagram: 25, activity: 10 },
  },
  {
    id: 'automotor',
    label: 'Talleres y automotor',
    queries: ['taller mecánico', 'gomería', 'lavadero de autos', 'chapa y pintura', 'service de autos'],
    notOwnWebsite: ['mercadolibre.com', 'autocosmos.com', 'demotores.com'],
    excludeNames: ['concesionaria', 'automotores 0km', 'terminal'],
    // Acá casi nadie tiene Instagram: pesa la reputación y las fotos del taller.
    weights: { photos: 30, reviews: 30, rating: 20, instagram: 10, activity: 10 },
  },
  {
    id: 'construccion',
    label: 'Construcción y reformas',
    queries: ['empresa constructora', 'reformas y refacciones', 'plomero', 'electricista', 'pintor de obra'],
    notOwnWebsite: ['zonaprop.com', 'habitissimo.com', 'construred.com'],
    excludeNames: ['corralón', 'ferretería', 'mayorista'],
    weights: { photos: 30, reviews: 30, rating: 15, instagram: 15, activity: 10 },
  },
  {
    id: 'veterinarias',
    label: 'Veterinarias y mascotas',
    queries: ['veterinaria', 'peluquería canina', 'pet shop', 'guardería para perros'],
    notOwnWebsite: ['puppis.com', 'petshopargentina.com'],
    excludeNames: ['zoológico', 'criadero', 'mayorista'],
    weights: { photos: 25, reviews: 30, rating: 20, instagram: 15, activity: 10 },
  },
  {
    id: 'educacion',
    label: 'Institutos y academias',
    queries: [
      'instituto de inglés',
      'academia de idiomas',
      'apoyo escolar',
      'escuela de manejo',
      'academia de danza',
    ],
    notOwnWebsite: ['emagister.com', 'buscauniversidad.com'],
    excludeNames: ['universidad', 'colegio secundario', 'escuela pública', 'ministerio'],
    weights: { photos: 20, reviews: 30, rating: 20, instagram: 20, activity: 10 },
  },
  {
    id: 'comercio',
    label: 'Comercios de barrio',
    queries: ['tienda de ropa', 'bazar', 'ferretería', 'librería', 'juguetería'],
    notOwnWebsite: ['mercadolibre.com', 'tiendanube.com', 'empretienda.com'],
    excludeNames: ['supermercado', 'shopping', 'mayorista', 'cadena'],
    weights: { photos: 30, reviews: 20, rating: 15, instagram: 25, activity: 10 },
  },
  {
    id: 'eventos',
    label: 'Eventos y fiestas',
    queries: ['salón de fiestas', 'catering', 'fotografía de eventos', 'organización de eventos', 'DJ para fiestas'],
    notOwnWebsite: ['casamientos.com.ar', 'bodas.com.ar', 'zankyou.com'],
    excludeNames: ['hotel', 'municipal', 'club'],
    // Rubro de vidriera: se vende con imágenes.
    weights: { photos: 40, reviews: 20, rating: 10, instagram: 20, activity: 10 },
  },
  {
    id: 'turismo',
    label: 'Turismo y alojamiento',
    queries: ['cabañas', 'hostel', 'hotel boutique', 'agencia de viajes', 'posada'],
    notOwnWebsite: [
      'booking.com',
      'airbnb.com',
      'despegar.com',
      'tripadvisor.com',
      'expedia.com',
      'hoteles.com',
    ],
    excludeNames: ['cadena', 'all inclusive', 'resort internacional'],
    weights: { photos: 35, reviews: 25, rating: 20, instagram: 10, activity: 10 },
  },
  {
    id: 'hogar',
    label: 'Servicios para el hogar',
    queries: ['servicio de limpieza', 'jardinería', 'mudanzas', 'fumigación', 'cerrajería'],
    notOwnWebsite: ['iguanafix.com', 'habitissimo.com', 'timbrit.com'],
    excludeNames: ['mayorista', 'insumos', 'venta de productos'],
    // Servicios a domicilio: casi nunca tienen local que fotografiar.
    weights: { photos: 15, reviews: 35, rating: 25, instagram: 15, activity: 10 },
  },
];

export function getNichePack(id: string): NichePack {
  return NICHE_PACKS.find((p) => p.id === id) ?? NICHE_PACKS[0];
}

/** Lista completa de dominios que no cuentan como web propia para un pack. */
export function notOwnWebsiteDomains(pack: NichePack): string[] {
  return [...GENERIC_NOT_OWN_WEBSITE, ...pack.notOwnWebsite];
}
