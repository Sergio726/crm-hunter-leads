// Llevar al lead lo que se descubrió del prospecto **después** de promoverlo.
//
// POR QUÉ EXISTE
//
// El email, el WhatsApp y las redes viajaban del prospecto a la ficha del
// lead **solo en el momento de promoverlo** (`promote_prospects`, 0036).
// Después de eso, enriquecer no servía para nada: el dato quedaba en
// `prospects` y la persona que trabaja al lead no lo veía nunca.
//
// Medido sobre producción: los 163 leads ya estaban promovidos y **ninguno
// tenía email**, así que el botón "Buscar email y WhatsApp" era, para todos
// ellos, pagarle a Apify por un dato que no iba a aparecer en ningún lado.
//
// Importa más desde que se verificó que la API de Instagram **no permite el
// contacto en frío** (D72): el email es el único canal donde escribir primero
// es legítimo por diseño, así que conseguirlos dejó de ser opcional.

/** Lo que se sabe del prospecto después de leer su sitio. */
export interface DatosDelProspecto {
  email?: string | null;
  whatsapp_phone?: string | null;
  phone?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
}

/** Lo que hoy tiene la ficha del lead. */
export interface FichaDelCliente {
  email?: string | null;
  phone?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
}

const lleno = (v: string | null | undefined): v is string =>
  typeof v === 'string' && v.trim() !== '';

/**
 * Qué campos del lead conviene completar con lo que trajo el prospecto.
 *
 * **Completa huecos, nunca pisa.** Es la misma regla que ya usa el
 * enriquecimiento sobre `prospects`, y acá importa más: en la ficha del lead
 * puede haber datos que escribió una persona —un email que le pasaron por
 * teléfono, un contacto corregido a mano— y un scraper no tiene por qué ganarle
 * a eso.
 *
 * Devuelve un objeto vacío cuando no hay nada que agregar, así el llamador
 * puede saltarse la escritura.
 */
export function camposAPropagar(
  lead: FichaDelCliente,
  prospecto: DatosDelProspecto,
): Record<string, string> {
  const patch: Record<string, string> = {};

  if (!lleno(lead.email) && lleno(prospecto.email)) {
    patch.email = prospecto.email.trim();
  }
  // El teléfono del lead es el mismo campo que usa WhatsApp, y el que se
  // detectó como celular vale más que la línea fija.
  const telefono = lleno(prospecto.whatsapp_phone) ? prospecto.whatsapp_phone : prospecto.phone;
  if (!lleno(lead.phone) && lleno(telefono)) {
    patch.phone = telefono.trim();
  }
  if (!lleno(lead.instagram) && lleno(prospecto.instagram)) {
    patch.instagram = prospecto.instagram.trim().replace(/^@/, '');
  }
  if (!lleno(lead.linkedin) && lleno(prospecto.linkedin)) {
    patch.linkedin = prospecto.linkedin.trim();
  }

  return patch;
}

/** Si no hay nada que escribir, no se escribe. */
export function hayAlgoQuePropagar(patch: Record<string, string>): boolean {
  return Object.keys(patch).length > 0;
}
