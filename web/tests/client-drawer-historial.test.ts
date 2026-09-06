// El seguimiento se vuelve a pedir cada vez que se agrega algo.
//
// El usuario lo reportó así: "cuando agrego un comentario rápido, recién se ve
// cuando cierro la ventana y vuelvo a abrir".
//
// La causa: el historial se cargaba UNA sola vez, en un efecto con
// `[client.id]` en las dependencias. Al guardar se llamaba a `router.refresh()`,
// que refresca lo que arma el servidor, pero esa lista vive en el estado de la
// ventana y nadie le avisaba. Cerrar y reabrir la desmontaba y la volvía a
// cargar; de ahí que "apareciera" recién entonces.
//
// Acá se prueba la forma del arreglo sin montar React: que guardar dispare una
// recarga, y que el orden sea el correcto —primero se escribe, después se
// relee— porque al revés se releería antes de que exista la fila nueva.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/** Guardar algo en el seguimiento: escribir y volver a leer. */
async function guardar(
  insertar: () => Promise<{ error: string | null }>,
  recargar: () => Promise<void>,
  pasos: string[],
): Promise<boolean> {
  const { error } = await insertar();
  pasos.push('insert');
  if (error) return false;
  await recargar();
  pasos.push('recarga');
  return true;
}

describe('guardar en el seguimiento', () => {
  it('recarga el historial después de escribir', async () => {
    const pasos: string[] = [];
    const ok = await guardar(
      async () => ({ error: null }),
      async () => {},
      pasos,
    );
    assert.equal(ok, true);
    // El orden importa: releer antes de escribir traería la lista vieja, que es
    // justo el síntoma que se está arreglando.
    assert.deepEqual(pasos, ['insert', 'recarga']);
  });

  it('si el guardado falla NO recarga', async () => {
    // Recargar tras un error mostraría la lista de siempre y daría la impresión
    // de que se guardó algo que no se guardó.
    const pasos: string[] = [];
    const ok = await guardar(
      async () => ({ error: 'no se pudo' }),
      async () => {},
      pasos,
    );
    assert.equal(ok, false);
    assert.deepEqual(pasos, ['insert']);
  });
});
