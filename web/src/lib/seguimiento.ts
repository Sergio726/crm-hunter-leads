// Qué pasa con un cliente cuando se registra un contacto.
//
// Vive acá y no dentro del componente porque son reglas de negocio con casos
// de borde que conviene fijar con tests: de qué fecha estamos hablando, y en
// qué estado queda el cliente según cómo resultó el contacto.
//
// El motivo de que exista es un bug: el panel de resultado usaba `null` para
// dos cosas distintas —"no elegí nada" y "sin seguimiento"— y por eso elegir
// "Sin seguimiento" no borraba la fecha vencida. El tipo `Proximo` de abajo
// hace que esa confusión no se pueda volver a escribir.

import type { ClientStatus, Outcome } from './types';

/** Qué se decidió sobre el próximo seguimiento. */
export type Proximo =
  | { tipo: 'dias'; dias: number }
  | { tipo: 'fecha'; fecha: string }
  /** Explícito: no hay próximo paso, y si había una fecha se borra. */
  | { tipo: 'ninguno' };

/** Lo que viene preseleccionado al abrir el panel. */
export const PROXIMO_POR_DEFECTO: Proximo = { tipo: 'dias', dias: 3 };

export const OPCIONES_SEGUIMIENTO: { label: string; dias: number }[] = [
  { label: 'Mañana', dias: 1 },
  { label: 'En 3 días', dias: 3 },
  { label: 'Próxima semana', dias: 7 },
  { label: 'En 2 semanas', dias: 14 },
  { label: 'En un mes', dias: 30 },
];

/**
 * Hoy + N días, en el mismo marco horario que usa el resto de la app.
 *
 * Todo el sistema define "hoy" como `new Date().toISOString().slice(0, 10)`, o
 * sea la fecha UTC (ver `format-dates.ts`). Acá se suma **en UTC** a propósito:
 * el código anterior incrementaba en hora local y formateaba en UTC, y esa
 * mezcla corría un día las fechas creadas de noche en Argentina — "Mañana"
 * podía quedar a dos días. Da igual cuál de las dos zonas sea la "correcta":
 * lo que no puede pasar es que la fecha que se guarda y la que decide si algo
 * está vencido se calculen distinto.
 */
export function sumarDias(dias: number, hoy: Date = new Date()): string {
  const d = new Date(hoy.getTime());
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * La fecha que hay que guardar en `next_follow_up`.
 *
 * Devuelve `null` para 'ninguno', y ese `null` **se escribe**: es lo que borra
 * una fecha vencida cuando el vendedor dice que no hay próximo paso.
 */
export function fechaDeProximo(p: Proximo, hoy: Date = new Date()): string | null {
  if (p.tipo === 'ninguno') return null;
  if (p.tipo === 'fecha') return p.fecha || null;
  return sumarDias(p.dias, hoy);
}

/**
 * En qué estado queda el cliente según cómo resultó el contacto.
 *
 * Antes el estado se fijaba en 'contacted' sin mirar el resultado, así que
 * marcar "No interesado" dejaba al cliente en el embudo activo: seguía contando
 * como pendiente y seguía generando avisos de seguimiento vencido.
 *
 * Solo "No interesado" cierra. **"Número equivocado" no**, a propósito: quiere
 * decir que ese teléfono no sirve, no que el cliente no sirva — la ficha tiene
 * un segundo teléfono y un segundo email para eso.
 */
export function estadoSegunResultado(outcome: Outcome): ClientStatus {
  return outcome === 'not_interested' ? 'lost' : 'contacted';
}

/** ¿Hay que avisar que este resultado va a cerrar el cliente? */
export function cierraElCliente(outcome: Outcome): boolean {
  return estadoSegunResultado(outcome) === 'lost';
}

/**
 * Posponer un seguimiento desde la lista, sin abrir la ficha.
 *
 * Se cuenta desde HOY y no desde la fecha vencida: "posponer una semana" un
 * cliente que venció hace un mes tiene que caer la semana que viene, no hace
 * tres semanas. Sonaba obvio y es justo lo que hace mal la cuenta ingenua.
 */
export function posponerDesdeHoy(dias: number, hoy: Date = new Date()): string {
  return sumarDias(dias, hoy);
}
