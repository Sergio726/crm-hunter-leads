/**
 * Corre una búsqueda REAL desde la terminal, sin levantar la app.
 *
 * Para qué sirve: probar el circuito completo de una fuente contra su proveedor
 * —y ver qué devuelve de verdad— sin necesitar sesión, navegador ni deploy. Es
 * lo que permitió encontrar los dos bugs que dejaban LinkedIn en cero: que la
 * documentación del actor no coincide con sus campos reales, y que una zona
 * escrita para que la lea una persona ("Colombia (todo el país)") no matchea
 * nada en un filtro de coincidencia exacta.
 *
 * ⚠️ GASTA PLATA DE VERDAD. Cada corrida se factura al proveedor. Usá `limit`
 * chico: 5 alcanza para saber si algo anda.
 *
 * Uso:
 *   npx tsx --conditions=react-server scripts/buscar.ts <filtros.json>
 *
 * Las credenciales salen de `web/.env.local`. Si ese archivo está vacío —pasa en
 * los worktrees, porque no se comparte entre copias— apuntá a otro:
 *   HUNTER_ENV_FILE=C:/ruta/al/.env.local npx tsx ... scripts/buscar.ts f.json
 *
 * Ejemplo de filtros.json:
 *   {
 *     "source": "linkedin",
 *     "queries": ["gerente comercial"],
 *     "areas": ["Colombia"],
 *     "country": "CO",
 *     "niche": "generico",
 *     "requireNoWebsite": false,
 *     "requireInstagram": false,
 *     "requireLinkedin": false,
 *     "requireWhatsapp": false,
 *     "minRating": null,
 *     "limit": 5
 *   }
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runProspectSearch } from '../src/lib/prospect/places';
import {
  LINKEDIN_ACTOR,
  LINKEDIN_FIELDS,
  buildLinkedinInput,
  mapLinkedinProfiles,
} from '../src/lib/prospect/linkedin';
import {
  IG_SEARCH_ACTOR,
  IG_SEARCH_FIELDS,
  buildIgSearchInput,
  mapIgSearchResults,
} from '../src/lib/prospect/instagram-search';
import { GRADE_LABELS, gradeFor, type ProspectFilters, type ProspectResult } from '../src/lib/prospect/types';

const ENV_FILE = process.env.HUNTER_ENV_FILE ?? resolve(process.cwd(), '.env.local');

/** Lee una credencial del .env sin imprimirla nunca. */
function env(name: string): string {
  let texto: string;
  try {
    texto = readFileSync(ENV_FILE, 'utf8');
  } catch {
    throw new Error(`No pude leer ${ENV_FILE}. Pasá HUNTER_ENV_FILE con la ruta correcta.`);
  }
  const linea = texto.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  const valor = linea?.slice(name.length + 1).trim();
  if (!valor) {
    throw new Error(
      `${name} está vacía en ${ENV_FILE}. En un worktree el .env.local sale vacío: ` +
        `apuntá HUNTER_ENV_FILE al del checkout principal.`,
    );
  }
  return valor;
}

/** Corre un actor de Apify y espera el resultado en la misma llamada. */
async function correrActor<T>(actor: string, input: unknown, fields: string, maxItems: number) {
  const url = new URL(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items`);
  url.searchParams.set('token', env('APIFY_API_TOKEN'));
  url.searchParams.set('fields', fields);
  url.searchParams.set('maxItems', String(maxItems));
  // Techo de gasto del lado de Apify: vale aunque este script tenga un error.
  url.searchParams.set('maxTotalChargeUsd', '1');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T[];
}

function mostrar(results: ProspectResult[], crudos: number) {
  console.log(`\n  ítems del proveedor: ${crudos} · prospectos: ${results.length}\n`);
  for (const r of results) {
    const grade = gradeFor(r.score);
    console.log(`  ${r.businessName} — ${r.score} (${grade ? GRADE_LABELS[grade] : '—'})`);
    if (r.roleTitle) console.log(`    ${r.roleTitle}${r.companyName ? ` · ${r.companyName}` : ''}`);
    if (r.area) console.log(`    zona: ${r.area}`);
    const contacto = [
      r.whatsappPhone && `wa ${r.whatsappPhone}`,
      r.instagram && `@${r.instagram}`,
      r.linkedin && `li ${r.linkedin}`,
      r.website,
    ].filter(Boolean);
    if (contacto.length) console.log(`    ${contacto.join(' · ')}`);
    console.log(`    ${r.reasons.join(' · ')}`);
    console.log('');
  }
}

async function main() {
  const archivo = process.argv[2];
  if (!archivo) {
    console.error('uso: tsx --conditions=react-server scripts/buscar.ts <filtros.json>');
    process.exit(1);
  }

  const filters = JSON.parse(readFileSync(archivo, 'utf8')) as ProspectFilters;
  console.log(`\n▶ ${filters.source} · ${filters.areas.join(' · ')} · hasta ${filters.limit}`);

  if (filters.source === 'google_places') {
    const run = await runProspectSearch(filters, env('GOOGLE_PLACES_API_KEY'));
    console.log(`  consultas facturadas: ${run.requestsUsed} (~US$ ${(run.requestsUsed * 0.04).toFixed(2)})`);
    console.log(`  descartados: ${JSON.stringify(run.discarded)}`);
    mostrar(run.results, run.totalMatched);
    return;
  }

  if (filters.source === 'linkedin') {
    const input = buildLinkedinInput(filters);
    console.log(`  zona que se manda: ${JSON.stringify(input.locations)}`);
    const raw = await correrActor<Parameters<typeof mapLinkedinProfiles>[0][number]>(
      LINKEDIN_ACTOR,
      input,
      LINKEDIN_FIELDS,
      filters.limit,
    );
    mostrar(mapLinkedinProfiles(raw, filters), raw.length);
    return;
  }

  if (filters.source === 'instagram') {
    const input = buildIgSearchInput(filters);
    console.log(`  término: ${JSON.stringify(input.search)}`);
    const raw = await correrActor<Parameters<typeof mapIgSearchResults>[0][number]>(
      IG_SEARCH_ACTOR,
      input,
      IG_SEARCH_FIELDS,
      filters.limit * 6,
    );
    mostrar(mapIgSearchResults(raw, filters), raw.length);
    return;
  }

  throw new Error(`La fuente "${filters.source}" no se puede buscar desde acá.`);
}

main().catch((e) => {
  console.error('\n  FALLÓ:', e instanceof Error ? e.message : e);
  process.exit(1);
});
