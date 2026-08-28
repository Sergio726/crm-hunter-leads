// Tests del link de agenda y de las reglas nuevas del mensaje.
//
// Turbo pasó a escribir mensajes que **empujan a una llamada** en vez de pedir
// una respuesta corta (decisión del usuario, 2026-08-27, a partir de la
// propuesta de Nexum). Eso trae una regla que no se puede romper: **sin link de
// agenda, no se inventan horarios** — el modelo no sabe la disponibilidad de
// nadie, y un horario inventado quema la reunión antes de tenerla.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeAgendaUrl } from '../src/lib/agenda';
import { systemPromptParaTest } from '../src/lib/prospect/approach';
import { promptDeSeguimientoParaTest } from '../src/lib/client-message';

describe('normalizeAgendaUrl', () => {
  it('acepta un link normal', () => {
    assert.equal(normalizeAgendaUrl('https://cal.com/juan/15min'), 'https://cal.com/juan/15min');
  });

  it('le agrega el protocolo al que lo pega sin él', () => {
    assert.match(normalizeAgendaUrl('calendly.com/juan') ?? '', /^https:\/\/calendly\.com\/juan/);
  });

  it('descarta lo que no es un link, en vez de ofrecer algo roto', () => {
    // Es preferible que el mensaje no proponga nada a que proponga un link que
    // no abre.
    assert.equal(normalizeAgendaUrl('mi agenda'), null);
    assert.equal(normalizeAgendaUrl('agendame'), null);
    assert.equal(normalizeAgendaUrl(''), null);
    assert.equal(normalizeAgendaUrl('   '), null);
    assert.equal(normalizeAgendaUrl(null), null);
    assert.equal(normalizeAgendaUrl(42), null);
  });

  it('un host sin punto no es un dominio', () => {
    assert.equal(normalizeAgendaUrl('http://localhost'), null);
  });
});

describe('las reglas nuevas del mensaje', () => {
  it('el primer mensaje empuja a una llamada', () => {
    const p = systemPromptParaTest();
    assert.match(p, /empuja a una llamada corta/i);
  });

  it('y no inventa horarios si no hay link', () => {
    const p = systemPromptParaTest();
    assert.match(p, /sin inventar horarios/i);
  });

  it('nunca inventa casos ni números', () => {
    // La propuesta de Nexum insiste: nada de casos de éxito inventados.
    assert.match(systemPromptParaTest(), /Nunca inventes casos/i);
  });

  it('el seguimiento se corta después de dos intentos', () => {
    // Perseguir a alguien que no contesta quema el contacto y la cuenta.
    const p = promptDeSeguimientoParaTest();
    assert.match(p, /DOS veces sin respuesta/);
    assert.match(p, /no vuelve a insistir/i);
  });

  it('el seguimiento escala en vez de inventar', () => {
    const p = promptDeSeguimientoParaTest();
    assert.match(p, /no lo inventes/i);
    assert.match(p, /lo consultás/i);
  });
});
