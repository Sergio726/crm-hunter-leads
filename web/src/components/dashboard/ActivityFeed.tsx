import { UserPlus, MessageSquare, CircleCheck } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatRelativeTime } from '@/lib/format-dates';

export type ActivityKind = 'added' | 'contacted' | 'won';
export type ActivityItem = { id: string; kind: ActivityKind; text: string; at: string };

const ICONS: Record<ActivityKind, typeof UserPlus> = {
  added: UserPlus,
  contacted: MessageSquare,
  won: CircleCheck,
};

const TONE: Record<ActivityKind, string> = {
  added: 'bg-muted text-muted-foreground',
  contacted: 'bg-orange/10 text-orange',
  won: 'bg-success/10 text-success',
};

/** Feed de actividad reciente del dashboard admin (WEB-6/UXR-6). Presentacional. */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="Todavía no hay actividad reciente" />;
  }
  return (
    <ul className="space-y-3">
      {items.map((it) => {
        const Icon = ICONS[it.kind];
        return (
          <li key={it.id} className="flex items-center gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE[it.kind]}`}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex-1 text-sm text-foreground">{it.text}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(it.at)}</span>
          </li>
        );
      })}
    </ul>
  );
}
