// Por cuáles canales se le puede escribir de verdad a un lead.
//
// Existe por un hallazgo que ordenó el diseño: medido sobre producción, de los
// 163 clientes **ninguno** tenía email ni LinkedIn, y 135 sí tenían Instagram
// —pero guardado dentro del texto de las notas, así que la pantalla no lo veía—.
// La ficha ofrecía los cuatro canales por igual: dos que no servían para nadie y
// uno que servía para 135 y no se notaba.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canalesDisponibles, primerCanalDisponible } from '../src/lib/canales';
import { contactoDeCliente } from '../src/lib/contact-links';

const vacio = { phone: null, email: null, notes: null };

describe('canalesDisponibles', () => {
  it('el teléfono habilita WhatsApp', () => {
    const d = canalesDisponibles({ phone: '+54 351 555 0000' });
    assert.equal(d.whatsapp, true);
    assert.equal(d.email, false);
  });

  it('lo que está en blanco no cuenta como dato', () => {
    // Una columna con espacios es el caso que hace que un botón se vea
    // encendido y no lleve a ninguna parte.
    const d = canalesDisponibles({ phone: '   ', email: '', instagram: null });
    assert.deepEqual(d, { whatsapp: false, instagram: false, email: false, linkedin: false });
  });

  it('sin ningún dato no hay primer canal', () => {
    assert.equal(primerCanalDisponible(canalesDisponibles({})), null);
  });

  it('el primero disponible respeta el orden de uso real', () => {
    // WhatsApp primero; si no hay teléfono, Instagram antes que email.
    assert.equal(primerCanalDisponible(canalesDisponibles({ phone: '123', email: 'a@b.c' })), 'whatsapp');
    assert.equal(primerCanalDisponible(canalesDisponibles({ instagram: 'gym', email: 'a@b.c' })), 'instagram');
  });
});

describe('contactoDeCliente', () => {
  it('encuentra el Instagram que está solo dentro de las notas', () => {
    // Es el caso de los 135: el dato estaba pago y guardado, y la pantalla lo
    // ignoraba porque no era una columna.
    const c = contactoDeCliente({
      ...vacio,
      notes: 'Prospecto detectado por búsqueda.\nInstagram: @gimnasio.nu\nFicha: https://maps.google.com/x',
    });
    assert.equal(c.instagram, 'gimnasio.nu');
    assert.equal(canalesDisponibles(c).instagram, true);
  });

  it('la columna le gana a las notas', () => {
    // Si alguien corrigió el usuario a mano, vale el corregido y no el que dejó
    // la búsqueda hace meses.
    const c = contactoDeCliente({
      ...vacio,
      instagram: 'el.corregido',
      notes: 'Instagram: @el.viejo',
    });
    assert.equal(c.instagram, 'el.corregido');
  });

  it('el contacto secundario también sirve para escribir', () => {
    const c = contactoDeCliente({ phone: null, email: null, phone_2: '351 555', email_2: 'b@b.c', notes: null });
    assert.equal(c.phone, '351 555');
    assert.equal(canalesDisponibles(c).email, true);
  });

  it('un cliente sin nada no habilita ningún canal', () => {
    const d = canalesDisponibles(contactoDeCliente(vacio));
    assert.deepEqual(d, { whatsapp: false, instagram: false, email: false, linkedin: false });
    assert.equal(primerCanalDisponible(d), null);
  });
});
