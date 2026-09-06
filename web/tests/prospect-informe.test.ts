// Tests del informe de corrida y del presupuesto.
//
// Lo que fijan: la distinción entre "vacío porque mis filtros descartaron todo"
// y "vacío porque el proveedor no devolvió nada". Confundirlas fue lo que hizo
// que una búsqueda de LinkedIn rota mandara al usuario a aflojar filtros que no
// tenían nada que ver.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  describeRunForAgent,
  summarizeRun,
  topDiscard,
  totalDiscarded,
  type DiscardCounts,
  type RunFacts,
} from '../src/lib/prospect/run-summary';
import { describeBudget, evaluarPresupuesto, requestsForFilters, type Budget } from '../src/lib/prospect/budget';
import { COSTO_POR_SITIO_USD, costoDeLeerSitios, esSitioLeible } from '../src/lib/prospect/sitios';

const sinDescartes: DiscardCounts = {
  withWebsite: 0,
  noInstagram: 0,
  noLinkedin: 0,
  noWhatsapp: 0,
  lowRating: 0,
  excludedName: 0,
};

const corrida = (extra: Partial<RunFacts> = {}): RunFacts => ({
  source: 'google_places',
  requested: 30,
  returned: 30,
  totalMatched: 30,
  requestsUsed: 6,
  truncated: false,
  discarded: sinDescartes,
  ...extra,
});

describe('summarizeRun', () => {
  it('una corrida completa no inventa un problema', () => {
    const s = summarizeRun(corrida());
    assert.equal(s.shortfall, null);
    assert.equal(s.providerEmpty, false);
  });

  it('cuando faltan, dice cuántos y por qué filtro', () => {
    const s = summarizeRun(
      corrida({
        returned: 12,
        totalMatched: 12,
        discarded: { ...sinDescartes, withWebsite: 18, noWhatsapp: 3 },
      }),
    );
    assert.match(s.shortfall!, /Faltaron 18/);
    assert.match(s.shortfall!, /ya tienen web propia/);
  });

  it('vacío CON descartes es culpa de los filtros', () => {
    const s = summarizeRun(
      corrida({ returned: 0, totalMatched: 0, discarded: { ...sinDescartes, noLinkedin: 9 } }),
    );
    assert.equal(s.providerEmpty, false);
    assert.match(s.shortfall!, /no publican LinkedIn/);
  });

  it('vacío SIN descartes es culpa del proveedor, y se dice', () => {
    // El caso real: 0 candidatos con todos los motivos en cero. Mandar al
    // usuario a aflojar filtros ahí es mandarlo a perder el tiempo.
    const s = summarizeRun(corrida({ returned: 0, totalMatched: 0 }));
    assert.equal(s.providerEmpty, true);
    assert.match(s.shortfall!, /No fue por tus filtros/);
  });

  it('en LinkedIn apunta a la zona, que es la causa habitual', () => {
    const s = summarizeRun(corrida({ source: 'linkedin', returned: 0, totalMatched: 0 }));
    assert.match(s.shortfall!, /zona/);
    assert.match(s.shortfall!, /coincidencia exacta/);
  });

  it('el detalle lista solo los motivos que descartaron algo', () => {
    const s = summarizeRun(
      corrida({ returned: 5, discarded: { ...sinDescartes, lowRating: 4, noInstagram: 0 } }),
    );
    assert.equal(s.detail.length, 1);
    assert.match(s.detail[0], /4 quedaron bajo el rating/);
  });
});

describe('topDiscard y totalDiscarded', () => {
  it('elige el motivo que se llevó más puestos', () => {
    const t = topDiscard({ ...sinDescartes, noLinkedin: 3, withWebsite: 11 });
    assert.equal(t?.n, 11);
    assert.match(t!.texto, /web propia/);
  });
  it('sin descartes devuelve null, no un motivo inventado', () => {
    assert.equal(topDiscard(sinDescartes), null);
    assert.equal(totalDiscarded(sinDescartes), 0);
  });
});

describe('describeRunForAgent', () => {
  it('marca en mayúsculas el caso que Turbo tiene que reconocer', () => {
    const t = describeRunForAgent(corrida({ returned: 0, totalMatched: 0 }));
    assert.match(t, /EL PROVEEDOR NO DEVOLVIÓ NADA/);
  });
  it('incluye los números crudos para que no invente', () => {
    const t = describeRunForAgent(corrida({ requested: 50, returned: 44 }), 1.5);
    assert.match(t, /pedidos 50/);
    assert.match(t, /devueltos 44/);
    assert.match(t, /US\$ 1\.50/);
  });
});

describe('requestsForFilters', () => {
  it('cuenta zonas por términos, hasta el tope de la corrida', () => {
    assert.equal(requestsForFilters({ areas: ['a'], queries: ['x'] }), 3);
    assert.equal(requestsForFilters({ areas: ['a', 'b'], queries: ['x', 'y'] }), 12);
    // El tope duro de `places.ts` manda por encima de todo.
    assert.equal(requestsForFilters({ areas: Array(9).fill('a'), queries: ['x'] }), 24);
  });
  it('las fuentes que no son Google no consumen consultas de Places', () => {
    assert.equal(requestsForFilters({ source: 'linkedin', areas: ['a'], queries: ['x'] }), 0);
  });
});

describe('presupuesto', () => {
  const budget = (remainingUsd: number, googleRequests = 120): Budget => ({
    apify: { usedUsd: 5 - remainingUsd, limitUsd: 5, remainingUsd },
    google: {
      requests: googleRequests,
      freeRequests: 1000,
      estimatedUsd: 0,
      remainingRequests: Math.max(0, 1000 - googleRequests),
    },
  });

  describe('Apify — saldo real en dólares', () => {
    it('deja pasar lo que entra y frena lo que no', () => {
      assert.equal(evaluarPresupuesto(budget(2.76), 'linkedin', 0.12).nivel, 'ok');
      assert.equal(evaluarPresupuesto(budget(0.1), 'linkedin', 0.7).nivel, 'agotado');
    });

    it('avisa ANTES de que se acabe, no cuando ya no queda', () => {
      // 80% gastado y la corrida todavía entra: se deja pasar, pero se avisa.
      const v = evaluarPresupuesto(budget(1), 'linkedin', 0.1);
      assert.equal(v.nivel, 'aviso');
      assert.match(v.mensaje, /Queda poco saldo/);
    });

    it('cuando frena, dice qué hacer', () => {
      const v = evaluarPresupuesto(budget(0.1), 'linkedin', 0.7);
      assert.match(v.mensaje, /cargar saldo|renueve/);
    });

    it('sin dato de saldo no frena a nadie', () => {
      // Que no responda la API de Apify no puede dejar al equipo sin trabajar.
      const sinDato: Budget = {
        apify: null,
        google: { requests: 0, freeRequests: 1000, estimatedUsd: 0, remainingRequests: 1000 },
      };
      assert.equal(evaluarPresupuesto(sinDato, 'linkedin', 99).nivel, 'ok');
    });
  });

  describe('Google — consultas gratis del mes', () => {
    it('frena cuando la búsqueda no entra en lo que queda', () => {
      // 990 gastadas, quedan 10, y esta pide 24.
      const v = evaluarPresupuesto(budget(3, 990), 'google_places', 0, 24);
      assert.equal(v.nivel, 'agotado');
      assert.match(v.mensaje, /consultas gratis/);
    });

    it('avisa al 80% aunque la búsqueda todavía entre', () => {
      const v = evaluarPresupuesto(budget(3, 800), 'google_places', 0, 24);
      assert.equal(v.nivel, 'aviso');
      // Dice lo que queda (200) y aparte lo que cuesta esta (24), sin restarlas:
      // el vendedor tiene que poder decidir si la hace o la deja para después.
      assert.match(v.mensaje, /Quedan ~200 consultas/);
      assert.match(v.mensaje, /usa 24/);
    });

    it('con margen de sobra no dice nada', () => {
      const v = evaluarPresupuesto(budget(3, 120), 'google_places', 0, 24);
      assert.equal(v.nivel, 'ok');
      assert.equal(v.mensaje, '');
    });

    it('el saldo de Apify no frena una búsqueda de Google', () => {
      // Son plata distinta: quedarse sin Apify no puede cortar Google Maps.
      assert.equal(evaluarPresupuesto(budget(0, 120), 'google_places', 0, 24).nivel, 'ok');
    });
  });

  describe('el enriquecimiento también pasa por la caja', () => {
    // Hasta ahora el freno solo cubría la búsqueda: leer sitios y consultar
    // Instagram gastan del MISMO saldo de Apify y se colaban sin control, así
    // que el saldo se podía terminar por ahí y el vendedor se enteraba con un
    // error del proveedor en inglés.

    it('leer 20 sitios sale más de lo que queda → frena', () => {
      const v = evaluarPresupuesto(
        budget(0.05),
        'contact_scraper',
        costoDeLeerSitios(20),
        0,
        'buscar estos contactos',
      );
      assert.equal(v.nivel, 'agotado');
    });

    it('el mensaje nombra lo que se está por hacer, no "esta búsqueda"', () => {
      // Decirle "búsqueda" a la lectura de sitios manda a revisar el lugar
      // equivocado: el vendedor iría a mirar los filtros.
      const v = evaluarPresupuesto(
        budget(0.05),
        'contact_scraper',
        costoDeLeerSitios(20),
        0,
        'buscar estos contactos',
      );
      assert.match(v.mensaje, /buscar estos contactos sale US\$ 0\.10/);
      assert.doesNotMatch(v.mensaje, /búsqueda/);
    });

    it('sin decir la acción sigue hablando de una búsqueda', () => {
      // El caso original no cambia: el parámetro es opcional a propósito.
      assert.match(evaluarPresupuesto(budget(0.1), 'linkedin', 0.7).mensaje, /esta búsqueda/);
    });

    it('con saldo de sobra no frena ni avisa', () => {
      const v = evaluarPresupuesto(budget(4.5), 'contact_scraper', costoDeLeerSitios(20));
      assert.equal(v.nivel, 'ok');
      assert.equal(v.mensaje, '');
    });
  });

  describe('costo de leer sitios', () => {
    it('cuesta por sitio, medido en la validación real', () => {
      assert.equal(costoDeLeerSitios(1), COSTO_POR_SITIO_USD);
      assert.equal(Number(costoDeLeerSitios(20).toFixed(4)), 0.1);
    });

    it('ninguno no cuesta nada, y un negativo tampoco', () => {
      // El tope de la corrida puede dejar la lista en cero: cobrar por eso
      // frenaría una corrida que no iba a gastar.
      assert.equal(costoDeLeerSitios(0), 0);
      assert.equal(costoDeLeerSitios(-3), 0);
    });

    it('solo se paga por lo que se puede leer', () => {
      // La pantalla filtra con la misma regla que el servidor: un `wa.me` no
      // es un sitio y mandarlo al scraper es tirar plata.
      const sitios = ['https://acme.com.ar', 'https://wa.me/5491133334444'];
      const leibles = sitios.filter(esSitioLeible);
      assert.equal(leibles.length, 1);
      assert.equal(costoDeLeerSitios(leibles.length), COSTO_POR_SITIO_USD);
    });
  });

  it('avisa cuando queda muy poco', () => {
    assert.match(describeBudget(budget(0.2)), /Queda muy poco/);
    assert.doesNotMatch(describeBudget(budget(3)), /Queda muy poco/);
  });

  it('aclara que lo de Google es una estimación nuestra', () => {
    assert.match(describeBudget(budget(3)), /estimado nuestro/);
  });
});
