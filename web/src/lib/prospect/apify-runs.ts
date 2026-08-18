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
  /**
   * El mensaje que deja el propio actor. Es el único lugar donde avisa que NO
   * hizo el trabajo.
   *
   * Un actor que llegó al tope de corridas del plan gratis termina como
   * SUCCEEDED, con 0 ítems y US$ 0 de costo — indistinguible de una búsqueda
   * que simplemente no encontró a nadie. Lo único que los separa es esto:
   * "free user run limit reached". Sin leerlo, la app le dice al vendedor
   * "no hay resultados" cuando la verdad es "tu cuenta no puede buscar más".
   */
  statusMessage: string | null;
}

interface ApifyRunPayload {
  data?: {
    id?: string;
    status?: ApifyRunStatus;
    defaultDatasetId?: string;
    usageTotalUsd?: number;
    statusMessage?: string;
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
    statusMessage: payload.data?.statusMessage ?? null,
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

/**
 * ¿El actor terminó "bien" pero sin haber hecho el trabajo?
 *
 * Encontrado con una corrida real (2026-08-18). Cuatro sondas distintas contra
 * el actor de LinkedIn —incluida una sin ningún filtro— devolvieron 0 perfiles,
 * estado SUCCEEDED, exit 0 y US$ 0 de costo. El log del actor decía:
 *
 *     [WARNING] Free users are limited to 10 runs. Please upgrade to a paid plan.
 *     [Status message]: free user run limit reached
 *
 * Para la API el run salió perfecto. Para el vendedor, la app decía "no hay
 * resultados" y lo mandaba a aflojar filtros que no tenían nada que ver —
 * incluso a gastar otra corrida en un reintento igual de estéril.
 *
 * Un costo de US$ 0 es la señal más confiable: si el actor hubiera buscado de
 * verdad, la página se factura aunque no encuentre a nadie.
 */
export function providerDidNotRun(snapshot: RunSnapshot): string | null {
  const msg = snapshot.statusMessage?.toLowerCase() ?? '';

  if (msg.includes('run limit') || msg.includes('upgrade')) {
    return (
      'Tu cuenta de Apify llegó al tope de corridas del plan gratis, así que la búsqueda ' +
      'no llegó a ejecutarse. No es un problema de los filtros: hay que ampliar el plan ' +
      'en apify.com o esperar a que se renueve el ciclo.'
    );
  }
  if (msg.includes('credit') || msg.includes('insufficient')) {
    return (
      'Tu cuenta de Apify se quedó sin crédito y la búsqueda no llegó a ejecutarse. ' +
      'No es un problema de los filtros.'
    );
  }
  // Terminó bien, no escribió nada y no cobró nada: no buscó. No se sabe por
  // qué, pero decir "no hay resultados" sería mentir.
  if (snapshot.itemCount === 0 && snapshot.costUsd === 0 && snapshot.statusMessage) {
    return `El proveedor no llegó a ejecutar la búsqueda y avisó: "${snapshot.statusMessage}".`;
  }
  return null;
}

/** Cancela un run que ya no interesa, para dejar de pagarlo. */
export async function abortRun(runId: string, apiToken: string): Promise<void> {
  const url = new URL(`${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}/abort`);
  url.searchParams.set('token', apiToken);
  await fetch(url, { method: 'POST', cache: 'no-store' }).catch(() => {
    // Que falle el aborto no es fatal: el `timeout` del run lo corta igual.
  });
}
