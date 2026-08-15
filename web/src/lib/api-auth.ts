// Guarda de sección para los route handlers.
//
// Va separada de `auth.ts` para no arrastrar `next/server` a las páginas, y
// porque una API responde 403 en vez de redirigir.
//
// Sin esto la matriz mentiría: si el admin le habilita Prospección al lector,
// vería la pantalla y comería 403 de todas las llamadas.

import 'server-only';
import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { getPermissions } from '@/lib/permissions';
import { canAccess, type SectionId } from '@/lib/sections';
import type { Profile } from '@/lib/types';

export type Gate =
  | { ok: true; profile: Profile }
  | { ok: false; response: NextResponse };

export async function apiSectionGuard(section: SectionId): Promise<Gate> {
  const profile = await getSessionProfile();
  if (!profile) {
    return { ok: false, response: NextResponse.json({ error: 'no autorizado' }, { status: 401 }) };
  }

  const perms = await getPermissions();
  if (!canAccess(profile.role, section, perms)) {
    return { ok: false, response: NextResponse.json({ error: 'no autorizado' }, { status: 403 }) };
  }

  return { ok: true, profile };
}
