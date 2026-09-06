// Prueba de punta a punta de una búsqueda de LinkedIn, con el código real.
//
// No es un test: llama al proveedor y gasta plata (US$ 0 mientras la cuenta
// esté en el tope). Se corre a mano:
//
//   node --env-file=<ruta>/.env.local --import tsx --conditions=react-server \
//        tests/linkedin-extremo-a-extremo.ts
//
// Recorre exactamente el mismo camino que la app: arma el input con
// `buildLinkedinInput`, arranca con `startRun`, poll con `getRun`, decide con
// `providerDidNotRun` y clasifica con `problemFrom`. Lo único que no toca es la
// ruta HTTP y la pantalla, que necesitan sesión.
//
// Sirve para responder una sola pregunta: **¿qué vería el vendedor?**

import { getRun, isFinished, isSuccess, providerDidNotRun, startRun } from '../src/lib/prospect/apify-runs';
import { MAX_COST_PER_RUN_USD } from '../src/lib/prospect/apify';
import {
  LINKEDIN_ACTOR,
  LINKEDIN_FIELDS,
  buildLinkedinInput,
  mapLinkedinProfiles,
  relaxLinkedinInput,
  type RawLinkedinProfile,
} from '../src/lib/prospect/linkedin';
import { fetchItems } from '../src/lib/prospect/apify-runs';
import { problemFrom } from '../src/lib/prospect/provider-problem';
import { outcomeFor } from '../src/lib/prospect/request-log';
import type { ProspectFilters } from '../src/lib/prospect/types';

const token = process.env.APIFY_API_TOKEN;
if (!token) {
  console.error('Falta APIFY_API_TOKEN.');
  process.exit(1);
}

/** Lo mismo que pidió el usuario: dueños de empresa en Buenos Aires. */
const filtros: ProspectFilters = {
  source: 'linkedin',
  queries: [],
  areas: ['Buenos Aires'],
  country: 'AR',
  niche: 'generico',
  requireNoWebsite: false,
  requireInstagram: false,
  requireLinkedin: false,
  requireWhatsapp: false,
  minRating: null,
  limit: 10,
  linkedin: {
    jobTitles: ['fundador', 'CEO', 'socio gerente'],
    industries: [],
    seniority: ['owner'],
    companySizes: [],
  },
};

async function main() {
  const input = buildLinkedinInput(filtros);
  console.log('INPUT que arma la app:');
  console.log(JSON.stringify(input, null, 2));

  const started = await startRun(LINKEDIN_ACTOR, input, token as string, {
    maxItems: 25,
    maxCostUsd: MAX_COST_PER_RUN_USD,
    timeoutSecs: 600,
  });
  console.log(`\nrun ${started.runId} — esperando…`);

  let snap = await getRun(started.runId, token as string);
  for (let i = 0; i < 60 && !isFinished(snap.status); i += 1) {
    await new Promise((r) => setTimeout(r, 5000));
    snap = await getRun(started.runId, token as string);
  }

  console.log('\nSNAPSHOT (lo que ve la app):');
  console.log(`  estado   : ${snap.status}`);
  console.log(`  ítems    : ${snap.itemCount}`);
  console.log(`  costo    : US$ ${snap.costUsd}`);
  console.log(`  mensaje  : ${snap.statusMessage ?? '(ninguno)'}`);

  if (!isSuccess(snap.status)) {
    console.log(`\n❌ El trabajo terminó como ${snap.status}.`);
    return;
  }

  // ── La decisión que importa ───────────────────────────────────────────────
  const noEjecuto = providerDidNotRun(snap);

  console.log('\n══════ LO QUE VERÍA EL VENDEDOR ══════');
  if (noEjecuto) {
    console.log(`CARTEL: ${noEjecuto}`);
    console.log(`tipo de problema: ${problemFrom(noEjecuto)}`);
    console.log(
      problemFrom(noEjecuto) === 'tope-corridas'
        ? '→ NO se le ofrece "buscar la mitad" (no serviría de nada). Correcto.'
        : '→ Se le ofrece "buscar la mitad".',
    );
    console.log(`se registra en el log como: ${outcomeFor(0, noEjecuto)}`);
    return;
  }

  const raw = await fetchItems<RawLinkedinProfile>(
    started.datasetId,
    token as string,
    LINKEDIN_FIELDS,
  );
  console.log(`el proveedor devolvió ${raw.length} perfiles`);

  if (raw.length === 0) {
    const wider = relaxLinkedinInput(input);
    console.log(wider ? `→ reintentaría más ancho: ${wider.note}` : '→ el cero es real.');
    console.log(`se registra como: ${outcomeFor(0)}`);
    return;
  }

  const results = mapLinkedinProfiles(raw, filtros);
  console.log(`mapeados: ${results.length} (se registra como ${outcomeFor(results.length)})`);
  if (raw.length > 0 && results.length === 0) {
    console.log('⚠️ El proveedor devolvió perfiles y el mapeo los descartó TODOS.');
  }
  for (const r of results.slice(0, 5)) {
    console.log(`  · ${r.businessName} — ${r.roleTitle ?? '?'} @ ${r.companyName ?? '?'} (${r.area})`);
  }
}

void main();
