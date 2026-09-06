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
  google: {
    requests: number;
    freeRequests: number;
    estimatedUsd: number;
    /** Consultas gratis que quedan. Nunca baja de 0. */
    remainingRequests: number;
  };
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
 * Sale de `prospect_google_filters_this_month()` (migración `0046`), que
 * devuelve los filtros de **todas** las búsquedas del equipo. Antes se contaba
 * sobre `prospect_searches` y el número salía mal por dos motivos a la vez:
 * esa tabla solo se escribe cuando el vendedor GUARDA prospectos —así que toda
 * búsqueda descartada, incluidas las que devuelven cero, gastaba sin aparecer—
 * y además el RLS del log deja que cada uno vea solo lo suyo, cuando el tope
 * gratis es de la cuenta entera.
 *
 * Sigue siendo una estimación, y se dice en todos lados donde se muestra: la
 * corrida real puede cortar antes por el tope de pool, y Google no expone lo
 * que factura sin configurar Cloud Billing.
 */
export async function estimateGoogleSpend(
  supabase: SupabaseClient,
): Promise<Budget['google']> {
  // Si la 0046 todavía no se aplicó, se cuenta 0 en vez de romper la pantalla.
  // Contar de menos es lo que ya pasaba; lo que no puede pasar es que no cargue.
  const { data } = await supabase.rpc('prospect_google_filters_this_month');
  const filas = Array.isArray(data) ? data : [];

  const requests = filas.reduce((total: number, f) => total + requestsForFilters(f), 0);
  return {
    requests,
    freeRequests: GOOGLE_FREE_REQUESTS,
    estimatedUsd: Math.max(0, requests - GOOGLE_FREE_REQUESTS) * SOURCES.google_places.costPerUnitUsd,
    remainingRequests: Math.max(0, GOOGLE_FREE_REQUESTS - requests),
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
      // El aviso NO dice "no vas a poder buscar en ningún lado": el tope que
      // encontramos es **del actor de LinkedIn**, no de la cuenta. Verificado el
      // 2026-08-18 con una corrida real: con LinkedIn bloqueado, el actor de
      // Instagram corrió igual y devolvió datos. Decir que todo está caído
      // haría que el vendedor no intente lo que sí funciona.
      partes.push(
        `⚠️ Ojo: tener saldo no alcanza. ${budget.apifyBlocked} ` +
          'Afecta solo a esa fuente; las demás siguen funcionando.',
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

/** A partir de acá se avisa que se está por acabar. */
const UMBRAL_AVISO = 0.8;

export type NivelPresupuesto = 'ok' | 'aviso' | 'agotado';

export interface Veredicto {
  nivel: NivelPresupuesto;
  /** Qué decirle a la persona. Vacío cuando el nivel es 'ok'. */
  mensaje: string;
}

/** Cuándo vuelve a haber consultas gratis de Google: el 1° del mes que viene. */
export function proximaRenovacionGoogle(hoy = new Date()): string {
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 1));
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/**
 * ¿Se puede gastar esto, y hay que avisar algo antes?
 *
 * Tres estados en vez de un sí/no, porque avisar recién cuando ya no queda nada
 * llega tarde: el vendedor arma una búsqueda, la aprueba y ahí se entera. Con
 * el aviso al 80% puede decidir en qué gastar lo que sobra.
 *
 * Los dos proveedores se miden distinto y por eso se evalúan por separado: de
 * Apify sabemos el saldo real en dólares; de Google, cuántas consultas gratis
 * quedan según nuestra propia cuenta.
 *
 * **No decide sobre quién llama.** La excepción del superadmin vive en la ruta,
 * que es la que sabe el rol; acá solo se dice cómo está la plata.
 */
export function evaluarPresupuesto(
  budget: Budget,
  source: string,
  costoEstimadoUsd: number,
  consultasEstimadas = 0,
  /**
   * Cómo se llama lo que se está por gastar. Por defecto es una búsqueda,
   * porque es el caso original — pero el enriquecimiento gasta del mismo
   * saldo, y decirle "búsqueda" a la lectura de sitios mandaría a revisar el
   * lugar equivocado.
   */
  accion = 'esta búsqueda',
): Veredicto {
  const Accion = accion.charAt(0).toUpperCase() + accion.slice(1);
  if (source === 'google_places') {
    const { requests, freeRequests, remainingRequests } = budget.google;

    if (consultasEstimadas > remainingRequests) {
      // Se pasa del tope gratis. No es un corte de Google: a partir de acá cada
      // 1000 consultas cuestan US$ 40, así que la decisión de seguir gastando
      // es de quien paga, no de quien busca.
      return {
        nivel: 'agotado',
        mensaje:
          `Se acabaron las consultas gratis de Google Maps de este mes ` +
          `(~${requests} de ${freeRequests}). De acá en más cada búsqueda se factura, ` +
          `así que hay que ampliar el presupuesto en Google Cloud o esperar al ` +
          `${proximaRenovacionGoogle()}, cuando se renueva el cupo gratis.`,
      };
    }
    if (requests >= freeRequests * UMBRAL_AVISO) {
      return {
        nivel: 'aviso',
        mensaje:
          `Quedan ~${remainingRequests} consultas gratis de Google Maps hasta el ` +
          `${proximaRenovacionGoogle()}. ${Accion} usa ${consultasEstimadas}.`,
      };
    }
    return { nivel: 'ok', mensaje: '' };
  }

  // Apify: LinkedIn, Instagram y datos de contacto.
  if (!budget.apify) {
    // Sin saber el saldo no se frena a nadie: dejar a un equipo sin trabajar
    // porque no respondió la API de Apify es peor que gastar de más.
    return { nivel: 'ok', mensaje: '' };
  }
  const { remainingUsd, limitUsd, usedUsd } = budget.apify;

  if (costoEstimadoUsd > remainingUsd) {
    return {
      nivel: 'agotado',
      mensaje:
        `No alcanza el saldo de Apify: ${accion} sale US$ ${costoEstimadoUsd.toFixed(2)} ` +
        `y quedan US$ ${remainingUsd.toFixed(2)}. Hay que cargar saldo en Apify o esperar ` +
        `a que se renueve el ciclo mensual.`,
    };
  }
  if (usedUsd >= limitUsd * UMBRAL_AVISO) {
    return {
      nivel: 'aviso',
      mensaje:
        `Queda poco saldo en Apify: US$ ${remainingUsd.toFixed(2)} de US$ ${limitUsd.toFixed(2)}. ` +
        `${Accion} usa US$ ${costoEstimadoUsd.toFixed(2)}.`,
    };
  }
  return { nivel: 'ok', mensaje: '' };
}
