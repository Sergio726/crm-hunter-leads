// Corrida REAL contra el actor de LinkedIn, con el mismo armado que usa la app.
//
// NO es un test: gasta plata (US$ 0,10 por página de 25 perfiles). Se corre a
// mano cuando hay que diagnosticar un "devolvió 0":
//
//     node --env-file=<ruta>/.env.local --import tsx --conditions=react-server tests/linkedin-corrida-real.ts
//
// Es la única forma de distinguir las tres causas posibles de un cero, que
// tienen arreglos opuestos:
//   1. el filtro de cargo (coincidencia exacta) no engancha con nadie
//   2. la zona no existe con ese nombre para LinkedIn
//   3. el actor falla o la cuenta se quedó sin crédito

import { buildLinkedinInput, relaxLinkedinInput, LINKEDIN_ACTOR, LINKEDIN_FIELDS, mapLinkedinProfiles } from '../src/lib/prospect/linkedin';
import type { ProspectFilters } from '../src/lib/prospect/types';

const token = process.env.APIFY_API_TOKEN;
if (!token) {
  console.error('Falta APIFY_API_TOKEN.');
  process.exit(1);
}

/** Lo que el usuario pidió: dueños de empresa en Buenos Aires, para venderles automatizaciones de IA. */
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
  // 10 = una sola página facturada. Alcanza para saber si devuelve algo.
  limit: 10,
  linkedin: {
    jobTitles: ['dueño de empresa', 'fundador', 'CEO'],
    industries: ['inteligencia artificial'],
    seniority: ['owner'],
    companySizes: [],
  },
};

const BASE = 'https://api.apify.com/v2';

/**
 * El log del actor dice lo que la API calla.
 *
 * El estado del run puede ser SUCCEEDED con el dataset vacío tanto porque la
 * búsqueda no encontró a nadie como porque el actor nunca arrancó a buscar. La
 * única diferencia visible está acá.
 */
async function mostrarLog(runId: string) {
  const log = await fetch(`${BASE}/actor-runs/${runId}/log?token=${token}`);
  if (!log.ok) return;
  const lineas = (await log.text()).trim().split('\n');
  console.log('  --- log del actor (últimas 6) ---');
  for (const l of lineas.slice(-6)) console.log(`  ${l.slice(0, 160)}`);
}

async function correr(input: Record<string, unknown>, etiqueta: string) {
  console.log(`\n── ${etiqueta} ──`);
  console.log(`input: ${JSON.stringify(input)}`);

  const start = await fetch(`${BASE}/acts/${LINKEDIN_ACTOR}/runs?token=${token}&timeout=600`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!start.ok) {
    console.log(`❌ Apify rechazó el arranque: ${start.status} ${(await start.text()).slice(0, 300)}`);
    return null;
  }
  const { data } = (await start.json()) as { data: { id: string; defaultDatasetId: string } };
  console.log(`run ${data.id} — esperando…`);

  // Polleo simple: esto corre a mano, no en producción.
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(`${BASE}/actor-runs/${data.id}?token=${token}`);
    const { data: snap } = (await res.json()) as {
      data: {
        status: string;
        usageTotalUsd?: number;
        statusMessage?: string;
        stats?: { itemCount?: number };
      };
    };
    if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(snap.status)) {
      console.log(
        `estado final: ${snap.status} | costó US$ ${snap.usageTotalUsd ?? '?'} | ` +
          `mensaje: ${snap.statusMessage ?? '-'}`,
      );
      // Un SUCCEEDED que costó US$ 0 no buscó: si hubiera buscado, la página se
      // factura aunque no encuentre a nadie. Fue lo que destrabó el diagnóstico
      // del 2026-08-18 — el estado y el dataset decían "todo bien, cero
      // resultados" y el log decía "free user run limit reached".
      if (snap.usageTotalUsd === 0) {
        console.log('⚠️ Costó US$ 0: sospechá que NO buscó. Mirá el log de abajo.');
      }
      await mostrarLog(data.id);
      if (snap.status !== 'SUCCEEDED') return null;
      break;
    }
    if (i % 4 === 0) console.log(`  … ${snap.status}`);
  }

  const items = await fetch(
    `${BASE}/datasets/${data.defaultDatasetId}/items?token=${token}&fields=${LINKEDIN_FIELDS}`,
  );
  const raw = (await items.json()) as unknown[];
  console.log(`DEVOLVIÓ: ${raw.length} perfiles`);
  if (raw.length > 0) {
    console.log(`primer ítem crudo: ${JSON.stringify(raw[0]).slice(0, 400)}`);
    const mapeados = mapLinkedinProfiles(raw as never[], filtros);
    console.log(`MAPEADOS: ${mapeados.length}`);
    for (const m of mapeados.slice(0, 3)) {
      console.log(`  · ${m.businessName} — ${m.roleTitle ?? '?'} @ ${m.companyName ?? '?'} (${m.area})`);
    }
    if (raw.length > 0 && mapeados.length === 0) {
      console.log('⚠️ El actor devolvió perfiles pero el mapeo los descartó TODOS.');
    }
  }
  return raw.length;
}

async function main() {
  const saldo = await fetch(`${BASE}/users/me/limits?token=${token}`);
  if (saldo.ok) {
    const { data } = (await saldo.json()) as { data: { current?: Record<string, number> } };
    console.log(`gastado este mes: US$ ${data.current?.monthlyUsageUsd ?? '?'}`);
  }

  const primero = buildLinkedinInput(filtros);
  const n1 = await correr(primero, 'INTENTO 1 — cargo exacto (lo que hace la app)');

  if (n1 === 0) {
    const wider = relaxLinkedinInput(primero);
    if (!wider) {
      console.log('\nNo hay nada que aflojar: el cero es real.');
      return;
    }
    console.log(`\nAflojando: ${wider.note}`);
    await correr(wider.input, 'INTENTO 2 — cargo como texto (el reintento automático)');
  }
}

void main();
