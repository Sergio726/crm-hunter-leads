// El texto del aviso que recibe un vendedor por mail.
//
// Módulo PURO: sin red, sin `server-only`, sin React. Se puede probar entero, y
// es la parte que más se va a retocar — un mail se lee una vez por día y tiene
// que decir algo útil en la primera línea.
//
// Cubre los DOS eventos en un solo cuerpo. Alguien con tres vencidos y dos
// clientes nuevos recibe UN mail, no cinco: cinco mails no se leen.

/** Un ítem pendiente, tal como lo devuelve `notificaciones_pendientes()`. */
export interface ItemPendiente {
  id: string;
  evento: 'followup.overdue' | 'lead.assigned' | 'client.stale';
  cliente: string | null;
  empresa?: string | null;
  /** `YYYY-MM-DD` para los vencidos; null para el resto. */
  vence?: string | null;
  /** Días desde el último contacto. Lo que hace accionable al aviso de inactividad. */
  dias_sin_contacto?: number | null;
}

export interface Destinatario {
  user_id: string;
  email: string;
  full_name?: string | null;
  items: ItemPendiente[];
}

/**
 * Cuántos días pasaron desde la fecha de seguimiento.
 *
 * Se compara en fechas puras (`YYYY-MM-DD`), no en instantes: `next_follow_up`
 * es un `date` sin hora, y convertirlo a `Date` local puede correrlo un día
 * según la zona horaria — el error clásico de "vence hoy" mostrado como
 * "vence ayer" para quien está en UTC-3.
 */
export function diasDeAtraso(vence: string, hoy: string): number {
  const [a1, m1, d1] = vence.split('-').map(Number);
  const [a2, m2, d2] = hoy.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** "hace 1 día" / "hace 5 días", que es como lo diría una persona. */
export function atrasoEnPalabras(dias: number): string {
  if (dias <= 0) return 'vence hoy';
  if (dias === 1) return 'hace 1 día';
  return `hace ${dias} días`;
}

/**
 * El asunto.
 *
 * Lleva los números adelante porque es lo único que se ve en la lista del correo
 * y en la notificación del teléfono. Con los dos eventos junta las dos cosas en
 * una frase en vez de elegir una.
 */
export function asunto(vencidos: number, asignados: number, inactivos = 0): string {
  const partes: string[] = [];
  if (vencidos > 0) {
    partes.push(vencidos === 1 ? '1 seguimiento vencido' : `${vencidos} seguimientos vencidos`);
  }
  if (inactivos > 0) {
    partes.push(inactivos === 1 ? '1 cliente sin contactar' : `${inactivos} clientes sin contactar`);
  }
  if (asignados > 0) {
    partes.push(asignados === 1 ? '1 cliente nuevo' : `${asignados} clientes nuevos`);
  }
  if (partes.length === 0) return 'Tenés novedades';
  // "a, b y c": la coma de más antes del "y" se lee mal en castellano.
  const ultima = partes.pop() as string;
  return partes.length > 0
    ? `Tenés ${partes.join(', ')} y ${ultima}`
    : `Tenés ${ultima}`;
}

function nombreCorto(nombre?: string | null): string {
  const limpio = (nombre ?? '').trim();
  return limpio ? limpio.split(/\s+/)[0] : '';
}

/** Escapa lo que va dentro del HTML: los nombres los escribe el usuario. */
function esc(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "Ana Gómez (Kuvia)" o "Ana Gómez" si no hay empresa. */
function quien(i: ItemPendiente): string {
  const nombre = i.cliente ?? 'Un cliente';
  return i.empresa ? `${nombre} (${i.empresa})` : nombre;
}

export interface Aviso {
  asunto: string;
  texto: string;
  html: string;
}

export function armarAviso(d: Destinatario, hoy: string, urlClientes: string): Aviso {
  const vencidos = d.items.filter((i) => i.evento === 'followup.overdue');
  const asignados = d.items.filter((i) => i.evento === 'lead.assigned');
  const inactivos = d.items.filter((i) => i.evento === 'client.stale');

  const hola = nombreCorto(d.full_name);
  const saludo = hola ? `Hola ${hola},` : 'Hola,';

  const lineasVencidos = vencidos.map(
    (i) => `${quien(i)} — ${i.vence ? atrasoEnPalabras(diasDeAtraso(i.vence, hoy)) : 'sin fecha'}`,
  );
  const lineasAsignados = asignados.map((i) => quien(i));
  // El número de días es lo que hace accionable al aviso: "hace mucho" no mueve
  // a nadie, "hace 12 días" sí.
  const lineasInactivos = inactivos.map((i) =>
    i.dias_sin_contacto != null
      ? `${quien(i)} — hace ${i.dias_sin_contacto} días`
      : quien(i),
  );

  const texto = [saludo, ''];
  if (lineasVencidos.length > 0) {
    texto.push(
      lineasVencidos.length === 1 ? 'Se te pasó un seguimiento:' : 'Se te pasaron estos seguimientos:',
      '',
      ...lineasVencidos.map((l) => `· ${l}`),
      '',
    );
  }
  if (lineasInactivos.length > 0) {
    texto.push(
      lineasInactivos.length === 1
        ? 'Hace rato que no tocás este cliente:'
        : 'Hace rato que no tocás estos clientes:',
      '',
      ...lineasInactivos.map((l) => `· ${l}`),
      '',
    );
  }
  if (lineasAsignados.length > 0) {
    texto.push(
      lineasAsignados.length === 1 ? 'Te asignaron un cliente:' : 'Te asignaron estos clientes:',
      '',
      ...lineasAsignados.map((l) => `· ${l}`),
      '',
    );
  }
  texto.push(`Podés verlos acá: ${urlClientes}`, '', 'Hunter Leads');

  const html: string[] = [`<p>${esc(saludo)}</p>`];
  if (lineasVencidos.length > 0) {
    html.push(
      `<p>${lineasVencidos.length === 1 ? 'Se te pasó un seguimiento:' : 'Se te pasaron estos seguimientos:'}</p>`,
      '<ul>',
      ...lineasVencidos.map((l) => `<li>${esc(l)}</li>`),
      '</ul>',
    );
  }
  if (lineasInactivos.length > 0) {
    html.push(
      `<p>${
        lineasInactivos.length === 1
          ? 'Hace rato que no tocás este cliente:'
          : 'Hace rato que no tocás estos clientes:'
      }</p>`,
      '<ul>',
      ...lineasInactivos.map((l) => `<li>${esc(l)}</li>`),
      '</ul>',
    );
  }
  if (lineasAsignados.length > 0) {
    html.push(
      `<p>${lineasAsignados.length === 1 ? 'Te asignaron un cliente:' : 'Te asignaron estos clientes:'}</p>`,
      '<ul>',
      ...lineasAsignados.map((l) => `<li>${esc(l)}</li>`),
      '</ul>',
    );
  }
  html.push(
    `<p><a href="${esc(urlClientes)}">Ver mis clientes</a></p>`,
    '<p style="color:#6b7280;font-size:12px">Hunter Leads</p>',
  );

  return {
    asunto: asunto(vencidos.length, asignados.length, inactivos.length),
    texto: texto.join('\n'),
    html: html.join(''),
  };
}
