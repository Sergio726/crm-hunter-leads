// El texto del recordatorio de seguimientos vencidos.
//
// Módulo PURO: sin red, sin `server-only`, sin React. Se puede probar entero, y
// es la parte que más se va a retocar — el texto de un mail se lee una vez por
// día y tiene que decir algo útil en la primera línea.

/** Un cliente al que se le pasó la fecha de seguimiento. */
export interface ClienteVencido {
  id: string;
  nombre: string;
  empresa?: string | null;
  /** Fecha en formato `YYYY-MM-DD`, tal como la devuelve Postgres. */
  vence: string;
}

export interface RecordatorioDestinatario {
  user_id: string;
  email: string;
  full_name?: string | null;
  clientes: ClienteVencido[];
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
  const uno = Date.UTC(a1, m1 - 1, d1);
  const dos = Date.UTC(a2, m2 - 1, d2);
  return Math.round((dos - uno) / 86_400_000);
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
 * Lleva el número adelante porque es lo único que se ve en la lista del correo
 * y en la notificación del teléfono: "Tenés 3 seguimientos vencidos" se entiende
 * sin abrir nada.
 */
export function asunto(cantidad: number): string {
  return cantidad === 1
    ? 'Tenés 1 seguimiento vencido'
    : `Tenés ${cantidad} seguimientos vencidos`;
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

export interface Recordatorio {
  asunto: string;
  texto: string;
  html: string;
}

/**
 * Arma el recordatorio de un vendedor.
 *
 * Un solo mail por persona con todos sus vencidos, no uno por cliente: alguien
 * con quince atrasados recibiría quince mails y no leería ninguno.
 */
export function armarRecordatorio(
  d: RecordatorioDestinatario,
  hoy: string,
  urlClientes: string,
): Recordatorio {
  const hola = nombreCorto(d.full_name);
  const saludo = hola ? `Hola ${hola},` : 'Hola,';
  const lineas = d.clientes.map((c) => {
    const quien = c.empresa ? `${c.nombre} (${c.empresa})` : c.nombre;
    return { quien, cuando: atrasoEnPalabras(diasDeAtraso(c.vence, hoy)) };
  });

  const texto = [
    saludo,
    '',
    d.clientes.length === 1
      ? 'Se te pasó un seguimiento:'
      : `Se te pasaron ${d.clientes.length} seguimientos:`,
    '',
    ...lineas.map((l) => `· ${l.quien} — ${l.cuando}`),
    '',
    `Podés verlos acá: ${urlClientes}`,
    '',
    'Hunter Leads',
  ].join('\n');

  const html = [
    `<p>${esc(saludo)}</p>`,
    `<p>${
      d.clientes.length === 1
        ? 'Se te pasó un seguimiento:'
        : `Se te pasaron <strong>${d.clientes.length}</strong> seguimientos:`
    }</p>`,
    '<ul>',
    ...lineas.map((l) => `<li>${esc(l.quien)} — ${esc(l.cuando)}</li>`),
    '</ul>',
    `<p><a href="${esc(urlClientes)}">Ver mis clientes</a></p>`,
    '<p style="color:#6b7280;font-size:12px">Hunter Leads</p>',
  ].join('');

  return { asunto: asunto(d.clientes.length), texto, html };
}
