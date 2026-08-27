'use client';

import { CANALES, type Channel } from '@/lib/canales';
import { IconoDeCanal } from './IconoDeCanal';

/**
 * Por dónde se le va a escribir.
 *
 * Era un desplegable al lado del campo de la oferta. Ahora va **debajo** y con
 * el logo de cada aplicación: son cuatro opciones fijas y reconocibles, y un
 * desplegable las esconde detrás de un clic para no ahorrar nada.
 *
 * Los logos van en el color del texto y no en el de cada marca: cuatro colores
 * de marca en una fila de botones compiten entre sí y con el verde del panel.
 * El seleccionado se distingue por el fondo, que es lo que el manual reserva
 * para el foco.
 */
export function SelectorDeCanal({
  value,
  onChange,
  disabled = false,
}: {
  value: Channel;
  onChange: (c: Channel) => void;
  disabled?: boolean;
}) {
  // 2x2 fijo: en una fila los cuatro no entran en el ancho del panel y
  // "LinkedIn" caía solo a una segunda línea.
  return (
    <div className="grid grid-cols-2 gap-2">
      {CANALES.map((c) => {
        const activo = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            disabled={disabled}
            aria-pressed={activo}
            title={c.ayuda}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-50 sm:h-9 ${
              activo
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <IconoDeCanal canal={c.id} className="h-4 w-4 shrink-0" />
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * El aviso de que todavía hay que copiar y pegar.
 *
 * Se dice una vez, abajo y en chico: el vendedor ya sabe que copia, pero el
 * plan es que la app mande sola y conviene que se note que está en camino.
 * Cuando algún canal tenga `envioDirecto`, esta nota se reemplaza por el botón
 * de enviar.
 */
export function AvisoDeEnvio() {
  return (
    <p className="text-xs text-muted-foreground">
      Por ahora el mensaje se copia y lo mandás vos desde la aplicación. Estamos
      trabajando para poder enviarlo desde acá — el primero va a ser LinkedIn.
    </p>
  );
}
