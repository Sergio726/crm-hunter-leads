'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Field';
import { recallOffer, rememberOffer } from '@/lib/prospect/offer';

type Channel = 'whatsapp' | 'email' | 'linkedin';

const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  linkedin: 'LinkedIn',
};

/**
 * Redacta el primer mensaje para un prospecto.
 *
 * De a uno a propósito: es lo único del sistema que se paga por lead. El
 * vendedor contacta a unos pocos por día, así que generarlo en lote sería pagar
 * cien mensajes para usar tres.
 *
 * Pide qué vende: sin eso el mensaje sale genérico, y un genérico lo escribe
 * cualquiera sin gastar.
 */
export function ApproachDialog({
  prospectId,
  prospectName,
  onClose,
}: {
  prospectId: string;
  prospectName: string;
  onClose: () => void;
}) {
  // Arranca con lo que Turbo entendió en la entrevista: volver a preguntarlo
  // sería pedir un dato que el sistema ya tiene. Se puede editar igual.
  const [offer, setOffer] = useState(() => recallOffer());
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (offer.trim().length < 5) {
      toast.error('Contame en una frase qué vendés.');
      return;
    }
    setLoading(true);
    // Si lo editó a mano, esa versión es la que vale para la próxima vez.
    rememberOffer(offer);
    try {
      const res = await fetch('/api/prospect/approach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId, offer: offer.trim(), channel }),
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

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-1">
          <Label>¿Qué vendés?</Label>
          <Input
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            placeholder="Ej. páginas web para inmobiliarias, listas en 10 días"
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
