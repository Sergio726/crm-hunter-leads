import type { MyProgress } from '@/lib/types';

function message(p: MyProgress): string {
  const remaining = p.goal - p.today;
  if (p.today >= p.goal) return '¡Meta del día cumplida! Seguí sumando.';
  if (p.today === 0) return '¡Arrancá el día! Cada contacto suma.';
  if (remaining <= 2) return `¡Casi! Te faltan ${remaining} para la meta.`;
  return `Vas bien, te faltan ${remaining} para la meta de hoy.`;
}

/**
 * Banner de progreso diario del vendedor.
 *
 * Superficie de marca: fondo ink con la grilla fina del manual, y el verde
 * reservado a lo que es progreso real (la barra y la cifra del día). Antes el
 * banner entero era del color primario con la barra en blanco; con el mint eso
 * quedaba ilegible y contradecía la regla "señal antes que ruido".
 */
export function ProgressBanner({ progress }: { progress: MyProgress | null }) {
  if (!progress) return null;
  const pct = progress.goal ? Math.min(100, Math.round((progress.today / progress.goal) * 100)) : 0;
  const done = progress.today >= progress.goal;

  return (
    <div className="brand-grid overflow-hidden rounded-xl border border-brand-paper/10 bg-brand-ink p-4 text-brand-paper shadow-md md:p-5">
      <div className="flex items-center justify-between">
        {/* El mint marca el logro, así que aparece SOLO cuando hay racha.
            Antes estaba fijo: "sin racha aún" se anunciaba en flúor, o sea el
            color del logro para la ausencia de logro. */}
        <span className={`eyebrow ${progress.streak > 0 ? 'text-brand-mint' : 'text-brand-paper/60'}`}>
          {progress.streak > 0
            ? `/ racha · ${progress.streak} ${progress.streak === 1 ? 'día' : 'días'}`
            : '/ sin racha aún'}
        </span>
        <span className="eyebrow text-brand-paper/60">semana · {progress.this_week}</span>
      </div>

      <p className="mt-3 text-sm text-brand-paper/80">
        Hoy{' '}
        <span className="metric text-3xl font-bold text-brand-mint">{progress.today}</span>
        <span className="metric text-brand-paper/50">/{progress.goal}</span> contactos
      </p>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-brand-mint/15">
        <div
          className="h-full rounded-full bg-brand-mint transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className={`mt-2.5 text-sm ${done ? 'text-brand-mint' : 'text-brand-paper/70'}`}>
        {message(progress)}
      </p>
    </div>
  );
}
