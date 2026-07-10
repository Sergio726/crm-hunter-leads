import type { MyProgress } from '@/lib/types';

function message(p: MyProgress): string {
  const remaining = p.goal - p.today;
  if (p.today >= p.goal) return '🎉 ¡Meta del día cumplida! Seguí sumando.';
  if (p.today === 0) return '¡Arrancá el día! Cada contacto suma.';
  if (remaining <= 2) return `¡Casi! Te faltan ${remaining} para la meta.`;
  return `Vas bien, te faltan ${remaining} para la meta de hoy.`;
}

export function ProgressBanner({ progress }: { progress: MyProgress | null }) {
  if (!progress) return null;
  const pct = progress.goal ? Math.min(100, Math.round((progress.today / progress.goal) * 100)) : 0;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-4 text-primary-foreground shadow-md md:p-5">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>
          {progress.streak > 0
            ? `🔥 Racha: ${progress.streak} ${progress.streak === 1 ? 'día' : 'días'}`
            : '🔥 Sin racha aún'}
        </span>
        <span className="opacity-90">Semana: {progress.this_week}</span>
      </div>
      <p className="mt-2 text-sm">
        Hoy <span className="text-2xl font-bold">{progress.today}</span>
        <span className="opacity-80">/{progress.goal}</span> contactos
      </p>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/25">
        <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm opacity-95">{message(progress)}</p>
    </div>
  );
}
