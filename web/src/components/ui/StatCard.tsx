import type { ReactNode } from 'react';
import Link from 'next/link';

/** Color del recuadro del ícono, para señalizar urgencia (UXR-7). */
const ICON_TONE = {
  // 'primary-deep': el mint pleno como texto no contrasta sobre papel.
  default: 'bg-[var(--badge-primary-bg)] text-primary-deep',
  warning: 'bg-[var(--badge-warning-bg)] text-warning',
  danger: 'bg-[var(--badge-danger-bg)] text-destructive',
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon,
  delta,
  deltaLabel,
  tone = 'default',
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Variación vs. período anterior. Positivo = ▲ verde, negativo = ▼ rojo, 0 = neutro. */
  delta?: number;
  /** Texto que acompaña al delta, ej. "vs. semana anterior". */
  deltaLabel?: string;
  /** Tono del ícono: 'warning'/'danger' para señalizar urgencia (vencidos/pendientes). */
  tone?: keyof typeof ICON_TONE;
  /** Si viene, la tarjeta es un enlace (UXR-5): ej. "Pendientes" → /clientes?status=pending. */
  href?: string;
}) {
  const showDelta = typeof delta === 'number';
  const deltaTone =
    delta === undefined || delta === 0
      ? 'text-muted-foreground'
      : delta > 0
        ? 'text-success'
        : 'text-destructive';
  const deltaArrow = delta === undefined || delta === 0 ? '' : delta > 0 ? '▲' : '▼';

  const cardCls =
    'group relative block overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md' +
    (href ? ' cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary' : '');

  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="eyebrow text-muted-foreground">{label}</p>
        {icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${ICON_TONE[tone]}`}>
            {icon}
          </span>
        )}
      </div>
      {/* Las cifras van en la mono de marca: "títulos, cifras y señales técnicas". */}
      <p className="metric mt-3 text-3xl font-bold text-foreground">{value}</p>
      {showDelta ? (
        <p className={`mt-1 text-xs font-medium ${deltaTone}`}>
          {deltaArrow} {delta > 0 ? `+${delta}` : delta}
          {deltaLabel ? <span className="font-normal text-muted-foreground"> {deltaLabel}</span> : null}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      )}
    </>
  );

  return href ? (
    <Link href={href} className={cardCls}>
      {body}
    </Link>
  ) : (
    <div className={cardCls}>{body}</div>
  );
}
