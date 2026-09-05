import { separarNotas } from '@/lib/notas-prospecto';
import type { ContactoDelLead } from '@/lib/canales';

/**
 * Por dónde se le puede escribir a un cliente, y cómo se abre cada canal.
 *
 * OJO con los dos "canales" del proyecto, que no son lo mismo:
 *   · `Channel` de `lib/types.ts` — whatsapp | sms | email | call | note. Es con
 *     qué se registró una **interacción**, y tiene un `check` en la base.
 *   · `Channel` de `lib/canales.ts` — whatsapp | instagram | email | linkedin.
 *     Es por dónde se **redacta un mensaje**.
 *
 * Esto de acá es un tercer conjunto y a propósito: lo que se puede **abrir**
 * desde la ficha. Incluye llamar y mandar un SMS, que no son canales de
 * mensaje, y suma Instagram y LinkedIn, que no son canales de interacción. Solo
 * abre un enlace: no registra nada, así que no toca la tabla ni su `check`.
 */
export type CanalDeContacto = 'whatsapp' | 'instagram' | 'email' | 'linkedin' | 'sms' | 'call';

export interface ContactoAbrible {
  phone: string | null;
  email: string | null;
  instagram?: string | null;
  linkedin?: string | null;
}

const digits = (phone: string | null | undefined) => (phone ?? '').replace(/\D/g, '');
const limpio = (v: string | null | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * De dónde sale cada dato de contacto de un cliente.
 *
 * `instagram` y `linkedin` se leen de la columna, y si está vacía se cae al
 * bloque automático de las notas. Los dos caminos hacen falta: la columna es
 * nueva (0053) y el dato venía guardando **dentro del texto de las notas** desde
 * que existe la prospección — 135 de los 163 clientes lo tienen solo ahí. Sin el
 * respaldo, el canal se vería apagado justo en los que sí se puede usar.
 */
export function contactoDeCliente(client: {
  phone: string | null;
  email: string | null;
  phone_2?: string | null;
  email_2?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  notes?: string | null;
}): ContactoDelLead & ContactoAbrible {
  const delBloque = separarNotas(client.notes).datos;
  return {
    // El segundo teléfono y el segundo email cuentan: si el principal está
    // vacío pero hay un alternativo, al cliente igual se le puede escribir.
    phone: limpio(client.phone) ?? limpio(client.phone_2) ?? null,
    email: limpio(client.email) ?? limpio(client.email_2) ?? null,
    instagram: limpio(client.instagram) ?? limpio(delBloque?.instagram) ?? null,
    linkedin: limpio(client.linkedin) ?? limpio(delBloque?.linkedin) ?? null,
  };
}

/** El perfil puede venir como URL entera o como usuario suelto; sirven los dos. */
function perfil(base: string, valor: string): string {
  const v = valor.trim().replace(/^@/, '');
  if (/^https?:\/\//i.test(v)) return v;
  return `${base}${v.replace(/^\/+/, '')}`;
}

/** Abre el canal de contacto (deeplink). Devuelve false si faltan datos. */
export function openContactChannel(channel: CanalDeContacto, contact: ContactoAbrible): boolean {
  const d = digits(contact.phone);

  if (channel === 'whatsapp') {
    if (!d) return false;
    window.open(`https://wa.me/${d}`, '_blank');
    return true;
  }
  if (channel === 'instagram') {
    const ig = limpio(contact.instagram);
    if (!ig) return false;
    // `ig.me/m/<usuario>` abre la conversación directamente —en la app si está
    // instalada— en vez de dejar al vendedor en el perfil con un clic más por
    // dar. Es el enlace que Instagram publica para esto.
    //
    // Si lo guardado es una URL entera, se respeta tal cual: puede ser un
    // enlace a algo que no es un perfil, y reescribirlo lo rompería.
    window.open(perfil('https://ig.me/m/', ig), '_blank');
    return true;
  }
  if (channel === 'linkedin') {
    const li = limpio(contact.linkedin);
    if (!li) return false;
    // El bloque de notas guarda el camino sin el dominio (`in/juan-perez`), así
    // que la base ya trae la barra final.
    window.open(perfil('https://www.linkedin.com/', li), '_blank');
    return true;
  }
  if (channel === 'sms') {
    if (!contact.phone) return false;
    window.location.assign(`sms:${contact.phone}`);
    return true;
  }
  if (channel === 'call') {
    if (!contact.phone) return false;
    window.location.assign(`tel:${contact.phone}`);
    return true;
  }
  if (!contact.email) return false;
  window.location.assign(`mailto:${contact.email}`);
  return true;
}
