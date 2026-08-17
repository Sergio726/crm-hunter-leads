'use client';

import { useEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { FIELD_BASE } from './Field';

/**
 * Campo de texto que CRECE con lo que se escribe.
 *
 * Existe por un problema concreto y reportado del chat de Turbo: usaba un
 * `<input>` de una sola línea con alto fijo, así que cuanto más largo el
 * mensaje, menos veía el usuario — el texto se iba de costado y recién se leía
 * entero después de enviarlo.
 *
 * Crece hasta `maxRows` y después scrollea, para que el campo de escritura no
 * termine comiéndose el historial del chat.
 *
 * Archivo propio y no dentro de `Field.tsx` porque usa hooks: si viviera ahí,
 * cualquier server component que importe `Input` arrastraría el módulo entero
 * al cliente y Next se queja.
 */
export function Textarea({
  className,
  maxRows = 6,
  value,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // El alto se recalcula en cada cambio. El reset a `auto` es imprescindible:
  // sin él `scrollHeight` nunca baja y el campo no se puede achicar al borrar.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const linea = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const bordes = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight, linea * maxRows) + bordes}px`;
  }, [value, maxRows]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      className={cn(
        FIELD_BASE,
        // `h-auto` pisa el alto fijo de FIELD_BASE; `min-h-11` conserva el
        // objetivo táctil de 44px en móvil que ese estilo ya cuidaba.
        'h-auto min-h-11 resize-none py-2 leading-normal sm:min-h-9',
        className,
      )}
      {...props}
    />
  );
}
