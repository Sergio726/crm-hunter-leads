// La red de seguridad del mensaje: lo que el prompt pide, esto lo fuerza.
//
// La idea viene del código del desafío de Nexum, que aplica sus reglas **dos
// veces** —el prompt las pide y una función las impone después— con un
// razonamiento que vale: el mensaje es lo que ve el prospecto, así que no queda
// librado a que el modelo obedezca. Un modelo que ignora una instrucción una de
// cada veinte veces deja pasar ese mensaje.
//
// Dos diferencias a propósito con la versión de ellos:
//
// 1. **Por canal.** Ellos borran los emojis siempre. Acá un emoji en WhatsApp o
//    en un DM de Instagram es normal, y en un mail o en LinkedIn desentona: la
//    regla depende de dónde se lee el mensaje.
//
// 2. **No se tocan `¿` ni `¡`.** Ellos los eliminan porque escriben en inglés;
//    copiar esa regla acá sería introducir una falta de ortografía en cada
//    pregunta. Es el ejemplo de por qué una regla no se copia sin mirar para
//    qué idioma se escribió.

import { trimToLastSentence } from './prospect/agent';
import type { Channel } from './canales';

/** Emojis, pictogramas y flechas. */
const EMOJIS =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

interface ReglasDeCanal {
  /** Si el canal admite emojis con naturalidad. */
  emojis: boolean;
  /** Tope de palabras antes de recortar. Va con holgura sobre el prompt. */
  maxPalabras: number;
}

const REGLAS: Record<Channel, ReglasDeCanal> = {
  // El prompt pide 45; el recorte entra recién cuando se pasa de largo.
  whatsapp: { emojis: true, maxPalabras: 60 },
  // El DM cae en solicitudes: si se estira, no se lee.
  instagram: { emojis: true, maxPalabras: 50 },
  // Asunto + cuerpo, así que tiene más aire.
  email: { emojis: false, maxPalabras: 120 },
  linkedin: { emojis: false, maxPalabras: 80 },
};

export function contarPalabras(texto: string): number {
  const limpio = texto.trim();
  return limpio ? limpio.split(/\s+/).length : 0;
}

/**
 * Deja el mensaje listo para mostrar.
 *
 * Nunca corta a mitad de una frase: si hay que acortar, se queda con las
 * oraciones completas que entren. Un mensaje cortado por la mitad se nota más
 * que uno largo.
 */
export function sanitizarMensaje(texto: string, canal: Channel): string {
  const reglas = REGLAS[canal] ?? REGLAS.whatsapp;

  let out = texto;
  if (!reglas.emojis) out = out.replace(EMOJIS, '');

  out = out
    // El guion largo es la marca de agua de un texto generado.
    .replace(/\s*[—–]\s*/g, ', ')
    // Comillas tipográficas que el modelo agrega al citar.
    .replace(/[«»""]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    // Una coma pegada a otra por el reemplazo del guion.
    .replace(/,\s*,/g, ',')
    .trim();

  if (contarPalabras(out) > reglas.maxPalabras) {
    const recortado = trimToLastSentence(
      out.split(/\s+/).slice(0, reglas.maxPalabras).join(' '),
    );
    // `trimToLastSentence` puede devolver algo muy corto si no había ninguna
    // oración cerrada: en ese caso es mejor el mensaje largo que uno mutilado.
    if (contarPalabras(recortado) >= reglas.maxPalabras / 2) out = recortado;
  }

  return out;
}
