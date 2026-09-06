import Image from 'next/image';
import { cn } from '@/lib/cn';

/**
 * Identidad visual de Turbo, el agente de IA de ST Labs.
 *
 * Representaciones, según el espacio (manual 05 / Turbo, BRAND-3):
 * - `mark` / `glyph`: SVG compacto para el sidebar y chrome de 16px.
 * - `portrait` / `hero`: retrato 3D para login y estado vacío.
 * - `face`: el mismo retrato a tamaño de conversación, en el primer
 *   mensaje de un grupo. El SVG a 20px se leía como una carita genérica.
 *
 * El halo mint (`turbo-glow`) es la firma del agente: el verde como fuente de
 * luz. No se usa en ningún otro elemento de la interfaz.
 */

const SIZES = {
  sm: 'h-6 w-6 rounded-md',
  md: 'h-9 w-9 rounded-lg',
  lg: 'h-14 w-14 rounded-xl',
} as const;

export function TurboMark({
  size = 'sm',
  className,
  glow = false,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  glow?: boolean;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center bg-brand-ink p-1',
        SIZES[size],
        glow && 'turbo-glow',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/turbo-mark.svg" alt="" aria-hidden="true" className="h-full w-full object-contain" />
    </span>
  );
}

/**
 * La marca de Turbo sin contenedor, para alinearse con iconografía existente
 * (por ejemplo los íconos de 16px del sidebar).
 */
export function TurboGlyph({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/turbo-mark.svg" alt="" aria-hidden="true" className={cn('object-contain', className)} />;
}

/**
 * Turbo en grande, como figura protagonista (login).
 *
 * El PNG tiene fondo transparente, así que va sin caja: la luz la ponen dos
 * capas detrás — un halo que respira y un anillo que gira, como un equipo
 * encendido. Ambas son decorativas y quedan quietas si el sistema pide menos
 * movimiento (ver `.turbo-halo` / `.turbo-scan` en globals.css).
 */
export function TurboHero({ size = 132 }: { size?: number }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div
        aria-hidden="true"
        className="turbo-halo pointer-events-none absolute rounded-full"
        style={{ width: size * 1.55, height: size * 1.55 }}
      />
      <div
        aria-hidden="true"
        className="turbo-scan pointer-events-none absolute rounded-full"
        style={{ width: size * 1.12, height: size * 1.12 }}
      />
      <Image
        src="/brand/turbo-avatar.png"
        alt="Turbo, el asistente de prospección"
        width={size}
        height={size}
        priority
        className="relative object-contain drop-shadow-[0_0_24px_oklch(0.888_0.179_168.3/35%)]"
      />
    </div>
  );
}

export function TurboPortrait({ className, size = 96 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/brand/turbo-avatar.png"
      alt="Turbo, el asistente de prospección"
      width={size}
      height={size}
      className={cn('turbo-glow rounded-xl bg-brand-ink object-contain', className)}
      priority={false}
    />
  );
}

/**
 * El retrato de Turbo a tamaño de conversación.
 *
 * El SVG compacto (`TurboMark`) a 20px se leía como una carita genérica. Acá
 * se usa el casco 3D, en caja cuadrada para no recortar las aletas, y solo
 * en el primer mensaje de un grupo — el resto del hilo ya sabe quién habla.
 */
export function TurboFace({
  size = 36,
  alt = '',
}: {
  size?: number;
  /** Vacío en el encabezado (el nombre ya está al lado). En el hilo: "Turbo". */
  alt?: string;
}) {
  return (
    <Image
      src="/brand/turbo-avatar.png"
      alt={alt}
      width={size}
      height={size}
      className="rounded-xl bg-brand-ink object-contain"
    />
  );
}
