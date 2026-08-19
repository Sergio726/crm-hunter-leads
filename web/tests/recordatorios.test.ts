// Tests del aviso que recibe un vendedor por mail.
//
// Cubre los DOS eventos —seguimiento vencido y cliente asignado— porque van en
// un solo mail: alguien con tres vencidos y dos clientes nuevos recibe uno, no
// cinco. Cinco mails no se leen.
//
// Las fechas son donde se esconden los errores: `next_follow_up` es un `date`
// sin hora, y pasarlo por un `Date` local lo corre un día según la zona horaria
// — el clásico "vence hoy" mostrado como "vence ayer" para quien está en UTC-3.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  armarAviso,
  asunto,
  atrasoEnPalabras,
  diasDeAtraso,
  type Destinatario,
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
    // Con `new Date('2026-08-19')` y hora local UTC-3 daría el 18 a las 21:00 y
    // el cálculo se iría un día.
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
  it('lleva los números adelante: es lo único que se ve sin abrir el mail', () => {
    assert.equal(asunto(1, 0), 'Tenés 1 seguimiento vencido');
    assert.equal(asunto(3, 0), 'Tenés 3 seguimientos vencidos');
    assert.equal(asunto(0, 1), 'Tenés 1 cliente nuevo');
  });

  it('con dos eventos junta las dos cosas en vez de elegir una', () => {
    assert.equal(asunto(2, 3), 'Tenés 2 seguimientos vencidos y 3 clientes nuevos');
  });

  it('con los tres usa comas y un solo "y"', () => {
    // "a, b, y c" se lee mal en castellano.
    assert.equal(
      asunto(2, 3, 1),
      'Tenés 2 seguimientos vencidos, 1 cliente sin contactar y 3 clientes nuevos',
    );
  });

  it('solo inactivos', () => {
    assert.equal(asunto(0, 0, 4), 'Tenés 4 clientes sin contactar');
  });

  it('sin nada no queda una frase rota', () => {
    assert.equal(asunto(0, 0), 'Tenés novedades');
  });
});

describe('armarAviso', () => {
  const base: Destinatario = {
    user_id: 'u1',
    email: 'vendedor@ejemplo.com',
    full_name: 'Juan Pérez',
    items: [
      {
        id: 'n1',
        evento: 'followup.overdue',
        cliente: 'Ana Gómez',
        empresa: 'Kuvia',
        vence: '2026-08-15',
      },
      {
        id: 'n2',
        evento: 'lead.assigned',
        cliente: 'Estudio Pilates',
        empresa: null,
        vence: null,
      },
    ],
  };

  it('saluda por el nombre de pila, no por el nombre completo', () => {
    assert.match(armarAviso(base, '2026-08-19', 'https://app/clientes').texto, /^Hola Juan,/);
  });

  it('sin nombre no saluda raro', () => {
    const r = armarAviso({ ...base, full_name: null }, '2026-08-19', 'https://app/clientes');
    assert.match(r.texto, /^Hola,/);
  });

  it('separa los vencidos de los asignados', () => {
    const r = armarAviso(base, '2026-08-19', 'https://app/clientes');
    assert.match(r.texto, /Se te pasó un seguimiento:/);
    assert.match(r.texto, /· Ana Gómez \(Kuvia\) — hace 4 días/);
    assert.match(r.texto, /Te asignaron un cliente:/);
    // Sin empresa no deja los paréntesis vacíos.
    assert.match(r.texto, /· Estudio Pilates$/m);
  });

  it('un solo mail con todo, no uno por evento', () => {
    const r = armarAviso(base, '2026-08-19', 'https://app/clientes');
    assert.equal(r.asunto, 'Tenés 1 seguimiento vencido y 1 cliente nuevo');
    assert.equal((r.texto.match(/^· /gm) ?? []).length, 2);
  });

  it('solo asignados no habla de seguimientos', () => {
    const r = armarAviso(
      { ...base, items: [base.items[1]] },
      '2026-08-19',
      'https://app/clientes',
    );
    assert.ok(!r.texto.includes('seguimiento'), 'no menciona lo que no pasó');
    assert.match(r.texto, /Te asignaron un cliente:/);
  });

  it('un vencido sin fecha no rompe ni miente', () => {
    const r = armarAviso(
      {
        ...base,
        items: [{ id: 'n3', evento: 'followup.overdue', cliente: 'X', vence: null }],
      },
      '2026-08-19',
      'https://app/clientes',
    );
    assert.match(r.texto, /X — sin fecha/);
  });

  it('escapa el HTML: los nombres los escribe el usuario', () => {
    const r = armarAviso(
      {
        ...base,
        items: [
          { id: 'n4', evento: 'lead.assigned', cliente: '<script>alert(1)</script>', vence: null },
        ],
      },
      '2026-08-19',
      'https://app/clientes',
    );
    assert.ok(!r.html.includes('<script>'), 'no puede inyectarse una etiqueta');
    assert.match(r.html, /&lt;script&gt;/);
  });

  it('el aviso de inactividad dice cuántos días, no "hace mucho"', () => {
    // El número es lo que hace que alguien actúe.
    const r = armarAviso(
      {
        ...base,
        items: [
          {
            id: 'n5',
            evento: 'client.stale',
            cliente: 'Ana Gómez',
            empresa: 'Kuvia',
            dias_sin_contacto: 12,
          },
        ],
      },
      '2026-08-19',
      'https://app/clientes',
    );
    assert.equal(r.asunto, 'Tenés 1 cliente sin contactar');
    assert.match(r.texto, /Hace rato que no tocás este cliente:/);
    assert.match(r.texto, /· Ana Gómez \(Kuvia\) — hace 12 días/);
  });

  it('un inactivo sin el dato de días no queda con un texto roto', () => {
    const r = armarAviso(
      {
        ...base,
        items: [{ id: 'n6', evento: 'client.stale', cliente: 'X', dias_sin_contacto: null }],
      },
      '2026-08-19',
      'https://app/clientes',
    );
    assert.match(r.texto, /· X$/m);
    assert.ok(!r.texto.includes('hace null'));
  });

  it('los tres eventos entran en UN solo mail', () => {
    const r = armarAviso(
      {
        ...base,
        items: [
          ...base.items,
          { id: 'n7', evento: 'client.stale', cliente: 'Gimnasio Sur', dias_sin_contacto: 15 },
        ],
      },
      '2026-08-19',
      'https://app/clientes',
    );
    assert.equal((r.texto.match(/^· /gm) ?? []).length, 3);
    assert.match(r.asunto, /vencido.*sin contactar.*nuevo/);
  });

  it('el enlace a clientes va en las dos versiones', () => {
    const r = armarAviso(base, '2026-08-19', 'https://app/clientes');
    assert.match(r.texto, /https:\/\/app\/clientes/);
    assert.match(r.html, /href="https:\/\/app\/clientes"/);
  });
});
