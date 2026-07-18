'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { ClientDrawer } from './ClientDrawer';
import type { Client, ClientStatus, Role } from '@/lib/types';
import { STATUS_LABELS } from '@/lib/types';
import { formatFollowUpLabel, isFollowUpOverdue } from '@/lib/format-dates';

type Seller = { id: string; name: string };

// Orden de las columnas = recorrido del embudo.
const COLUMNS: ClientStatus[] = ['pending', 'contacted', 'won', 'lost'];

// Mismo semáforo que Reportes (FUNNEL_COLORS) y el resto de la app (SEM-1).
const STATUS_BG: Record<ClientStatus, string> = {
  pending: 'bg-warning',
  contacted: 'bg-orange',
  won: 'bg-success',
  lost: 'bg-destructive',
};

export function ClientsBoard({
  clients,
  sellers,
  role,
  currentUserId,
}: {
  clients: Client[];
  sellers: Seller[];
  role: Role;
  currentUserId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const canEdit = role !== 'viewer';

  // Copia local para el movimiento optimista; se re-sincroniza cuando el server
  // manda datos frescos (router.refresh()).
  const [items, setItems] = useState<Client[]>(clients);
  useEffect(() => setItems(clients), [clients]);

  const [search, setSearch] = useState('');
  const [drawerClient, setDrawerClient] = useState<Client | null>(null);
  const [dragOver, setDragOver] = useState<ClientStatus | null>(null);

  const sellerNames = useMemo(() => new Map(sellers.map((s) => [s.id, s.name])), [sellers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const hay = `${c.full_name} ${c.company ?? ''} ${c.phone ?? ''} ${c.email ?? ''} ${(c.tags ?? []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  const byStatus = useMemo(() => {
    const m: Record<ClientStatus, Client[]> = { pending: [], contacted: [], won: [], lost: [] };
    for (const c of filtered) m[c.status].push(c);
    return m;
  }, [filtered]);

  async function moveTo(id: string, newStatus: ClientStatus) {
    const client = items.find((c) => c.id === id);
    if (!client || client.status === newStatus) return;
    const prev = client.status;

    // Optimista: mueve la tarjeta ya mismo.
    setItems((list) => list.map((c) => (c.id === id ? { ...c, status: newStatus } : c)));

    const { error } = await supabase.from('clients').update({ status: newStatus }).eq('id', id);
    if (error) {
      setItems((list) => list.map((c) => (c.id === id ? { ...c, status: prev } : c)));
      toast.error(error.message);
      return;
    }
    toast.success(`${client.full_name} → ${STATUS_LABELS[newStatus]}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nombre, empresa, teléfono, tag…"
          className="pl-9"
        />
      </div>

      {canEdit && (
        <p className="text-xs text-muted-foreground">
          Arrastrá una tarjeta a otra columna para cambiar su estado. Tocá una tarjeta para abrir la ficha.
        </p>
      )}

      <div className="flex gap-4 overflow-x-auto pb-2">
        {COLUMNS.map((status) => {
          const cards = byStatus[status];
          const isTarget = dragOver === status;
          return (
            <section
              key={status}
              aria-label={STATUS_LABELS[status]}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={(e) => {
                // Solo limpiar si el puntero salió de la columna, no de un hijo.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
              }}
              onDrop={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData('text/plain');
                if (id) moveTo(id, status);
              }}
              className={`flex min-w-[260px] flex-1 flex-col overflow-hidden rounded-xl border bg-muted/30 transition-colors ${
                isTarget ? 'border-primary ring-2 ring-primary/30' : 'border-border'
              }`}
            >
              <div className={`h-1 ${STATUS_BG[status]}`} />
              <header className="flex items-center gap-2 px-3 py-2.5">
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_BG[status]}`} />
                <span className="text-sm font-semibold text-foreground">{STATUS_LABELS[status]}</span>
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {cards.length}
                </span>
              </header>

              <div className="flex flex-col gap-2 p-2">
                {cards.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground/70">
                    {search ? 'Sin coincidencias' : 'Sin clientes'}
                  </p>
                ) : (
                  cards.map((c) => {
                    const overdue = isFollowUpOverdue(c.next_follow_up, c.status);
                    const sellerName = c.assigned_to ? sellerNames.get(c.assigned_to) : null;
                    return (
                      <article
                        key={c.id}
                        draggable={canEdit}
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
                        onClick={() => setDrawerClient(c)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDrawerClient(c);
                          }
                        }}
                        className={`rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary ${
                          canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                        }`}
                      >
                        <p className="truncate text-sm font-medium text-foreground">{c.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[c.phone, c.company].filter(Boolean).join(' · ') || c.email || '—'}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className={overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                            {formatFollowUpLabel(c.next_follow_up)}
                          </span>
                          {overdue && <Badge tone="danger">vencido</Badge>}
                          {(c.tags ?? []).slice(0, 2).map((t) => (
                            <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                              {t}
                            </span>
                          ))}
                        </div>
                        {role !== 'seller' && (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {sellerName ? sellerName : <Badge tone="warning">Sin asignar</Badge>}
                          </p>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      {drawerClient && (
        <ClientDrawer
          client={drawerClient}
          sellers={sellers}
          role={role}
          currentUserId={currentUserId}
          onClose={() => setDrawerClient(null)}
        />
      )}
    </div>
  );
}
