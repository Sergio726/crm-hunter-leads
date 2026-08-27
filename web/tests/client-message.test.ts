// Tests del mensaje para un cliente (MSG-1).
//
// Lo que se fija acá es la decisión que nadie ve y que cambia todo: si va el
// rompehielo o el de seguimiento, y qué historial se le cuenta al modelo para
// que no repita lo que ya se dijo.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  comoProspecto,
  diasDesdeUltimoContacto,
  esPrimerContacto,
  lineasDeContexto,
  lineasDeHistorial,
  rubroDelLead,
  type ContextoCliente,
} from '../src/lib/client-message';
import { promptDeSeguimientoParaTest } from '../src/lib/client-message';
import { systemPromptParaTest } from '../src/lib/prospect/approach';

const HOY = new Date('2026-08-23T15:00:00Z');

function ctx(over: Partial<ContextoCliente> = {}): ContextoCliente {
  return {
    client: {
      id: 'c1',
      full_name: 'Gimnasio Olimpo',
      company: 'Olimpo Fitness',
      email: null,
      phone: '+5493514442211',
      status: 'pending',
      next_follow_up: null,
      tags: ['gimnasios'],
      notes: null,
      created_at: '2026-08-01T10:00:00Z',
      ...over.client,
    },
    prospect: over.prospect === undefined ? null : over.prospect,
    history: {
      total: 0,
      last_contact_at: null,
      last_channel: null,
      last_outcome: null,
      recent: [],
      ...over.history,
    },
  };
}

describe('esPrimerContacto', () => {
  it('sin contactos previos va el rompehielo', () => {
    assert.equal(esPrimerContacto(ctx()), true);
  });

  it('con un contacto previo va el de seguimiento', () => {
    const c = ctx({
      history: {
        total: 1,
        last_contact_at: '2026-08-15T12:00:00Z',
        last_channel: 'whatsapp',
        last_outcome: 'no_answer',
        recent: [],
      },
    });
    assert.equal(esPrimerContacto(c), false);
  });

  it('un comentario suelto NO cuenta como haberlo contactado', () => {
    // La ficha permite dejar notas ("me lo pasó Juan") sin haber escrito nunca.
    // Si eso contara, el rompehielo no se ofrecería jamás para ese cliente.
    const c = ctx({
      history: {
        total: 3,
        last_contact_at: null,
        last_channel: null,
        last_outcome: null,
        recent: [
          { contacted_at: '2026-08-20T10:00:00Z', channel: 'note', outcome: null, notes: 'me lo pasó Juan' },
        ],
      },
    });
    assert.equal(esPrimerContacto(c), true);
  });
});

describe('diasDesdeUltimoContacto', () => {
  it('cuenta los días completos', () => {
    const c = ctx({
      history: {
        total: 1,
        last_contact_at: '2026-08-15T12:00:00Z',
        last_channel: 'whatsapp',
        last_outcome: 'no_answer',
        recent: [],
      },
    });
    assert.equal(diasDesdeUltimoContacto(c, HOY), 8);
  });

  it('sin contacto previo devuelve null, no cero', () => {
    // Cero significaría "lo contacté hoy", que es lo contrario de la verdad.
    assert.equal(diasDesdeUltimoContacto(ctx(), HOY), null);
  });

  it('nunca devuelve un negativo', () => {
    const c = ctx({
      history: {
        total: 1,
        last_contact_at: '2026-08-24T12:00:00Z',
        last_channel: 'call',
        last_outcome: 'answered',
        recent: [],
      },
    });
    assert.equal(diasDesdeUltimoContacto(c, HOY), 0);
  });
});

describe('lineasDeHistorial', () => {
  const c = ctx({
    history: {
      total: 2,
      last_contact_at: '2026-08-15T12:00:00Z',
      last_channel: 'whatsapp',
      last_outcome: 'no_answer',
      recent: [
        {
          contacted_at: '2026-08-15T12:00:00Z',
          channel: 'whatsapp',
          outcome: 'no_answer',
          notes: 'Le ofrecí la web',
        },
        { contacted_at: '2026-08-02T09:00:00Z', channel: 'call', outcome: 'answered', notes: null },
      ],
    },
  });

  it('dice cuánto hace del último contacto', () => {
    assert.match(lineasDeHistorial(c, HOY), /hace 8 días/);
  });

  it('traduce canal y resultado al castellano', () => {
    const t = lineasDeHistorial(c, HOY);
    assert.match(t, /por WhatsApp — no atendió/);
    assert.match(t, /por llamada — atendió/);
  });

  it('incluye lo que se dijo: es lo que evita repetir el mismo ángulo', () => {
    assert.match(lineasDeHistorial(c, HOY), /Le ofrecí la web/);
  });
});

describe('lineasDeContexto', () => {
  it('sin prospecto de origen igual arma algo con lo del cliente', () => {
    // Los clientes cargados a mano o importados no vienen de una búsqueda.
    const t = lineasDeContexto(ctx());
    assert.match(t, /Gimnasio Olimpo/);
    assert.match(t, /Olimpo Fitness/);
  });

  it('aprovecha lo que trajo la prospección', () => {
    const c = ctx({
      prospect: {
        source: 'google_places',
        kind: 'business',
        niche: 'gimnasios',
        area: 'Córdoba',
        role_title: null,
        company_name: null,
        website: null,
        has_own_website: false,
        instagram: 'olimpo',
        linkedin: null,
        ig_bio: 'Entrená con nosotros',
        ig_category: null,
        audience_size: 1200,
        audience_activity: 'dormido',
        rating: 4.7,
        reviews_count: 210,
        score: 80,
      },
    });
    const t = lineasDeContexto(c);
    assert.match(t, /Rubro: gimnasios/);
    assert.match(t, /Zona: Córdoba/);
    assert.match(t, /Seguidores: 1200/);
    assert.match(t, /hace mucho que no publica/);
    assert.match(t, /No tiene sitio web propio/);
    assert.match(t, /4\.7 \(210 reseñas\)/);
  });

  it('las notas del vendedor viajan: es lo que ningún dato automático sabe', () => {
    const c = ctx({ client: { ...ctx().client, notes: 'Preguntó por el plan anual' } });
    assert.match(lineasDeContexto(c), /Preguntó por el plan anual/);
  });
});

describe('comoProspecto', () => {
  it('sin prospecto de origen lo trata como negocio', () => {
    const i = comoProspecto(ctx(), 'whatsapp', 'páginas web');
    assert.equal(i.kind, 'business');
    assert.equal(i.name, 'Gimnasio Olimpo');
    assert.equal(i.offer, 'páginas web');
  });

  it('la empresa del cliente le gana a la del prospecto', () => {
    // La ficha es lo que el vendedor mantiene al día; el prospecto es una foto
    // del día de la búsqueda.
    const c = ctx({
      prospect: {
        source: 'linkedin',
        kind: 'person',
        niche: null,
        area: null,
        role_title: 'Dueño',
        company_name: 'Nombre viejo SA',
        website: null,
        has_own_website: null,
        instagram: null,
        linkedin: 'in/juan',
        ig_bio: null,
        ig_category: null,
        audience_size: null,
        audience_activity: null,
        rating: null,
        reviews_count: null,
        score: null,
      },
    });
    const i = comoProspecto(c, 'linkedin', 'consultoría');
    assert.equal(i.companyName, 'Olimpo Fitness');
    assert.equal(i.kind, 'person');
    assert.equal(i.roleTitle, 'Dueño');
  });
});

describe('el rubro del lead — el bug del mensaje para otro rubro', () => {
  // El usuario reportó un mensaje "para inmobiliarias" en un cliente que era
  // dueño de un gimnasio. Una de las causas: cuando el cliente no venía de una
  // búsqueda, el rubro no llegaba al modelo y él lo deducía de lo que vende el
  // vendedor — o sea, de la última oferta que había quedado pegada.

  it('sin prospecto de origen, las etiquetas de la ficha igual viajan', () => {
    const c = ctx({ client: { ...ctx().client, tags: ['fitness', 'Córdoba'] } });
    assert.match(lineasDeContexto(c), /Etiquetas de la ficha: fitness, Córdoba/);
  });

  it('con rubro de la búsqueda manda ese, y no duplica con las etiquetas', () => {
    const c = ctx({
      client: { ...ctx().client, tags: ['fitness'] },
      prospect: {
        source: 'google_places',
        kind: 'business',
        niche: 'fitness',
        area: null,
        role_title: null,
        company_name: null,
        website: null,
        has_own_website: null,
        instagram: null,
        linkedin: null,
        ig_bio: null,
        ig_category: null,
        audience_size: null,
        audience_activity: null,
        rating: null,
        reviews_count: null,
        score: null,
      },
    });
    const t = lineasDeContexto(c);
    assert.match(t, /Rubro: fitness/);
    assert.doesNotMatch(t, /Etiquetas de la ficha/);
  });

  it('rubroDelLead prefiere el de la búsqueda', () => {
    const c = ctx({
      client: { ...ctx().client, tags: ['inmobiliarias'] },
      prospect: {
        source: 'google_places',
        kind: 'business',
        niche: 'fitness',
        area: null,
        role_title: null,
        company_name: null,
        website: null,
        has_own_website: null,
        instagram: null,
        linkedin: null,
        ig_bio: null,
        ig_category: null,
        audience_size: null,
        audience_activity: null,
        rating: null,
        reviews_count: null,
        score: null,
      },
    });
    assert.equal(rubroDelLead(c), 'fitness');
  });

  it('sin búsqueda, rubroDelLead lo saca de las etiquetas', () => {
    const c = ctx({ client: { ...ctx().client, tags: ['referido', 'fitness'] } });
    assert.equal(rubroDelLead(c), 'fitness');
  });

  it('un cliente sin nada reconocible no tiene rubro, y eso está bien', () => {
    // Es el caso en que el modelo NO debe inventarlo: para eso está la regla
    // del prompt de abajo.
    const c = ctx({ client: { ...ctx().client, tags: ['cliente-viejo'] } });
    assert.equal(rubroDelLead(c), null);
  });
});

describe('la regla que impide deducir el rubro de la oferta', () => {
  // Es una instrucción, así que lo único que se puede fijar es que esté. Sin
  // ella el modelo llenaba el hueco con lo único específico que tenía: la
  // oferta del vendedor.

  it('está en el prompt del primer mensaje', () => {
    const p = systemPromptParaTest();
    assert.match(p, /rubro del prospecto sale SOLO de sus datos/i);
    assert.match(p, /no lo deduzcas de la oferta/i);
  });

  it('está en el prompt del seguimiento', () => {
    const p = promptDeSeguimientoParaTest();
    assert.match(p, /rubro del destinatario sale SOLO de sus datos/i);
    assert.match(p, /no lo deduzcas de la oferta/i);
  });
});

describe('los clientes que ya existían — lo reportó el usuario probando', () => {
  // "No puede leer los datos de los clientes actuales, los que ya existían
  // antes de esto." Esos clientes no tienen prospecto vinculado, pero sí
  // guardan lo que sabía la búsqueda como texto plano en las notas.

  const VIEJO = [
    'Prospecto detectado por búsqueda.',
    'Score: 72',
    'Cargo: Dueño',
    'Instagram: @olimpo',
    'Ficha: https://maps.google.com/?cid=123',
    'Sitio: https://olimpo.com.ar',
    'Llamar después de las 18.',
  ].join('\n');

  const c = ctx({ client: { ...ctx().client, notes: VIEJO } });

  it('el cargo llega aunque no haya prospecto vinculado', () => {
    assert.match(lineasDeContexto(c), /Cargo: Dueño/);
  });

  it('el Instagram y el sitio también', () => {
    const t = lineasDeContexto(c);
    assert.match(t, /Instagram: @olimpo/);
    assert.match(t, /Sitio web: https:\/\/olimpo\.com\.ar/);
  });

  it('la nota de la persona viaja sola, sin el bloque técnico pegado', () => {
    const t = lineasDeContexto(c);
    assert.match(t, /Notas del vendedor: Llamar después de las 18\./);
    // Lo que se repartió arriba no se manda otra vez dentro de las notas.
    assert.doesNotMatch(t, /Notas del vendedor:[\s\S]*Prospecto detectado/);
    assert.doesNotMatch(t, /Notas del vendedor:[\s\S]*Score: 72/);
  });

  it('el prospecto vinculado le sigue ganando al texto de las notas', () => {
    // La ficha del prospecto es el dato de primera mano; el bloque es una copia
    // vieja del día de la promoción.
    const conProspecto = ctx({
      client: { ...ctx().client, notes: VIEJO },
      prospect: {
        source: 'google_places',
        kind: 'business',
        niche: 'fitness',
        area: null,
        role_title: 'Gerente',
        company_name: null,
        website: null,
        has_own_website: null,
        instagram: null,
        linkedin: null,
        ig_bio: null,
        ig_category: null,
        audience_size: null,
        audience_activity: null,
        rating: null,
        reviews_count: null,
        score: null,
      },
    });
    assert.match(lineasDeContexto(conProspecto), /Cargo: Gerente/);
  });
});
