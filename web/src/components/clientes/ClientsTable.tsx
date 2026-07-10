'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlarmClock, Loader2, Mail, MessageCircle, Phone, Search, SlidersHorizontal, Trash2, UserX } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { openContactChannel } from '@/lib/contact-links';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Combobox } from '@/components/ui/Combobox';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClientDrawer } from './ClientDrawer';
import type { Client, ClientStatus, ClientOrigin } from '@/lib/types';
import { STATUS_LABELS, ORIGIN_LABELS } from '@/lib/types';
import { formatFollowUpLabel, isFollowUpOverdue } from '@/lib/format-dates';

type Seller = { id: string; name: string };

const STATUS_TONE: Record<ClientStatus, 'warning' | 'primary' | 'success' | 'neutral'> = {
  pending: 'warning',
  contacted: 'primary',
  won: 'success',
  lost: 'neutral',
};

export function ClientsTable({ clients, sellers }: { clients: Client[]; sellers: Seller[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClientStatus | 'all'>('all');
  const [origin, setOrigin] = useState<ClientOrigin | 'all'>('all');
  const [tag, setTag] = useState('all');
  const [sellerFilter, setSellerFilter] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [drawerClient, setDrawerClient] = useState<Client | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkSellerId, setBulkSellerId] = useState('');
  const [bulkStatus, setBulkStatus] = useState<ClientStatus>('pending');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const sellerNames = useMemo(() => new Map(sellers.map((s) => [s.id, s.name])), [sellers]);

  const allTags = useMemo(
    () => Array.from(new Set(clients.flatMap((c) => c.tags ?? []))).sort(),
    [clients],
  );

  const tagOptions = useMemo(
    () => [
      { value: 'all', label: 'Todas las tags' },
      ...allTags.map((t) => ({ value: t, label: t })),
    ],
    [allTags],
  );

  const sellerOptions = useMemo(
    () => [
      { value: 'all', label: 'Todos los vendedores' },
      { value: 'unassigned', label: 'Sin asignar' },
      ...sellers.map((s) => ({ value: s.id, label: s.name })),
    ],
    [sellers],
  );

  const overdueCount = useMemo(
    () => clients.filter((c) => isFollowUpOverdue(c.next_follow_up, c.status)).length,
    [clients],
  );
  const unassignedCount = useMemo(() => clients.filter((c) => !c.assigned_to).length, [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (overdueOnly && !isFollowUpOverdue(c.next_follow_up, c.status)) return false;
      if (unassignedOnly && c.assigned_to) return false;
      if (status !== 'all' && c.status !== status) return false;
      if (origin !== 'all' && c.origin !== origin) return false;
      if (tag !== 'all' && !(c.tags ?? []).includes(tag)) return false;
      if (sellerFilter === 'unassigned' && c.assigned_to) return false;
      if (sellerFilter !== 'all' && sellerFilter !== 'unassigned' && c.assigned_to !== sellerFilter)
        return false;
      if (q) {
        const hay = `${c.full_name} ${c.company ?? ''} ${c.phone ?? ''} ${c.email ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [clients, search, status, origin, tag, sellerFilter, overdueOnly, unassignedOnly]);

  const filteredIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => checkedIds.has(c.id));

  function toggleCheck(id: string) {
    setCheckedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAllFiltered() {
    setCheckedIds((s) => {
      if (allFilteredSelected) return new Set();
      return new Set(filteredIds);
    });
  }

  function clearSelection() {
    setCheckedIds(new Set());
    setConfirmBulkDelete(false);
  }

  function contact(channel: 'whatsapp' | 'call' | 'email', c: Client) {
    if (!openContactChannel(channel, c)) {
      toast.error(channel === 'email' ? 'Este cliente no tiene email' : 'Este cliente no tiene teléfono');
    }
  }

  async function bulkAssign() {
    const ids = [...checkedIds];
    if (ids.length === 0) return;
    if (!bulkSellerId) return toast.error('Elegí un vendedor para asignar.');
    setBulkBusy(true);
    const { error } = await supabase
      .from('clients')
      .update({ assigned_to: bulkSellerId })
      .in('id', ids);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    const name = sellerNames.get(bulkSellerId) ?? 'vendedor';
    toast.success(`${ids.length} cliente(s) asignados a ${name}`);
    clearSelection();
    router.refresh();
  }

  async function bulkChangeStatus() {
    const ids = [...checkedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from('clients')
      .update({ status: bulkStatus })
      .in('id', ids);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} cliente(s) → ${STATUS_LABELS[bulkStatus]}`);
    clearSelection();
    router.refresh();
  }

  async function bulkDelete() {
    const ids = [...checkedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { error } = await supabase.from('clients').delete().in('id', ids);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} cliente(s) borrados`);
    clearSelection();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:min-w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, empresa, teléfono…"
            className="pl-9"
          />
        </div>
        {/* En móvil los selects viven detrás de este botón */}
        <Button
          variant={showFilters ? 'default' : 'outline'}
          className="sm:hidden"
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
        </Button>
        <div
          className={`${showFilters ? 'flex' : 'hidden'} w-full flex-wrap items-center gap-2 sm:flex sm:w-auto`}
        >
          <Select value={status} onChange={(e) => setStatus(e.target.value as ClientStatus | 'all')} className="w-auto">
            <option value="all">Todos los estados</option>
            {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </Select>
          <div className="w-44">
            <Combobox
              options={sellerOptions}
              value={sellerFilter}
              onChange={setSellerFilter}
              placeholder="Vendedor…"
              emptyLabel="Sin vendedores"
            />
          </div>
          <Select value={origin} onChange={(e) => setOrigin(e.target.value as ClientOrigin | 'all')} className="w-auto">
            <option value="all">Todos los orígenes</option>
            <option value="app">App/Web</option>
            <option value="ghl">GHL</option>
          </Select>
          {allTags.length > 0 && (
            <div className="w-44">
              <Combobox
                options={tagOptions}
                value={tag}
                onChange={setTag}
                placeholder="Tag…"
                emptyLabel="Sin tags"
              />
            </div>
          )}
        </div>
        <Button
          variant={overdueOnly ? 'default' : 'outline'}
          size="default"
          onClick={() => setOverdueOnly((v) => !v)}
        >
          <AlarmClock className="h-4 w-4" />
          Vencidos {overdueCount > 0 ? `(${overdueCount})` : ''}
        </Button>
        <Button
          variant={unassignedOnly ? 'default' : 'outline'}
          size="default"
          onClick={() => setUnassignedOnly((v) => !v)}
        >
          <UserX className="h-4 w-4" />
          Sin asignar {unassignedCount > 0 ? `(${unassignedCount})` : ''}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {filtered.length} de {clients.length} clientes
          {checkedIds.size > 0 ? ` · ${checkedIds.size} seleccionado(s)` : ''}
        </p>
        {filtered.length > 0 && checkedIds.size === 0 && (
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => setCheckedIds(new Set(filteredIds))}
          >
            Seleccionar visibles ({filtered.length})
          </Button>
        )}
      </div>

      {checkedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
          <span className="text-sm font-medium text-foreground">{checkedIds.size} seleccionado(s)</span>

          <Select
            value={bulkSellerId}
            onChange={(e) => setBulkSellerId(e.target.value)}
            className="h-8 w-auto min-w-36 text-xs"
            disabled={bulkBusy}
          >
            <option value="">Asignar a…</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <Button size="sm" onClick={bulkAssign} disabled={bulkBusy || !bulkSellerId}>
            {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Asignar
          </Button>

          <Select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as ClientStatus)}
            className="h-8 w-auto text-xs"
            disabled={bulkBusy}
          >
            {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </Select>
          <Button size="sm" variant="outline" onClick={bulkChangeStatus} disabled={bulkBusy}>
            Cambiar estado
          </Button>

          {confirmBulkDelete ? (
            <>
              <span className="text-xs text-muted-foreground">¿Borrar {checkedIds.size}?</span>
              <Button size="sm" variant="destructive" onClick={bulkDelete} disabled={bulkBusy}>
                Sí, borrar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmBulkDelete(false)} disabled={bulkBusy}>
                No
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={bulkBusy}
            >
              <Trash2 className="h-4 w-4" />
              Borrar
            </Button>
          )}

          <Button size="sm" variant="ghost" onClick={clearSelection} disabled={bulkBusy}>
            Cancelar
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState title="No hay clientes que coincidan" description="Probá cambiar los filtros o la búsqueda." />
      ) : (
        <>
        {/* Móvil: tarjetas con contacto directo */}
        <div className="space-y-2 sm:hidden">
          {filtered.map((c) => {
            const overdue = isFollowUpOverdue(c.next_follow_up, c.status);
            const sellerName = c.assigned_to ? sellerNames.get(c.assigned_to) : null;
            return (
              <div
                key={c.id}
                onClick={() => setDrawerClient(c)}
                className="rounded-xl border border-border bg-card p-3 shadow-sm transition-colors active:bg-muted/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{c.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[c.phone, c.company].filter(Boolean).join(' · ') || c.email || '—'}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABELS[c.status]}</Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className={overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                    {formatFollowUpLabel(c.next_follow_up)}
                  </span>
                  {overdue && <Badge tone="danger">vencido</Badge>}
                  {sellerName ? (
                    <span className="text-muted-foreground">· {sellerName}</span>
                  ) : (
                    <Badge tone="warning">Sin asignar</Badge>
                  )}
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" disabled={!c.phone} onClick={() => contact('whatsapp', c)}>
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </Button>
                  <Button size="sm" variant="outline" disabled={!c.phone} onClick={() => contact('call', c)}>
                    <Phone className="h-4 w-4" />
                    Llamar
                  </Button>
                  <Button size="sm" variant="outline" disabled={!c.email} onClick={() => contact('email', c)}>
                    <Mail className="h-4 w-4" />
                    Email
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: tabla completa */}
        <Card className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAllFiltered}
                    aria-label="Seleccionar todos los visibles"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Seguimiento</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Vendedor</th>
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const overdue = isFollowUpOverdue(c.next_follow_up, c.status);
                const sellerName = c.assigned_to ? sellerNames.get(c.assigned_to) : null;
                const isChecked = checkedIds.has(c.id);

                return (
                  <tr
                    key={c.id}
                    onClick={() => setDrawerClient(c)}
                    className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50 ${
                      isChecked ? 'bg-primary/5' : ''
                    }`}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(c.id)}
                        aria-label={`Seleccionar ${c.full_name}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{c.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[c.phone, c.email, c.company].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={overdue ? 'text-destructive' : 'text-muted-foreground'}>
                          {formatFollowUpLabel(c.next_follow_up)}
                        </span>
                        {overdue && <Badge tone="danger">vencido</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABELS[c.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {sellerName ? (
                        <span className="text-foreground">{sellerName}</span>
                      ) : (
                        <Badge tone="warning">Sin asignar</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={c.origin === 'ghl' ? 'accent' : 'neutral'}>{ORIGIN_LABELS[c.origin]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags ?? []).length === 0 ? (
                          <span className="text-xs text-muted-foreground/60">—</span>
                        ) : (
                          c.tags.slice(0, 3).map((t) => (
                            <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                              {t}
                            </span>
                          ))
                        )}
                        {(c.tags ?? []).length > 3 && (
                          <span className="text-xs text-muted-foreground">+{c.tags.length - 3}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        </>
      )}

      {drawerClient && (
        <ClientDrawer
          client={drawerClient}
          sellers={sellers}
          onClose={() => setDrawerClient(null)}
        />
      )}
    </div>
  );
}
