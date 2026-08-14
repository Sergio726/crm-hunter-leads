import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const TONES = {
  neutral: 'bg-muted text-muted-foreground',
  // 'primary-deep' y no 'primary': el mint pleno no contrasta sobre papel.
  // En modo oscuro ese token ya es el mint, así que la variante se sostiene sola.
  primary: 'bg-[var(--badge-primary-bg)] text-primary-deep',
  success: 'bg-[var(--badge-success-bg)] text-success',
  warning: 'bg-[var(--badge-warning-bg)] text-warning',
  orange: 'bg-[var(--badge-orange-bg)] text-orange',
  danger: 'bg-[var(--badge-danger-bg)] text-destructive',
  accent: 'bg-[var(--badge-accent-bg)] text-violet',
} as const;

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONES }) {
  return (
    <span
      className={cn(
        // Mono: los estados son señal técnica (manual 04 / Tipografía).
        // Sin uppercase forzado — este mismo Badge muestra tags escritos por
        // el usuario, y mayusculizarlos deformaría nombres propios.
        'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[0.6875rem] font-bold tracking-wide',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
