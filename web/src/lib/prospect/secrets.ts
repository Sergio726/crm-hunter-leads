// Lectura de credenciales del módulo de prospección — SOLO servidor.
//
// Hay dos lugares posibles para cada key, en este orden:
//   1. `private.integration_secrets` en Supabase (cargada desde Configuración).
//      Requiere SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor: la RPC
//      `get_integration_secret` está concedida únicamente a `service_role`, de
//      modo que un vendedor logueado no puede leerla desde el navegador.
//   2. Variable de entorno, como respaldo para desarrollo local o si se prefiere
//      no darle la service_role key a la web.
//
// Si no hay ninguna de las dos, quien llama decide qué hacer (el agente degrada
// a modo guiado; la búsqueda avisa que falta configurar Places).

import 'server-only';
import { createClient } from '@supabase/supabase-js';

type SecretKey = 'openrouter_api_key' | 'google_places_api_key';

const ENV_FALLBACK: Record<SecretKey, string | undefined> = {
  openrouter_api_key: process.env.OPENROUTER_API_KEY,
  google_places_api_key: process.env.GOOGLE_PLACES_API_KEY,
};

/** Cache en memoria del proceso: evita una consulta por request del chat. */
const cache = new Map<SecretKey, { value: string | null; expiresAt: number }>();
const TTL_MS = 60_000;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getSecret(key: SecretKey): Promise<string | null> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value: string | null = null;

  const admin = adminClient();
  if (admin) {
    const { data, error } = await admin.rpc('get_integration_secret', { p_key: key });
    if (error) {
      // No es fatal: puede que la migración 0029 todavía no esté aplicada.
      console.error('[prospect/secrets] no se pudo leer el secreto de Supabase', error.message);
    } else if (typeof data === 'string' && data.trim().length > 0) {
      value = data.trim();
    }
  }

  if (!value) {
    const fromEnv = ENV_FALLBACK[key];
    if (fromEnv && fromEnv.trim().length > 0) value = fromEnv.trim();
  }

  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

/** Invalida el cache — útil justo después de guardar una key nueva. */
export function clearSecretCache(): void {
  cache.clear();
}
