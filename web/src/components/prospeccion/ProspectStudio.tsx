'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, Loader2, Save, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SectionCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Skeleton';
import { getNichePack } from '@/lib/prospect/niches';
import {
  COUNTRIES,
  DEFAULT_LIMIT,
  mobileDetectable,
  type AgentReply,
  type ChatTurn,
  type ProspectFilters,
  type ProspectResult,
  type SavedProspect,
} from '@/lib/prospect/types';
import { AvatarChat } from './AvatarChat';
import { FiltersPanel } from './FiltersPanel';
import { ResultsTable } from './ResultsTable';
import { SavedProspects } from './SavedProspects';

type Seller = { id: string; name: string };

interface SearchRun {
  results: ProspectResult[];
  totalMatched: number;
  requestsUsed: number;
  discarded: {
    withWebsite: number;
    noInstagram: number;
    noLinkedin: number;
    noWhatsapp: number;
    lowRating: number;
    lowScore: number;
    excludedName: number;
  };
  truncated: boolean;
}

const MANUAL_FILTERS: ProspectFilters = {
  queries: [],
  areas: [],
  country: 'AR',
  niche: 'generico',
  requireNoWebsite: true,
  requireInstagram: false,
  requireLinkedin: false,
  requireWhatsapp: true,
  minScore: 35,
  minRating: null,
  limit: DEFAULT_LIMIT,
};

export function ProspectStudio({
  userId,
  isSuperadmin,
  sellers,
}: {
  userId: string;
  isSuperadmin: boolean;
  sellers: Seller[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);

  const [filters, setFilters] = useState<ProspectFilters | null>(null);
  const [icpSummary, setIcpSummary] = useState<string | null>(null);

  const [searching, setSearching] = useState(false);
  const [run, setRun] = useState<SearchRun | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [taken, setTaken] = useState<Map<string, string>>(new Map());

  const [saving, setSaving] = useState(false);
  const [savedProspects, setSavedProspects] = useState<SavedProspect[]>([]);
  const [promoting, setPromoting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [assignee, setAssignee] = useState(isSuperadmin ? '' : userId);

  const selectableCount = useMemo(
    () => (run?.results ?? []).filter((r) => !taken.has(r.googlePlaceId)).length,
    [run, taken],
  );

  /** Marca cuáles de estos negocios ya tiene guardados alguien (atraviesa RLS por RPC). */
  const loadTakenStatus = useCallback(
    async (results: ProspectResult[]) => {
      if (results.length === 0) {
        setTaken(new Map());
        return;
      }
      const { data, error } = await supabase.rpc('prospect_import_status', {
        p_place_ids: results.map((r) => r.googlePlaceId),
      });
      if (error) {
        console.error(error);
        return;
      }
      setTaken(new Map(Object.entries((data ?? {}) as Record<string, string>)));
    },
    [supabase],
  );

  async function sendMessage(message: string) {
    const next: ChatTurn[] = [...turns, { role: 'user', content: message }];
    setTurns(next);
    setDraft('');
    setThinking(true);
    try {
      const res = await fetch('/api/prospect/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns: next }),
      });
      const data = (await res.json()) as AgentReply & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'error');

      setTurns([...next, { role: 'assistant', content: data.message }]);
      if (data.filters) {
        setFilters(data.filters);
        setIcpSummary(data.icpSummary);
      }
      if (data.fallback) {
        toast.info('Turbo corre en modo guiado: falta configurar la API key de OpenRouter.');
      }
    } catch (error) {
      setTurns(next);
      toast.error(error instanceof Error ? error.message : 'No se pudo hablar con Turbo.');
    } finally {
      setThinking(false);
    }
  }

  async function runSearch() {
    if (!filters) return;
    setSearching(true);
    setSelected(new Set());
    setSavedProspects([]);
    try {
      const res = await fetch('/api/prospect/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters }),
      });
      const data = (await res.json()) as SearchRun & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'No se pudo buscar.');

      setRun(data);
      await loadTakenStatus(data.results);

      if (data.results.length === 0) {
        toast.info('La búsqueda no devolvió candidatos. Probá aflojar las señales exigidas.');
      } else {
        toast.success(`${data.results.length} candidatos encontrados.`);
      }
      if (data.truncated) {
        toast.warning('Se alcanzó el tope de consultas por corrida: hay zonas sin recorrer.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo buscar.');
    } finally {
      setSearching(false);
    }
  }

  function toggle(placeId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  }

  function toggleAll() {
    const selectable = (run?.results ?? [])
      .filter((r) => !taken.has(r.googlePlaceId))
      .map((r) => r.googlePlaceId);
    setSelected((prev) =>
      selectable.length > 0 && selectable.every((id) => prev.has(id))
        ? new Set()
        : new Set(selectable),
    );
  }

  /** Paso explícito: recién acá los resultados dejan de ser efímeros. */
  async function saveSelected() {
    if (!run || !filters || selected.size === 0) return;
    setSaving(true);
    try {
      const rows = run.results.filter(
        (r) => selected.has(r.googlePlaceId) && !taken.has(r.googlePlaceId),
      );
      // Puede quedar vacío si entre la selección y el guardado otro usuario tomó
      // esos negocios. Sin este corte se insertaría una búsqueda vacía y se
      // llamaría a `.insert([])`, que no tiene sentido.
      if (rows.length === 0) {
        toast.info('Los seleccionados ya fueron guardados por otra persona.');
        setSelected(new Set());
        return;
      }

      const { data: search, error: searchError } = await supabase
        .from('prospect_searches')
        .insert({
          created_by: userId,
          icp_summary: icpSummary,
          filters,
          results_count: run.totalMatched,
          saved_count: rows.length,
        })
        .select('id')
        .single();
      if (searchError) throw searchError;

      const { data: inserted, error } = await supabase
        .from('prospects')
        .insert(
          rows.map((r) => ({
            business_name: r.businessName,
            address: r.address,
            area: r.area,
            country: filters.country,
            niche: filters.niche,
            phone: r.phone,
            whatsapp_phone: r.whatsappPhone,
            website: r.website,
            instagram: r.instagram,
            linkedin: r.linkedin,
            maps_url: r.mapsUrl,
            google_place_id: r.googlePlaceId,
            rating: r.rating,
            reviews_count: r.reviewsCount,
            photos_count: r.photosCount,
            has_own_website: r.hasOwnWebsite,
            score: r.score,
            search_id: search.id,
            created_by: userId,
          })),
        )
        .select('id, google_place_id');
      if (error) throw error;

      // Se guarda la fila completa (no solo el id) para poder mostrar y
      // enriquecer los prospectos sin volver a consultarlos.
      const byPlaceId = new Map(rows.map((r) => [r.googlePlaceId, r]));
      setSavedProspects(
        (inserted ?? []).map((row) => {
          const source = byPlaceId.get(row.google_place_id as string);
          return {
            id: row.id as string,
            businessName: source?.businessName ?? '(sin nombre)',
            instagram: source?.instagram ?? null,
            score: source?.score ?? null,
            igFollowers: null,
            igActivity: null,
            enrichmentStatus: null,
          };
        }),
      );
      setTaken((prev) => {
        const next = new Map(prev);
        for (const row of rows) next.set(row.googlePlaceId, 'vos');
        return next;
      });
      setSelected(new Set());
      // Con acción a "Guardados": guardar y no volver a verlos nunca más era
      // justamente el problema. El aviso es el momento en que el usuario está
      // mirando, así que es el mejor lugar para decirle dónde quedaron.
      toast.success(`${inserted?.length ?? 0} prospectos guardados.`, {
        description: 'Quedan en Guardados hasta que los asignes a un vendedor.',
        action: {
          label: 'Ver guardados',
          onClick: () => router.push('/prospeccion/guardados'),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al guardar.';
      toast.error(
        message.includes('duplicate')
          ? 'Alguno de esos negocios ya estaba guardado por otra persona.'
          : `Error al guardar: ${message}`,
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * Paso opcional: traer datos reales del Instagram de los prospectos guardados.
   * Va después del guardado a propósito — cada consulta a Apify se paga, así que
   * solo se corre sobre los que el usuario decidió conservar.
   */
  async function enrichSaved() {
    const withInstagram = savedProspects.filter((p) => p.instagram);
    if (withInstagram.length === 0) {
      toast.info('Ninguno de estos prospectos tiene Instagram para consultar.');
      return;
    }
    setEnriching(true);
    try {
      const res = await fetch('/api/prospect/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectIds: withInstagram.map((p) => p.id) }),
      });
      const data = (await res.json()) as {
        enriched?: number;
        profiles?: {
          handle: string;
          status: SavedProspect['enrichmentStatus'];
          followers: number | null;
          activity: SavedProspect['igActivity'];
        }[];
        error?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'No se pudo enriquecer.');

      const byHandle = new Map((data.profiles ?? []).map((p) => [p.handle, p]));
      setSavedProspects((prev) =>
        prev.map((p) => {
          const found = p.instagram ? byHandle.get(p.instagram.toLowerCase()) : undefined;
          if (!found) return p;
          return {
            ...p,
            igFollowers: found.followers,
            igActivity: found.activity,
            enrichmentStatus: found.status,
          };
        }),
      );

      if (data.message) toast.info(data.message);
      else toast.success(`${data.enriched ?? 0} perfiles de Instagram consultados.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo enriquecer.');
    } finally {
      setEnriching(false);
    }
  }

  /** Segundo paso, opcional: los prospectos guardados entran al circuito comercial. */
  async function promoteSaved() {
    if (savedProspects.length === 0) return;
    if (!assignee) {
      toast.error('Elegí a qué vendedor asignar los leads.');
      return;
    }
    setPromoting(true);
    try {
      const { data, error } = await supabase.rpc('promote_prospects', {
        p_prospect_ids: savedProspects.map((p) => p.id),
        p_assigned_to: assignee,
      });
      if (error) throw error;
      const result = (data ?? {}) as { promoted?: number; skipped?: number };
      toast.success(
        `${result.promoted ?? 0} prospectos promovidos a clientes${
          result.skipped ? ` (${result.skipped} salteados)` : ''
        }.`,
      );
      setSavedProspects([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo promover.');
    } finally {
      setPromoting(false);
    }
  }

  // El pack "generico" no aporta términos: sin queries escritas la búsqueda
  // fallaría del lado del servidor, así que el botón no debe estar habilitado.
  const effectiveQueries = filters
    ? filters.queries.length > 0
      ? filters.queries
      : getNichePack(filters.niche).queries
    : [];
  const missingQueries = Boolean(filters) && effectiveQueries.length === 0;
  const searchDisabled = !filters || filters.areas.length === 0 || missingQueries || searching;

  const searchHint = !filters
    ? null
    : filters.areas.length === 0
      ? 'Agregá al menos una zona para poder buscar.'
      : missingQueries
        ? 'Agregá al menos un término de búsqueda (ej. "inmobiliaria").'
        : !mobileDetectable(filters.country) && filters.requireWhatsapp
          ? `En ${COUNTRIES[filters.country].name} no se puede distinguir celular de fijo por el número, así que esa señal no filtra nada.`
          : null;

  return (
    <div className="space-y-4">
      {/* El flujo tiene tres momentos y antes no se leían como secuencia: las
          tarjetas parecían independientes. Numerarlas es lo que más ayuda a
          entender por dónde empezar, sobre todo en el teléfono, donde se ven
          una debajo de la otra. */}
      <p className="eyebrow text-muted-foreground">
        / 1 contale a turbo · 2 revisá los filtros · 3 elegí a quién guardar
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="1 · Definí el avatar"
          description="Turbo te ayuda a acotar a quién buscás y propone los filtros."
        >
          <AvatarChat
            turns={turns}
            draft={draft}
            thinking={thinking}
            onDraftChange={setDraft}
            onSend={sendMessage}
          />
        </SectionCard>

        <SectionCard
          title="2 · Filtros de la búsqueda"
          description={icpSummary ?? 'Editá lo que propuso Turbo, o cargalos vos.'}
          action={
            <Button onClick={runSearch} disabled={searchDisabled}>
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {searching ? 'Buscando…' : 'Buscar'}
            </Button>
          }
        >
          {filters ? (
            <>
              <FiltersPanel filters={filters} onChange={setFilters} disabled={searching} />
              {searchHint && (
                <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  {searchHint}
                </p>
              )}
            </>
          ) : (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Todavía no hay una búsqueda propuesta. Contale a Turbo a quién buscás, o cargá
                los filtros a mano.
              </p>
              <Button variant="outline" onClick={() => setFilters(MANUAL_FILTERS)}>
                <SlidersHorizontal className="h-4 w-4" /> Cargar filtros a mano
              </Button>
            </div>
          )}
        </SectionCard>
      </div>

      {searching && (
        <SectionCard title="Buscando candidatos…">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </SectionCard>
      )}

      {!searching && run && (
        <SectionCard
          title={`3 · ${run.results.length} candidatos${
            run.totalMatched > run.results.length ? ` de ${run.totalMatched} que dieron match` : ''
          }`}
          description={`Descartados en el camino: ${run.discarded.withWebsite} con web propia, ${run.discarded.noWhatsapp} sin celular, ${run.discarded.noInstagram} sin Instagram, ${run.discarded.noLinkedin} sin LinkedIn, ${run.discarded.lowRating} bajo el rating mínimo, ${run.discarded.lowScore} bajo el score mínimo, ${run.discarded.excludedName} fuera de rubro. ${run.requestsUsed} consultas a Places.`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {selected.size > 0 ? `${selected.size} seleccionados` : 'Ninguno seleccionado'}
              </span>
              <Button variant="outline" onClick={toggleAll} disabled={selectableCount === 0}>
                {selected.size >= selectableCount && selectableCount > 0
                  ? 'Deseleccionar'
                  : `Seleccionar todos (${selectableCount})`}
              </Button>
              <Button onClick={saveSelected} disabled={saving || selected.size === 0}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Guardando…' : `Migrar a Supabase (${selected.size})`}
              </Button>
            </div>
          }
        >
          <ResultsTable
            results={run.results}
            selected={selected}
            taken={taken}
            onToggle={toggle}
            onToggleAll={toggleAll}
          />
        </SectionCard>
      )}

      {savedProspects.length > 0 && (
        <SectionCard
          title={`${savedProspects.length} prospectos guardados`}
          description="Ya están en Supabase. Podés traer datos de su Instagram y, cuando quieras que un vendedor los trabaje, promoverlos a clientes."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={enrichSaved}
                disabled={enriching || savedProspects.every((p) => !p.instagram)}
              >
                {enriching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {enriching ? 'Consultando…' : 'Enriquecer con Instagram'}
              </Button>
              {isSuperadmin ? (
                <Select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="w-auto min-w-40"
                >
                  <option value="">Asignar a…</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <span className="text-xs text-muted-foreground">Se asignan a tu lista</span>
              )}
              <Button onClick={promoteSaved} disabled={promoting || !assignee}>
                {promoting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {promoting ? 'Promoviendo…' : 'Promover a clientes'}
              </Button>
            </div>
          }
        >
          <SavedProspects prospects={savedProspects} />
          <p className="mt-3 text-sm text-muted-foreground">
            Los clientes creados desde acá quedan con origen <code>hunter</code> y no se sincronizan
            con GHL. Esta lista es solo de esta corrida:{' '}
            <Link href="/prospeccion/guardados" className="text-primary-deep hover:underline">
              ver todos los guardados
            </Link>
            .
          </p>
        </SectionCard>
      )}
    </div>
  );
}
