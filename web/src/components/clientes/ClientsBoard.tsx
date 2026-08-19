'use client';

import { useMemo, useState } from 'react';
import { useResetWhen } from '@/lib/use-reset-when';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Badge } from '@/components/ui/Badge';
import { ClientDrawer } from './ClientDrawer';
import { BoardMoveDialog, type MovePayload } from './BoardMoveDialog';
import type { Client, ClientStatus, Role } from '@/lib/types';
import { STATUS_LABELS } from '@/lib/types';
import { formatFollowUpLabel, isFollowUpOverdue } from '@/lib/format-dates';

type Seller = { id: string; name: string };

// Orden de las columnas = recorrido del embudo.
const COLUMNS: ClientStatus[] = ['pending', 'contacted', 'won', 'lost'];
const PAGE_SIZE = 15;

// Mismo semáforo que Reportes (FUNNEL_COLORS) y el resto de la app (SEM-1).
const STATUS_BG: Record<ClientStatus, string> = {
  pending: 'bg-warning',
  contacted: 'bg-orange',
  won: 'bg-success',
  lost: 'bg-destructive',
};

// Destinos que abren un flujo antes de aplicar (WEB-27b): registrar contacto / confirmar cierre.
function needsDialog(to: ClientStatus): boolean {
  return to === 'contacted' || to === 'won' || to === 'lost';
}

export function ClientsBoard({
  clients,
  sellers,
  role,
  currentUserId,
  search,
}: {
  clients: Client[];
  sellers: Seller[];
  role: Role;
  currentUserId: string;
  /** WEB-28: buscador compartido (vive en la barra de ClientsView). */
  search: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const canEdit = role !== 'viewer';

  // Copia local para el movimiento optimista; se re-sincroniza con datos frescos del server.
  const [items, setItems] = useState<Client[]>(clients);
  // Cuando llegan datos frescos del servidor, la copia local se descarta.
  // La clave es la identidad del array a propósito: es lo que cambia después de
  // un `router.refresh()`.
  useResetWhen(clients, () => setItems(clients));

  const [sellerFilter, setSellerFilter] = useState('all');
  // Mismo filtro que en la Lista: el Tablero no lo tenía y era el único lugar
  // donde no se podían separar, por ejemplo, inmobiliarias de gimnasios.
  const [tag, setTag] = useState('all');
  const [drawerClient, setDrawerClient] = useState<Client | null>(null);
  const [dragOver, setDragOver] = useState<ClientStatus | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ id: string; to: ClientStatus } | null>(null);
  const [limits, setLimits] = useState<Record<ClientStatus, number>>({
    pending: PAGE_SIZE, contacted: PAGE_SIZE, won: PAGE_SIZE, lost: PAGE_SIZE,
  });

  const sellerNames = useMemo(() => new Map(sellers.map((s) => [s.id, s.name])), [sellers]);

  // Cuando el cliente viene de Prospección, su primer tag ES el rubro: lo copia
  // `promote_prospects` desde `prospects.niche`.
  const tagOptions = useMemo(
    () => [
      { value: 'all', label: 'Todos los rubros' },
      ...Array.from(new Set(items.flatMap((c) => c.tags ?? [])))
        .sort()
        .map((t) => ({ value: t, label: t })),
    ],
    [items],
  );
  const sellerOptions = useMemo(
    () => [
      { value: 'all', label: 'Todos los vendedores' },
      { value: 'unassigned', label: 'Sin asignar' },
      ...sellers.map((s) => ({ value: s.id, label: s.name })),
    ],
    [sellers],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      if (sellerFilter === 'unassigned' && c.assigned_to) return false;
      if (sellerFilter !== 'all' && sellerFilter !== 'unassigned' && c.assigned_to !== sellerFilter) return false;
      if (tag !== 'all' && !(c.tags ?? []).includes(tag)) return false;
      if (q) {
        const hay = `${c.full_name} ${c.company ?? ''} ${c.phone ?? ''} ${c.email ?? ''} ${(c.tags ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, sellerFilter, tag]);

  // Al cambiar los filtros, volver a la primera "página" de cada columna.
  useResetWhen(`${search}|${sellerFilter}|${tag}`, () =>
    setLimits({ pending: PAGE_SIZE, contacted: PAGE_SIZE, won: PAGE_SIZE, lost: PAGE_SIZE }),
  );

  const byStatus = useMemo(() => {
    const m: Record<ClientStatus, Client[]> = { pending: [], contacted: [], won: [], lost: [] };
    for (const c of filtered) m[c.status].push(c);
    return m;
  }, [filtered]);

  // Aplica un cambio de estado (optimista) y persiste; revierte si la BD lo rechaza.
  async function persistStatus(id: string, to: ClientStatus, prev: ClientStatus) {
    setItems((list) => list.map((c) => (c.id === id ? { ...c, status: to } : c)));
    const { error } = await supabase.from('clients').update({ status: to }).eq('id', id);
    if (error) {
      setItems((list) => list.map((c) => (c.id === id ? { ...c, status: prev } : c)));
      toast.error(error.message);
    }
  }

  // Movimiento directo (a "Pendiente" o "solo cambiar estado") con opción de deshacer.
  function applySimple(id: string, to: ClientStatus) {
    const client = items.find((c) => c.id === id);
    if (!client) return;
    const prev = client.status;
    persistStatus(id, to, prev);
    toast.success(`${client.full_name} → ${STATUS_LABELS[to]}`, {
      action: { label: 'Deshacer', onClick: () => persistStatus(id, prev, to) },
    });
  }

  // Punto de entrada único (drag y menú <select>): decide el flujo según el destino.
  function moveTo(id: string, to: ClientStatus) {
    const client = items.find((c) => c.id === id);
    if (!client || client.status === to) return;
    if (needsDialog(to)) setPendingMove({ id, to });
    else applySimple(id, to);
  }

  async function registerContact(id: string, p: Extract<MovePayload, { mode: 'register' }>) {
    const client = items.find((c) => c.id === id);
    if (!client) return;
    const prev = client.status;

    let nextFollowUp: string | null = null;
    if (p.followUpDays !== null) {
      const dt = new Date();
      dt.setDate(dt.getDate() + p.followUpDays);
      nextFollowUp = dt.toISOString().slice(0, 10);
    }

    setItems((list) =>
      list.map((c) => (c.id === id ? { ...c, status: 'contacted', next_follow_up: nextFollowUp } : c)),
    );

    const { error: iErr } = await supabase.from('interactions').insert({
      client_id: id,
      user_id: currentUserId,
      channel: p.channel,
      outcome: p.outcome,
      notes: p.notes.trim() || null,
    });
    if (iErr) {
      setItems((list) => list.map((c) => (c.id === id ? { ...c, status: prev } : c)));
      return toast.error('No se pudo registrar: ' + iErr.message);
    }
    await supabase
      .from('clients')
      .update({ status: 'contacted', next_follow_up: nextFollowUp })
      .eq('id', id);
    toast.success(`Contacto registrado — ${client.full_name}`);
    router.refresh();
  }

  async function onDialogConfirm(payload: MovePayload) {
    const mv = pendingMove;
    setPendingMove(null);
    if (!mv) return;
    const client = items.find((c) => c.id === mv.id);
    if (!client) return;

    if (payload.mode === 'register') {
      await registerContact(mv.id, payload);
      return;
    }
    // 'status-only' o 'confirm' (won/lost): cambia el estado; si hay nota de cierre, la registra.
    const prev = client.status;
    await persistStatus(mv.id, mv.to, prev);
    if (payload.mode === 'confirm' && payload.notes.trim()) {
      await supabase.from('interactions').insert({
        client_id: mv.id,
        user_id: currentUserId,
        channel: 'note',
        outcome: null,
        notes: payload.notes.trim(),
      });
      router.refresh();
    }
    toast.success(`${client.full_name} → ${STATUS_LABELS[mv.to]}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {role !== 'seller' && (
          <div className="w-full sm:w-52">
            <Combobox
              options={sellerOptions}
              value={sellerFilter}
              onChange={setSellerFilter}
              placeholder="Filtrar por vendedor…"
              emptyLabel="Sin vendedores"
            />
          </div>
        )}
        {tagOptions.length > 1 && (
          <div className="w-full sm:w-52">
            <Combobox
              options={tagOptions}
              value={tag}
              onChange={setTag}
              placeholder="Rubro…"
              emptyLabel="Sin rubros"
            />
          </div>
        )}
      </div>

      {canEdit && (
        <p className="text-xs text-muted-foreground">
          Arrastrá una tarjeta a otra columna (o usá el menú de estado de la tarjeta) para cambiar su estado.
          Tocá una tarjeta para abrir la ficha.
        </p>
      )}

      <div className="flex gap-4 overflow-x-auto pb-2">
        {COLUMNS.map((status) => {
          const all = byStatus[status];
          const shown = all.slice(0, limits[status]);
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
                  {all.length}
                </span>
              </header>

              <div className="flex max-h-[62vh] flex-col gap-2 overflow-y-auto p-2">
                {all.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground/70">
                    {search || sellerFilter !== 'all' ? 'Sin coincidencias' : 'Sin clientes'}
                  </p>
                ) : (
                  shown.map((c) => {
                    const overdue = isFollowUpOverdue(c.next_follow_up, c.status);
                    const sellerName = c.assigned_to ? sellerNames.get(c.assigned_to) : null;
                    return (
                      <article
                        key={c.id}
                        draggable={canEdit}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', c.id);
                          setDraggingId(c.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
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
                        } ${draggingId === c.id ? 'opacity-50' : ''}`}
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
                        {canEdit && (
                          <select
                            value={c.status}
                            aria-label={`Cambiar estado de ${c.full_name}`}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const v = e.target.value as ClientStatus;
                              e.currentTarget.blur();
                              moveTo(c.id, v);
                            }}
                            className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                          >
                            {COLUMNS.map((s) => (
                              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        )}
                      </article>
                    );
                  })
                )}

                {all.length > shown.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLimits((l) => ({ ...l, [status]: l[status] + PAGE_SIZE }))}
                  >
                    Cargar más ({all.length - shown.length})
                  </Button>
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

      {pendingMove && (
        <BoardMoveDialog
          client={items.find((c) => c.id === pendingMove.id)!}
          to={pendingMove.to}
          onCancel={() => setPendingMove(null)}
          onConfirm={onDialogConfirm}
        />
      )}
    </div>
  );
}
