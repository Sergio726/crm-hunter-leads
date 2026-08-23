'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { posponerDesdeHoy } from '@/lib/seguimiento';

/**
 * Mover la fecha de seguimiento sin abrir la ficha.
 *
 * Existe porque reagendar era el gesto más frecuente y el más caro: abrir la
 * ficha, bajar al formulario, cambiar la fecha, guardar, cerrar. Cinco pasos
 * para algo que se decide en un segundo mirando la lista.
 *
 * "Listo" no es lo mismo que posponer: **borra** la fecha en vez de moverla. Es
 * el que resuelve el cliente que quedó vencido para siempre porque nadie tenía
 * cómo decir "ya está, con este no hay nada pendiente".
 */
export function PosponerRapido({
  clientId,
  className = '',
}: {
  clientId: string;
  className?: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);

  async function mover(dias: number | null, texto: string) {
    setGuardando(true);
    const { error } = await supabase
      .from('clients')
      // Se cuenta desde HOY y no desde la fecha vieja: posponer una semana un
      // cliente que venció hace un mes tiene que caer la semana que viene.
      .update({ next_follow_up: dias === null ? null : posponerDesdeHoy(dias) })
      .eq('id', clientId);
    setGuardando(false);
    if (error) return toast.error('No se pudo mover: ' + error.message);
    toast.success(texto);
    router.refresh();
  }

  // Los chips no pasan por el componente Button, así que el tamaño táctil va
  // acá: medían 22px de alto, la mitad de lo que necesita un dedo. En el
  // teléfono suben a 40 y el texto a `sm`; en escritorio se conserva el chip
  // chico, que es lo que permite meterlos dentro de una fila de tabla.
  const boton =
    'inline-flex h-11 items-center gap-1 rounded-full border border-border px-3 text-sm ' +
    'text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50 ' +
    'sm:h-auto sm:px-2 sm:py-0.5 sm:text-xs';

  return (
    <div className={`flex flex-wrap items-center gap-2 sm:gap-1.5 ${className}`}>
      <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <button className={boton} disabled={guardando} onClick={() => mover(1, 'Movido a mañana')}>
        Mañana
      </button>
      <button className={boton} disabled={guardando} onClick={() => mover(7, 'Movido a la semana que viene')}>
        1 semana
      </button>
      <button
        className={boton}
        disabled={guardando}
        onClick={() => mover(null, 'Listo: sin seguimiento pendiente')}
        title="Saca la fecha: deja de aparecer como vencido y de avisar"
      >
        <Check className="h-3 w-3" />
        Listo
      </button>
    </div>
  );
}
