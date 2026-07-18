import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  hint,
  icon,
  delta,
  deltaLabel,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Variación vs. período anterior. Positivo = ▲ verde, negativo = ▼ rojo, 0 = neutro. */
  delta?: number;
  /** Texto que acompaña al delta, ej. "vs. semana anterior". */
  deltaLabel?: string;
}) {
  const showDelta = typeof delta === 'number';
  const deltaTone =
    delta === undefined || delta === 0
      ? 'text-muted-foreground'
      : delta > 0
        ? 'text-success'
        : 'text-destructive';
  const deltaArrow = delta === undefined || delta === 0 ? '' : delta > 0 ? '▲' : '▼';

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      {showDelta ? (
        <p className={`mt-1 text-xs font-medium ${deltaTone}`}>
          {deltaArrow} {delta > 0 ? `+${delta}` : delta}
          {deltaLabel ? <span className="font-normal text-muted-foreground"> {deltaLabel}</span> : null}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
