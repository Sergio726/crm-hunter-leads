'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, PenLine } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Field';
import { AvisoDeEnvio, SelectorDeCanal } from '@/components/ui/SelectorDeCanal';
import type { Channel } from '@/lib/canales';
import { recallOffer, rememberOffer } from '@/lib/prospect/offer';
import { OFFERS_KEY, elegirOferta, normalizeOffers, type Offer } from '@/lib/offers';

/** Valor del selector cuando se escribe una oferta a mano. */
const A_MANO = '';

/**
 * Redacta el primer mensaje para un prospecto.
 *
 * De a uno a propósito: es lo único del sistema que se paga por lead. El
 * vendedor contacta a unos pocos por día, así que generarlo en lote sería pagar
 * cien mensajes para usar tres.
 *
 * La oferta la elige el sistema según el rubro de la búsqueda. Antes era una
 * sola frase global compartida con la ficha de clientes: si la última búsqueda
 * había sido de inmobiliarias, esa frase aparecía después en un gimnasio.
 */
export function ApproachDialog({
  prospectId,
  prospectName,
  rubro = null,
  onClose,
}: {
  prospectId: string;
  prospectName: string;
  /** Rubro de la búsqueda: define qué oferta se preselecciona. */
  rubro?: string | null;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerId, setOfferId] = useState<string>(A_MANO);
  // Respaldo de siempre para cuando todavía no hay ofertas cargadas.
  const [offerLibre, setOfferLibre] = useState(() => recallOffer());
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', OFFERS_KEY)
        .maybeSingle();
      if (!vivo) return;
      const lista = normalizeOffers(data?.value);
      setOffers(lista);
      const elegida = elegirOferta(lista, rubro);
      if (elegida) setOfferId(elegida.id);
    }
    void cargar();
    return () => {
      vivo = false;
    };
  }, [supabase, rubro]);

  const elegida = offers.find((o) => o.id === offerId) ?? null;
  const textoOferta = elegida ? elegida.texto : offerLibre;

  async function generate() {
    if (textoOferta.trim().length < 5) {
      toast.error('Contame en una frase qué vendés.');
      return;
    }
    setLoading(true);
    // Solo se recuerda lo escrito a mano: guardar también las ofertas de la
    // lista nos devolvería a la frase única pegada entre pantallas.
    if (!elegida) rememberOffer(offerLibre);
    try {
      const res = await fetch('/api/prospect/approach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId, offer: textoOferta.trim(), channel }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok || !data.message) throw new Error(data.error ?? 'No se pudo redactar.');
      setMessage(data.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo redactar.');
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(message);
    toast.success('Mensaje copiado.');
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-muted-foreground">/ primer mensaje</p>
          <p className="text-sm font-medium text-foreground">{prospectName}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      {/* Apilados y no en dos columnas: la oferta necesita el ancho para
          leerse entera, y el canal ahora son cuatro botones con logo que en una
          columna angosta no entran. */}
      <div className="space-y-1">
        <Label>¿Qué ofrecés?</Label>
        {offers.length > 0 ? (
          <Select value={offerId} onChange={(e) => setOfferId(e.target.value)} disabled={loading}>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
            <option value={A_MANO}>Otra cosa…</option>
          </Select>
        ) : (
          <Input
            value={offerLibre}
            onChange={(e) => setOfferLibre(e.target.value)}
            placeholder="Ej. páginas web, listas en 10 días"
            disabled={loading}
          />
        )}
        {/* Pegado al selector: quedaba debajo del canal, lejos de su campo. */}
        {offers.length > 0 && !elegida && (
          <Input
            value={offerLibre}
            onChange={(e) => setOfferLibre(e.target.value)}
            placeholder="Ej. páginas web, listas en 10 días"
            disabled={loading}
            className="mt-2"
          />
        )}
      </div>

      <div className="mt-3 space-y-1">
        <Label>Canal</Label>
        <SelectorDeCanal value={channel} onChange={setChannel} disabled={loading} />
      </div>

      {/* El ejemplo traía el rubro adentro —"para inmobiliarias"— y esa frase
          terminaba pegada en leads de otro rubro. */}
      <p className="mt-1.5 text-xs text-muted-foreground">
        No hace falta aclarar a quién: el rubro lo toma del prospecto.
      </p>

      <div className="mt-1.5">
        <AvisoDeEnvio />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
          {loading ? 'Escribiendo…' : message ? 'Probar otro' : 'Escribir mensaje'}
        </Button>
        {message && (
          <Button variant="outline" onClick={copy}>
            <Copy className="h-4 w-4" /> Copiar
          </Button>
        )}
      </div>

      {message && (
        <div className="mt-3 space-y-2">
          <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap text-foreground">
            {message}
          </p>
          <p className="text-xs text-muted-foreground">
            Revisalo antes de mandarlo. Turbo escribe con los datos que tiene del prospecto, pero
            vos conocés el contexto que él no.
          </p>
        </div>
      )}
    </div>
  );
}
