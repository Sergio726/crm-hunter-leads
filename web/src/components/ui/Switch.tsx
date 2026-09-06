'use client';

import { cn } from '@/lib/cn';

/**
 * Una llave on/off.
 *
 * Reemplaza a las casillas de Configuración. La diferencia no es estética: una
 * casilla dice "esto está tildado" y una llave dice **"esto está encendido o
 * apagado"**, que es lo que de verdad significan estos ajustes. Además el área
 * de toque pasa de 16px a 44×24, que es lo mínimo usable en un teléfono.
 *
 * Es un `<button role="switch">` y no un `<input type="checkbox">` disfrazado:
 * los lectores de pantalla lo anuncian como "activado/desactivado" en vez de
 * "casilla marcada", y funciona con la barra espaciadora sin nada extra.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** Qué implica encenderlo. Va debajo, en gris. */
  description?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <div className={cn('flex items-start gap-3', disabled && 'opacity-60')}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'focus-visible:ring-offset-background focus-visible:outline-none',
          disabled && 'cursor-not-allowed',
          // El mint es la señal de "encendido". Apagado queda neutro: si los dos
          // estados tuvieran color, ninguno diría nada.
          checked ? 'bg-primary' : 'bg-muted border border-border',
        )}
      >
        {/* `left` explícito, no solo `translate`: sin un origen fijo la perilla se
            posicionaba desde su lugar estático y se dibujaba 18px FUERA del
            riel. Medido en el navegador — a ojo parecía un riel liso. */}
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full shadow-sm',
            'transition-transform duration-150',
            checked ? 'translate-x-5 bg-primary-foreground' : 'translate-x-0 bg-foreground/70',
          )}
        />
      </button>

      <div className="min-w-0">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cn(
            'text-left text-sm text-foreground',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          )}
        >
          {label}
        </button>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}
