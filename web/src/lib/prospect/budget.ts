// Cuánta plata queda para prospectar — SOLO servidor.
//
// Existe porque nadie lo sabía. La cuenta de Apify está en el plan gratis, con
// un tope de US$ 5 por mes que corta TODO cuando se alcanza: búsquedas de
// LinkedIn, enriquecimiento de Instagram y datos de contacto. Hasta ahora eso se
// descubría fallando.
//
// Los dos proveedores no se leen igual, y conviene tenerlo claro:
//
//   Apify   → saldo REAL, lo devuelve su API.
//   Google  → ESTIMADO nuestro. No hay endpoint de gasto sin configurar Cloud
//             Billing, así que se calcula con las corridas que ya registramos.
//             Se dice que es una estimación en todos lados donde se muestra.

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SOURCES } from './sources/catalog';

/** Consultas gratis por mes en el escalón de Places que usamos. */
export const GOOGLE_FREE_REQUESTS = 1000;

/** Tope de consultas por corrida, igual que en `places.ts`. */
const MAX_REQUESTS_PER_RUN = 24;

export interface Budget {
  /** Saldo real de Apify. `null` si no se pudo consultar. */
  apify: { usedUsd: number; limitUsd: number; remainingUsd: number } | null;
  /** Estimación propia del consumo de Google en el mes en curso. */
  google: { requests: number; freeRequests: number; estimatedUsd: number };
  /**
   * Por qué Apify no está dejando ejecutar, si pasó hace poco.
   *
   * Sale del log de solicitudes y no del saldo, porque el saldo no lo sabe: el
   * tope del plan gratis limita **cuántas veces** se corre el actor, no cuánta
   * plata queda. Sin esto la línea de presupuesto decía "quedan US$ 2,75"
   * mientras ninguna búsqueda podía ejecutarse.
   */
  apifyBlocked?: string | null;
}

/**
 * ¿Apify rechazó una corrida hace poco?
 *
 * Se mira solo lo reciente: si el tope se levantó al renovarse el ciclo, un
 * aviso viejo asustaría sin motivo.
 */
export async function readApifyBlocked(
  supabase: SupabaseClient,
  horas = 12,
): Promise<string | null> {
  const desde = new Date(Date.now() - horas * 3600_000).toISOString();
  const { data } = await supabase
    .from('prospect_request_log')
    .select('error, created_at')
    .eq('outcome', 'provider_skipped')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1);
  const fila = data?.[0] as { error?: string } | undefined;
  return fila?.error ?? null;
}

interface ApifyLimits {
  data?: {
    limits?: { maxMonthlyUsageUsd?: number };
    current?: { monthlyUsageUsd?: number };
  };
}

/**
 * Saldo de Apify.
 *
 * No lanza: quedarse sin saber el saldo no puede romper el chat ni una
 * búsqueda. Si falla se devuelve `null` y quien muestra decide qué decir.
 */
export async function readApifyBudget(apiToken: string): Promise<Budget['apify']> {
  try {
    const res = await fetch(
      `https://api.apify.com/v2/users/me/limits?token=${encodeURIComponent(apiToken)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as ApifyLimits;
    const limitUsd = payload.data?.limits?.maxMonthlyUsageUsd;
    const usedUsd = payload.data?.current?.monthlyUsageUsd;
    if (typeof limitUsd !== 'number' || typeof usedUsd !== 'number') return null;
    return {
      usedUsd,
      limitUsd,
      remainingUsd: Math.max(0, limitUsd - usedUsd),
    };
  } catch {
    return null;
  }
}

/**
 * Cuántas consultas a Places habría consumido una búsqueda con esos filtros.
 *
 * Misma fórmula que usa el Plan de Caza para prometer el costo. Está duplicada a
 * propósito con la del runner: si algún día se separan, el número prometido y el
 * número contado dejarían de coincidir y nadie se enteraría.
 */
export function requestsForFilters(filters: unknown): number {
  const f = (filters ?? {}) as { areas?: unknown[]; queries?: unknown[]; source?: string };
  if (f.source && f.source !== 'google_places') return 0;
  const combos = Math.max(1, f.areas?.length ?? 1) * Math.max(1, f.queries?.length ?? 1);
  return Math.min(MAX_REQUESTS_PER_RUN, combos * 3);
}

/**
 * Estimación del consumo de Google en el mes.
 *
 * Se calcula sobre `prospect_searches`, que ya guarda los filtros de cada
 * corrida. Es una estimación por dos motivos honestos: la corrida real puede
 * cortar antes por el tope de pool, y no vemos lo que Google factura de verdad.
 */
export async function estimateGoogleSpend(
  supabase: SupabaseClient,
): Promise<Budget['google']> {
  const desde = new Date();
  desde.setUTCDate(1);
  desde.setUTCHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('prospect_searches')
    .select('filters')
    .gte('created_at', desde.toISOString());

  const requests = (data ?? []).reduce((total, row) => total + requestsForFilters(row.filters), 0);
  return {
    requests,
    freeRequests: GOOGLE_FREE_REQUESTS,
    estimatedUsd: Math.max(0, requests - GOOGLE_FREE_REQUESTS) * SOURCES.google_places.costPerUnitUsd,
  };
}

export async function readBudget(
  apiToken: string | null,
  supabase: SupabaseClient,
): Promise<Budget> {
  const [apify, google, apifyBlocked] = await Promise.all([
    apiToken ? readApifyBudget(apiToken) : Promise.resolve(null),
    estimateGoogleSpend(supabase),
    // No rompe si la 0039 todavía no se aplicó: sin log, no hay aviso.
    readApifyBlocked(supabase).catch(() => null),
  ]);
  return { apify, google, apifyBlocked };
}

/** El presupuesto en una frase, para que lo lea una persona o Turbo. */
export function describeBudget(budget: Budget): string {
  const partes: string[] = [];

  if (budget.apify) {
    const { remainingUsd, limitUsd, usedUsd } = budget.apify;
    partes.push(
      `Apify: quedan US$ ${remainingUsd.toFixed(2)} de US$ ${limitUsd.toFixed(2)} este mes ` +
        `(gastados US$ ${usedUsd.toFixed(2)}). Cubre LinkedIn, Instagram y datos de contacto.`,
    );
    if (remainingUsd < 0.5) {
      partes.push('⚠️ Queda muy poco: alcanza para una búsqueda chica y nada más.');
    }
    if (budget.apifyBlocked) {
      // El saldo por sí solo tranquiliza de más. Medido: decía "quedan US$ 2,75"
      // mientras la cuenta no podía correr NADA, porque el tope del plan gratis
      // es de cuántas veces se corre el actor, no de cuánta plata queda, y no
      // aparece en el endpoint de límites.
      partes.push(
        `⚠️ Ojo: tener saldo no alcanza. ${budget.apifyBlocked} ` +
          'Mientras siga así, buscar en LinkedIn o Instagram no va a devolver nada.',
      );
    }
  } else {
    partes.push('No se pudo leer el saldo de Apify.');
  }

  const { requests, freeRequests } = budget.google;
  partes.push(
    `Google Maps: ~${requests} de ${freeRequests} consultas gratis del mes (estimado nuestro, no el dato de Google).`,
  );

  return partes.join(' ');
}

/** ¿Entra esta corrida en lo que queda? */
export function fitsInBudget(budget: Budget, costUsd: number): boolean {
  if (!budget.apify) return true; // sin dato no se bloquea nada
  return costUsd <= budget.apify.remainingUsd;
}
