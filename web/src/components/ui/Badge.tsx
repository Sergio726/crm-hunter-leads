import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const TONES = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-[var(--badge-primary-bg)] text-primary',
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
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
