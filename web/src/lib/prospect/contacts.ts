// Enriquecimiento de contacto: email, WhatsApp y redes leídos del sitio web del
// prospecto. SOLO servidor.
//
// Actor `vdrmota/contact-info-scraper`, validado con datos reales antes de
// escribir este código (ver docs/PROSPECCION-CONTACTOS.md): email en 4 de 5
// sitios del ICP, ~US$ 0,005 por sitio.
//
// Por qué existe este módulo y no alcanza con Places: Google publica UN enlace
// por negocio. Si ese enlace es el sitio propio, nunca sabemos su Instagram; si
// es su Instagram, nunca sabemos su web. Y el email no lo da nunca. Medido sobre
// la base real: de 47 prospectos encontrados por Turbo solo 17 tenían Instagram
// y CERO tenían LinkedIn. Leer el sitio es lo único que llena esos huecos.

import 'server-only';
import { ApifyError, apifyErrorFor } from './apify';

const CONTACT_ACTOR = 'vdrmota~contact-info-scraper';
const APIFY_BASE = 'https://api.apify.com/v2/acts';

/** Tope de sitios por corrida. Mismo criterio de tiempo que en `apify.ts`. */
export const MAX_SITES_PER_RUN = 20;

/** Techo de gasto por corrida, aplicado por Apify. ~US$ 0,005 por sitio. */
export const MAX_COST_PER_RUN_USD = 1;

/** Páginas por sitio. Con 3 alcanzó en la prueba real; más es pagar de más. */
const PAGES_PER_SITE = 3;

export type ContactStatus = 'ok' | 'not_found' | 'unreachable' | 'error';

export interface ScrapedContact {
  /** El sitio tal como se pidió, para poder mapearlo de vuelta al prospecto. */
  website: string;
  status: ContactStatus;
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
  instagram: string | null;
  linkedin: string | null;
}

interface ContactItem {
  url?: string;
  domain?: string;
  emails?: string[];
  phones?: string[];
  phonesUncertain?: string[];
  whatsapps?: string[];
  instagrams?: string[];
  linkedIns?: string[];
  scrapedUrls?: string[];
}

/** Emails que no son de nadie: no sirven para escribirle a un negocio. */
const EMAIL_BLOCKLIST = [
  'example.com',
  'sentry.io',
  'wordpress.',
  'wixpress.com',
  '@sentry',
  'godaddy',
  'domain.com',
];

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
 * Elige un email entre los que publica el sitio.
 *
 * Prioriza el que una persona leería como "el del negocio": primero los de
 * contacto directo, después cualquiera del mismo dominio, y recién al final uno
 * de afuera (un Gmail, habitual en comercios chicos).
 */
export function pickEmail(emails: string[] | undefined, site: string): string | null {
  const clean = (emails ?? [])
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e))
    .filter((e) => !EMAIL_BLOCKLIST.some((bad) => e.includes(bad)))
    // Un email con extensión de imagen es un archivo mal parseado, no un contacto.
    .filter((e) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(e));
  if (clean.length === 0) return null;

  const preferred = ['info@', 'contacto@', 'ventas@', 'hola@', 'comercial@', 'consultas@'];
  const byPrefix = clean.find((e) => preferred.some((p) => e.startsWith(p)));
  if (byPrefix) return byPrefix;

  const domain = domainOf(site);
  if (domain) {
    const own = clean.find((e) => e.endsWith(`@${domain}`) || e.endsWith(`.${domain}`));
    if (own) return own;
  }

  return clean[0];
}

/**
 * El WhatsApp viene como enlace (`wa.me/5493514445566`, `api.whatsapp.com/send?phone=…`),
 * no como número. Se extrae y se normaliza a E.164.
 */
export function normalizeWhatsapp(links: string[] | undefined): string | null {
  for (const raw of links ?? []) {
    const digits = (/(?:phone=|wa\.me\/|whatsapp\.com\/send\/?\?phone=)(\+?\d[\d\s-]{6,})/i.exec(
      raw,
    )?.[1] ?? '')
      .replace(/\D/g, '');
    if (digits.length >= 8) return `+${digits}`;
  }
  return null;
}

/** Primer teléfono utilizable. Los `phonesUncertain` se ignoran a propósito. */
function pickPhone(phones: string[] | undefined): string | null {
  for (const raw of phones ?? []) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 8) return raw.trim();
  }
  return null;
}

/** `https://instagram.com/acme/` → `acme` */
export function handleFromInstagram(urls: string[] | undefined): string | null {
  for (const raw of urls ?? []) {
    const m = /(?:instagram\.com|instagr\.am)\/([A-Za-z0-9._]{2,30})/i.exec(raw);
    const handle = m?.[1]?.toLowerCase().replace(/\.$/, '');
    if (handle && !['p', 'reel', 'reels', 'explore', 'accounts', 'stories'].includes(handle)) {
      return handle;
    }
  }
  return null;
}

/**
 * `https://ar.linkedin.com/company/acme/about` → `company/acme`
 *
 * Se guarda con el tipo adelante por la misma razón que en `places.ts`:
 * `company/acme` e `in/acme` son perfiles distintos y sin el tipo la URL no se
 * puede reconstruir.
 */
export function slugFromLinkedin(urls: string[] | undefined): string | null {
  for (const raw of urls ?? []) {
    const m = /linkedin\.com\/(company|in|school)\/([A-Za-z0-9\-_%.]{2,100})/i.exec(raw);
    if (!m) continue;
    const slug = m[2].toLowerCase().split(/[/?#]/)[0].replace(/\.$/, '');
    if (slug.length >= 2) return `${m[1].toLowerCase()}/${slug}`;
  }
  return null;
}

function emptyContact(website: string, status: ContactStatus): ScrapedContact {
  return {
    website,
    status,
    email: null,
    whatsapp: null,
    phone: null,
    instagram: null,
    linkedin: null,
  };
}

/**
 * Lee hasta MAX_SITES_PER_RUN sitios y devuelve sus datos de contacto.
 *
 * Devuelve una entrada por sitio pedido, incluso los que fallaron: quien llama
 * necesita marcarlos como intentados para no volver a pagarlos.
 */
export async function scrapeContacts(
  websites: string[],
  apiToken: string,
): Promise<ScrapedContact[]> {
  const unique = [...new Set(websites.map((w) => w.trim()).filter(Boolean))].slice(
    0,
    MAX_SITES_PER_RUN,
  );
  if (unique.length === 0) return [];

  const url = new URL(`${APIFY_BASE}/${CONTACT_ACTOR}/run-sync-get-dataset-items`);
  url.searchParams.set('token', apiToken);
  url.searchParams.set('maxTotalChargeUsd', String(MAX_COST_PER_RUN_USD));

  let items: ContactItem[];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: unique.map((w) => ({ url: w.startsWith('http') ? w : `https://${w}` })),
        maxRequestsPerStartUrl: PAGES_PER_SITE,
        maxDepth: 1,
        sameDomain: true,
        mergeContacts: true,
        considerChildFrames: true,
        // Todos los add-ons pagos apagados de forma explícita: en el tier
        // gratuito cuestan US$ 0,10 por evento, veinte veces la corrida entera.
        maximumLeadsEnrichmentRecords: 0,
        verifyLeadsEnrichmentEmails: false,
        scrapeSocialMediaProfiles: {
          facebooks: false,
          instagrams: false,
          youtubes: false,
          tiktoks: false,
          twitters: false,
        },
        // Apagado a propósito: recuperaría ~1 de cada 5 sitios que bloquean al
        // scraper, pero encarece TODAS las corridas. Se reevalúa con datos.
        useBrowser: false,
        proxyConfig: { useApifyProxy: true },
      }),
      cache: 'no-store',
    });

    if (!res.ok) throw apifyErrorFor(res.status, await res.text().catch(() => ''));
    items = (await res.json()) as ContactItem[];
  } catch (error) {
    if (error instanceof ApifyError) throw error;
    return unique.map((w) => emptyContact(w, 'error'));
  }

  // El actor devuelve la URL que efectivamente visitó, que puede diferir de la
  // pedida (redirecciones, /contacto). Se mapea por dominio, que sí coincide.
  const byDomain = new Map<string, ContactItem>();
  for (const item of items ?? []) {
    const d = item.domain?.toLowerCase().replace(/^www\./, '') ?? domainOf(item.url ?? '');
    if (d && !byDomain.has(d)) byDomain.set(d, item);
  }

  return unique.map((website) => {
    const domain = domainOf(website);
    const item = domain ? byDomain.get(domain) : undefined;
    if (!item) return emptyContact(website, 'error');

    // Cero páginas leídas = el sitio bloqueó al scraper. No es que no tenga
    // email: no se llegó a mirar. Distinguirlo evita descartar el prospecto por
    // una conclusión que nunca se sacó.
    if ((item.scrapedUrls?.length ?? 0) === 0) return emptyContact(website, 'unreachable');

    const email = pickEmail(item.emails, website);
    const whatsapp = normalizeWhatsapp(item.whatsapps);
    const phone = pickPhone(item.phones);
    const instagram = handleFromInstagram(item.instagrams);
    const linkedin = slugFromLinkedin(item.linkedIns);

    const foundSomething = Boolean(email || whatsapp || phone || instagram || linkedin);
    return {
      website,
      status: foundSomething ? ('ok' as const) : ('not_found' as const),
      email,
      whatsapp,
      phone,
      instagram,
      linkedin,
    };
  });
}
