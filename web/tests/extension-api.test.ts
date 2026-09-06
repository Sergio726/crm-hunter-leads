// Las rutas de la extensión entran con la clave de servicio, así que el RLS no
// las protege. La ÚNICA barrera entre "mis borradores" y "los de todos" es el
// filtro por el vendedor del token, escrito a mano en cada consulta.
//
// Este test fija que ese filtro esté. No prueba que funcione contra la base
// —eso se verificó ejecutando sobre producción, ver el tablero—: prueba que
// nadie lo saque sin que un test falle. Es la clase de línea que se borra
// "limpiando" y no rompe ninguna compilación.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const raiz = join(import.meta.dirname, '..', 'src', 'app', 'api', 'extension');
const leer = (nombre: string) => readFileSync(join(raiz, nombre, 'route.ts'), 'utf8');

describe('las rutas de la extensión filtran por el vendedor del token', () => {
  it('pendientes: solo los borradores del vendedor', () => {
    const codigo = leer('pendientes');
    assert.ok(codigo.includes("puertaDeExtension(request)"), 'tiene que pasar por la puerta');
    assert.ok(
      codigo.includes(".eq('created_by', puerta.userId)"),
      'la consulta a outbound_drafts tiene que filtrar por el vendedor del token',
    );
  });

  it('enviado: lee y marca solo borradores propios', () => {
    const codigo = leer('enviado');
    assert.ok(codigo.includes('puertaDeExtension(request)'));
    // Dos veces: al leer el borrador y al marcarlo. Si falta una, alguien
    // podría marcar como enviado un borrador ajeno conociendo su id.
    const filtros = codigo.match(/\.eq\('created_by', userId\)/g) ?? [];
    assert.ok(filtros.length >= 2, `se esperaban 2 filtros por vendedor, hay ${filtros.length}`);
    // Y la interacción se anota en nombre del vendedor del token, no de otro.
    assert.ok(codigo.includes('user_id: userId'));
  });

  it('ping: no devuelve más que el nombre', () => {
    const codigo = leer('ping');
    assert.ok(codigo.includes("eq('id', puerta.userId)"));
  });

  it('ninguna ruta por token usa la sesión del panel', () => {
    // La sesión del panel no viaja desde la extensión. Si alguna de estas rutas
    // la usara, fallaría siempre con 401 sin que se entienda por qué.
    for (const nombre of ['pendientes', 'enviado', 'ping']) {
      const codigo = leer(nombre);
      assert.ok(!codigo.includes('apiSectionGuard'), `${nombre} no debe usar apiSectionGuard`);
      assert.ok(!codigo.includes("from '@/lib/supabase/server'"), `${nombre} no debe usar la sesión`);
    }
  });

  it('token: es la única con sesión, y nunca devuelve el hash', () => {
    const codigo = leer('token');
    assert.ok(codigo.includes('getSessionProfile'));
    // El select de la lista no puede traer token_hash: sería mostrar el secreto.
    const select = /select\('([^']+)'\)/.exec(codigo);
    assert.ok(select, 'hay un select de la lista');
    assert.ok(!select[1].includes('token_hash'), 'la lista no debe incluir el hash');
  });

  it('la extensión nunca aprieta enviar', () => {
    // Es la línea que separa "asistida" de "automatizada", y la que mantiene el
    // riesgo con LinkedIn en el mínimo. Se fija acá para que no entre por un
    // "mejora chica".
    const content = readFileSync(join(import.meta.dirname, '..', '..', 'extension', 'content.js'), 'utf8');
    const sinComentarios = content.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\.click\(\)/.test(sinComentarios), 'el content script no hace clic en nada de LinkedIn');
    assert.ok(!/msg-form__send|send-button|type="submit"/i.test(sinComentarios), 'no toca el botón de enviar');
  });
});
