// Tests de las funciones puras del enriquecimiento de contacto y de Instagram.
//
// Runner nativo de Node (`node --test`), sin dependencias nuevas. Se corre con
// `--conditions=react-server` porque los módulos importan `server-only`, que
// fuera de esa condición lanza a propósito.
//
// Solo se prueba lo determinista. Lo que depende de Apify se verifica con una
// corrida real, que necesita el token cargado en `web/.env.local`.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyActivity, apifyErrorFor, limpiar } from '../src/lib/prospect/apify';
import { cerrarFrase, trimToLastSentence } from '../src/lib/prospect/agent';
import {
  domainOf,
  esSitioLeible,
  handleFromInstagram,
  normalizeWhatsapp,
  pickEmail,
  slugFromLinkedin,
} from '../src/lib/prospect/contacts';

describe('limpiar', () => {
  // Encontrado en una corrida REAL: el actor de Instagram devolvió el texto
  // "None" como rubro de @agogebox_. Sin esto se guardaba esa palabra y se
  // mostraba tal cual en la tabla.
  it('trata el texto "None" como vacío', () => {
    assert.equal(limpiar('None'), null);
    assert.equal(limpiar('null'), null);
    assert.equal(limpiar('undefined'), null);
  });
  it('no toca un valor de verdad', () => {
    assert.equal(limpiar('Real Estate Company'), 'Real Estate Company');
  });
  it('recorta y descarta el vacío', () => {
    assert.equal(limpiar('   '), null);
    assert.equal(limpiar(undefined), null);
  });
});

describe('esSitioLeible', () => {
  // Salió de mirar los datos reales: el campo "sitio web" de los prospectos de
  // esta base suele traer un wa.me, porque son negocios SIN web propia.
  it('rechaza links de WhatsApp y de redes: pagarlos es tirar plata', () => {
    assert.equal(esSitioLeible('https://wa.me/kavodgym'), false);
    assert.equal(esSitioLeible('https://api.whatsapp.com/send?phone=549351'), false);
    assert.equal(esSitioLeible('https://www.instagram.com/acme'), false);
    assert.equal(esSitioLeible('https://facebook.com/acme'), false);
  });
  it('acepta un sitio de verdad, aunque sea de una sola pantalla', () => {
    assert.equal(esSitioLeible('https://betrainerstudio.carrd.co/'), true);
    assert.equal(esSitioLeible('https://sites.google.com/view/gimnasio-ener-gym/'), true);
    assert.equal(esSitioLeible('https://www.acme.com.ar'), true);
  });
  it('una URL rota no es leíble', () => {
    assert.equal(esSitioLeible('no soy una url'), false);
  });
});

const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();

describe('classifyActivity', () => {
  it('publica esta semana → activo', () => {
    assert.equal(classifyActivity(hace(3)), 'activo');
  });
  it('justo en el borde de 60 días → activo', () => {
    assert.equal(classifyActivity(hace(59)), 'activo');
  });
  it('entre 60 y 180 días → tibio', () => {
    assert.equal(classifyActivity(hace(120)), 'tibio');
  });
  it('más de 180 días → dormido', () => {
    assert.equal(classifyActivity(hace(400)), 'dormido');
  });
  it('sin fecha → dormido, no un hueco', () => {
    assert.equal(classifyActivity(null), 'dormido');
  });
  it('fecha basura no rompe', () => {
    assert.equal(classifyActivity('no soy una fecha'), 'dormido');
  });
});

describe('apifyErrorFor', () => {
  it('401 y 403 son problema del token', () => {
    assert.equal(apifyErrorFor(401, '').reason, 'token');
    assert.equal(apifyErrorFor(403, '').reason, 'token');
  });
  it('402 es falta de crédito, no un token inválido', () => {
    // Antes se decidía buscando "token" en el mensaje y quedarse sin saldo se
    // reportaba como si la key estuviera mal.
    assert.equal(apifyErrorFor(402, '').reason, 'credit');
  });
  it('408 avisa que el trabajo se sigue pagando', () => {
    const e = apifyErrorFor(408, '');
    assert.equal(e.reason, 'timeout');
    assert.match(e.message, /se cobra igual|paga dos veces/);
  });
  it('cualquier otro es del proveedor', () => {
    assert.equal(apifyErrorFor(500, 'boom').reason, 'upstream');
  });
});

describe('domainOf', () => {
  it('saca el www y el path', () => {
    assert.equal(domainOf('https://www.acme.com.ar/contacto'), 'acme.com.ar');
  });
  it('acepta una URL sin protocolo', () => {
    assert.equal(domainOf('acme.com.ar'), 'acme.com.ar');
  });
  it('devuelve null con basura', () => {
    assert.equal(domainOf('no es una url ni ahí'), null);
  });
});

describe('pickEmail', () => {
  const sitio = 'https://www.inmobiliariasur.com.ar';

  it('prefiere el email de contacto sobre uno personal', () => {
    assert.equal(
      pickEmail(['juan.perez@gmail.com', 'info@inmobiliariasur.com.ar'], sitio),
      'info@inmobiliariasur.com.ar',
    );
  });
  it('si no hay uno de contacto, prefiere el del propio dominio', () => {
    assert.equal(
      pickEmail(['otro@gmail.com', 'martin@inmobiliariasur.com.ar'], sitio),
      'martin@inmobiliariasur.com.ar',
    );
  });
  it('acepta un Gmail si es lo único que hay', () => {
    // Habitual en comercios chicos: descartarlo sería perder el único contacto.
    assert.equal(pickEmail(['contacto.sur@gmail.com'], sitio), 'contacto.sur@gmail.com');
  });
  it('descarta emails de herramientas y plantillas', () => {
    assert.equal(pickEmail(['algo@sentry.io', 'test@example.com'], sitio), null);
  });
  it('descarta un archivo mal parseado como email', () => {
    assert.equal(pickEmail(['logo@2x.png'], sitio), null);
  });
  it('sin emails devuelve null', () => {
    assert.equal(pickEmail([], sitio), null);
    assert.equal(pickEmail(undefined, sitio), null);
  });
});

describe('normalizeWhatsapp', () => {
  it('extrae el número de un wa.me', () => {
    assert.equal(normalizeWhatsapp(['https://wa.me/5493514445566']), '+5493514445566');
  });
  it('extrae el número de api.whatsapp.com', () => {
    assert.equal(
      normalizeWhatsapp(['https://api.whatsapp.com/send?phone=5491133334444&text=hola']),
      '+5491133334444',
    );
  });
  it('ignora un link sin número usable', () => {
    assert.equal(normalizeWhatsapp(['https://wa.me/']), null);
  });
  it('sin links devuelve null', () => {
    assert.equal(normalizeWhatsapp(undefined), null);
  });
});

describe('handleFromInstagram', () => {
  it('saca el handle de la URL', () => {
    assert.equal(handleFromInstagram(['https://www.instagram.com/acmeprop/']), 'acmeprop');
  });
  it('ignora los links que no son perfiles', () => {
    assert.equal(handleFromInstagram(['https://instagram.com/p/CxYz123/']), null);
  });
  it('se queda con el primer perfil válido', () => {
    assert.equal(
      handleFromInstagram(['https://instagram.com/reel/abc', 'https://instagram.com/real_perfil']),
      'real_perfil',
    );
  });
});

describe('trimToLastSentence', () => {
  // El modelo se queda sin presupuesto (los que razonan se comen una parte) y la
  // última frase llega partida. Mostrar media palabra parece un error nuestro.
  it('corta en la última frase completa', () => {
    assert.equal(
      trimToLastSentence('Te armo la propuesta. Fuente Google Maps, porque te importa contactarl'),
      'Te armo la propuesta.',
    );
  });
  it('respeta signos de pregunta y admiración', () => {
    assert.equal(
      trimToLastSentence('¿Buscamos por zona o por rubro? Yo diría que por zo'),
      '¿Buscamos por zona o por rubro?',
    );
  });
  it('si no hay ninguna frase cerrada, avisa con puntos suspensivos', () => {
    assert.equal(trimToLastSentence('Estaba pensando en algo'), 'Estaba pensando en algo…');
  });
  it('un texto completo no se toca', () => {
    const ok = 'Encontré 12 inmobiliarias sin web en Nueva Córdoba.';
    assert.equal(trimToLastSentence(ok), ok);
  });
});

describe('slugFromLinkedin', () => {
  it('conserva el tipo de perfil, que es lo que permite rearmar la URL', () => {
    // `company/acme` e `in/acme` son perfiles distintos: guardar solo el slug
    // hacía imposible saber cuál era.
    assert.equal(slugFromLinkedin(['https://www.linkedin.com/company/acme/']), 'company/acme');
    assert.equal(slugFromLinkedin(['https://www.linkedin.com/in/acme/']), 'in/acme');
  });
  it('acepta el subdominio de país y corta la basura del final', () => {
    assert.equal(
      slugFromLinkedin(['https://ar.linkedin.com/in/juan-perez-123/about?trk=algo']),
      'in/juan-perez-123',
    );
  });
  it('ignora un link de LinkedIn que no es un perfil', () => {
    assert.equal(slugFromLinkedin(['https://www.linkedin.com/feed/']), null);
  });
});

describe('cerrarFrase', () => {
  // Los dos primeros son textos REALES de una corrida contra el modelo
  // (`tests/turbo-conversaciones.ts`, 2026-08-18). El modelo escribe un párrafo
  // y lo corta de golpe al decidir llamar a la herramienta: el motivo de corte
  // es `tool_calls`, no `length`, así que el recorte por presupuesto no lo
  // agarraba y el vendedor veía media palabra justo al presentar el plan.
  it('corta hasta la última frase completa cuando quedó media palabra', () => {
    const real = 'Google Maps no reconoce "dueño" en una ficha.\n\nPropuesta para que la rev';
    assert.equal(cerrarFrase(real, true), 'Google Maps no reconoce "dueño" en una ficha.');
  });

  it('sin ninguna frase cerrada y con propuesta, prefiere el texto de respaldo', () => {
    // "Los gimnasios de Rosario, por la cercanía geográfica, van por Google"
    // no tiene un solo punto: mostrarlo cortado es peor que dejar que entre el
    // mensaje de respaldo, que al menos dice que el plan está armado.
    const real = 'Los gimnasios de Rosario, por la cercanía geográfica, van por Google';
    assert.equal(cerrarFrase(real, true), '');
  });

  it('sin propuesta conserva el fragmento, que es todo lo que hay', () => {
    assert.equal(cerrarFrase('Contame un poco más de tu', false), 'Contame un poco más de tu…');
  });

  it('no toca un mensaje que ya cierra bien', () => {
    assert.equal(cerrarFrase('Listo, armé el plan.', true), 'Listo, armé el plan.');
    assert.equal(cerrarFrase('¿De qué zona?', false), '¿De qué zona?');
  });

  it('los dos puntos cuentan como cierre', () => {
    // Es como Turbo presenta el plan. Recortarlo ahí rompería un mensaje sano.
    assert.equal(cerrarFrase('Te propongo esto:', true), 'Te propongo esto:');
  });
});
