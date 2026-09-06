import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Llama a la edge function `invite-user` y, si falla, tira un Error con el
 * motivo REAL.
 *
 * `functions.invoke` deja el cuerpo de una respuesta no-2xx en `error.context`
 * (un Response). Antes eso no se leía nunca: el llamador solo veía
 * "Edge Function returned a non-2xx status code" y, peor, lo mostraba con
 * `toast.success`. Por eso una invitación que nunca salió se anunciaba como
 * enviada.
 */
export async function invokeInvite(
  supabase: SupabaseClient,
  body: { email: string; mode: 'link' | 'send'; redirectTo: string },
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.functions.invoke('invite-user', { body });
  if (!error) return (data as Record<string, unknown>) ?? null;

  let detail = error.message;
  let code: string | undefined;

  // El context es el Response crudo; puede no ser JSON (504 de la plataforma).
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    const parsed = (await context.json().catch(() => null)) as {
      error?: string;
      code?: string;
    } | null;
    if (parsed?.error) detail = parsed.error;
    code = parsed?.code;
  }

  // Los motivos frecuentes, dichos en castellano y con la salida a mano.
  if (code === 'over_email_send_rate_limit') {
    detail =
      'Supabase no deja mandar más emails por ahora: el remitente compartido tiene un tope por hora. Esperá un rato o usá «Copiar enlace».';
  } else if (code === 'missing_site_url') {
    detail =
      'Falta configurar PUBLIC_SITE_URL en la función invite-user: sin eso no se sabe a dónde tiene que llevar el enlace.';
  }

  throw new Error(detail);
}
