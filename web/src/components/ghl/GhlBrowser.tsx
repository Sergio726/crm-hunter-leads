'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Seller = { id: string; full_name: string | null; email: string };
type GhlResult = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  tags: string[];
};

export function GhlBrowser({ sellers }: { sellers: Seller[] }) {
  const supabase = createClient();
  const [tags, setTags] = useState<string[]>([]);
  const [tag, setTag] = useState('');
  const [results, setResults] = useState<GhlResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sellerId, setSellerId] = useState('');
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searched, setSearched] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ghl/tags')
      .then((r) => r.json())
      .then((d) => setTags(d.tags ?? []))
      .catch(() => {});
  }, []);

  async function search() {
    if (!tag) return;
    setSearching(true);
    setErr(null);
    setMsg(null);
    setSelected(new Set());
    try {
      const r = await fetch('/api/ghl/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'error');
      setResults(d.contacts ?? []);
      setSearched(true);
    } catch {
      setErr('No se pudo buscar en GHL. Reintentá en un momento.');
    } finally {
      setSearching(false);
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setSelected((s) => (s.size === results.length ? new Set() : new Set(results.map((r) => r.id))));
  }

  async function importSelected() {
    if (!sellerId) return setErr('Elegí a qué vendedor asignar los contactos.');
    if (selected.size === 0) return setErr('Seleccioná al menos un contacto.');
    setImporting(true);
    setErr(null);
    setMsg(null);
    const rows = results
      .filter((r) => selected.has(r.id))
      .map((r) => ({
        full_name: r.name,
        email: r.email,
        phone: r.phone,
        company: r.company,
        tags: r.tags,
        crm_contact_id: r.id,
        origin: 'ghl',
        status: 'pending',
        assigned_to: sellerId,
      }));
    const { data, error } = await supabase
      .from('clients')
      .upsert(rows, { onConflict: 'crm_contact_id', ignoreDuplicates: true })
      .select('id');
    setImporting(false);
    if (error) return setErr('Error al importar: ' + error.message);
    const inserted = data?.length ?? 0;
    const skipped = rows.length - inserted;
    const seller = sellers.find((s) => s.id === sellerId);
    setMsg(
      `Importados ${inserted} contacto(s)${skipped > 0 ? ` (${skipped} ya estaban importados)` : ''}. ` +
        `Asignados a ${seller?.full_name ?? seller?.email ?? 'el vendedor'}.`,
    );
    setSelected(new Set());
  }

  return (
    <div className="space-y-4">
      {/* Búsqueda por tag */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">Traer contactos de GHL</h2>
        <p className="mt-1 text-xs text-slate-400">
          Elegí una etiqueta (tag) de GHL para ver los contactos y traer los que quieras al seguimiento.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="min-w-56 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Elegí una tag…</option>
            {tags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button
            onClick={search}
            disabled={!tag || searching}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {searching ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      </section>

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
      {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}

      {/* Resultados */}
      {searched && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-700">
              {results.length} contacto(s) con la tag “{tag}”
            </h3>
            {results.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={sellerId}
                  onChange={(e) => setSellerId(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Asignar a…</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name ?? s.email}</option>
                  ))}
                </select>
                <button
                  onClick={importSelected}
                  disabled={importing || selected.size === 0 || !sellerId}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {importing ? 'Importando…' : `Importar (${selected.size})`}
                </button>
              </div>
            )}
          </div>

          {results.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No hay contactos con esa etiqueta.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                    <th className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selected.size === results.length && results.length > 0}
                        onChange={toggleAll}
                        aria-label="Seleccionar todos"
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">Nombre</th>
                    <th className="px-2 py-2 font-medium">Email</th>
                    <th className="px-2 py-2 font-medium">Teléfono</th>
                    <th className="px-2 py-2 font-medium">Empresa</th>
                    <th className="px-2 py-2 font-medium">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="px-2 py-2">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                      </td>
                      <td className="px-2 py-2 font-medium text-slate-800">{r.name}</td>
                      <td className="px-2 py-2 text-slate-600">{r.email ?? '—'}</td>
                      <td className="px-2 py-2 text-slate-600">{r.phone ?? '—'}</td>
                      <td className="px-2 py-2 text-slate-600">{r.company ?? '—'}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {r.tags.slice(0, 4).map((t) => (
                            <span key={t} className="rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-600">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
