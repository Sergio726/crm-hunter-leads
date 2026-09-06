import { useState } from 'react';

/**
 * Reinicia estado cuando cambia algo, **durante el render**.
 *
 * Reemplaza al patrón `useEffect(() => setAlgo(...), [dep])`, que en React 19
 * el linter marca como error: llamar a `setState` dentro de un efecto dispara
 * un render en cascada — React pinta una vez con el valor viejo, corre el
 * efecto y vuelve a pintar.
 *
 * Ajustar el estado durante el render es lo que recomienda React para esto
 * (https://react.dev/learn/you-might-not-need-an-effect): React descarta el
 * render en curso y vuelve a empezar con el valor nuevo, **antes** de pintar.
 * Sin parpadeo y sin el render de más.
 *
 * ⚠️ `clave` tiene que ser un valor comparable con `!==`. Para varias
 * dependencias, unirlas en un string. Ojo con los objetos: comparar por
 * identidad hace que el reinicio corra en cada render si el padre lo recrea —
 * que es exactamente el bug que borraba lo que se estaba tipeando en la ficha
 * de un cliente.
 *
 * @example
 * // Volver a la primera página cuando cambian los filtros
 * useResetWhen(`${search}|${estado}`, () => setVisibles(PAGE_SIZE));
 */
export function useResetWhen(clave: unknown, reiniciar: () => void): void {
  const [anterior, setAnterior] = useState(clave);
  if (anterior !== clave) {
    setAnterior(clave);
    reiniciar();
  }
}
