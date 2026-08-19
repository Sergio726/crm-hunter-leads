// Tests del recordatorio de seguimientos vencidos.
//
// El texto de un mail se lee una vez por día y tiene que decir algo útil en la
// primera línea. Y las fechas son donde se esconden los errores: `next_follow_up`
// es un `date` sin hora, y pasarlo por un `Date` local puede correrlo un día
// según la zona horaria — el clásico "vence hoy" mostrado como "vence ayer"
// para quien está en UTC-3.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  armarRecordatorio,
  asunto,
  atrasoEnPalabras,
  diasDeAtraso,
} from '../src/lib/recordatorios/mensaje';

describe('diasDeAtraso', () => {
  it('cuenta los días entre dos fechas', () => {
    assert.equal(diasDeAtraso('2026-08-15', '2026-08-19'), 4);
    assert.equal(diasDeAtraso('2026-08-19', '2026-08-19'), 0);
  });

  it('cruza fin de mes sin equivocarse', () => {
    assert.equal(diasDeAtraso('2026-07-31', '2026-08-01'), 1);
  });

  it('no se corre un día por la zona horaria', () => {
    // Se compara en fechas puras, no en instantes. Con `new Date('2026-08-19')`
    // y hora local UTC-3 daría el 18 a las 21:00 y el cálculo se iría un día.
    assert.equal(diasDeAtraso('2026-08-19', '2026-08-20'), 1);
    assert.equal(diasDeAtraso('2026-01-01', '2026-01-01'), 0);
  });
});

describe('atrasoEnPalabras', () => {
  it('habla como una persona', () => {
    assert.equal(atrasoEnPalabras(1), 'hace 1 día');
    assert.equal(atrasoEnPalabras(5), 'hace 5 días');
  });
  it('cero o menos es "vence hoy", no "hace 0 días"', () => {
    assert.equal(atrasoEnPalabras(0), 'vence hoy');
    assert.equal(atrasoEnPalabras(-2), 'vence hoy');
  });
});

describe('asunto', () => {
  it('lleva el número adelante: es lo único que se ve sin abrir el mail', () => {
    assert.equal(asunto(1), 'Tenés 1 seguimiento vencido');
    assert.equal(asunto(3), 'Tenés 3 seguimientos vencidos');
  });
});

describe('armarRecordatorio', () => {
  const base = {
    user_id: 'u1',
    email: 'vendedor@ejemplo.com',
    full_name: 'Juan Pérez',
    clientes: [
      { id: 'c1', nombre: 'Ana Gómez', empresa: 'Kuvia', vence: '2026-08-15' },
      { id: 'c2', nombre: 'Estudio Pilates', empresa: null, vence: '2026-08-18' },
    ],
  };

  it('saluda por el nombre de pila, no por el nombre completo', () => {
    const r = armarRecordatorio(base, '2026-08-19', 'https://app/clientes');
    assert.match(r.texto, /^Hola Juan,/);
  });

  it('sin nombre no saluda raro', () => {
    const r = armarRecordatorio({ ...base, full_name: null }, '2026-08-19', 'https://app/clientes');
    assert.match(r.texto, /^Hola,/);
  });

  it('lista cada cliente con cuánto hace que venció', () => {
    const r = armarRecordatorio(base, '2026-08-19', 'https://app/clientes');
    assert.match(r.texto, /Ana Gómez \(Kuvia\) — hace 4 días/);
    // Sin empresa no deja los paréntesis vacíos.
    assert.match(r.texto, /· Estudio Pilates — hace 1 día/);
  });

  it('un solo mail con todos, no uno por cliente', () => {
    // Alguien con quince atrasados recibiría quince mails y no leería ninguno.
    const r = armarRecordatorio(base, '2026-08-19', 'https://app/clientes');
    assert.equal(r.asunto, 'Tenés 2 seguimientos vencidos');
    assert.equal((r.texto.match(/^· /gm) ?? []).length, 2);
  });

  it('escapa el HTML: los nombres los escribe el usuario', () => {
    const r = armarRecordatorio(
      { ...base, clientes: [{ id: 'c1', nombre: '<script>alert(1)</script>', vence: '2026-08-18' }] },
      '2026-08-19',
      'https://app/clientes',
    );
    assert.ok(!r.html.includes('<script>'), 'no puede inyectarse una etiqueta');
    assert.match(r.html, /&lt;script&gt;/);
  });

  it('el enlace a clientes va en las dos versiones', () => {
    const r = armarRecordatorio(base, '2026-08-19', 'https://app/clientes');
    assert.match(r.texto, /https:\/\/app\/clientes/);
    assert.match(r.html, /href="https:\/\/app\/clientes"/);
  });
});
