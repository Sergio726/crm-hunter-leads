'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, AlarmClock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClientDrawer } from './ClientDrawer';
import type { Client, ClientStatus, ClientOrigin } from '@/lib/types';
import { STATUS_LABELS, ORIGIN_LABELS } from '@/lib/types';

type Seller = { id: string; name: string };

const TODAY = new Date().toISOString().slice(0, 10);
const isOverdue = (c: Client) =>
  !!c.next_follow_up && c.next_follow_up <= TODAY && c.status !== 'won' && c.status !== 'lost';

export function ClientsTable({ clients, sellers }: { clients: Client[]; sellers: Seller[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClientStatus | 'all'>('all');
  const [origin, setOrigin] = useState<ClientOrigin | 'all'>('all');
  const [tag, setTag] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);

  const allTags = useMemo(
    () => Array.from(new Set(clients.flatMap((c) => c.tags ?? []))).sort(),
    [clients],
  );
  const overdueCount = useMemo(() => clients.filter(isOverdue).length, [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (overdueOnly && !isOverdue(c)) return false;
      if (status !== 'all' && c.status !== status) return false;
      if (origin !== 'all' && c.origin !== origin) return false;
      if (tag !== 'all' && !(c.tags ?? []).includes(tag)) return false;
      if (q) {
        const hay = `${c.full_name} ${c.company ?? ''} ${c.phone ?? ''} ${c.email ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [clients, search, status, origin, tag, overdueOnly]);

  async function update(id: string, patch: Partial<Client>) {
    setBusy(id);
    const { error } = await supabase.from('clients').update(patch).eq('id', id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success('Cliente actualizado');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, empresa, teléfono…"
            className="pl-9"
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as ClientStatus | 'all')} className="w-auto">
          <option value="all">Todos los estados</option>
          {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </Select>
        <Select value={origin} onChange={(e) => setOrigin(e.target.value as ClientOrigin | 'all')} className="w-auto">
          <option value="all">Todos los orígenes</option>
          <option value="app">App/Web</option>
          <option value="ghl">GHL</option>
        </Select>
        <Select value={tag} onChange={(e) => setTag(e.target.value)} disabled={allTags.length === 0} className="w-auto">
          <option value="all">Todas las tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <Button
          variant={overdueOnly ? 'default' : 'outline'}
          size="default"
          onClick={() => setOverdueOnly((v) => !v)}
        >
          <AlarmClock className="h-4 w-4" />
          Vencidos {overdueCount > 0 ? `(${overdueCount})` : ''}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} de {clients.length} clientes
      </p>

      {filtered.length === 0 ? (
        <EmptyState title="No hay clientes que coincidan" description="Probá cambiar los filtros o la búsqueda." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Vendedor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-border/60 transition-colors hover:bg-muted/50 ${busy === c.id ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(c)}
                      className="text-left font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {c.full_name}
                    </button>
                    <div className="flex items-center gap-2">
                      {(c.company || c.email) && (
                        <p className="text-xs text-muted-foreground">{[c.company, c.email].filter(Boolean).join(' · ')}</p>
                      )}
                      {isOverdue(c) && <Badge tone="danger">vencido</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge tone={c.origin === 'ghl' ? 'accent' : 'neutral'}>{ORIGIN_LABELS[c.origin]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.tags ?? []).length === 0 ? (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      ) : (
                        c.tags.map((t) => (
                          <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{t}</span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={c.status}
                      disabled={busy === c.id}
                      onChange={(e) => update(c.id, { status: e.target.value as ClientStatus })}
                      className="h-8 w-auto text-xs"
                    >
                      {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={c.assigned_to ?? ''}
                      disabled={busy === c.id}
                      onChange={(e) => update(c.id, { assigned_to: e.target.value || null })}
                      className="h-8 w-auto text-xs"
                    >
                      <option value="">Sin asignar</option>
                      {sellers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {selected && (
        <ClientDrawer client={selected} sellers={sellers} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
