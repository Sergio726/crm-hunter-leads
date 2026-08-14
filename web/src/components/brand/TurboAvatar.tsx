import Image from 'next/image';
import { cn } from '@/lib/cn';

/**
 * Identidad visual de Turbo, el agente de IA de ST Labs.
 *
 * Dos representaciones, según el espacio disponible (manual 05 / Turbo):
 * - `mark`: la marca compacta en SVG, para avatares chicos y repetidos
 *   (cada burbuja del chat). Pesa menos de 1 KB.
 * - `portrait`: el retrato completo, para presentaciones y estados vacíos.
 *   Va por next/image porque el PNG original pesa 1,4 MB.
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
