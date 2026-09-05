// Lo que se descubre del prospecto tiene que llegar a la ficha del cliente.
//
// El bug: `promote_prospects` copia email, teléfono y redes **solo en el momento
// de promover**. Después de eso, enriquecer no servía para nada — el dato se
// quedaba en `prospects` y la persona que trabaja al cliente no lo veía nunca.
// Con los 163 clientes ya promovidos y ninguno con email, el botón "Buscar email
// y WhatsApp" era pagarle a Apify por algo que no iba a aparecer en ningún lado.
//
// La regla delicada es la de abajo: **completar huecos, nunca pisar**. En la
// ficha puede haber un email que alguien anotó a mano después de una llamada, y
// un scraper no tiene por qué ganarle a eso.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { camposAPropagar, hayAlgoQuePropagar } from '../src/lib/prospect/propagar';

const vacia = { email: null, phone: null, instagram: null, linkedin: null };

describe('camposAPropagar', () => {
  it('completa el email que la ficha no tenía', () => {
    const patch = camposAPropagar(vacia, { email: 'hola@gimnasio.com' });
    assert.equal(patch.email, 'hola@gimnasio.com');
    assert.ok(hayAlgoQuePropagar(patch));
  });

  it('NO pisa lo que ya está cargado', () => {
    // El caso que importa: alguien anotó el mail después de hablar por teléfono,
    // y el scraper encontró el genérico de contacto del sitio.
    const patch = camposAPropagar(
      { ...vacia, email: 'juan@gimnasio.com' },
      { email: 'info@gimnasio.com' },
    );
    assert.equal(patch.email, undefined);
    assert.equal(hayAlgoQuePropagar(patch), false);
  });

  it('un campo con espacios no cuenta como cargado', () => {
    const patch = camposAPropagar({ ...vacia, email: '   ' }, { email: 'hola@gimnasio.com' });
    assert.equal(patch.email, 'hola@gimnasio.com');
  });

  it('el celular le gana a la línea fija', () => {
    // `phone` del cliente es el mismo campo que usa el botón de WhatsApp, así
    // que conviene el número que se detectó como celular.
    const patch = camposAPropagar(vacia, { whatsapp_phone: '351 555 0000', phone: '0351 4000000' });
    assert.equal(patch.phone, '351 555 0000');
  });

  it('si no hay celular, usa el teléfono que haya', () => {
    const patch = camposAPropagar(vacia, { phone: '0351 4000000' });
    assert.equal(patch.phone, '0351 4000000');
  });

  it('el usuario de Instagram entra sin arroba', () => {
    // La ficha guarda el usuario pelado: el enlace lo arma `contact-links.ts`.
    const patch = camposAPropagar(vacia, { instagram: '@gimnasio.nu' });
    assert.equal(patch.instagram, 'gimnasio.nu');
  });

  it('sin nada nuevo no escribe nada', () => {
    // Importa: sin esto se dispararía un update por cada prospecto de la
    // corrida, incluidos los que no aportan un solo dato.
    const completa = {
      email: 'a@b.c',
      phone: '351',
      instagram: 'gym',
      linkedin: 'in/juan',
    };
    const patch = camposAPropagar(completa, {
      email: 'otro@b.c',
      whatsapp_phone: '999',
      instagram: 'otro',
      linkedin: 'in/otro',
    });
    assert.deepEqual(patch, {});
    assert.equal(hayAlgoQuePropagar(patch), false);
  });

  it('completa solo los huecos, y deja el resto', () => {
    const patch = camposAPropagar(
      { ...vacia, email: 'ya@estaba.com' },
      { email: 'nuevo@x.com', instagram: 'gimnasio.nu', linkedin: 'in/duenio' },
    );
    assert.deepEqual(patch, { instagram: 'gimnasio.nu', linkedin: 'in/duenio' });
  });
});
