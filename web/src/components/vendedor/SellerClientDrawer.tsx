'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { X, MessageCircle, Mail, Phone, MessageSquare, MessageSquarePlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { Channel, Client, Interaction, Outcome } from '@/lib/types';
import { STATUS_LABELS, CHANNEL_LABELS, OUTCOME_LABELS } from '@/lib/types';

type HistoryRow = Pick<Interaction, 'id' | 'channel' | 'outcome' | 'notes' | 'contacted_at'>;

const OUTCOMES = Object.keys(OUTCOME_LABELS) as Outcome[];
const FOLLOW_UPS: { label: string; days: number | null }[] = [
  { label: 'Sin seguimiento', days: null },
  { label: 'Mañana', days: 1 },
  { label: 'En 3 días', days: 3 },
  { label: 'Próxima semana', days: 7 },
];

const digits = (p: string | null) => (p ?? '').replace(/\D/g, '');

export function SellerClientDrawer({
  client,
  sellerId,
  onClose,
}: {
  client: Client;
  sellerId: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [pending, setPending] = useState<Channel | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('answered');
  const [followUp, setFollowUp] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    supabase
      .from('interactions')
      .select('id, channel, outcome, notes, contacted_at')
      .eq('client_id', client.id)
      .order('contacted_at', { ascending: false })
      .then(({ data }) => setHistory((data as HistoryRow[]) ?? []));
  }, [client.id, supabase]);

  function contact(channel: Channel) {
    const d = digits(client.phone);
    if (channel === 'whatsapp') {
      if (!d) return toast.error('El cliente no tiene teléfono.');
      window.open(`https://wa.me/${d}`, '_blank');
    } else if (channel === 'sms') {
      if (!client.phone) return toast.error('El cliente no tiene teléfono.');
      window.location.assign(`sms:${client.phone}`);
    } else if (channel === 'call') {
      if (!client.phone) return toast.error('El cliente no tiene teléfono.');
      window.location.assign(`tel:${client.phone}`);
    } else {
      if (!client.email) return toast.error('El cliente no tiene email.');
      window.location.assign(`mailto:${client.email}`);
    }
    setOutcome('answered');
    setFollowUp(null);
    setNotes('');
    setPending(channel);
  }

  async function saveOutcome() {
    if (!pending) return;
    setSaving(true);
    const { error: iErr } = await supabase.from('interactions').insert({
      client_id: client.id,
      user_id: sellerId,
      channel: pending,
      send_mode: 'deeplink',
      outcome,
      notes: notes.trim() || null,
    });
    if (iErr) {
      setSaving(false);
      return toast.error('No se pudo guardar: ' + iErr.message);
    }
    const patch: { status: string; next_follow_up?: string } = { status: 'contacted' };
    if (followUp !== null) {
      const dt = new Date();
      dt.setDate(dt.getDate() + followUp);
      patch.next_follow_up = dt.toISOString().slice(0, 10);
    }
    await supabase.from('clients').update(patch).eq('id', client.id);
    setSaving(false);
    toast.success('Contacto registrado');
    setPending(null);
    onClose();
    router.refresh();
  }

  async function saveNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    const { error } = await supabase.from('interactions').insert({
      client_id: client.id,
      user_id: sellerId,
      channel: 'note',
      outcome: null,
      notes: noteText.trim(),
    });
    setSavingNote(false);
    if (error) return toast.error('No se pudo guardar: ' + error.message);
    toast.success('Comentario guardado');
    setNoteText('');
    setNoteOpen(false);
    router.refresh();
  }

  const actions: { channel: Channel; label: string; icon: typeof Mail; className: string }[] = [
    { channel: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, className: 'bg-success text-white hover:opacity-90' },
    { channel: 'sms', label: 'SMS', icon: MessageSquare, className: 'bg-primary text-primary-foreground hover:opacity-90' },
    { channel: 'email', label: 'Email', icon: Mail, className: 'bg-violet text-white hover:opacity-90' },
    { channel: 'call', label: 'Llamar', icon: Phone, className: 'bg-muted-foreground text-background hover:opacity-90' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 md:backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl animate-in slide-in-from-right duration-200">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="truncate text-base font-semibold text-foreground">{client.full_name}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="space-y-1 text-sm">
            {client.company && <p className="text-muted-foreground">{client.company}</p>}
            {client.phone && <p className="text-muted-foreground">📞 {client.phone}</p>}
            {client.email && <p className="text-muted-foreground">✉️ {client.email}</p>}
            <p className="text-muted-foreground">
              Estado: {STATUS_LABELS[client.status]}
              {client.next_follow_up ? ` · Seguimiento: ${client.next_follow_up}` : ''}
            </p>
            {(client.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {client.tags.map((t) => (
                  <Badge key={t} tone="accent">{t}</Badge>
                ))}
              </div>
            )}
            {client.notes && <p className="pt-1 text-muted-foreground">{client.notes}</p>}
          </div>

          {/* Contactar */}
          <div className="grid grid-cols-4 gap-2">
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.channel}
                  onClick={() => contact(a.channel)}
                  className={`flex flex-col items-center gap-1 rounded-xl py-3 text-xs font-semibold transition ${a.className}`}
                >
                  <Icon className="h-5 w-5" />
                  {a.label}
                </button>
              );
            })}
          </div>

          {/* Comentario rápido */}
          {noteOpen ? (
            <div className="rounded-xl border border-border bg-background/50 p-4">
              <p className="mb-2 text-sm font-semibold text-foreground">Comentario rápido</p>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
                autoFocus
                placeholder="Escribí una nota…"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setNoteOpen(false); setNoteText(''); }}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={saveNote} disabled={savingNote || !noteText.trim()}>
                  {savingNote ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setNoteOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Comentario rápido
            </button>
          )}

          {/* Registrar resultado */}
          {pending && (
            <div className="rounded-xl border border-border bg-background/50 p-4">
              <p className="mb-2 text-sm font-semibold text-foreground">
                ¿Cómo resultó el {CHANNEL_LABELS[pending]}?
              </p>
              <div className="flex flex-wrap gap-1.5">
                {OUTCOMES.map((o) => (
                  <button
                    key={o}
                    onClick={() => setOutcome(o)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      outcome === o
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-foreground hover:bg-muted'
                    }`}
                  >
                    {OUTCOME_LABELS[o]}
                  </button>
                ))}
              </div>
              <p className="mt-3 mb-1 text-xs font-medium text-muted-foreground">Próximo seguimiento</p>
              <div className="flex flex-wrap gap-1.5">
                {FOLLOW_UPS.map((f) => (
                  <button
                    key={f.label}
                    onClick={() => setFollowUp(f.days)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      followUp === f.days
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-foreground hover:bg-muted'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Notas (opcional)…"
                className="mt-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
                  No se concretó
                </Button>
                <Button size="sm" onClick={saveOutcome} disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </div>
          )}

          {/* Historial */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Historial</h3>
            {history === null ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin contactos todavía.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((i) => (
                  <li key={i.id} className="rounded-lg border border-border bg-background/40 px-3 py-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-foreground">
                        {CHANNEL_LABELS[i.channel]}
                        {i.outcome ? ` · ${OUTCOME_LABELS[i.outcome]}` : ''}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(i.contacted_at).toLocaleString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {i.notes && <p className="text-xs text-muted-foreground">{i.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
