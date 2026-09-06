// Tests del formato de los mensajes de Turbo.
//
// El caso que originó todo, sacado de un video del usuario: el chat mostraba
// literalmente `**Cargos:** fundador, CEO, gerente general` — con los asteriscos
// a la vista, porque nadie dibujaba el markdown que Turbo escribe.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bulletOf, parseChatMarkdown, parseInline } from '../src/lib/prospect/chat-markdown';

/** Atajo: el texto plano de una lista de tokens. */
const plano = (tokens: { text: string }[]) => tokens.map((t) => t.text).join('');

describe('parseInline', () => {
  it('reconoce la negrita y le saca los asteriscos', () => {
    const t = parseInline('**Cargos:** fundador, CEO');
    assert.equal(t[0].kind, 'bold');
    assert.equal(t[0].text, 'Cargos:');
    assert.equal(t[1].text, ' fundador, CEO');
    // Lo que se ve NO tiene que tener asteriscos.
    assert.doesNotMatch(plano(t), /\*/);
  });

  it('la negrita gana sobre la cursiva', () => {
    // Sin este orden, `**x**` se leería como cursiva de `*x*`.
    assert.equal(parseInline('**x**')[0].kind, 'bold');
    assert.equal(parseInline('*x*')[0].kind, 'italic');
  });

  it('acepta guiones bajos', () => {
    assert.equal(parseInline('__x__')[0].kind, 'bold');
    assert.equal(parseInline('_x_')[0].kind, 'italic');
  });

  it('reconoce código entre acentos graves', () => {
    const t = parseInline('poné `Colombia` como zona');
    assert.equal(t[1].kind, 'code');
    assert.equal(t[1].text, 'Colombia');
  });

  it('un texto sin formato queda entero y en un solo tramo', () => {
    const t = parseInline('sin nada especial');
    assert.equal(t.length, 1);
    assert.equal(t[0].kind, 'text');
  });

  it('un asterisco suelto no rompe ni desaparece', () => {
    assert.equal(plano(parseInline('2 * 3 = 6')), '2 * 3 = 6');
  });

  it('nunca devuelve una lista vacía', () => {
    assert.equal(parseInline('').length, 1);
  });
});

describe('bulletOf', () => {
  it('reconoce las tres formas de viñeta', () => {
    assert.equal(bulletOf('- uno'), 'uno');
    assert.equal(bulletOf('* dos'), 'dos');
    assert.equal(bulletOf('• tres'), 'tres');
  });
  it('acepta viñetas indentadas, como las escribe el modelo', () => {
    assert.equal(bulletOf('   - con sangría'), 'con sangría');
  });
  it('no confunde una negrita al principio de línea con una viñeta', () => {
    assert.equal(bulletOf('**Cargos:** fundador'), null);
  });
});

describe('parseChatMarkdown', () => {
  it('el mensaje real del video se dibuja sin asteriscos', () => {
    const mensaje = [
      'Te propongo esto:',
      '',
      '- **Cargos:** fundador, CEO, gerente general',
      '- **Nivel:** owner, director',
      '- **Empresas:** 11-200 empleados',
      '',
      '¿Ajustás algo o lo lanzamos?',
    ].join('\n');

    const bloques = parseChatMarkdown(mensaje);
    const lista = bloques.find((b) => b.type === 'ul');
    assert.ok(lista && lista.type === 'ul');
    assert.equal(lista.items.length, 3);
    assert.equal(lista.items[0][0].kind, 'bold');
    assert.equal(lista.items[0][0].text, 'Cargos:');

    // Nada de lo que se muestra conserva los asteriscos.
    const todo = bloques
      .flatMap((b) => (b.type === 'p' ? b.tokens : b.type === 'ul' ? b.items.flat() : []))
      .map((t) => t.text)
      .join(' ');
    assert.doesNotMatch(todo, /\*\*/);
  });

  it('agrupa viñetas seguidas en una sola lista', () => {
    const b = parseChatMarkdown('- a\n- b\n- c');
    assert.equal(b.length, 1);
    assert.equal(b[0].type, 'ul');
  });

  it('una línea en blanco separa, pero dos no abren un hueco doble', () => {
    const b = parseChatMarkdown('uno\n\n\n\ndos');
    assert.equal(b.filter((x) => x.type === 'space').length, 1);
  });

  it('no empieza con un espacio en blanco', () => {
    assert.notEqual(parseChatMarkdown('\n\nhola')[0].type, 'space');
  });

  it('un mensaje simple es un solo párrafo', () => {
    const b = parseChatMarkdown('Listo, armé el plan.');
    assert.equal(b.length, 1);
    assert.equal(b[0].type, 'p');
  });

  it('los emojis pasan intactos', () => {
    const b = parseChatMarkdown('🎯 Encontré 12 inmobiliarias');
    assert.ok(b[0].type === 'p' && b[0].tokens[0].text.startsWith('🎯'));
  });
});
