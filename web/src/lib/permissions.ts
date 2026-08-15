// Lectura de la matriz de permisos (Configuración → "Quién ve cada sección").
// SOLO servidor: la usan las guardas de página y los route handlers.

import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import {
  EDITABLE_ROLES,
  SECTIONS,
  defaultPermissions,
  type EditableRole,
  type PermissionMap,
  type SectionId,
} from '@/lib/sections';

export const PERMISSIONS_KEY = 'role_permissions';

/** Forma de lo guardado en `app_settings`. Nada de esto se confía sin validar. */
interface StoredPermissions {
  version?: number;
  sections?: Record<string, Record<string, unknown>>;
}

/**
 * Toma lo guardado y lo superpone sobre los defaults, descartando cualquier cosa
 * que no reconozca: secciones que ya no existen, roles inventados, valores que
 * no son booleanos. Después reimpone los invariantes, así ni una edición a mano
 * por SQL puede dejar el panel en un estado inconsistente.
 */
export function normalizePermissions(raw: unknown): PermissionMap {
  const perms = defaultPermissions();
  const stored = (raw ?? {}) as StoredPermissions;
  const sections = stored.sections;
  if (!sections || typeof sections !== 'object') return perms;

  for (const section of SECTIONS) {
    // Una sección no configurable siempre usa su default, se haya guardado lo
    // que se haya guardado.
    if (section.editableFor.length === 0) continue;

    const savedForSection = sections[section.id];
    if (!savedForSection || typeof savedForSection !== 'object') continue;

    for (const role of EDITABLE_ROLES) {
      // Solo se permite editar los roles que la sección declara editables.
      if (!section.editableFor.includes(role)) continue;
      const value = (savedForSection as Record<string, unknown>)[role];
      // `undefined` = nunca se configuró → se conserva el default.
      if (typeof value === 'boolean') perms[section.id][role] = value;
    }
  }

  return perms;
}

/**
 * Lee la matriz vigente.
 *
 * `cache()` deduplica dentro de un mismo render: la guarda de la página y el
 * shell comparten una sola consulta. No se cachea entre requests a propósito —
 * un permiso desactualizado es peor que unos milisegundos.
 *
 * Ante cualquier error (o si la migración 0032 todavía no se aplicó) devuelve
 * los defaults del código, que son el comportamiento histórico. Ni abrir todo
 * (agujero) ni cerrar todo, que dejaría a todos afuera —incluido el admin— sin
 * forma de arreglarlo desde la interfaz.
 */
export const getPermissions = cache(async (): Promise<PermissionMap> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', PERMISSIONS_KEY)
      .maybeSingle();

    if (error) {
      console.error('[permissions] no se pudo leer la matriz, se usan los defaults', error.message);
      return defaultPermissions();
    }
    return normalizePermissions(data?.value);
  } catch (error) {
    console.error('[permissions] error inesperado, se usan los defaults', error);
    return defaultPermissions();
  }
});

/** ¿Existe la fila? Si no, la migración no se aplicó y Configuración lo avisa. */
export async function permissionsRowExists(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('app_settings')
      .select('key')
      .eq('key', PERMISSIONS_KEY)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

export type { PermissionMap, SectionId, EditableRole };
