'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { SectionCard } from '@/components/ui/Card';
import { Input, Label } from '@/components/ui/Field';
import { NICHE_PACKS } from '@/lib/prospect/niches';
import { OFFERS_KEY, normalizeOffers, nuevoOfferId, type Offer } from '@/lib/offers';
import { AGENDA_KEY, normalizeAgendaUrl } from '@/lib/agenda';

/** Los rubros que se pueden marcar. `generico` no es un rubro, es "a medida". */
const RUBROS = NICHE_PACKS.filter((n) => n.id !== 'generico');

/**
 * Qué vende el equipo, y para qué rubro sirve cada oferta.
 *
 * Existe por un bug reportado: el mensaje hablaba del rubro equivocado. Había
 * **una sola** frase de oferta, guardada en el navegador y compartida entre
 * Prospección y Clientes, así que el rubro de la última búsqueda terminaba en
 * el mensaje de otro lead. Con la lista acá, el sistema elige sola la oferta
 * que corresponde al lead que se está mirando.
 *
 * Solo el superadmin escribe (RLS de `app_settings`); todos los vendedores leen.
 */
export function OfertasSection() {
  const supabase = useMemo(() => createClient(), []);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [faltaMigracion, setFaltaMigracion] = useState(false);
  const [agenda, setAgenda] = useState('');
  const [guardandoAgenda, setGuardandoAgenda] = useState(false);

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', OFFERS_KEY)
        .maybeSingle();
      if (!vivo) return;
      setFaltaMigracion(!error && !data);
      setOffers(normalizeOffers(data?.value));
      const { data: ag } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', AGENDA_KEY)
        .maybeSingle();
      if (!vivo) return;
      setAgenda(typeof ag?.value === 'string' ? ag.value : '');
      setCargando(false);
    }
    void cargar();
    return () => {
      vivo = false;
    };
  }, [supabase]);

  function editar(id: string, patch: Partial<Offer>) {
    setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function alternarRubro(id: string, rubro: string) {
    setOffers((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              rubros: o.rubros.includes(rubro)
                ? o.rubros.filter((r) => r !== rubro)
                : [...o.rubros, rubro],
            }
          : o,
      ),
    );
  }

  function agregar() {
    const nombre = 'Oferta nueva';
    setOffers((prev) => [
      ...prev,
      { id: nuevoOfferId(nombre, prev), nombre, texto: '', rubros: [] },
    ]);
  }

  async function guardar() {
    // Se normaliza antes de mandar: una oferta sin texto no sirve para nada y
    // sería un renglón vacío en el selector de todos los vendedores.
    const limpias = normalizeOffers(offers);
    if (limpias.length !== offers.length) {
      toast.warning('Las ofertas sin texto no se guardan.');
    }
    setGuardando(true);
    const { error } = await supabase
      .from('app_settings')
      .update({ value: limpias })
      .eq('key', OFFERS_KEY);
    setGuardando(false);
    if (error) return toast.error('No se pudo guardar: ' + error.message);
    setOffers(limpias);
    toast.success(
      limpias.length === 0 ? 'Sin ofertas guardadas.' : `${limpias.length} ofertas guardadas.`,
    );
  }

  return (
    <SectionCard
      title="Prospección — Qué vendés"
      description="Las ofertas que usa Turbo para escribir los mensajes. Marcá para qué rubros sirve cada una y el sistema elige sola la que corresponde a cada lead. Si dejás una sin rubros, sirve para todos."
    >
      {faltaMigracion && (
        <p className="mb-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-foreground">
          Falta aplicar la migración <code>0049</code>: hasta entonces no se pueden guardar ofertas
          y el mensaje sigue pidiendo escribir a mano qué vendés.
        </p>
      )}

      {/* El mensaje que escribe Turbo empuja a una llamada: sin un lugar donde
          reservarla, la pide sin proponer nada. */}
      <div className="mb-4">
        <Label>Link de agenda (Cal.com, Calendly…)</Label>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            placeholder="https://cal.com/tu-usuario/15min"
            className="min-w-56 flex-1"
          />
          <Button
            variant="outline"
            disabled={guardandoAgenda}
            onClick={async () => {
              const limpio = normalizeAgendaUrl(agenda);
              if (agenda.trim() && !limpio) {
                return toast.error('Ese link no parece una dirección web válida.');
              }
              setGuardandoAgenda(true);
              const { error } = await supabase
                .from('app_settings')
                .update({ value: limpio ?? '' })
                .eq('key', AGENDA_KEY);
              setGuardandoAgenda(false);
              if (error) return toast.error('No se pudo guardar: ' + error.message);
              setAgenda(limpio ?? '');
              toast.success(limpio ? 'Link de agenda guardado.' : 'Link de agenda borrado.');
            }}
          >
            {guardandoAgenda ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Sin link, el mensaje pide la llamada pero no propone horarios: Turbo no sabe tu
          disponibilidad y un horario inventado es peor que ninguno.
        </p>
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : offers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay ofertas. Sin ninguna, el vendedor escribe a mano qué vende cada vez — que
          es de donde salía el problema del rubro equivocado.
        </p>
      ) : (
        <ul className="space-y-4">
          {offers.map((o) => (
            <li key={o.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <Label>Nombre</Label>
                  <Input
                    value={o.nombre}
                    onChange={(e) => editar(o.id, { nombre: e.target.value })}
                    placeholder="Ej. Páginas web"
                  />
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setOffers((prev) => prev.filter((x) => x.id !== o.id))}
                  aria-label={`Borrar ${o.nombre}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-2">
                <Label>Qué se ofrece</Label>
                <Input
                  value={o.texto}
                  onChange={(e) => editar(o.id, { texto: e.target.value })}
                  placeholder="Ej. páginas web, listas en 10 días"
                />
                {/* La causa del bug: la oferta traía el rubro adentro y se
                    reusaba en leads de otro rubro. */}
                <p className="mt-1 text-xs text-muted-foreground">
                  No aclares a quién va dirigida: para eso están los rubros de acá abajo.
                </p>
              </div>

              <div className="mt-2">
                <Label>Sirve para</Label>
                <div className="flex flex-wrap gap-1.5">
                  {RUBROS.map((r) => {
                    const activo = o.rubros.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => alternarRubro(o.id, r.id)}
                        aria-pressed={activo}
                        className={`inline-flex h-11 items-center rounded-full border px-3 text-sm transition sm:h-auto sm:px-2 sm:py-0.5 sm:text-xs ${
                          activo
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
                {o.rubros.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sin ninguno marcado, sirve para cualquier lead.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={agregar} disabled={cargando || faltaMigracion}>
          <Plus className="h-4 w-4" />
          Agregar oferta
        </Button>
        <Button onClick={guardar} disabled={guardando || cargando || faltaMigracion}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Guardar
        </Button>
      </div>
    </SectionCard>
  );
}
