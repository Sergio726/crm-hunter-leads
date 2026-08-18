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
  source: SourceId;
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
 * Tampoco frena la respuesta — se puede llamar sin `await` cuando el resultado
 * ya está listo para devolver.
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
 * Deduce el desenlace a partir de lo que volvió.
 *
 * `providerSkipped` viene de `providerDidNotRun` y manda sobre todo lo demás:
 * si el proveedor no buscó, cero resultados no significa "no hay nadie".
 */
export function outcomeFor(returned: number, providerSkipped?: string | null): RequestOutcome {
  if (providerSkipped) return 'provider_skipped';
  return returned > 0 ? 'ok' : 'empty';
}
