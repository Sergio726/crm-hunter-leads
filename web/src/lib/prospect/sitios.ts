// Qué URL vale la pena leer, y cuánto cuesta leerla.
//
// Vive fuera de `contacts.ts` por una razón concreta: ese módulo es
// `server-only` (habla con Apify), y el botón que dispara la búsqueda corre en
// el navegador. Sin esto, la pantalla no puede decir *antes* de apretar cuántos
// prospectos son elegibles, y el vendedor se entera después de pedirlo.
//
// `contacts.ts` re-exporta lo de acá, así que sigue siendo el único lugar del
// que importa el servidor.

/** `https://www.acme.com.ar/contacto` → `acme.com.ar` */
export function domainOf(url: string): string | null {
  try {
    const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.toLowerCase();
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/**
 * Dominios que NO son un sitio para leer: mandarlos al scraper es tirar plata.
 *
 * Salió de mirar los datos reales: el campo "sitio web" de los prospectos suele
 * traer un `wa.me/...` o el propio Instagram, porque justamente son negocios
 * SIN web propia. Cobrar por raspar un link de WhatsApp no tiene sentido.
 */
const NO_SON_SITIOS = [
  'wa.me',
  'api.whatsapp.com',
  'whatsapp.com',
  'instagram.com',
  'facebook.com',
  'fb.me',
  'm.me',
  'linkedin.com',
  't.me',
  'tiktok.com',
  'youtube.com',
  'goo.gl',
  'maps.app.goo.gl',
];

/** ¿Vale la pena pagar por leer esta URL? */
export function esSitioLeible(url: string): boolean {
  const d = domainOf(url);
  if (!d) return false;
  return !NO_SON_SITIOS.some((mal) => d === mal || d.endsWith(`.${mal}`));
}

/**
 * Lo que cobra Apify por leer un sitio con el actor de contactos.
 *
 * Medido en la validación con datos reales (2026-08-14): ~US$ 0,005 por sitio
 * con 3 páginas de profundidad y los add-ons pagos apagados. Es una
 * estimación, no una factura — sirve para frenar antes de gastar, que es
 * exactamente lo que se necesita.
 */
export const COSTO_POR_SITIO_USD = 0.005;

/** Cuánto sale, en dólares, leer esta cantidad de sitios. */
export function costoDeLeerSitios(sitios: number): number {
  return Math.max(0, sitios) * COSTO_POR_SITIO_USD;
}
