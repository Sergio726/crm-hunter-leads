'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select, Label } from '@/components/ui/Field';
import type { Channel, Client, ClientStatus, Outcome } from '@/lib/types';
import { CHANNEL_LABELS, OUTCOME_LABELS, STATUS_LABELS } from '@/lib/types';

// Canales reales de contacto (se excluye 'note', que es el comentario libre).
const CHANNELS: Channel[] = ['call', 'whatsapp', 'sms', 'email'];
const OUTCOMES = Object.keys(OUTCOME_LABELS) as Outcome[];
const FOLLOW_UPS: { label: string; days: number | null }[] = [
  { label: 'Mañana', days: 1 },
  { label: 'En 3 días', days: 3 },
  { label: 'Próxima semana', days: 7 },
  { label: 'Sin seguimiento', days: null },
];

export type MovePayload =
  | { mode: 'register'; channel: Channel; outcome: Outcome; followUpDays: number | null; notes: string }
  | { mode: 'status-only' }
  | { mode: 'confirm'; notes: string };

const pill = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs transition ${
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-muted'
  }`;

/**
 * Diálogo que aparece al mover una tarjeta en el board (WEB-27b).
 * - destino 'contacted' → registrar el contacto (canal/resultado/seguimiento) o solo cambiar estado.
 * - destino 'won'/'lost' → confirmar el cierre, con nota opcional.
 */
export function BoardMoveDialog({
  client,
  to,
  onCancel,
  onConfirm,
}: {
  client: Client;
  to: ClientStatus;
  onCancel: () => void;
  onConfirm: (payload: MovePayload) => void;
}) {
  const isContact = to === 'contacted';
  const [channel, setChannel] = useState<Channel>('call');
  const [outcome, setOutcome] = useState<Outcome>('answered');
  const [followUpDays, setFollowUpDays] = useState<number | null>(3);
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 md:backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">
            {isContact ? `Registrar contacto` : `¿Marcar como ${STATUS_LABELS[to]}?`}
          </h2>
          <button onClick={onCancel} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 -mt-2 text-sm text-muted-foreground">{client.full_name}</p>

        {isContact ? (
          <div className="space-y-3">
            <div>
              <Label>Canal</Label>
              <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Resultado</Label>
              <div className="flex flex-wrap gap-1.5">
                {OUTCOMES.map((o) => (
                  <button key={o} type="button" onClick={() => setOutcome(o)} className={pill(outcome === o)}>
                    {OUTCOME_LABELS[o]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Próximo seguimiento</Label>
              <div className="flex flex-wrap gap-1.5">
                {FOLLOW_UPS.map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setFollowUpDays(f.days)}
                    className={pill(followUpDays === f.days)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Notas (opcional)…"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancelar
              </Button>
              <Button type="button" variant="outline" onClick={() => onConfirm({ mode: 'status-only' })}>
                Solo cambiar estado
              </Button>
              <Button
                type="button"
                onClick={() => onConfirm({ mode: 'register', channel, outcome, followUpDays, notes })}
              >
                Registrar contacto
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {to === 'won'
                ? 'Vas a marcar este cliente como ganado (cerrado).'
                : 'Vas a marcar este cliente como perdido.'}
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Motivo o nota de cierre (opcional)…"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => onConfirm({ mode: 'confirm', notes })}>
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
