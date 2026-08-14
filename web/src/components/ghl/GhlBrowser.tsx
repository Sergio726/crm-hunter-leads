'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2, Tag, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SectionCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { TagCombobox } from './TagCombobox';

type Seller = { id: string; name: string };
type GhlResult = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  tags: string[];
};
const SELLER_STORAGE_KEY = 'ghl-import-seller-id';

export function GhlBrowser({
  sellers = [],
  selfAssignId,
}: {
  sellers?: Seller[];
  /** Modo vendedor: los contactos se importan siempre a este usuario (sin selector). */
  selfAssignId?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tags, setTags] = useState<string[]>([]);
  const [tag, setTag] = useState('');
  const [results, setResults] = useState<GhlResult[]>([]);
  // crm_contact_id → nombre del vendedor que ya lo tiene
  const [imported, setImported] = useState<Map<string, string>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sellerId, setSellerId] = useState(selfAssignId ?? '');
  const [hideImported, setHideImported] = useState(false);
  const [loadingTags, setLoadingTags] = useState(true);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searched, setSearched] = useState(false);

  const importableResults = useMemo(
    () => results.filter((r) => !imported.has(r.id)),
    [results, imported],
  );

  const visibleResults = useMemo(
    () => (hideImported ? importableResults : results),
    [hideImported, importableResults, results],
  );

  const selectedImportable = useMemo(
    () => [...selected].filter((id) => !imported.has(id)),
    [selected, imported],
  );

  useEffect(() => {
    fetch('/api/ghl/tags')
      .then((r) => r.json())
      .then((d) => setTags(d.tags ?? []))
      .catch(() => toast.error('No se pudieron cargar las tags de GHL.'))
      .finally(() => setLoadingTags(false));
  }, []);

  useEffect(() => {
    if (selfAssignId) return;
    const saved = sessionStorage.getItem(SELLER_STORAGE_KEY);
    if (saved && sellers.some((s) => s.id === saved)) setSellerId(saved);
  }, [sellers, selfAssignId]);

  const loadImportedStatus = useCallback(
    async (contacts: GhlResult[]) => {
      if (contacts.length === 0) {
        setImported(new Map());
        return;
      }

      // RPC security definer: ve TODOS los importados (el SELECT directo, por RLS,
      // le mostraría al vendedor solo los suyos y los de otros parecerían "nuevos").
      const ids = contacts.map((c) => c.id);
      const { data, error } = await supabase.rpc('ghl_import_status', { p_crm_ids: ids });

      if (error) {
        console.error(error);
        return;
      }

      setImported(new Map(Object.entries((data ?? {}) as Record<string, string>)));
    },
    [supabase],
  );

  const searchByTag = useCallback(
    async (selectedTag: string) => {
      if (!selectedTag) {
        setResults([]);
        setImported(new Map());
        setSearched(false);
        setSelected(new Set());
        return;
      }

      setSearching(true);
      setSelected(new Set());
      try {
        const r = await fetch('/api/ghl/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: selectedTag }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? 'error');
        const contacts: GhlResult[] = d.contacts ?? [];
        setResults(contacts);
        setSearched(true);
        await loadImportedStatus(contacts);
      } catch {
        toast.error('No se pudo buscar en GHL. Reintentá en un momento.');
        setResults([]);
        setImported(new Map());
        setSearched(true);
      } finally {
        setSearching(false);
      }
    },
    [loadImportedStatus],
  );

  useEffect(() => {
    searchByTag(tag);
  }, [tag, searchByTag]);

  function handleSellerChange(nextSellerId: string) {
    setSellerId(nextSellerId);
    if (nextSellerId) sessionStorage.setItem(SELLER_STORAGE_KEY, nextSellerId);
    else sessionStorage.removeItem(SELLER_STORAGE_KEY);
  }

  function toggle(id: string) {
    if (imported.has(id)) return;
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAllImportable() {
    const importableIds = importableResults.map((r) => r.id);
    setSelected((s) =>
      importableIds.length > 0 && importableIds.every((id) => s.has(id))
        ? new Set()
        : new Set(importableIds),
    );
  }

  function toggleAllVisible() {
    const visibleImportable = visibleResults.filter((r) => !imported.has(r.id)).map((r) => r.id);
    setSelected((s) =>
      visibleImportable.length > 0 && visibleImportable.every((id) => s.has(id))
        ? new Set()
        : new Set(visibleImportable),
    );
  }

  async function importSelected() {
    if (!sellerId) return toast.error('Elegí a qué vendedor asignar los contactos.');
    if (selectedImportable.length === 0) return toast.error('Seleccioná al menos un contacto nuevo.');
    setImporting(true);
    const assignName = selfAssignId ? 'tu lista' : (sellers.find((s) => s.id === sellerId)?.name ?? 'vendedor');
    const rows = results
      .filter((r) => selected.has(r.id) && !imported.has(r.id))
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
      .select('id, crm_contact_id, assigned_to');
    setImporting(false);
    if (error) return toast.error('Error al importar: ' + error.message);

    const inserted = data?.length ?? 0;
    const skipped = rows.length - inserted;

    setImported((prev) => {
      const next = new Map(prev);
      for (const row of rows) {
        if (!next.has(row.crm_contact_id)) {
          next.set(row.crm_contact_id, assignName);
        }
      }
      return next;
    });

    if (inserted === 0) {
      toast.error('Esos contactos ya fueron importados por otro vendedor.');
    } else {
      toast.success(
        `Importados ${inserted}${skipped > 0 ? ` (${skipped} ya los tenía otro vendedor)` : ''} → ${assignName}`,
      );
    }
    setSelected(new Set());
    if (skipped > 0) loadImportedStatus(results);
  }

  const importedCount = results.length - importableResults.length;
  const allVisibleImportableSelected =
    visibleResults.filter((r) => !imported.has(r.id)).length > 0 &&
    visibleResults.filter((r) => !imported.has(r.id)).every((r) => selected.has(r.id));

  const importBar =
    results.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {selectedImportable.length > 0
            ? `${selectedImportable.length} para importar`
            : 'Ninguno seleccionado'}
          {importedCount > 0 ? ` · ${importedCount} ya importado(s)` : ''}
        </span>
        {selfAssignId ? (
          <span className="text-xs font-medium text-muted-foreground">Se importan a tu lista</span>
        ) : (
          <Select value={sellerId} onChange={(e) => handleSellerChange(e.target.value)} className="w-auto min-w-40">
            <option value="">Asignar a…</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        )}
        <Button
          onClick={importSelected}
          disabled={importing || selectedImportable.length === 0 || !sellerId}
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {importing ? 'Importando…' : `Importar (${selectedImportable.length})`}
        </Button>
      </div>
    ) : undefined;

  return (
    <div className="space-y-4">
      <SectionCard
        title="Traer contactos de GHL"
        description="Escribí o elegí una etiqueta y los contactos se cargan solos. Marcá los nuevos para importarlos al seguimiento."
      >
        <TagCombobox
          tags={tags}
          value={tag}
          onChange={setTag}
          loading={loadingTags}
          searching={searching}
          disabled={searching}
        />
      </SectionCard>

      {!searched && !searching && (
        <EmptyState
          icon={<Tag className="h-5 w-5" />}
          title="Elegí una etiqueta para empezar"
          description="Los contactos de GHL con esa tag aparecerán acá para que los importes al seguimiento."
        />
      )}

      {searching && (
        <SectionCard title="Buscando contactos…">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </SectionCard>
      )}

      {searched && !searching && (
        <SectionCard
          title={`${results.length} contacto(s) con la tag “${tag}”`}
          action={importBar}
        >
          {results.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No hay contactos con esa etiqueta"
              description="Probá con otra tag o revisá en GHL que existan contactos etiquetados."
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="default"
                  onClick={toggleAllImportable}
                  disabled={importableResults.length === 0}
                >
                  {importableResults.every((r) => selected.has(r.id)) && importableResults.length > 0
                    ? 'Deseleccionar todos'
                    : `Seleccionar todos (${importableResults.length})`}
                </Button>
                {importedCount > 0 && (
                  <Button
                    variant={hideImported ? 'default' : 'outline'}
                    size="default"
                    onClick={() => setHideImported((v) => !v)}
                  >
                    {hideImported ? 'Mostrar importados' : `Ocultar importados (${importedCount})`}
                  </Button>
                )}
              </div>

              {visibleResults.length === 0 ? (
                <EmptyState
                  title="Todos los contactos ya están importados"
                  description="Desactivá “Ocultar importados” para verlos o elegí otra etiqueta."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
                        <th className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={allVisibleImportableSelected}
                            onChange={toggleAllVisible}
                            disabled={visibleResults.every((r) => imported.has(r.id))}
                            aria-label="Seleccionar todos visibles"
                          />
                        </th>
                        <th className="px-3 py-2.5 font-medium">Nombre</th>
                        <th className="px-3 py-2.5 font-medium">Estado</th>
                        <th className="px-3 py-2.5 font-medium">Email</th>
                        <th className="px-3 py-2.5 font-medium">Teléfono</th>
                        <th className="px-3 py-2.5 font-medium">Empresa</th>
                        <th className="px-3 py-2.5 font-medium">Tags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleResults.map((r) => {
                        const isImported = imported.has(r.id);
                        const isSelected = selected.has(r.id);
                        const assignedName = isImported ? (imported.get(r.id) ?? null) : null;

                        return (
                          <tr
                            key={r.id}
                            onClick={() => toggle(r.id)}
                            className={`border-b border-border/60 transition-colors ${
                              isImported
                                ? 'bg-muted/20 opacity-75'
                                : `cursor-pointer hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`
                            }`}
                          >
                            <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isImported}
                                onChange={() => toggle(r.id)}
                                aria-label={`Seleccionar ${r.name}`}
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              {isImported ? (
                                <span className="block px-2 py-1.5 font-medium text-muted-foreground">{r.name}</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggle(r.id);
                                  }}
                                  className="block w-full rounded-md px-2 py-1.5 text-left font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary hover:underline"
                                >
                                  {r.name}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {isImported ? (
                                <Badge tone="success" title={assignedName ? `Asignado a ${assignedName}` : undefined}>
                                  Importado{assignedName ? ` · ${assignedName}` : ''}
                                </Badge>
                              ) : (
                                <Badge tone="neutral">Nuevo</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">{r.email ?? '—'}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{r.phone ?? '—'}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{r.company ?? '—'}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {r.tags.slice(0, 4).map((t) => (
                                  <span key={t} className="rounded bg-violet/12 px-1.5 py-0.5 text-xs text-violet">{t}</span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </SectionCard>
      )}
    </div>
  );
}
