import { cn } from '@/lib/cn';
import { STATUS_LABELS, STATUS_TONE, type ClientStatus } from '@/lib/types';

const DOT: Record<(typeof STATUS_TONE)[ClientStatus], string> = {
  warning: 'bg-warning',
  orange: 'bg-orange',
  success: 'bg-success',
  danger: 'bg-destructive',
};

/**
 * Estado de cliente como señal, no como pastilla.
 * El Badge queda para excepciones (vencido, sin asignar). Ver BRAND-3.
 */
export function StatusLabel({
  status,
  className,
}: {
  status: ClientStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-[0.6875rem] font-bold tracking-wide text-foreground',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[STATUS_TONE[status]])} />
      {STATUS_LABELS[status]}
    </span>
  );
}
