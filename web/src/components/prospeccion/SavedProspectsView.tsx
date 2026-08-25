'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, Loader2, Mail, PenLine, Search, Sparkles, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { SectionCard } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { esSitioLeible } from '@/lib/prospect/sitios';
import type { SavedProspect } from '@/lib/prospect/types';
import { ApproachDialog } from './ApproachDialog';
import { SavedProspects } from './SavedProspects';

type Seller = { id: string; name: string };

/** De a cuántos se muestran. Mismo criterio que la tabla de clientes (WEB-8). */
const PAGE_SIZE = 20;

type StatusFilter = 'new' | 'promoted' | 'discarded' | 'all';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'new', label: 'Sin asignar' },
  { value: 'promoted', label: 'Ya asignados' },
  { value: 'discarded', label: 'Descartados' },
  { value: 'all', label: 'Todos' },
];

export function SavedProspectsView({
  prospects,
  sellers,
  isSuperadmin,
  userId,
}: {
  prospects: SavedProspect[];
  sellers: Seller[];
  isSuperadmin: boolean;
  userId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [status, setStatus] = useState<StatusFilter>('new');
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Un vendedor solo puede asignarse a sí mismo: el RPC lo rechaza de todas
  // formas (0028:189), así que ofrecer el selector sería mentirle.
  const [assignee, setAssignee] = useState(isSuperadmin ? '' : userId);
  const [working, setWorking] = useState<'promote' | 'enrich' | 'contacts' | 'discard' | null>(
    null,
  );
  /** Prospecto para el que se está redactando el primer mensaje. */
  const [approachFor, setApproachFor] = useState<SavedProspect | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prospects.filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      if (!q) return true;
      return (
        p.businessName.toLowerCase().includes(q) ||
        (p.area ?? '').toLowerCase().includes(q) ||
        (p.instagram ?? '').toLowerCase().includes(q)
      );
    });
  }, [prospects, status, query]);

  const page = filtered.slice(0, visible);
  const selectedIds = useMemo(
    // Solo lo seleccionado que además está a la vista: si cambiás el filtro con
    // cosas tildadas, no queremos actuar sobre lo que ya no se ve.
    () => page.filter((p) => selected.has(p.id)).map((p) => p.id),
    [page, selected],
  );
  const selectedProspects = page.filter((p) => selected.has(p.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const allOnPage = page.every((p) => prev.has(p.id));
      const next = new Set(prev);
      for (const p of page) {
        if (allOnPage) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  }

  function resetFilter(next: StatusFilter) {
    setStatus(next);
    setVisible(PAGE_SIZE);
    setSelected(new Set());
  }

  /** Prospecto → cliente asignado. Reusa el RPC que ya existe y es atómico. */
  async function promote() {
    if (selectedIds.length === 0) return;
    if (!assignee) {
      toast.error('Elegí a qué vendedor asignar los prospectos.');
      return;
    }
    setWorking('promote');
    try {
      const { data, error } = await supabase.rpc('promote_prospects', {
        p_prospect_ids: selectedIds,
        p_assigned_to: assignee,
      });
      if (error) throw error;
      const result = (data ?? {}) as { promoted?: number; skipped?: number };
      const promoted = result.promoted ?? 0;
      const skipped = result.skipped ?? 0;

      // El salteo se explica siempre: sin el motivo, "2 promovidos" sobre 50
      // seleccionados parece un error del sistema.
      if (promoted === 0) {
        toast.warning(
          skipped > 0
            ? `No se promovió ninguno: los ${skipped} seleccionados ya estaban asignados o descartados.`
            : 'No se promovió ninguno.',
        );
      } else {
        toast.success(
          skipped > 0
            ? `${promoted} promovidos a clientes. ${skipped} salteados: ya estaban asignados o descartados.`
            : `${promoted} promovidos a clientes. Ya aparecen en Clientes.`,
        );
      }
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo promover.');
    } finally {
      setWorking(null);
    }
  }

  /**
   * Lee el sitio web de los seleccionados para sacar email y WhatsApp.
   *
   * Google Maps no publica el email del negocio: publica el sitio. Entrar a
   * leerlo es lo único que llena ese hueco, y sin email el lead le llega al
   * vendedor sin dirección adonde escribirle.
   */
  async function enrichContacts() {
    const conSitio = selectedProspects.filter((p) => p.website && esSitioLeible(p.website));
    if (conSitio.length === 0) {
      toast.info(
        'Ninguno de los seleccionados tiene un sitio web para leer: los que solo tienen un link de WhatsApp o de red social no sirven.',
      );
      return;
    }
    setWorking('contacts');
    try {
      const res = await fetch('/api/prospect/enrich-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectIds: conSitio.map((p) => p.id) }),
      });
      const data = (await res.json()) as {
        enriched?: number;
        overflow?: number;
        maxPerRun?: number;
        filled?: { email: number; instagram: number; linkedin: number };
        error?: string;
        message?: string;
        budgetWarning?: string | null;
      };
      if (!res.ok) throw new Error(data.error ?? 'No se pudieron buscar los contactos.');

      if (data.message) {
        toast.info(data.message);
      } else {
        // El número que importa es cuántos emails aparecieron: leer 20 sitios y
        // encontrar 0 es un resultado, no un éxito.
        const emails = data.filled?.email ?? 0;
        toast.success(`${data.enriched ?? 0} sitios leídos.`, {
          description: [
            emails > 0 ? `${emails} emails nuevos` : 'ningún email nuevo',
            data.overflow
              ? `Quedaron ${data.overflow} afuera: se leen de a ${data.maxPerRun} por vez.`
              : null,
          ]
            .filter(Boolean)
            .join('. '),
        });
      }
      if (data.budgetWarning) toast.warning(data.budgetWarning);
      // Igual que en el enriquecimiento de Instagram: el endpoint ya escribió,
      // releer es más simple y más correcto que mezclar en memoria.
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron buscar los contactos.');
    } finally {
      setWorking(null);
    }
  }

  /** Trae seguidores y última publicación de Instagram. Cada consulta se paga. */
  async function enrich() {
    const withInstagram = selectedProspects.filter((p) => p.instagram);
    if (withInstagram.length === 0) {
      toast.info('Ninguno de los seleccionados tiene Instagram para consultar.');
      return;
    }
    setWorking('enrich');
    try {
      const res = await fetch('/api/prospect/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectIds: withInstagram.map((p) => p.id) }),
      });
      const data = (await res.json()) as {
        enriched?: number;
        overflow?: number;
        maxPerRun?: number;
        error?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'No se pudo enriquecer.');
      if (data.message) {
        toast.info(data.message);
      } else if (data.overflow) {
        // Decir el recorte: si no, "25 consultados" sobre 50 seleccionados
        // parece que terminó y quedarían 25 sin datos para siempre.
        toast.warning(`${data.enriched ?? 0} perfiles consultados.`, {
          description: `Quedaron ${data.overflow} afuera: se consultan de a ${data.maxPerRun} por vez. Volvé a seleccionarlos para seguir.`,
        });
      } else {
        toast.success(`${data.enriched ?? 0} perfiles de Instagram consultados.`);
      }
      // El endpoint ya escribió en la base: releer es más simple y más correcto
      // que mezclar la respuesta en memoria.
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo enriquecer.');
    } finally {
      setWorking(null);
    }
  }

  /**
   * Descartar es un UPDATE, no un DELETE, aunque la policy de delete exista:
   * borrar liberaría el google_place_id y el mismo negocio volvería a aparecer
   * como nuevo en la próxima búsqueda, rompiendo el dedupe.
   */
  async function discard() {
    if (selectedIds.length === 0) return;
    setWorking('discard');
    try {
      const { data, error } = await supabase
        .from('prospects')
        .update({ status: 'discarded' })
        .in('id', selectedIds)
        .eq('status', 'new')
        .select('id');
      if (error) throw error;
      const count = data?.length ?? 0;
      if (count === 0) {
        toast.warning('No se descartó ninguno: los seleccionados ya estaban asignados.');
      } else {
        toast.success(`${count} descartados.`);
      }
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo descartar.');
    } finally {
      setWorking(null);
    }
  }

  const busy = working !== null;
  const nothingSelected = selectedIds.length === 0;

  if (prospects.length === 0) {
    return (
      <EmptyState
        icon={<Search className="h-5 w-5" />}
        title="Todavía no guardaste prospectos"
        description="Cuando corras una búsqueda y guardes candidatos, van a quedar acá esperando que los asignes."
        action={
          <Link
            href="/prospeccion"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            Ir a buscar
          </Link>
        }
      />
    );
  }

  return (
    <SectionCard
      title="Prospectos guardados"
      description="Lo que guardaste en búsquedas anteriores. Desde acá los asignás a un vendedor: recién ahí entran al circuito comercial como clientes."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Select
              value={status}
              onChange={(e) => resetFilter(e.target.value as StatusFilter)}
              aria-label="Filtrar por estado"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-48 flex-1">
            <Input
              value={query}
              placeholder="Buscar por nombre, zona o Instagram"
              onChange={(e) => {
                setQuery(e.target.value);
                setVisible(PAGE_SIZE);
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'prospecto' : 'prospectos'}
            {selectedIds.length > 0 && ` · ${selectedIds.length} seleccionados`}
          </p>
        </div>

        {/* Acciones en masa. Se muestran siempre para que se sepa que existen,
            deshabilitadas mientras no haya nada tildado. */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
          {isSuperadmin ? (
            <div className="w-52">
              <Select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                aria-label="Asignar a"
              >
                <option value="">Asignar a…</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Se asignan a tu lista.</span>
          )}

          <Button onClick={promote} disabled={busy || nothingSelected}>
            {working === 'promote' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Asignar ({selectedIds.length})
          </Button>

          {/* Dos botones separados: cada corrida se paga aparte, y juntarlas
              obligaría a pagar Instagram para negocios que solo interesaban
              por el email. */}
          <Button
            variant="outline"
            onClick={enrichContacts}
            disabled={busy || nothingSelected}
            title="Lee el sitio web de cada uno para sacar el email y el WhatsApp que publican"
          >
            {working === 'contacts' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Buscar email
          </Button>

          <Button variant="outline" onClick={enrich} disabled={busy || nothingSelected}>
            {working === 'enrich' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Enriquecer Instagram
          </Button>

          {/* De a uno a propósito: es lo único que se paga por lead, y el
              vendedor contacta a unos pocos por día, no a la lista entera. */}
          <Button
            variant="outline"
            onClick={() => setApproachFor(selectedProspects[0] ?? null)}
            disabled={busy || selectedIds.length !== 1}
            title={
              selectedIds.length === 1
                ? 'Turbo redacta el primer mensaje para este prospecto'
                : 'Elegí un solo prospecto'
            }
          >
            <PenLine className="h-4 w-4" />
            Primer mensaje
          </Button>

          <Button variant="ghost" onClick={discard} disabled={busy || nothingSelected}>
            {working === 'discard' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            Descartar
          </Button>
        </div>

        {approachFor && (
          <ApproachDialog
            prospectId={approachFor.id}
            prospectName={approachFor.businessName}
            rubro={approachFor.niche ?? null}
            onClose={() => setApproachFor(null)}
          />
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="Nada con ese filtro"
            description="Probá con otro estado o limpiá la búsqueda."
          />
        ) : (
          <>
            <SavedProspects
              prospects={page}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              showOwner={isSuperadmin}
            />
            {visible < filtered.length && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  Cargar más ({filtered.length - visible} restantes)
                </Button>
              </div>
            )}
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Asignar convierte el prospecto en cliente y lo manda a la lista del vendedor. No se
          duplica: lo ya asignado se saltea. El vendedor <strong>no recibe una notificación</strong>{' '}
          por cada uno — lo ve al abrir su lista de clientes.
        </p>
      </div>
    </SectionCard>
  );
}
