// Por dónde se le escribe a un lead.
//
// Vive en un catálogo y no como una lista suelta en cada pantalla porque el
// canal va a dejar de ser solo "con qué reglas redactar": el objetivo es que la
// app **mande el mensaje ella misma**, sin copiar y pegar. Cuando eso llegue,
// cada canal va a necesitar saber si está conectado, con qué cuenta y qué
// límites tiene.
//
// Hoy `envioDirecto` es `false` en todos: el mensaje se copia y se manda desde
// la app del vendedor. El día que uno pase a `true`, la ficha muestra "Enviar"
// en vez de "Copiar" sin tocar nada más — el punto de extensión ya está puesto.
//
// **El próximo foco es LinkedIn** (pedido del usuario, 2026-08-27).

export type Channel = 'whatsapp' | 'instagram' | 'email' | 'linkedin';

export interface CanalDef {
  id: Channel;
  /** Cómo lo nombra el vendedor. */
  label: string;
  /**
   * Si la app puede mandarlo sola. Hoy ninguno: el mensaje se copia.
   * Cuando pase a `true`, además hará falta la conexión de la cuenta.
   */
  envioDirecto: boolean;
  /** Una línea para el que pasa el mouse por encima. */
  ayuda: string;
}

/**
 * En orden de uso real: el vendedor manda por WhatsApp casi siempre, y LinkedIn
 * queda para la venta B2B.
 */
export const CANALES: CanalDef[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    envioDirecto: false,
    ayuda: 'Mensaje corto, de una sola idea: se lee entero en la notificación.',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    envioDirecto: false,
    ayuda: 'Mensaje directo. Al ser de alguien que no te sigue cae en solicitudes, así que la primera línea es todo lo que se ve.',
  },
  {
    id: 'email',
    label: 'Email',
    envioDirecto: false,
    ayuda: 'Con asunto y algo más de espacio para explicar.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    envioDirecto: false,
    ayuda: 'Tono profesional, sin fórmulas de plantilla.',
  },
];

export const CANALES_IDS = CANALES.map((c) => c.id);

/** ¿Es un canal que la app conoce? Se usa para validar lo que llega por la API. */
export function esCanal(v: unknown): v is Channel {
  return typeof v === 'string' && CANALES_IDS.includes(v as Channel);
}

export function canal(id: Channel): CanalDef {
  return CANALES.find((c) => c.id === id) ?? CANALES[0];
}

/** Los que ya puede mandar la app sola. Hoy ninguno; existe para no olvidarlo. */
export function canalesConEnvio(): CanalDef[] {
  return CANALES.filter((c) => c.envioDirecto);
}
