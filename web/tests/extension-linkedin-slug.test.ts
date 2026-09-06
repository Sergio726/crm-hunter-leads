// La extensión tiene que reconocer, parada en un perfil de LinkedIn, que ese
// es el lead que el CRM guardó con ese mismo perfil escrito de otra forma.
//
// Si esto falla, la extensión dice "no hay mensaje para este perfil" justo en
// el que sí lo hay — y el vendedor concluye que no anda.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mismoPerfil, slugDeLinkedin } from '../src/lib/extension/linkedin-slug';
import { PREFIJO_TOKEN, extraerBearer, generarToken, hashToken } from '../src/lib/extension/auth-puro';

describe('slugDeLinkedin', () => {
  it('saca el slug de todas las formas en que llega el dato', () => {
    const esperado = 'juan-perez-3a';
    for (const forma of [
      'in/juan-perez-3a',
      '/in/juan-perez-3a/',
      'https://www.linkedin.com/in/juan-perez-3a',
      'https://linkedin.com/in/juan-perez-3a/?originalSubdomain=ar',
      'https://www.linkedin.com/in/Juan-Perez-3A/',
      '  in/juan-perez-3a  ',
    ]) {
      assert.equal(slugDeLinkedin(forma), esperado, forma);
    }
  });

  it('no confunde una empresa con una persona', () => {
    assert.equal(slugDeLinkedin('https://www.linkedin.com/company/st-labs/'), null);
  });

  it('con basura devuelve null en vez de inventar', () => {
    assert.equal(slugDeLinkedin(''), null);
    assert.equal(slugDeLinkedin(null), null);
    assert.equal(slugDeLinkedin('https://instagram.com/gimnasio'), null);
  });

  it('un slug codificado en la URL se lee igual', () => {
    assert.equal(slugDeLinkedin('/in/mar%C3%ADa-l%C3%B3pez/'), 'maría-lópez');
  });
});

describe('mismoPerfil', () => {
  it('reconoce el mismo perfil escrito distinto en el CRM y en la barra del navegador', () => {
    assert.ok(mismoPerfil('in/juan-perez-3a', 'https://www.linkedin.com/in/Juan-Perez-3A/'));
  });

  it('no da por iguales dos vacíos', () => {
    // Dos leads sin LinkedIn no son "el mismo perfil": sería matchear todo con todo.
    assert.equal(mismoPerfil(null, null), false);
    assert.equal(mismoPerfil('', ''), false);
  });
});

describe('extraerBearer', () => {
  it('saca el token del header', () => {
    assert.equal(extraerBearer('Bearer hl_ext_abc'), 'hl_ext_abc');
    assert.equal(extraerBearer('bearer hl_ext_abc'), 'hl_ext_abc');
  });

  it('rechaza lo que no es un Bearer', () => {
    assert.equal(extraerBearer(null), null);
    assert.equal(extraerBearer('hl_ext_abc'), null);
    assert.equal(extraerBearer('Basic abc'), null);
    assert.equal(extraerBearer('Bearer'), null);
  });
});

describe('el token', () => {
  it('se reconoce por el prefijo y no se repite', () => {
    const a = generarToken();
    const b = generarToken();
    assert.ok(a.startsWith(PREFIJO_TOKEN));
    assert.notEqual(a, b);
    // 32 bytes en base64url son 43 caracteres: suficiente para que no se adivine.
    assert.ok(a.length >= PREFIJO_TOKEN.length + 43);
  });

  it('el hash es determinista y no revela el token', () => {
    const t = generarToken();
    assert.equal(hashToken(t), hashToken(t));
    assert.equal(hashToken(t), hashToken('  ' + t + '  '), 'los espacios al pegar no cambian el hash');
    assert.notEqual(hashToken(t), hashToken(generarToken()));
    assert.ok(!hashToken(t).includes(t.slice(PREFIJO_TOKEN.length, PREFIJO_TOKEN.length + 8)));
    assert.equal(hashToken(t).length, 64);
  });
});
