'use client';

import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/cn';

const PRESETS: { label: string; days: number | null }[] = [
  { label: 'Sin fecha', days: null },
  { label: 'Hoy', days: 0 },
  { label: 'Mañana', days: 1 },
  { label: '+3 días', days: 3 },
  { label: 'Próx. semana', days: 7 },
];

function isoInDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatIso(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });
}

export function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!value && value < today;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const iso = p.days === null ? '' : isoInDays(p.days);
          const active = value === iso;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(iso)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-foreground hover:bg-muted',
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>
        {value && (
          <span className={cn('text-xs font-medium', overdue ? 'text-destructive' : 'text-muted-foreground')}>
            {formatIso(value)}
            {overdue ? ' · vencido' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
