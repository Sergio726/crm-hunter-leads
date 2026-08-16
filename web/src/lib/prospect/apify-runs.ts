// Ejecución ASÍNCRONA de actores de Apify — SOLO servidor.
//
// Por qué existe, además del cliente síncrono de `apify.ts`:
//
// 1. El plan Hobby de Vercel corta cualquier petición a los 60 segundos. Un
//    raspado de LinkedIn tarda minutos, así que sincrónicamente no entra nunca.
// 2. La llamada síncrona de Apify muere a los 300 s con un 408 — y el trabajo
//    SIGUE corriendo del otro lado y se factura igual. Con el id del run
//    guardado, el resultado se recupera en vez de pagarlo dos veces.
//
// El patrón es: arrancar el run, guardar su id, devolver enseguida, y que la
// pantalla vaya preguntando. Se descarta el mecanismo de avisos de Apify
// (webhooks) porque necesita una Edge Function desplegada, y esta cuenta no
// tiene permiso para desplegarlas.

import 'server-only';
import { ApifyError, apifyErrorFor } from './apify';

const APIFY_BASE = 'https://api.apify.com/v2';

/** Estados que devuelve Apify para un run. */
export type ApifyRunStatus =
  | 'READY'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'ABORTING'
  | 'ABORTED'
  | 'TIMING-OUT'
  | 'TIMED-OUT';

export interface StartedRun {
  runId: string;
  datasetId: string;
}

export interface RunSnapshot {
  status: ApifyRunStatus;
  datasetId: string | null;
  /** Cuántos ítems lleva escritos, para poder mostrar progreso real. */
  itemCount: number | null;
  costUsd: number | null;
}

interface ApifyRunPayload {
  data?: {
    id?: string;
    status?: ApifyRunStatus;
    defaultDatasetId?: string;
    usageTotalUsd?: number;
    stats?: { itemCount?: number };
  };
}

/** ¿El run terminó, salió bien o mal? */
export function isFinished(status: ApifyRunStatus): boolean {
  return status !== 'READY' && status !== 'RUNNING' && status !== 'ABORTING';
}

export function isSuccess(status: ApifyRunStatus): boolean {
  return status === 'SUCCEEDED';
}

/**
 * Arranca un run y devuelve enseguida, sin esperar a que termine.
 *
 * Los topes van como parámetros de Apify y no como lógica nuestra: los aplica su
 * servidor, así que valen aunque nuestro código tenga un error.
 */
export async function startRun(
  actor: string,
  input: unknown,
  apiToken: string,
  options: { maxItems?: number; maxCostUsd?: number; timeoutSecs?: number } = {},
): Promise<StartedRun> {
  const url = new URL(`${APIFY_BASE}/acts/${actor}/runs`);
  url.searchParams.set('token', apiToken);
  if (options.maxItems !== undefined) url.searchParams.set('maxItems', String(options.maxItems));
  if (options.maxCostUsd !== undefined) {
    url.searchParams.set('maxTotalChargeUsd', String(options.maxCostUsd));
  }
  // Techo de vida del run del lado de Apify: si algo se cuelga, no corre para
  // siempre facturando.
  url.searchParams.set('timeout', String(options.timeoutSecs ?? 600));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });

  if (!res.ok) throw apifyErrorFor(res.status, await res.text().catch(() => ''));

  const payload = (await res.json()) as ApifyRunPayload;
  const runId = payload.data?.id;
  const datasetId = payload.data?.defaultDatasetId;
  if (!runId || !datasetId) {
    throw new ApifyError('Apify aceptó el pedido pero no devolvió el id del trabajo.', 'upstream');
  }
  return { runId, datasetId };
}

/** Estado actual de un run ya arrancado. */
export async function getRun(runId: string, apiToken: string): Promise<RunSnapshot> {
  const url = new URL(`${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}`);
  url.searchParams.set('token', apiToken);

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw apifyErrorFor(res.status, await res.text().catch(() => ''));

  const payload = (await res.json()) as ApifyRunPayload;
  return {
    status: payload.data?.status ?? 'RUNNING',
    datasetId: payload.data?.defaultDatasetId ?? null,
    itemCount: payload.data?.stats?.itemCount ?? null,
    costUsd: payload.data?.usageTotalUsd ?? null,
  };
}

/**
 * Trae los resultados de un run terminado.
 *
 * `fields` no es un lujo: sin él, el actor de Instagram devuelve los 12 posts
 * completos, los 12 videos y los perfiles relacionados de cada cuenta.
 */
export async function fetchItems<T>(
  datasetId: string,
  apiToken: string,
  fields?: string,
): Promise<T[]> {
  const url = new URL(`${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items`);
  url.searchParams.set('token', apiToken);
  url.searchParams.set('format', 'json');
  if (fields) url.searchParams.set('fields', fields);

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw apifyErrorFor(res.status, await res.text().catch(() => ''));
  return (await res.json()) as T[];
}

/** Cancela un run que ya no interesa, para dejar de pagarlo. */
export async function abortRun(runId: string, apiToken: string): Promise<void> {
  const url = new URL(`${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}/abort`);
  url.searchParams.set('token', apiToken);
  await fetch(url, { method: 'POST', cache: 'no-store' }).catch(() => {
    // Que falle el aborto no es fatal: el `timeout` del run lo corta igual.
  });
}
