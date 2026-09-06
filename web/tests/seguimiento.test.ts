// Tests de las reglas de seguimiento.
//
// Fijan los tres casos que estaban rotos y que no se ven leyendo la pantalla:
// que "sin seguimiento" BORRE la fecha, que el resultado decida el estado, y
// que posponer se cuente desde hoy y no desde la fecha vencida.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PROXIMO_POR_DEFECTO,
  cierraElCliente,
  estadoSegunResultado,
  fechaDeProximo,
  posponerDesdeHoy,
  sumarDias,
} from '../src/lib/seguimiento';

// Fecha fija para que los tests no dependan del día en que se corren.
const HOY = new Date('2026-08-20T15:00:00Z');

describe('sumarDias', () => {
  it('suma en el mismo marco que usa el resto de la app', () => {
    assert.equal(sumarDias(1, HOY), '2026-08-21');
    assert.equal(sumarDias(3, HOY), '2026-08-23');
    assert.equal(sumarDias(30, HOY), '2026-09-19');
  });

  it('de noche en Argentina no se corre un día', () => {
    // 23:30 en Buenos Aires (UTC-3) es el 21 a las 02:30 UTC. Todo el sistema
    // define "hoy" en UTC, así que mañana tiene que ser el 22 y no el 21.
    // La cuenta vieja sumaba en hora local y formateaba en UTC: daba 2026-08-22
    // para "mañana" cuando el sistema ya consideraba que hoy era el 21 — un día
    // de más, y el cliente aparecía vencido antes de tiempo.
    const nocheEnArgentina = new Date('2026-08-21T02:30:00Z');
    assert.equal(sumarDias(1, nocheEnArgentina), '2026-08-22');
  });

  it('cruza fin de mes y año bisiesto', () => {
    assert.equal(sumarDias(1, new Date('2026-08-31T10:00:00Z')), '2026-09-01');
    assert.equal(sumarDias(1, new Date('2028-02-28T10:00:00Z')), '2028-02-29');
    assert.equal(sumarDias(1, new Date('2026-12-31T10:00:00Z')), '2027-01-01');
  });
});

describe('fechaDeProximo', () => {
  it('"sin seguimiento" devuelve null, y ese null es el que borra la fecha', () => {
    // El bug original: `null` significaba a la vez "no elegí" y "sin
    // seguimiento", así que la fecha vencida nunca se borraba y el cliente
    // quedaba en rojo para siempre, generando un mail por día.
    assert.equal(fechaDeProximo({ tipo: 'ninguno' }, HOY), null);
  });

  it('por días cuenta desde hoy', () => {
    assert.equal(fechaDeProximo({ tipo: 'dias', dias: 7 }, HOY), '2026-08-27');
  });

  it('una fecha elegida a mano se respeta tal cual', () => {
    assert.equal(fechaDeProximo({ tipo: 'fecha', fecha: '2026-12-01' }, HOY), '2026-12-01');
  });

  it('una fecha vacía es lo mismo que no tener fecha', () => {
    assert.equal(fechaDeProximo({ tipo: 'fecha', fecha: '' }, HOY), null);
  });

  it('lo que viene preseleccionado agenda algo', () => {
    // Es el arreglo de fondo: antes venía marcado "Sin seguimiento", así que el
    // camino más corto —contactar y guardar— nunca dejaba un próximo paso.
    assert.notEqual(fechaDeProximo(PROXIMO_POR_DEFECTO, HOY), null);
  });
});

describe('estadoSegunResultado', () => {
  it('"no interesado" cierra el cliente', () => {
    assert.equal(estadoSegunResultado('not_interested'), 'lost');
    assert.equal(cierraElCliente('not_interested'), true);
  });

  it('"número equivocado" NO cierra: el teléfono no sirve, el cliente sí', () => {
    // La ficha tiene segundo teléfono y segundo email justamente para esto.
    assert.equal(estadoSegunResultado('wrong_number'), 'contacted');
    assert.equal(cierraElCliente('wrong_number'), false);
  });

  it('el resto deja al cliente activo', () => {
    for (const o of ['answered', 'no_answer', 'interested', 'follow_up_scheduled', 'other'] as const) {
      assert.equal(estadoSegunResultado(o), 'contacted', o);
    }
  });
});

describe('posponerDesdeHoy', () => {
  it('cuenta desde hoy, no desde la fecha vencida', () => {
    // Un cliente que venció hace un mes, pospuesto una semana, tiene que caer
    // la semana que viene. La cuenta ingenua —sumarle días a la fecha vieja—
    // lo dejaría vencido igual.
    assert.equal(posponerDesdeHoy(7, HOY), '2026-08-27');
  });
});
