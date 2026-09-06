// Registro único de las secciones del panel y de quién puede entrar a cada una.
//
// Antes esto vivía en tres lugares que se mantenían sincronizados a mano: el
// array LINKS del sidebar, las guardas de cada página y los `if (role === ...)`
// sueltos. Ahora la definición es una sola y el admin puede editar parte de ella
// desde Configuración → "Quién ve cada sección".
//
// IMPORTANTE — el alcance de esto: controla **a qué pantallas se entra**. No
// controla los datos. El único límite real sobre qué información puede leer cada
// usuario es el RLS de Postgres, que no cambia desde esta pantalla.
//
// Módulo puro a propósito: sin React, sin `server-only`, sin íconos. Lo importan
// el guard del servidor, el sidebar (cliente) y la matriz (cliente), así que no
// puede arrastrar dependencias de ninguno de los dos lados.
//
// OJO: el orden de este array es el orden del menú.

import type { Role } from './types';

export const SECTION_IDS = [
  'inicio',
  'clientes',
  'cartera',
  'prospeccion',
  'contactos-ghl',
  'reportes',
  'equipo',
  'configuracion',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/** Roles cuyo acceso se puede editar desde la matriz. Superadmin y pending nunca. */
export type EditableRole = 'seller' | 'viewer';
export const EDITABLE_ROLES: EditableRole[] = ['seller', 'viewer'];

export interface SectionDef {
  id: SectionId;
  href: string;
  label: string;
  /** Una línea, en criollo, para la matriz de Configuración. */
  description: string;
  /** Si aparece en el menú lateral. */
  inNav: boolean;
  /**
   * Sección creada pero **todavía sin comportamiento definido**.
   *
   * Se muestra en el menú apagada y no se puede entrar desde ahí: es una
   * promesa visible, no una función a medias. El superadmin sí puede entrar por
   * la URL, que es lo que permite mirarla y decidir qué le falta sin
   * exponérsela al equipo.
   */
  enConstruccion?: boolean;
  /** Roles que el admin puede tildar/destildar. Vacío = fila bloqueada. */
  editableFor: EditableRole[];
  /** Comportamiento de fábrica: es el fallback si falta la configuración. */
  defaults: Record<EditableRole, boolean>;
  /** Por qué está bloqueada, o qué conviene saber antes de habilitarla. */
  note?: string;
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'inicio',
    href: '/',
    label: 'Inicio',
    description: 'La pantalla de entrada. Cada rol ve su propia versión.',
    inNav: true,
    // No configurable: si se niega, el usuario entra y rebota a "no autorizado".
    // Una cuenta válida que parece rota.
    editableFor: [],
    defaults: { seller: true, viewer: true },
    note: 'Siempre visible: es la pantalla a la que se llega al entrar.',
  },
  {
    // El id NO se renombra aunque la seccion ahora se llame Leads: es la clave
    // con la que se guardo la matriz de permisos en `app_settings` (0032).
    // Cambiarlo le resetea a cada rol lo que puede ver. Mismo criterio que con
    // los identificadores tecnicos de D23.
    id: 'clientes',
    href: '/leads',
    label: 'Leads',
    description: 'La lista y el tablero de leads.',
    inNav: true,
    editableFor: ['seller', 'viewer'],
    defaults: { seller: true, viewer: true },
    note: 'El lector entra en modo lectura: no puede editar ni registrar contactos.',
  },
  {
    // El módulo de verdad: un cliente es el lead que compró (D73). Nace apagado
    // hasta que se defina qué tiene que hacer además de listarlos.
    //
    // ⚠️ La dirección NO es `/clientes` a propósito: esa sigue redirigiendo a
    // `/leads` para no romper los enlaces viejos (UX-12). Cuando el módulo se
    // habilite y esos enlaces ya no importen, se decide si se muda.
    id: 'cartera',
    href: '/cartera',
    label: 'Clientes',
    description: 'Los leads que compraron. En definición.',
    inNav: true,
    enConstruccion: true,
    editableFor: ['seller', 'viewer'],
    // Visibles en `true` a propósito: la idea es que el equipo **vea que el
    // módulo viene**. No es un riesgo, porque `enConstruccion` hace que el ítem
    // no sea un enlace y la página redirige a cualquiera que no sea
    // administrador. Son dos frenos, no uno.
    defaults: { seller: true, viewer: true },
    note: 'Todavía no está definido qué hace: se ve en el menú apagado, no se puede entrar, y por URL solo entra un administrador.',
  },
  {
    id: 'prospeccion',
    href: '/prospeccion',
    label: 'Prospección',
    description: 'Buscar negocios nuevos con Turbo.',
    inNav: true,
    editableFor: ['seller', 'viewer'],
    defaults: { seller: true, viewer: false },
    note: 'Cada búsqueda consume crédito de Google Places, y el enriquecimiento consume Apify y OpenRouter.',
  },
  {
    id: 'contactos-ghl',
    href: '/contactos-ghl',
    label: 'Contactos GHL',
    description: 'Traer contactos desde GoHighLevel.',
    inNav: true,
    editableFor: ['seller', 'viewer'],
    defaults: { seller: true, viewer: false },
  },
  {
    id: 'reportes',
    href: '/reportes',
    label: 'Reportes',
    description: 'Embudo de conversión y números por vendedor.',
    inNav: true,
    editableFor: ['seller', 'viewer'],
    defaults: { seller: false, viewer: false },
    note: 'Un vendedor solo vería sus propios números: la base recorta los datos por usuario.',
  },
  {
    id: 'equipo',
    href: '/equipo',
    label: 'Equipo',
    description: 'Invitar gente y cambiar roles.',
    inNav: true,
    // No configurable: invitar y cambiar roles están bloqueados en la base
    // (`set_user_role`, `invite_member`). Dárselo a un vendedor no le da la
    // función, le da una pantalla de botones que fallan.
    editableFor: [],
    defaults: { seller: false, viewer: false },
    note: 'Solo administradores: la base rechaza estas acciones para cualquier otro rol.',
  },
  {
    id: 'configuracion',
    href: '/configuracion',
    label: 'Configuración',
    description: 'Ajustes del sistema y claves de los servicios.',
    inNav: true,
    // No configurable, por el mismo motivo que Equipo: la escritura de
    // `app_settings` exige superadmin en la propia base de datos.
    editableFor: [],
    defaults: { seller: false, viewer: false },
    note: 'Solo administradores: acá se guardan las claves de los servicios.',
  },
];

export function getSection(id: SectionId): SectionDef {
  const found = SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`Sección desconocida: ${id}`);
  return found;
}

/** Acceso de cada rol a cada sección, ya normalizado. */
export type PermissionMap = Record<SectionId, Record<EditableRole, boolean>>;

/** El comportamiento de fábrica, que es también el fallback ante cualquier error. */
export function defaultPermissions(): PermissionMap {
  return Object.fromEntries(
    SECTIONS.map((s) => [s.id, { ...s.defaults }]),
  ) as PermissionMap;
}

export function canAccess(role: Role, section: SectionId, perms: PermissionMap): boolean {
  // Invariantes que no dependen de lo guardado: el admin entra a todo y una
  // cuenta sin autorizar no entra a nada.
  if (role === 'superadmin') return true;
  if (role === 'pending') return false;
  return perms[section]?.[role] ?? false;
}

export function allowedSections(role: Role, perms: PermissionMap): SectionId[] {
  return SECTIONS.filter((s) => canAccess(role, s.id, perms)).map((s) => s.id);
}
