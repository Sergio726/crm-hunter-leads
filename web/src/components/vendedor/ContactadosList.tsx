'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { SellerClientDrawer } from './SellerClientDrawer';
import type { Channel, Client, Outcome } from '@/lib/types';
import { CHANNEL_LABELS, OUTCOME_LABELS } from '@/lib/types';

export type ContactadoItem = {
  id: string;
  channel: Channel;
  outcome: Outcome;
  notes: string | null;
  contacted_at: string;
  clients: Client | null;
};

export function ContactadosList({ items, sellerId }: { items: ContactadoItem[]; sellerId: string }) {
  const [range, setRange] = useState<'today' | 'week'>('today');
  const [selected, setSelected] = useState<Client | null>(null);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const filtered = range === 'today' ? items.filter((i) => new Date(i.contacted_at) >= todayStart) : items;

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-border p-1">
        {(['today', 'week'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {r === 'today' ? 'Hoy' : 'Esta semana'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={range === 'today' ? 'Todavía no contactaste a nadie hoy' : 'Sin contactos esta semana'} />
      ) : (
        <div className="space-y-2">
          {filtered.map((i) => (
            <button
              key={i.id}
              onClick={() => i.clients && setSelected(i.clients)}
              disabled={!i.clients}
              className="w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:shadow-md disabled:opacity-60"
            >
              <p className="font-medium text-foreground">{i.clients?.full_name ?? 'Cliente'}</p>
              <p className="text-xs text-muted-foreground">
                {CHANNEL_LABELS[i.channel]} · {OUTCOME_LABELS[i.outcome]} ·{' '}
                {new Date(i.contacted_at).toLocaleString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              {i.notes && <p className="text-xs text-muted-foreground">{i.notes}</p>}
            </button>
          ))}
        </div>
      )}

      {selected && <SellerClientDrawer client={selected} sellerId={sellerId} onClose={() => setSelected(null)} />}
    </div>
  );
}
