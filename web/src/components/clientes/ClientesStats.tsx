import type { Client } from '@/lib/types';
import { isFollowUpOverdue } from '@/lib/format-dates';
import { Clock, AlarmClock, UserX, Users } from 'lucide-react';

export function ClientesStats({ clients }: { clients: Client[] }) {
  const total = clients.length;
  const pending = clients.filter((c) => c.status === 'pending').length;
  const overdue = clients.filter((c) => isFollowUpOverdue(c.next_follow_up, c.status)).length;
  const unassigned = clients.filter((c) => !c.assigned_to).length;

  const items = [
    { label: 'Total', value: total, icon: Users },
    { label: 'Pendientes', value: pending, icon: Clock },
    { label: 'Vencidos', value: overdue, icon: AlarmClock, highlight: overdue > 0 },
    { label: 'Sin asignar', value: unassigned, icon: UserX, highlight: unassigned > 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <p
              className={`mt-1 text-2xl font-semibold tracking-tight ${
                item.highlight ? 'text-destructive' : 'text-foreground'
              }`}
            >
              {item.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
