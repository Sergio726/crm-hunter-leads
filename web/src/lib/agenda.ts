// El link donde el lead reserva la llamada.
//
// Turbo escribe mensajes que empujan a una reunión, así que necesita algo
// concreto que ofrecer. Sin link, el mensaje pide la llamada sin proponer
// horarios: el modelo no sabe la disponibilidad de nadie y un horario inventado
// es peor que ninguno.
//
// Vive en `app_settings.agenda_url` (migración `0051`), como las ofertas.

export const AGENDA_KEY = 'agenda_url';

/**
 * Lo guardado no se confía: puede venir vacío, con espacios o sin protocolo.
 * Devuelve `null` cuando no hay un link usable, que es la señal para que el
 * prompt no ofrezca ninguno.
 */
export function normalizeAgendaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.length < 8) return null;
  const conProtocolo = v.startsWith('http://') || v.startsWith('https://') ? v : `https://${v}`;
  try {
    const u = new URL(conProtocolo);
    // Sin punto en el host no es un dominio: evita guardar "mi agenda" y que
    // el mensaje ofrezca un link roto.
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}
