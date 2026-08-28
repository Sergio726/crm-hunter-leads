// Tests de la red de seguridad del mensaje.
//
// El prompt ya pide todo esto; el sanitizador lo fuerza. La idea viene del
// código del desafío de Nexum, con dos diferencias que estos tests protegen:
// las reglas dependen del canal, y los signos de apertura del español no se
// tocan.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { contarPalabras, sanitizarMensaje } from '../src/lib/sanitizar-mensaje';

describe('sanitizarMensaje', () => {
  it('saca el guion largo, que es la marca de agua de un texto generado', () => {
    const t = sanitizarMensaje('Vi tu local — está muy bien puesto', 'whatsapp');
    assert.doesNotMatch(t, /[—–]/);
    assert.match(t, /Vi tu local, está muy bien puesto/);
  });

  it('NO toca los signos de apertura del español', () => {
    // Ellos los borran porque escriben en inglés. Copiar esa regla acá sería
    // meter una falta de ortografía en cada pregunta.
    const t = sanitizarMensaje('¿Te sirve el martes? ¡Genial!', 'whatsapp');
    assert.match(t, /¿Te sirve el martes\?/);
    assert.match(t, /¡Genial!/);
  });

  it('deja los emojis en WhatsApp y en Instagram', () => {
    // Ahí son normales; borrarlos haría que el mensaje suene acartonado.
    assert.match(sanitizarMensaje('Buenísimo 👍', 'whatsapp'), /👍/);
    assert.match(sanitizarMensaje('Buenísimo 👍', 'instagram'), /👍/);
  });

  it('los saca en email y LinkedIn, donde desentonan', () => {
    assert.doesNotMatch(sanitizarMensaje('Buenísimo 👍', 'email'), /👍/);
    assert.doesNotMatch(sanitizarMensaje('Buenísimo 🚀🔥', 'linkedin'), /[🚀🔥]/);
  });

  it('limpia espacios de más y espacios antes de la puntuación', () => {
    assert.equal(sanitizarMensaje('Hola  Juan , ¿cómo va ?', 'whatsapp'), 'Hola Juan, ¿cómo va?');
  });

  it('saca las comillas tipográficas que el modelo agrega al citar', () => {
    assert.doesNotMatch(sanitizarMensaje('Vi tu post «sobre ventas»', 'linkedin'), /[«»]/);
  });

  it('un mensaje que ya está bien no se toca', () => {
    const bueno = 'Hola Ana, vi que abrieron el local nuevo. ¿Tenés 15 minutos esta semana?';
    assert.equal(sanitizarMensaje(bueno, 'whatsapp'), bueno);
  });
});

describe('el recorte por largo', () => {
  const largo = Array.from({ length: 40 }, (_, i) => `palabra${i}`).join(' ') + '.';

  it('un mensaje que se pasa se corta en una frase completa', () => {
    const dosFrases = `${largo} Segunda frase que sobra y no debería quedar entera.`;
    const t = sanitizarMensaje(dosFrases, 'instagram');
    // Termina en cierre de frase: nunca a mitad de palabra.
    assert.match(t.trim(), /[.!?…]$/);
  });

  it('no corta lo que entra dentro del tope', () => {
    const corto = 'Hola Ana, ¿tenés 15 minutos el jueves?';
    assert.equal(sanitizarMensaje(corto, 'instagram'), corto);
  });

  it('email tiene más aire que Instagram', () => {
    // El mismo texto sobrevive entero en mail y se recorta en un DM.
    const medio = Array.from({ length: 70 }, (_, i) => `pal${i}`).join(' ') + '.';
    assert.equal(contarPalabras(sanitizarMensaje(medio, 'email')), 70);
    assert.ok(contarPalabras(sanitizarMensaje(medio, 'instagram')) < 70);
  });

  it('antes que mutilar, prefiere dejarlo largo', () => {
    // Sin ninguna frase cerrada no hay dónde cortar sin romper la idea.
    const sinPuntos = Array.from({ length: 90 }, (_, i) => `p${i}`).join(' ');
    const t = sanitizarMensaje(sinPuntos, 'instagram');
    assert.ok(contarPalabras(t) >= 25, 'no debería quedar un fragmento inservible');
  });
});

describe('contarPalabras', () => {
  it('cuenta bien', () => {
    assert.equal(contarPalabras('una dos tres'), 3);
  });

  it('el vacío es cero, no uno', () => {
    assert.equal(contarPalabras(''), 0);
    assert.equal(contarPalabras('   '), 0);
  });
});
