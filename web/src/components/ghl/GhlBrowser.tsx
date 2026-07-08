'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Search, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SectionCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';

type Seller = { id: string; name: string };
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

  useEffect(() => {
    fetch('/api/ghl/tags')
      .then((r) => r.json())
      .then((d) => setTags(d.tags ?? []))
      .catch(() => {});
  }, []);

  async function search() {
    if (!tag) return;
    setSearching(true);
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
      toast.error('No se pudo buscar en GHL. Reintentá en un momento.');
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
    if (!sellerId) return toast.error('Elegí a qué vendedor asignar los contactos.');
    if (selected.size === 0) return toast.error('Seleccioná al menos un contacto.');
    setImporting(true);
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
    if (error) return toast.error('Error al importar: ' + error.message);
    const inserted = data?.length ?? 0;
    const skipped = rows.length - inserted;
    const seller = sellers.find((s) => s.id === sellerId);
    toast.success(
      `Importados ${inserted}${skipped > 0 ? ` (${skipped} ya estaban)` : ''} → ${seller?.name ?? 'vendedor'}`,
    );
    setSelected(new Set());
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Traer contactos de GHL"
        description="Elegí una etiqueta (tag) de GHL para ver los contactos y traer los que quieras al seguimiento."
      >
        <div className="flex flex-wrap gap-2">
          <Select value={tag} onChange={(e) => setTag(e.target.value)} className="min-w-56 flex-1">
            <option value="">Elegí una tag…</option>
            {tags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <Button onClick={search} disabled={!tag || searching}>
            <Search className="h-4 w-4" />
            {searching ? 'Buscando…' : 'Buscar'}
          </Button>
        </div>
      </SectionCard>

      {searched && (
        <SectionCard
          title={`${results.length} contacto(s) con la tag “${tag}”`}
          action={
            results.length > 0 ? (
              <div className="flex items-center gap-2">
                <Select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className="w-auto">
                  <option value="">Asignar a…</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
                <Button onClick={importSelected} disabled={importing || selected.size === 0 || !sellerId}>
                  <Download className="h-4 w-4" />
                  {importing ? 'Importando…' : `Importar (${selected.size})`}
                </Button>
              </div>
            ) : undefined
          }
        >
          {results.length === 0 ? (
            <EmptyState title="No hay contactos con esa etiqueta" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
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
                    <tr key={r.id} className="border-b border-border/60">
                      <td className="px-2 py-2">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                      </td>
                      <td className="px-2 py-2 font-medium text-foreground">{r.name}</td>
                      <td className="px-2 py-2 text-muted-foreground">{r.email ?? '—'}</td>
                      <td className="px-2 py-2 text-muted-foreground">{r.phone ?? '—'}</td>
                      <td className="px-2 py-2 text-muted-foreground">{r.company ?? '—'}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {r.tags.slice(0, 4).map((t) => (
                            <span key={t} className="rounded bg-violet/12 px-1.5 py-0.5 text-xs text-violet">{t}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
