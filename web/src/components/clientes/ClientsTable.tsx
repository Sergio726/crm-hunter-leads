'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Client, ClientStatus, ClientOrigin } from '@/lib/types';
import { STATUS_LABELS, ORIGIN_LABELS } from '@/lib/types';

type Seller = { id: string; name: string };

const ORIGIN_STYLES: Record<ClientOrigin, string> = {
  app: 'bg-slate-100 text-slate-600',
  ghl: 'bg-violet-100 text-violet-700',
};

export function ClientsTable({ clients, sellers }: { clients: Client[]; sellers: Seller[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClientStatus | 'all'>('all');
  const [origin, setOrigin] = useState<ClientOrigin | 'all'>('all');
  const [tag, setTag] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);

  const allTags = useMemo(
    () => Array.from(new Set(clients.flatMap((c) => c.tags ?? []))).sort(),
    [clients],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (status !== 'all' && c.status !== status) return false;
      if (origin !== 'all' && c.origin !== origin) return false;
      if (tag !== 'all' && !(c.tags ?? []).includes(tag)) return false;
      if (q) {
        const hay = `${c.full_name} ${c.company ?? ''} ${c.phone ?? ''} ${c.email ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [clients, search, status, origin, tag]);

  async function update(id: string, patch: Partial<Client>) {
    setBusy(id);
    await supabase.from('clients').update(patch).eq('id', id);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nombre, empresa, teléfono…"
          className="min-w-56 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as ClientStatus | 'all')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="all">Todos los estados</option>
          {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select value={origin} onChange={(e) => setOrigin(e.target.value as ClientOrigin | 'all')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="all">Todos los orígenes</option>
          <option value="app">App/Web</option>
          <option value="ghl">GHL</option>
        </select>
        <select value={tag} onChange={(e) => setTag(e.target.value)} disabled={allTags.length === 0} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="all">Todas las tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <p className="text-xs text-slate-400">{filtered.length} de {clients.length} clientes</p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Teléfono</th>
              <th className="px-4 py-3 font-medium">Origen</th>
              <th className="px-4 py-3 font-medium">Tags</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Vendedor</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">No hay clientes que coincidan.</td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className={`border-b border-slate-50 ${busy === c.id ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{c.full_name}</p>
                    {(c.company || c.email) && (
                      <p className="text-xs text-slate-400">{[c.company, c.email].filter(Boolean).join(' · ')}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORIGIN_STYLES[c.origin]}`}>
                      {ORIGIN_LABELS[c.origin]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.tags ?? []).length === 0 ? (
                        <span className="text-xs text-slate-300">—</span>
                      ) : (
                        c.tags.map((t) => (
                          <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{t}</span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={c.status}
                      disabled={busy === c.id}
                      onChange={(e) => update(c.id, { status: e.target.value as ClientStatus })}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    >
                      {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={c.assigned_to ?? ''}
                      disabled={busy === c.id}
                      onChange={(e) => update(c.id, { assigned_to: e.target.value || null })}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    >
                      <option value="">Sin asignar</option>
                      {sellers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
