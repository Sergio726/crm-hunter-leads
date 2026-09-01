// Por dónde se le escribe a un lead.
//
// Vive en un catálogo y no como una lista suelta en cada pantalla porque el
// canal va a dejar de ser solo "con qué reglas redactar": el objetivo es que la
// app **mande el mensaje ella misma**, sin copiar y pegar. Cuando eso llegue,
// cada canal va a necesitar saber si está conectado, con qué cuenta y qué
// límites tiene.
//
// Hoy `envioDirecto` es `false` en todos: el mensaje se copia y se manda desde
// la app del vendedor. El día que uno pase a `true`, la ficha muestra "Enviar"
// en vez de "Copiar" sin tocar nada más — el punto de extensión ya está puesto.
//
// **El próximo foco es LinkedIn** (pedido del usuario, 2026-08-27).

export type Channel = 'whatsapp' | 'instagram' | 'email' | 'linkedin';

export interface CanalDef {
  id: Channel;
  /** Cómo lo nombra el vendedor. */
  label: string;
  /**
   * Clase del color de marca del logo, cuando el canal está disponible.
   *
   * Solo el logo: el fondo del botón nunca se pinta con esto. Es lo que deja al
   * verde eléctrico como único color que ocupa superficies, así que un botón de
   * WhatsApp no compite con el botón primario. Los tokens están en
   * `globals.css`, con su valor por tema. Ver D71.
   *
   * El email no lleva color de marca porque no es una marca: es el sobre
   * genérico de lucide, y va en el verde profundo del sistema.
   */
  colorClase: string;
  /**
   * Si la app puede mandarlo sola. Hoy ninguno: el mensaje se copia.
   * Cuando pase a `true`, además hará falta la conexión de la cuenta.
   */
  envioDirecto: boolean;
  /** Una línea para el que pasa el mouse por encima. */
  ayuda: string;
}

/**
 * En orden de uso real: el vendedor manda por WhatsApp casi siempre, y LinkedIn
 * queda para la venta B2B.
 */
export const CANALES: CanalDef[] = [
  {
    id: 'whatsapp',
    colorClase: 'text-canal-whatsapp',
    label: 'WhatsApp',
    envioDirecto: false,
    ayuda: 'Mensaje corto, de una sola idea: se lee entero en la notificación.',
  },
  {
    id: 'instagram',
    colorClase: 'text-canal-instagram',
    label: 'Instagram',
    envioDirecto: false,
    ayuda: 'Mensaje directo. Al ser de alguien que no te sigue cae en solicitudes, así que la primera línea es todo lo que se ve.',
  },
  {
    id: 'email',
    colorClase: 'text-primary-deep',
    label: 'Email',
    envioDirecto: false,
    ayuda: 'Con asunto y algo más de espacio para explicar.',
  },
  {
    id: 'linkedin',
    colorClase: 'text-canal-linkedin',
    label: 'LinkedIn',
    envioDirecto: false,
    ayuda: 'Tono profesional, sin fórmulas de plantilla.',
  },
];

export const CANALES_IDS = CANALES.map((c) => c.id);

/** ¿Es un canal que la app conoce? Se usa para validar lo que llega por la API. */
export function esCanal(v: unknown): v is Channel {
  return typeof v === 'string' && CANALES_IDS.includes(v as Channel);
}

export function canal(id: Channel): CanalDef {
  return CANALES.find((c) => c.id === id) ?? CANALES[0];
}

/** Los que ya puede mandar la app sola. Hoy ninguno; existe para no olvidarlo. */
export function canalesConEnvio(): CanalDef[] {
  return CANALES.filter((c) => c.envioDirecto);
}

/**
 * Los datos de contacto de un lead, ya resueltos.
 *
 * Se recibe así —y no un cliente entero— para que `canalesDisponibles` sea pura
 * y sirva igual para un cliente y para un prospecto, que guardan lo mismo en
 * columnas distintas. Quién saca cada valor de dónde vive en
 * `contact-links.ts`.
 */
export interface ContactoDelLead {
  phone?: string | null;
  email?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
}

const conTexto = (v: string | null | undefined): boolean => typeof v === 'string' && v.trim() !== '';

/**
 * Por cuáles canales se le puede escribir de verdad a este lead.
 *
 * Existe porque los cuatro botones se mostraban iguales tuviera dato o no, y el
 * vendedor se enteraba de que faltaba el email recién al hacer clic, con un
 * cartel de error. Peor: medido sobre producción, **ningún** cliente tenía email
 * ni LinkedIn, así que dos de los cuatro canales que ofrecía la pantalla no
 * servían para nadie — mientras Instagram, que sí estaba en 135, no se veía.
 */
export function canalesDisponibles(contacto: ContactoDelLead): Record<Channel, boolean> {
  return {
    // El teléfono es el mismo dato para WhatsApp: no hay un campo aparte.
    whatsapp: conTexto(contacto.phone),
    instagram: conTexto(contacto.instagram),
    email: conTexto(contacto.email),
    linkedin: conTexto(contacto.linkedin),
  };
}

/**
 * El primero que se puede usar, para no abrir el diálogo en un canal muerto.
 *
 * Devuelve `null` cuando no hay ninguno: ese caso no se puede tapar eligiendo
 * igual: hay que decirle al vendedor que a ese lead todavía no se le puede
 * escribir por ningún lado.
 */
export function primerCanalDisponible(disponibles: Record<Channel, boolean>): Channel | null {
  return CANALES.find((c) => disponibles[c.id])?.id ?? null;
}
