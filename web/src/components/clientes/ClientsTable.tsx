'use client';

import { useMemo, useState } from 'react';
import { useResetWhen } from '@/lib/use-reset-when';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlarmClock, CheckCheck, Loader2, Mail, MessageCircle, Phone, SlidersHorizontal, Trash2, UserX, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { openContactChannel } from '@/lib/contact-links';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Combobox } from '@/components/ui/Combobox';
import { Badge } from '@/components/ui/Badge';
import { PosponerRapido } from './PosponerRapido';
import { StatusLabel } from '@/components/ui/StatusLabel';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClientDrawer } from './ClientDrawer';
import type { Client, ClientStatus, ClientOrigin, Role } from '@/lib/types';
import { STATUS_LABELS, ORIGIN_LABELS } from '@/lib/types';
import { formatFollowUpLabel, isFollowUpOverdue } from '@/lib/format-dates';

type Seller = { id: string; name: string };

/** WEB-8/WEB-26: la tabla traía y dibujaba todos los clientes de una — con listas largas,
 * eso puede trabar el scroll en celulares reales. Se pagina de a tandas en vez de todo junto. */
const PAGE_SIZE = 20;

export function ClientsTable({
  clients,
  sellers,
  role,
  currentUserId,
  contactedThisWeekIds,
  initialStatus,
  initialOverdue,
  search,
}: {
  clients: Client[];
  sellers: Seller[];
  role: Role;
  currentUserId: string;
  /** WEB-23: ids con al menos una interacción desde el lunes — fusiona "Contactados" como filtro. */
  contactedThisWeekIds?: string[];
  /** UXR-5: filtros iniciales al llegar desde una tarjeta del Inicio. */
  initialStatus?: ClientStatus;
  initialOverdue?: boolean;
  /** WEB-28: el buscador vive en la barra de ClientsView (compartido con el Tablero). */
  search: string;
}) {
  const isAdmin = role === 'superadmin';
  // El lector mira y no toca: sin esto le aparecerían botones que la base rechaza.
  const canWrite = role !== 'viewer';
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [status, setStatus] = useState<ClientStatus | 'all'>(initialStatus ?? 'all');
  const [origin, setOrigin] = useState<ClientOrigin | 'all'>('all');
  const [tag, setTag] = useState('all');
  const [sellerFilter, setSellerFilter] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(initialOverdue ?? false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [contactedOnly, setContactedOnly] = useState(false);
  const contactedThisWeekSet = useMemo(
    () => new Set(contactedThisWeekIds ?? []),
    [contactedThisWeekIds],
  );
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
      { value: 'all', label: 'Todos los rubros' },
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

  /** WEB-26: cuántos filtros (más allá de la búsqueda) están activos ahora mismo —
   * se muestra en el botón "Filtros" para que no queden ocultos sin que se note. */
  const activeFilterCount =
    (status !== 'all' ? 1 : 0) +
    (sellerFilter !== 'all' ? 1 : 0) +
    (origin !== 'all' ? 1 : 0) +
    (tag !== 'all' ? 1 : 0) +
    (overdueOnly ? 1 : 0) +
    (contactedOnly ? 1 : 0) +
    (unassignedOnly ? 1 : 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (overdueOnly && !isFollowUpOverdue(c.next_follow_up, c.status)) return false;
      if (unassignedOnly && c.assigned_to) return false;
      if (contactedOnly && !contactedThisWeekSet.has(c.id)) return false;
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
  }, [clients, search, status, origin, tag, sellerFilter, overdueOnly, unassignedOnly, contactedOnly, contactedThisWeekSet]);

  const filteredIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => checkedIds.has(c.id));

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Al tocar cualquier filtro se vuelve a la primera página.
  useResetWhen(
    [search, status, origin, tag, sellerFilter, overdueOnly, unassignedOnly, contactedOnly].join('|'),
    () => setVisibleCount(PAGE_SIZE),
  );
  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  function toggleCheck(id: string) {
    setCheckedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAllFiltered() {
    // No depende de la selección anterior: o se marcan todos los filtrados, o
    // ninguno. Por eso no toma el estado previo.
    setCheckedIds(allFilteredSelected ? new Set() : new Set(filteredIds));
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
      <div className="flex flex-col gap-2">
        {/* WEB-28: el buscador vive en la barra de arriba (ClientsView). Acá queda solo el
         * botón Filtros con su panel colapsable (oculto por defecto también en desktop). */}
        {/* El rubro sale de atrás del botón "Filtros" y queda a la vista.
            Era el filtro que más falta hacía —el usuario tenía inmobiliarias
            mezcladas con gimnasios— y estaba escondido y llamado "Tag", que no
            le dice nada a un vendedor. Cuando el cliente viene de Prospección,
            su primer tag ES el rubro (lo copia `promote_prospects`). */}
        <div className="flex flex-wrap items-center gap-2">
          {allTags.length > 0 && (
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
          <Button
            variant={activeFilterCount > 0 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
          </Button>
        </div>
        {/* En el teléfono es una hoja que sube por encima de la lista, y no un
            bloque que la empuja: abierto medía 294px —media pantalla— y entre
            la barra de arriba y el rubro no quedaba ni un cliente a la vista.
            De `sm` para arriba sigue siendo el panel de siempre, en su lugar.
            El patrón de hoja es el mismo que ya usa el alta rápida del
            vendedor. */}
        {showFilters && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/70 sm:hidden"
              onClick={() => setShowFilters(false)}
              aria-hidden="true"
            />
            <div
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col gap-2 overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-xl animate-in slide-in-from-bottom duration-200 sm:static sm:z-auto sm:max-h-none sm:animate-none sm:flex-row sm:flex-wrap sm:items-center sm:rounded-xl sm:p-3 sm:shadow-none"
              role="group"
              aria-label="Filtros"
            >
              <div className="flex items-center justify-between sm:hidden">
                <span className="eyebrow text-muted-foreground">/ filtros</span>
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  aria-label="Cerrar filtros"
                  className="flex h-11 w-11 items-center justify-center text-muted-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as ClientStatus | 'all')}
                className="w-full sm:w-auto"
              >
                <option value="all">Todos los estados</option>
                {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </Select>
              {role !== 'seller' && (
                <div className="sm:w-44">
                  <Combobox
                    options={sellerOptions}
                    value={sellerFilter}
                    onChange={setSellerFilter}
                    placeholder="Vendedor…"
                    emptyLabel="Sin vendedores"
                  />
                </div>
              )}
              <Select
                value={origin}
                onChange={(e) => setOrigin(e.target.value as ClientOrigin | 'all')}
                className="w-full sm:w-auto"
              >
                <option value="all">Todos los orígenes</option>
                <option value="app">App/Web</option>
                <option value="ghl">GHL</option>
              </Select>
              {/* Dos columnas en el teléfono: en una sola, tres botones de 44px
                  se comían el alto que la hoja necesita para mostrar algo más. */}
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <Button
                  variant={overdueOnly ? 'default' : 'outline'}
                  size="default"
                  onClick={() => setOverdueOnly((v) => !v)}
                >
                  <AlarmClock className="h-4 w-4" />
                  Vencidos {overdueCount > 0 ? `(${overdueCount})` : ''}
                </Button>
                <Button
                  variant={contactedOnly ? 'default' : 'outline'}
                  size="default"
                  onClick={() => setContactedOnly((v) => !v)}
                >
                  <CheckCheck className="h-4 w-4" />
                  {/* El rótulo entero era el control más ancho de la pantalla. */}
                  Contactados<span className="hidden sm:inline">&nbsp;esta semana</span>{' '}
                  {contactedThisWeekSet.size > 0 ? `(${contactedThisWeekSet.size})` : ''}
                </Button>
                {role !== 'seller' && (
                  <Button
                    variant={unassignedOnly ? 'default' : 'outline'}
                    size="default"
                    onClick={() => setUnassignedOnly((v) => !v)}
                  >
                    <UserX className="h-4 w-4" />
                    Sin asignar {unassignedCount > 0 ? `(${unassignedCount})` : ''}
                  </Button>
                )}
              </div>

              {/* Cerrar mostrando el resultado: es lo que se quiere saber al
                  terminar de filtrar, y evita ir a buscar la X. */}
              <Button className="w-full sm:hidden" onClick={() => setShowFilters(false)}>
                Ver {filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {filtered.length} de {clients.length} clientes
          {checkedIds.size > 0 ? ` · ${checkedIds.size} seleccionado(s)` : ''}
        </p>
        {isAdmin && filtered.length > 0 && checkedIds.size === 0 && (
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => setCheckedIds(new Set(filteredIds))}
          >
            Seleccionar todos los filtrados ({filtered.length})
          </Button>
        )}
      </div>

      {isAdmin && checkedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted p-3">
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
          {visible.map((c) => {
            const overdue = isFollowUpOverdue(c.next_follow_up, c.status);
            const sellerName = c.assigned_to ? sellerNames.get(c.assigned_to) : null;
            const isChecked = checkedIds.has(c.id);
            return (
              <div
                key={c.id}
                // Se puede abrir con el teclado: era un bloque con clic y nada
                // más, así que quien navega con Tab no podía entrar a ninguna
                // ficha. `role` + `tabIndex` + Enter/Espacio es lo mínimo.
                role="button"
                tabIndex={0}
                onClick={() => setDrawerClient(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDrawerClient(c);
                  }
                }}
                className={`rounded-xl border border-border bg-card p-3 shadow-sm transition-colors active:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring ${
                  isChecked ? 'bg-muted' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Seleccionar varios existía solo en la tabla de escritorio,
                      así que desde el teléfono no había forma de reasignar un
                      lote. El cuadrado va a 20px, que es lo mínimo usable con
                      el dedo. */}
                  {isAdmin && (
                    // El <label> es el que hace de objetivo táctil: un checkbox
                    // nativo ignora el padding, así que agrandarlo por CSS no
                    // agranda lo que el dedo puede tocar. Envolviéndolo, los
                    // 44px son reales y el cuadrado sigue midiendo 20.
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="-m-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(c.id)}
                        aria-label={`Seleccionar ${c.full_name}`}
                        className="h-5 w-5 accent-[var(--primary)]"
                      />
                    </label>
                  )}
                  {/* El nombre se lleva el ancho completo: con el estado al lado
                      se cortaba a 360px, y el nombre es el dato que identifica
                      la fila. El estado baja a la línea de abajo, que ya es la
                      de los datos secundarios. */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{c.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[c.phone, c.company].filter(Boolean).join(' · ') || c.email || '—'}
                    </p>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <StatusLabel status={c.status} />
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
                {/* Posponer sin abrir la ficha estaba en la tabla de escritorio
                    y en la lista del vendedor, pero no acá — que es justo donde
                    más sirve: ves el vencido, lo pateás y seguís. */}
                {canWrite && (
                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                    <PosponerRapido clientId={c.id} />
                  </div>
                )}
                {role !== 'viewer' && (
                <div className="mt-2.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {/* flex-1 + min-w-0 para que nunca desborde la tarjeta (el Button base es shrink-0) */}
                  <Button
                    className="min-w-0 flex-1 shrink"
                    disabled={!c.phone}
                    onClick={() => contact('whatsapp', c)}
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span className="truncate">WhatsApp</span>
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={!c.phone}
                    onClick={() => contact('call', c)}
                    aria-label={`Llamar a ${c.full_name}`}
                    title="Llamar"
                  >
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={!c.email}
                    onClick={() => contact('email', c)}
                    aria-label={`Email a ${c.full_name}`}
                    title="Email"
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop: tabla completa */}
        <Card className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              {/* Encabezados en la mono de marca: son rótulos de sistema. */}
              <tr className="border-b border-border text-left font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
                {isAdmin && (
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAllFiltered}
                      aria-label="Seleccionar todos los visibles"
                    />
                  </th>
                )}
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Seguimiento</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                {role !== 'seller' && <th className="px-4 py-3 font-medium">Vendedor</th>}
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Tags</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const overdue = isFollowUpOverdue(c.next_follow_up, c.status);
                const sellerName = c.assigned_to ? sellerNames.get(c.assigned_to) : null;
                const isChecked = checkedIds.has(c.id);

                return (
                  <tr
                    key={c.id}
                    onClick={() => setDrawerClient(c)}
                    className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50 ${
                      isChecked ? 'bg-muted' : ''
                    }`}
                  >
                    {isAdmin && (
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(c.id)}
                          aria-label={`Seleccionar ${c.full_name}`}
                        />
                      </td>
                    )}
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
                      {canWrite && (
                        // `stopPropagation`: la fila entera abre la ficha, y
                        // tocar "Mañana" no puede además abrirla.
                        <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                          <PosponerRapido clientId={c.id} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={c.status} />
                    </td>
                    {role !== 'seller' && (
                      <td className="px-4 py-3">
                        {sellerName ? (
                          <span className="text-foreground">{sellerName}</span>
                        ) : (
                          <Badge tone="warning">Sin asignar</Badge>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {ORIGIN_LABELS[c.origin]}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {(c.tags ?? []).length === 0
                        ? '—'
                        : `${c.tags.slice(0, 3).join(' · ')}${c.tags.length > 3 ? ` · +${c.tags.length - 3}` : ''}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        {visibleCount < filtered.length && (
          <div className="flex justify-center pt-1">
            <Button variant="outline" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
              Cargar más ({filtered.length - visibleCount} restantes)
            </Button>
          </div>
        )}
        </>
      )}

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
