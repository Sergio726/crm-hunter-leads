// Registro de cada solicitud de búsqueda — SOLO servidor.
//
// Existe porque un cero no se podía diagnosticar. La búsqueda de LinkedIn que
// devolvió 0 tenía la causa en el log del actor de Apify —"free user run limit
// reached"— y ese mensaje no se guardaba en ningún lado. Reconstruirlo costó
// cuatro corridas de sondeo contra el proveedor.
//
// Y faltaba más: las búsquedas de Google Maps **no dejaban rastro**.
// `prospect_searches` solo se escribe cuando el vendedor guarda prospectos, así
// que justo la búsqueda que hay que investigar —la que no devolvió nada— no
// existía para la base.
//
// Ver la migración `0039_prospect_request_log.sql`.

import 'server-only';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProspectFilters, SourceId } from './types';

/**
 * Cómo terminó la solicitud.
 *
 * La distinción que importa es `empty` vs `provider_skipped`: la primera
 * significa "busqué de verdad y no había nadie" —ahí sí tiene sentido tocar los
 * filtros— y la segunda "el proveedor nunca buscó", donde tocar los filtros no
 * cambia nada. Confundirlas fue exactamente el error que dejó al usuario
 * aflojando señales que no tenían nada que ver.
 */
export type RequestOutcome = 'ok' | 'empty' | 'provider_skipped' | 'error';

export interface RequestLogEntry {
  userId: string | null;
  /**
   * De dónde salieron los datos.
   *
   * `sitio_web` no es una fuente de prospectos —no se busca gente ahí— pero sí
   * es de dónde vienen el email y el WhatsApp que trae el scraper de contactos,
   * y se paga aparte. Llamarlo `google_places` porque de ahí venían los
   * negocios sería mentirle al que después lee el historial para saber en qué
   * se gastó.
   */
  source: SourceId | 'sitio_web';
  job?: 'search' | 'enrich' | 'contacts';
  filters?: ProspectFilters | Record<string, unknown> | null;
  /** Lo EXACTO que se le mandó al proveedor. Sin esto no se puede diagnosticar. */
  providerInput?: Record<string, unknown> | null;
  outcome: RequestOutcome;
  returnedCount?: number;
  matchedCount?: number;
  /** Los motivos de descarte, tal cual los cuenta cada fuente. Va a un jsonb. */
  discarded?: object | null;
  relaxed?: string | null;
  providerRunId?: string | null;
  providerStatus?: string | null;
  /** El `statusMessage` del run: acá vive el aviso de que no se ejecutó. */
  providerMessage?: string | null;
  costUsd?: number | null;
  error?: string | null;
  durationMs?: number | null;
}

/**
 * Guarda una entrada. **Nunca lanza.**
 *
 * Que falle el registro no puede tumbar una búsqueda que ya se pagó: el log
 * existe para explicar lo que pasó, no para ser otra cosa que pueda fallar.
 *
 * ⚠️ **Hay que esperarla o pasarla por `logRequestAfter`.** Dispararla y
 * olvidarse —`void logRequest(...)`— es lo que dejó el log casi vacío: ver la
 * explicación en `logRequestAfter`.
 */
export async function logRequest(
  supabase: SupabaseClient,
  entry: RequestLogEntry,
): Promise<void> {
  try {
    const { error } = await supabase.from('prospect_request_log').insert({
      created_by: entry.userId,
      source: entry.source,
      job: entry.job ?? 'search',
      filters: entry.filters ?? {},
      provider_input: entry.providerInput ?? null,
      outcome: entry.outcome,
      returned_count: entry.returnedCount ?? 0,
      matched_count: entry.matchedCount ?? 0,
      discarded: entry.discarded ?? null,
      relaxed: entry.relaxed ?? null,
      provider_run_id: entry.providerRunId ?? null,
      provider_status: entry.providerStatus ?? null,
      provider_message: entry.providerMessage ?? null,
      cost_usd: entry.costUsd ?? null,
      error: entry.error ?? null,
      duration_ms: entry.durationMs ?? null,
    });
    // Se avisa por consola y se sigue. El caso más probable es que la migración
    // 0039 todavía no esté aplicada, y eso no debe romper una búsqueda.
    if (error) console.error('[request-log] no se pudo registrar', error.message);
  } catch (e) {
    console.error('[request-log] no se pudo registrar', e);
  }
}

/**
 * Registra **después** de contestarle al vendedor, sin hacerlo esperar.
 *
 * POR QUÉ EXISTE (2026-08-31)
 *
 * Todas las rutas llamaban `void logRequest(...)`: disparar el insert y devolver
 * la respuesta sin esperarlo. En una función serverless eso **pierde la
 * escritura**, porque en cuanto la respuesta sale el entorno puede congelar la
 * ejecución y el pedido a Supabase queda a medio camino. No falla, no avisa:
 * simplemente no queda la fila.
 *
 * La prueba está en la base y es un experimento involuntario perfecto. En el
 * camino de "el proveedor no ejecutó" (`runs/[id]`) hay dos escrituras seguidas,
 * misma petición y mismos permisos: el `update` de `prospect_runs` **con
 * `await`** quedó grabado en los tres casos reales del 19, 21 y 25 de agosto; el
 * `logRequest` de la línea siguiente, **sin `await`**, no dejó ninguna. La
 * diferencia es el `await`. Se descartó que fuera RLS ejecutando el insert como
 * vendedor común sobre una copia restaurada del backup: entra sin problema.
 *
 * `after()` es la respuesta de Next a esto: corre el trabajo cuando la respuesta
 * ya salió, pero manteniendo viva la función hasta que termine. Se gana lo mismo
 * que se buscaba con el `void` —no hacer esperar a nadie— sin perder la fila.
 *
 * Vive acá y no en cada ruta a propósito: el bug fue que cuatro llamadores
 * repetían el mismo `void`. Con esto, registrar bien es lo que sale por defecto.
 */
export function logRequestAfter(supabase: SupabaseClient, entry: RequestLogEntry): void {
  try {
    after(() => logRequest(supabase, entry));
  } catch {
    // `after()` solo existe dentro de una petición. Fuera de ahí —un script, un
    // test— no hay respuesta que corte nada, así que se escribe y listo.
    void logRequest(supabase, entry);
  }
}

/**
 * Deduce el desenlace a partir de lo que volvió.
 *
 * `providerSkipped` viene de `providerDidNotRun` y manda sobre todo lo demás:
 * si el proveedor no buscó, cero resultados no significa "no hay nadie".
 */
export function outcomeFor(returned: number, providerSkipped?: string | null): RequestOutcome {
  if (providerSkipped) return 'provider_skipped';
  return returned > 0 ? 'ok' : 'empty';
}
