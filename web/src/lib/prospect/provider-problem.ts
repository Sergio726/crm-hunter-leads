// De qué se trata cuando el proveedor no pudo ejecutar la búsqueda.
//
// Módulo PURO, sin `server-only` y sin React: lo usa el cartel del navegador y
// se puede probar sin levantar nada. Vivía dentro del componente y eso hacía
// que el test tuviera que importar `lucide-react`, que no arranca fuera del
// navegador.
//
// ⚠️ LOS DOS CASOS NO SE ARREGLAN IGUAL, y esa es toda la razón de que exista
// esta clasificación:
//
//   · Sin crédito      → bajar la cantidad de resultados SÍ ayuda: cada
//                        resultado se paga y una búsqueda más chica entra.
//   · Tope de corridas → bajar la cantidad NO sirve para NADA. El plan gratis
//                        limita cuántas VECES se corre el actor, no cuántos
//                        resultados trae. Ofrecer "reducí la cantidad" acá sería
//                        mandar al vendedor a probar algo que no puede funcionar
//                        — exactamente el error que este trabajo vino a corregir.

export type ProviderProblem = 'sin-credito' | 'tope-corridas' | 'desconocido';

/**
 * Clasifica lo que dijo el proveedor.
 *
 * Acepta tanto el texto ya traducido que devuelve el servidor como el mensaje
 * crudo del actor ("free user run limit reached"), por si llega sin pasar por
 * `providerDidNotRun`.
 */
export function problemFrom(message: string | null | undefined): ProviderProblem {
  const m = (message ?? '').toLowerCase();
  if (m.includes('tope de corridas') || m.includes('run limit')) return 'tope-corridas';
  if (m.includes('crédito') || m.includes('credito') || m.includes('credit')) return 'sin-credito';
  return 'desconocido';
}
