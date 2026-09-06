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
 * **Los cuatro se muestran siempre**, tenga dato el lead o no: esconder los que
 * no se pueden usar dejaría al vendedor sin saber qué le falta. El que tiene
 * dato se enciende con el color de su marca; el que no, queda apagado y no se
 * puede elegir, con el motivo escrito. Ver D71.
 *
 * El color de marca vive en el logo y nunca en el fondo: el fondo lleno es el
 * foco, y eso el manual lo reserva para el verde de la marca. Por eso el logo
 * del elegido vuelve a `currentColor` — el verde de WhatsApp sobre el verde de
 * marca sería ilegible.
 */
export function SelectorDeCanal({
  value,
  onChange,
  disabled = false,
  disponibles,
}: {
  value: Channel;
  onChange: (c: Channel) => void;
  disabled?: boolean;
  /**
   * Cuáles tienen dato. Si no se pasa, van los cuatro habilitados: es el
   * comportamiento viejo, para quien todavía no sabe qué contacto tiene.
   */
  disponibles?: Record<Channel, boolean>;
}) {
  // 2x2 fijo: en una fila los cuatro no entran en el ancho del panel y
  // "LinkedIn" caía solo a una segunda línea.
  return (
    <div className="grid grid-cols-2 gap-2">
      {CANALES.map((c) => {
        const hayDato = disponibles ? disponibles[c.id] : true;
        const activo = c.id === value && hayDato;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            disabled={disabled || !hayDato}
            aria-pressed={activo}
            title={hayDato ? c.ayuda : `Este contacto no tiene ${c.label}`}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors sm:h-9 ${
              activo
                ? 'border-primary bg-primary text-primary-foreground'
                : hayDato
                  ? 'border-border bg-background text-foreground hover:bg-muted'
                  : // Apagado: sin hover y sin puntero, para que se note que no
                    // es que "no anduvo el clic".
                    'cursor-not-allowed border-border/60 bg-background text-muted-foreground/60'
            } disabled:opacity-100`}
          >
            <IconoDeCanal
              canal={c.id}
              className={`h-4 w-4 shrink-0 ${activo ? '' : hayDato ? c.colorClase : 'opacity-50'}`}
            />
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Cuando no se le puede escribir por ningún lado.
 *
 * Sin esto el diálogo quedaba mudo: cuatro botones grises y ninguna explicación
 * de por qué no responde ninguno.
 */
export function SinCanales() {
  return (
    <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      Este contacto no tiene teléfono, email, Instagram ni LinkedIn cargados, así
      que todavía no hay por dónde escribirle. Cargale alguno en la ficha.
    </p>
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
