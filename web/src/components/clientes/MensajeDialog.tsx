'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, PenLine, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Field';
import { recallOffer, rememberOffer } from '@/lib/prospect/offer';

type Channel = 'whatsapp' | 'email' | 'linkedin';

const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  linkedin: 'LinkedIn',
};

interface Respuesta {
  tipo?: 'primer_contacto' | 'seguimiento';
  message?: string;
  error?: string;
  contexto?: { vieneDeProspeccion: boolean; contactosPrevios: number; esPrimerContacto: boolean };
}

/**
 * Escribe el mensaje para contactar a un cliente, en la ficha y sin salir.
 *
 * Antes los botones de WhatsApp, llamar y email abrían el canal **vacío**: el
 * vendedor tenía que redactar de cero mirando una ficha que ya sabía el rubro,
 * la zona, las reseñas y lo que se habló la última vez.
 *
 * El sistema decide solo cuál de los dos mensajes corresponde —rompehielo o
 * seguimiento— y lo dice, porque no es lo mismo revisar uno que otro.
 */
export function MensajeDialog({
  clientId,
  clientName,
  currentUserId,
  onGuardado,
  onClose,
}: {
  clientId: string;
  clientName: string;
  currentUserId: string;
  /** Para que la ficha recargue su historial cuando el mensaje queda anotado. */
  onGuardado?: () => void;
  onClose: () => void;
}) {
  const supabase = createClient();
  // Arranca con lo último que se usó: volver a preguntarlo sería pedir un dato
  // que el sistema ya tiene. Se puede editar igual.
  const [offer, setOffer] = useState(() => recallOffer());
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [res, setRes] = useState<Respuesta | null>(null);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function generar() {
    if (offer.trim().length < 5) {
      toast.error('Contame en una frase qué vendés.');
      return;
    }
    setLoading(true);
    rememberOffer(offer);
    try {
      const r = await fetch('/api/client/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, offer: offer.trim(), channel }),
      });
      const data = (await r.json()) as Respuesta;
      if (!r.ok || !data.message) throw new Error(data.error ?? 'No se pudo redactar.');
      setRes(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo redactar.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Copiar deja el mensaje anotado en el historial.
   *
   * Va como comentario y **no** como contacto: copiar no es haber enviado, y
   * contarlo como contacto inflaría los números del vendedor y taparía el
   * seguimiento real. Sirve para dos cosas: ver qué se le dijo la vez pasada
   * —que es lo primero que hace falta para el mensaje siguiente— y no volver a
   * pagar por generar lo mismo.
   */
  async function copiar() {
    if (!res?.message) return;
    await navigator.clipboard.writeText(res.message);
    setGuardando(true);
    const etiqueta = res.tipo === 'seguimiento' ? 'seguimiento' : 'primer contacto';
    const { error } = await supabase.from('interactions').insert({
      client_id: clientId,
      user_id: currentUserId,
      channel: 'note',
      notes: `[Mensaje sugerido · ${CHANNEL_LABELS[channel]} · ${etiqueta}]\n${res.message}`,
    });
    setGuardando(false);
    if (error) {
      // El texto ya está en el portapapeles: que falle el registro no puede
      // leerse como que falló el copiado.
      toast.warning('Copiado, pero no se pudo anotar en el historial.');
      return;
    }
    toast.success('Copiado y anotado en el historial.');
    onGuardado?.();
  }

  const ctx = res?.contexto;

  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-muted-foreground">/ mensaje para contactar</p>
          <p className="text-sm font-medium text-foreground">{clientName}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-1">
          <Label>¿Qué vendés?</Label>
          <Input
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            placeholder="Ej. páginas web para gimnasios, listas en 10 días"
            disabled={loading}
          />
        </div>
        <div className="space-y-1">
          <Label>Canal</Label>
          <Select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            disabled={loading}
          >
            {(Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={generar} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
          {loading ? 'Escribiendo…' : res?.message ? 'Probar otro' : 'Escribir mensaje'}
        </Button>
        {res?.message && (
          <Button variant="outline" onClick={copiar} disabled={guardando}>
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Copiar
          </Button>
        )}
      </div>

      {res?.message && (
        <div className="mt-3 space-y-2">
          {/* Decir cuál de los dos escribió: revisar un rompehielo y revisar un
              re-contacto son dos lecturas distintas. */}
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {res.tipo === 'seguimiento'
              ? `Mensaje de seguimiento — ya lo contactaste ${ctx?.contactosPrevios ?? 0} ${
                  ctx?.contactosPrevios === 1 ? 'vez' : 'veces'
                }, así que no repite lo anterior.`
              : 'Primer mensaje — es el rompehielo, nunca se lo contactó.'}
          </p>
          <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap text-foreground">
            {res.message}
          </p>
          <p className="text-xs text-muted-foreground">
            {ctx?.vieneDeProspeccion
              ? 'Escrito con los datos que trajo la búsqueda y con lo que ya pasó con este cliente. '
              : 'Este cliente no vino de una búsqueda, así que Turbo solo tiene lo que hay en la ficha. '}
            Revisalo antes de mandarlo: vos conocés el contexto que él no.
          </p>
        </div>
      )}
    </div>
  );
}
