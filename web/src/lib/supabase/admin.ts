// Cliente con la clave de servicio — SOLO servidor, y solo para lo que no
// puede hacerse con la sesión de una persona.
//
// Hasta ahora vivía como función privada en `prospect/secrets.ts`. Se saca acá
// porque la extensión de Chrome también lo necesita: sus pedidos llegan sin
// cookie de sesión, así que el servidor tiene que validar el token y actuar en
// nombre del vendedor con una credencial propia.
//
// ⚠️ Con esta clave NO aplica el RLS. Todo lo que se consulte con este cliente
// tiene que filtrar a mano por el usuario que corresponde, y ese filtro tiene
// que estar cubierto por un test. Es la diferencia entre "un vendedor ve sus
// leads" y "cualquiera con un token ve todos los leads".

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
