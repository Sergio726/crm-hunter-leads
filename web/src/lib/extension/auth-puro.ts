// La parte del token que no necesita Next ni Supabase: generar, hashear y leer
// el header. Separada para poder testearla sin levantar nada.

import { createHash, randomBytes } from 'node:crypto';

/** Prefijo para reconocer un token de estos a simple vista, y no confundirlo con otra clave. */
export const PREFIJO_TOKEN = 'hl_ext_';

export function generarToken(): string {
  return PREFIJO_TOKEN + randomBytes(32).toString('base64url');
}

/** sha256 en hexadecimal. Es lo único que se guarda en la base. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

/** Saca el token del header `Authorization: Bearer …`, o `null`. */
export function extraerBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
