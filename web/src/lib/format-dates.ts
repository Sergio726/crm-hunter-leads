const TODAY = () => new Date().toISOString().slice(0, 10);

export function isFollowUpOverdue(date: string | null, status: string): boolean {
  return !!date && date <= TODAY() && status !== 'won' && status !== 'lost';
}

/** Etiqueta corta para próximo seguimiento en tablas. */
export function formatFollowUpLabel(date: string | null): string {
  if (!date) return 'Sin fecha';
  const today = TODAY();
  if (date === today) return 'Hoy';
  if (date < today) {
    const diff = daysBetween(date, today);
    return diff === 1 ? 'Ayer (vencido)' : `Hace ${diff} días (vencido)`;
  }
  const diff = daysBetween(today, date);
  if (diff === 1) return 'Mañana';
  if (diff <= 7) return `En ${diff} días`;
  return new Date(date + 'T12:00:00').toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
  });
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T12:00:00').getTime();
  const b = new Date(to + 'T12:00:00').getTime();
  return Math.round(Math.abs(b - a) / 86_400_000);
}
