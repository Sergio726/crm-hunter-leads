'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, Loader2, Save, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SectionCard } from '@/components/ui/Card';
import { ExportButton } from '@/components/reportes/ExportButton';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Skeleton';
import { getNichePack } from '@/lib/prospect/niches';
import { rememberOffer } from '@/lib/prospect/offer';
import type { Budget } from '@/lib/prospect/budget';
import type { RunFacts } from '@/lib/prospect/run-summary';
import {
  COUNTRIES,
  DEFAULT_LIMIT,
  GRADE_LABELS,
  gradeFor,
  linkedinUrl,
  mobileDetectable,
  type AgentReply,
  type ChatTurn,
  type ProspectFilters,
  type SignalField,
  type ProspectResult,
  type SavedProspect,
} from '@/lib/prospect/types';
import { AvatarChat } from './AvatarChat';
import { FiltersPanel } from './FiltersPanel';
import { HuntPlan } from './HuntPlan';
import { ProviderNotice } from './ProviderNotice';
import { problemFrom } from '@/lib/prospect/provider-problem';
import { RunReport } from './RunReport';
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
    excludedName: number;
  };
  truncated: boolean;
  /** Explicación de por qué hubo que ensanchar la búsqueda. Ver `places.ts`. */
  relaxed?: string | null;
}

const MANUAL_FILTERS: ProspectFilters = {
  source: 'google_places',
  queries: [],
  areas: [],
  country: 'AR',
  niche: 'generico',
  // Apagado por defecto: solo tiene sentido si lo que se vende es presencia web.
  requireNoWebsite: false,
  requireInstagram: false,
  requireLinkedin: false,
  requireWhatsapp: true,
  minRating: null,
  limit: DEFAULT_LIMIT,
};

/**
 * De todo lo que se descartó, cuál señal se llevó más puestos.
 *
 * Es lo que convierte un "no encontré nada" en algo accionable: los motivos ya
 * se calculaban en la búsqueda y se mostraban como una fila de números que nadie
 * leía. Devuelve además qué filtro apagar para revertirlo.
 */
function topDiscardReason(d: SearchRun['discarded']): {
  explicacion: string;
  accion: string;
  campo: keyof ProspectFilters;
  valor: boolean | null;
} | null {
  const candidatos = [
    {
      n: d.noLinkedin,
      explicacion: 'les exigí LinkedIn, y Google casi nunca lo publica.',
      accion: 'Sacar esa exigencia',
      campo: 'requireLinkedin' as const,
      valor: false,
    },
    {
      n: d.withWebsite,
      explicacion: 'pedí que no tuvieran web propia, y todos tienen.',
      accion: 'Aceptar los que tienen web',
      campo: 'requireNoWebsite' as const,
      valor: false,
    },
    {
      n: d.noInstagram,
      explicacion: 'les exigí Instagram y no se les detectó ninguno.',
      accion: 'Sacar esa exigencia',
      campo: 'requireInstagram' as const,
      valor: false,
    },
    {
      n: d.noWhatsapp,
      explicacion: 'pedí que el teléfono fuera celular, y ninguno lo parece.',
      accion: 'Aceptar teléfonos fijos',
      campo: 'requireWhatsapp' as const,
      valor: false,
    },
    {
      n: d.lowRating,
      explicacion: 'quedaron por debajo del rating mínimo que puse.',
      accion: 'Sacar el rating mínimo',
      campo: 'minRating' as const,
      valor: null,
    },
  ].filter((c) => c.n > 0);

  if (candidatos.length === 0) return null;
  const peor = candidatos.reduce((a, b) => (b.n > a.n ? b : a));
  return {
    explicacion: `descarté ${peor.n} porque ${peor.explicacion}`,
    accion: peor.accion,
    campo: peor.campo,
    valor: peor.valor,
  };
}

export function ProspectStudio({
  userId,
  isSuperadmin,
  sellers,
  initialBudget,
}: {
  userId: string;
  isSuperadmin: boolean;
  sellers: Seller[];
  /**
   * Saldo leído en el servidor. Viene por prop y no de un efecto al montar:
   * hace falta apenas se dibuja el Plan de Caza, y pedirlo desde el navegador
   * agregaba un viaje y un parpadeo.
   */
  initialBudget?: Budget | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);

  const [filters, setFilters] = useState<ProspectFilters | null>(null);
  const [icpSummary, setIcpSummary] = useState<string | null>(null);
  /** Por que Turbo eligio esa fuente. Se muestra en el Plan de Caza. */
  const [planReason, setPlanReason] = useState<string | null>(null);
  /** Por que exigio cada senal. Se muestra al lado de cada una. */
  const [signalReasons, setSignalReasons] = useState<Partial<
    Record<SignalField, string>
  > | null>(null);
  /** El panel de filtros a mano, cerrado por defecto. */
  const [editandoAMano, setEditandoAMano] = useState(false);
  /** El proveedor no pudo ejecutar (sin credito o tope de corridas). */
  const [providerProblem, setProviderProblem] = useState<string | null>(null);
  /** Respuestas sugeridas por Turbo en su ultimo mensaje. */
  const [chatOptions, setChatOptions] = useState<string[] | null>(null);
  /** Cuanta plata queda. Se muestra al lado del costo en el Plan de Caza. */
  const [budget, setBudget] = useState<Budget | null>(initialBudget ?? null);
  /** Lo que hay que contarle al vendedor de la ultima corrida. */
  const [lastRun, setLastRun] = useState<RunFacts | null>(null);

  const [searching, setSearching] = useState(false);
  /** Perfiles procesados hasta ahora, en las búsquedas que corren en segundo plano. */
  const [searchProgress, setSearchProgress] = useState(0);
  const [run, setRun] = useState<SearchRun | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [taken, setTaken] = useState<Map<string, string>>(new Map());

  const [saving, setSaving] = useState(false);
  const [savedProspects, setSavedProspects] = useState<SavedProspect[]>([]);
  const [promoting, setPromoting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [assignee, setAssignee] = useState(isSuperadmin ? '' : userId);

  const selectableCount = useMemo(
    () => (run?.results ?? []).filter((r) => !taken.has(r.sourceRef)).length,
    [run, taken],
  );

  /**
   * El saldo, al abrir la pantalla y después de cada corrida.
   *
   * Se carga aparte y no bloquea nada: si falla, el Plan de Caza muestra el
   * costo sin el saldo, como antes. Saber cuánto queda es una mejora, no un
   * requisito para poder buscar.
   */
  const loadBudget = useCallback(async () => {
    try {
      const res = await fetch('/api/prospect/budget');
      if (res.ok) setBudget((await res.json()) as Budget);
    } catch {
      // Sin saldo a la vista se sigue trabajando igual.
    }
  }, []);


  /** Marca cuáles de estos negocios ya tiene guardados alguien (atraviesa RLS por RPC). */
  const loadTakenStatus = useCallback(
    async (results: ProspectResult[]) => {
      if (results.length === 0) {
        setTaken(new Map());
        return;
      }
      // Firma nueva por (fuente, referencias). La vieja solo entendía place_ids
      // de Google, así que no podía responder por un perfil de LinkedIn.
      const { data, error } = await supabase.rpc('prospect_import_status', {
        p_source: results[0].source,
        p_refs: results.map((r) => r.sourceRef),
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
    const next: ChatTurn[] = [...turns, { role: 'user', content: message, at: Date.now() }];
    setTurns(next);
    setDraft('');
    // Las opciones del turno anterior dejan de valer apenas el usuario responde:
    // si quedaran, tocaría una respuesta a una pregunta que ya no está en pantalla.
    setChatOptions(null);
    setThinking(true);
    try {
      const res = await fetch('/api/prospect/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns: next, source: filters?.source, lastRun }),
      });
      const data = (await res.json()) as AgentReply & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'error');

      setTurns([...next, { role: 'assistant', content: data.message, at: Date.now() }]);
      setChatOptions(data.options ?? null);
      // La oferta se guarda apenas Turbo la entiende, para que el primer mensaje
      // a cada prospecto no tenga que volver a preguntar "¿qué vendés?".
      if (data.offer) rememberOffer(data.offer);
      if (data.filters) {
        setFilters(data.filters);
        setIcpSummary(data.icpSummary);
        setPlanReason(data.reason ?? null);
        setSignalReasons(data.signalReasons ?? null);
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

  /**
   * Los resultados en formato planilla.
   *
   * Sale del estado en memoria y no de la base porque los resultados NO están
   * persistidos hasta que el usuario guarda (D14): exportar tiene que funcionar
   * también para lo que decidió no guardar, que es justamente el caso de uso.
   */
  const exportRows = useMemo(
    () =>
      (run?.results ?? []).map((r) => ({
        Nombre: r.businessName,
        // Cargo, empresa y email van primero y no al final: para una persona son
        // el dato principal, y hasta ahora el archivo no los llevaba aunque se
        // pagara por traerlos.
        Cargo: r.roleTitle ?? '',
        Empresa: r.companyName ?? '',
        Email: r.email ?? '',
        Calificación: GRADE_LABELS[gradeFor(r.score) ?? 'flojo'],
        Puntaje: r.score,
        Motivos: r.reasons.join(' · '),
        Zona: r.area,
        Dirección: r.address ?? '',
        WhatsApp: r.whatsappPhone ?? '',
        Teléfono: r.phone ?? '',
        Instagram: r.instagram ? `@${r.instagram}` : '',
        LinkedIn: r.linkedin ? linkedinUrl(r.linkedin) : '',
        'Sitio web': r.website ?? '',
        'Tiene web propia': r.hasOwnWebsite ? 'sí' : 'no',
        Rating: r.rating ?? '',
        Reseñas: r.reviewsCount,
        'Ficha de Google': r.mapsUrl ?? '',
        // Va último porque es largo, pero es de donde sale el gancho del primer
        // mensaje: lo que la persona escribió sobre sí misma.
        'Sobre el prospecto': (r.bio ?? '').replace(/\s+/g, ' ').slice(0, 500),
      })),
    [run],
  );

  /**
   * Espera a que termine una búsqueda que corre en segundo plano.
   *
   * LinkedIn tarda minutos y el servidor no puede tenerla en vilo: se pregunta
   * cada pocos segundos hasta que hay resultado. Google Maps no pasa por acá,
   * termina dentro de la misma petición.
   */
  async function waitForRun(runId: string, signal: { cancelled: boolean }): Promise<SearchRun> {
    const INTERVALO_MS = 4000;
    const TOPE_MS = 10 * 60 * 1000;
    const desde = Date.now();

    while (!signal.cancelled) {
      await new Promise((r) => setTimeout(r, INTERVALO_MS));
      if (Date.now() - desde > TOPE_MS) {
        throw new Error('La búsqueda tardó demasiado. Probá con menos resultados.');
      }
      const res = await fetch(`/api/prospect/runs/${runId}`);
      const data = (await res.json()) as {
        status?: string;
        itemsDone?: number;
        itemsTotal?: number;
        result?: SearchRun;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'No se pudo consultar la búsqueda.');
      if (data.status === 'error') throw new Error(data.error ?? 'La búsqueda falló.');
      if (data.status === 'done' && data.result) return data.result;
      setSearchProgress(data.itemsDone ?? 0);
    }
    throw new Error('Búsqueda cancelada.');
  }

  async function runSearch() {
    if (!filters) return;
    setSearching(true);
    setSearchProgress(0);
    setSelected(new Set());
    setSavedProspects([]);
    try {
      let data: SearchRun;

      if (filters.source === 'google_places') {
        const res = await fetch('/api/prospect/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters }),
        });
        const payload = (await res.json()) as SearchRun & { error?: string };
        if (!res.ok) throw new Error(payload.error ?? 'No se pudo buscar.');
        data = payload;
      } else {
        const res = await fetch('/api/prospect/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job: 'search', filters }),
        });
        const started = (await res.json()) as { runId?: string; error?: string };
        if (!res.ok || !started.runId) {
          throw new Error(started.error ?? 'No se pudo arrancar la búsqueda.');
        }
        toast.info('Buscando en segundo plano. Puede tardar unos minutos.');
        data = await waitForRun(started.runId, { cancelled: false });
      }

      setRun(data);
      // Los hechos de la corrida: es lo que después se cuenta en el informe y lo
      // que ve Turbo para poder diagnosticar en vez de decir "no encontré nada".
      setLastRun({
        source: filters.source,
        requested: filters.limit,
        returned: data.results.length,
        totalMatched: data.totalMatched,
        requestsUsed: data.requestsUsed,
        truncated: data.truncated,
        discarded: data.discarded,
      });
      void loadBudget();
      await loadTakenStatus(data.results);

      if (data.relaxed) {
        // La búsqueda no dio nada con el cargo exacto y se reintentó más ancha.
        // Decirlo es obligatorio: los resultados son de una búsqueda distinta a
        // la que se aprobó en el Plan de Caza, y además se pagó una página más.
        toast.info(data.relaxed, { duration: 12000 });
      }

      if (data.results.length === 0) {
        // Antes decía "probá aflojar las señales exigidas": le pedía al usuario
        // que adivine con información que el sistema ya tenía. Ahora se dice
        // CUÁL señal lo dejó en cero y se ofrece sacarla.
        const culpable = topDiscardReason(data.discarded);
        if (culpable && filters) {
          toast.error(`Ninguno pasó el filtro: ${culpable.explicacion}`, {
            duration: 12000,
            action: {
              label: culpable.accion,
              onClick: () => {
                setFilters({ ...filters, [culpable.campo]: culpable.valor } as ProspectFilters);
                toast.success('Listo, saqué esa exigencia. Revisá el plan y volvé a buscar.');
              },
            },
          });
        } else {
          // No descartó nada y aun así vino vacío: el proveedor no devolvió
          // nada. En LinkedIn eso casi siempre es la zona, que es un filtro de
          // coincidencia exacta y no perdona una aclaración de más.
          toast.info(
            filters?.source === 'linkedin'
              ? 'LinkedIn no devolvió a nadie. Suele ser la zona: tiene que ser un lugar tal cual, como "Colombia" o "Bogotá", sin aclaraciones. También probá con menos cargos.'
              : 'La búsqueda no encontró nada. Probá con otra zona o con otros términos.',
            { duration: 12000 },
          );
        }
      } else {
        toast.success(`${data.results.length} candidatos encontrados.`);
      }
      if (data.truncated) {
        toast.warning('Se alcanzó el tope de consultas por corrida: hay zonas sin recorrer.');
      }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo buscar.';
      // Que el proveedor no haya podido ejecutar es distinto de un fallo
      // cualquiera: hay que leerlo entero y decidir algo, así que va a un panel
      // que se queda y no a un toast que se va. Ver `ProviderNotice`.
      if (problemFrom(mensaje) !== 'desconocido') setProviderProblem(mensaje);
      else toast.error(mensaje);
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
      .filter((r) => !taken.has(r.sourceRef))
      .map((r) => r.sourceRef);
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
        (r) => selected.has(r.sourceRef) && !taken.has(r.sourceRef),
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
            // Identidad multi-fuente. `google_place_id` lo completa solo el
            // trigger de la 0036 cuando la fuente es Google, así que la app no
            // necesita saber que esa columna todavía existe.
            source: r.source,
            source_ref: r.sourceRef,
            kind: r.kind,
            rating: r.rating,
            reviews_count: r.reviewsCount,
            photos_count: r.photosCount,
            has_own_website: r.hasOwnWebsite,
            score: r.score,
            search_id: search.id,
            created_by: userId,
          })),
        )
        .select('id, source_ref');
      if (error) throw error;

      // Se guarda la fila completa (no solo el id) para poder mostrar y
      // enriquecer los prospectos sin volver a consultarlos.
      const byRef = new Map(rows.map((r) => [r.sourceRef, r]));
      setSavedProspects(
        (inserted ?? []).map((row) => {
          const original = byRef.get(row.source_ref as string);
          return {
            id: row.id as string,
            businessName: original?.businessName ?? '(sin nombre)',
            instagram: original?.instagram ?? null,
            linkedin: original?.linkedin ?? null,
            score: original?.score ?? null,
            audienceSize: null,
            audienceActivity: null,
            enrichmentStatus: null,
          };
        }),
      );
      setTaken((prev) => {
        const next = new Map(prev);
        for (const row of rows) next.set(row.sourceRef, 'vos');
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
          activity: SavedProspect['audienceActivity'];
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
            audienceSize: found.followers,
            audienceActivity: found.activity,
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
            options={chatOptions}
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
              {searching ? 'Buscando…' : 'Aprobar y buscar'}
            </Button>
          }
        >
          {providerProblem && (
            <ProviderNotice
              message={providerProblem}
              onDismiss={() => setProviderProblem(null)}
              onReducirCantidad={
                filters
                  ? () => {
                      setFilters({ ...filters, limit: Math.max(1, Math.floor(filters.limit / 2)) });
                      setProviderProblem(null);
                      toast.success('Listo, bajé la cantidad a la mitad. Probá de nuevo.');
                    }
                  : undefined
              }
            />
          )}

          {filters ? (
            <>
              {/* El plan va ARRIBA de los filtros: es lo que el usuario tiene
                  que leer para decidir. Los filtros son el detalle editable. */}
              <HuntPlan
                filters={filters}
                icpSummary={icpSummary}
                reason={planReason}
                signalReasons={signalReasons}
                remainingUsd={budget?.apify?.remainingUsd ?? null}
                onChange={setFilters}
              />

              {/* El panel de casillas ya NO es la interfaz.
                  Competía con Turbo: él elegía las señales a partir de la oferta
                  y las explicaba en el plan, y justo abajo aparecían las mismas
                  como perillas sueltas, sin contexto. Ante un resultado raro lo
                  primero que hacía el vendedor era tocar ahí — incluso cuando el
                  problema no estaba ahí (en LinkedIn esas casillas nunca
                  descartaron un solo perfil).
                  Queda como salida de emergencia: si Turbo se equivoca en una
                  señal y no hay dónde tocarla, la única alternativa sería rehacer
                  la entrevista entera. */}
              {editandoAMano ? (
                <div className="mt-3 rounded-lg border border-border p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Editás por encima de lo que decidió Turbo.
                    </p>
                    <button
                      type="button"
                      onClick={() => setEditandoAMano(false)}
                      className="text-xs text-primary-deep hover:underline"
                    >
                      listo
                    </button>
                  </div>
                  <FiltersPanel filters={filters} onChange={setFilters} disabled={searching} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditandoAMano(true)}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Editar a mano
                </button>
              )}
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
        <SectionCard
          title={
            searchProgress > 0 ? `Buscando candidatos… (${searchProgress})` : 'Buscando candidatos…'
          }
        >
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
          description={`Descartados en el camino: ${run.discarded.withWebsite} con web propia, ${run.discarded.noWhatsapp} sin celular, ${run.discarded.noInstagram} sin Instagram, ${run.discarded.noLinkedin} sin LinkedIn, ${run.discarded.lowRating} bajo el rating mínimo, ${run.discarded.excludedName} fuera de rubro. ${run.requestsUsed} consultas facturadas.`}
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
              {/* Salida sin pasar por el CRM: hasta ahora el único destino de
                  una búsqueda era guardarla y promoverla a cliente. Si solo
                  querías la lista para trabajarla afuera, no había forma. */}
              <ExportButton
                rows={exportRows}
                filename={`prospectos-${new Date().toISOString().slice(0, 10)}`}
                label="Exportar a Excel"
                sheetName="Prospectos"
              />
              <Button onClick={saveSelected} disabled={saving || selected.size === 0}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Guardando…' : `Guardar (${selected.size})`}
              </Button>
            </div>
          }
        >
          {/* Antes que la tabla: si faltaron leads, eso se lee primero. */}
          {lastRun && (
            <RunReport facts={lastRun} remainingUsd={budget?.apify?.remainingUsd ?? null} />
          )}
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
