'use client';

/**
 * Lo que vende el usuario, recordado entre pantallas.
 *
 * Turbo lo entiende durante la entrevista, pero el primer mensaje a un prospecto
 * se escribe en OTRA pantalla (Guardados), así que sin esto habría que volver a
 * preguntarlo — una pregunta que el sistema ya sabe responder.
 *
 * Va en `localStorage` y no en la base a propósito: es una preferencia de
 * trabajo del vendedor, cambia seguido y no vale una migración. Si se pierde, el
 * diálogo simplemente arranca vacío como antes.
 */

const KEY = 'hunter-leads:oferta';

export function rememberOffer(offer: string): void {
  const value = offer.trim();
  if (value.length < 5) return;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Modo privado o storage lleno: no es motivo para romper el chat.
  }
}

export function recallOffer(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}
