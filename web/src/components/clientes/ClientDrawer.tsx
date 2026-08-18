'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  X,
  Trash2,
  Save,
  MessageCircle,
  Mail,
  Phone,
  MessageSquare,
  MessageSquarePlus,
  Paperclip,
  ExternalLink,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { openContactChannel } from '@/lib/contact-links';
import { Button } from '@/components/ui/Button';
import { Input, Select, Label } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { StatusLabel } from '@/components/ui/StatusLabel';
import type { Channel, Client, ClientStatus, Interaction, InteractionAttachment, Outcome, Role } from '@/lib/types';
import { STATUS_LABELS, ORIGIN_LABELS, CHANNEL_LABELS, OUTCOME_LABELS } from '@/lib/types';

type Seller = { id: string; name: string };
type HistoryRow = Pick<Interaction, 'id' | 'channel' | 'outcome' | 'notes' | 'contacted_at'> & {
  user: { full_name: string | null; email: string } | null;
};
type AttachmentRow = Pick<InteractionAttachment, 'id' | 'interaction_id' | 'storage_path' | 'file_type' | 'file_size_bytes'>;

const CONTACT_ACTIONS: { channel: Channel; label: string; icon: typeof Mail }[] = [
  { channel: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { channel: 'sms', label: 'SMS', icon: MessageSquare },
  { channel: 'email', label: 'Email', icon: Mail },
  { channel: 'call', label: 'Llamar', icon: Phone },
];

const OUTCOMES = Object.keys(OUTCOME_LABELS) as Outcome[];
const FOLLOW_UPS: { label: string; days: number | null }[] = [
  { label: 'Sin seguimiento', days: null },
  { label: 'Mañana', days: 1 },
  { label: 'En 3 días', days: 3 },
  { label: 'Próxima semana', days: 7 },
];

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes: number | null) {
  if (!bytes) return '';
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

export function ClientDrawer({
  client,
  sellers,
  currentUserId,
  role,
  onClose,
}: {
  client: Client;
  sellers: Seller[];
  currentUserId: string;
  role: Role;
  onClose: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const isViewer = role === 'viewer';
  const isAdmin = role === 'superadmin';
  const canWrite = !isViewer;

  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [attachments, setAttachments] = useState<Record<string, AttachmentRow[]>>({});
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: client.full_name,
    phone: client.phone ?? '',
    email: client.email ?? '',
    phone_2: client.phone_2 ?? '',
    email_2: client.email_2 ?? '',
    company: client.company ?? '',
    status: client.status as string,
    assigned_to: client.assigned_to ?? '',
    next_follow_up: client.next_follow_up ?? '',
    tags: (client.tags ?? []).join(', '),
    notes: client.notes ?? '',
  });

  // Contactar + registrar resultado
  const [pending, setPending] = useState<Channel | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('answered');
  const [followUp, setFollowUp] = useState<number | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [savingOutcome, setSavingOutcome] = useState(false);

  // Comentario rápido
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    setForm({
      full_name: client.full_name,
      phone: client.phone ?? '',
      email: client.email ?? '',
      phone_2: client.phone_2 ?? '',
      email_2: client.email_2 ?? '',
      company: client.company ?? '',
      status: client.status as string,
      assigned_to: client.assigned_to ?? '',
      next_follow_up: client.next_follow_up ?? '',
      tags: (client.tags ?? []).join(', '),
      notes: client.notes ?? '',
    });
  }, [client]);

  useEffect(() => {
    supabase
      .from('interactions')
      .select('id, channel, outcome, notes, contacted_at, user:profiles(full_name, email)')
      .eq('client_id', client.id)
      .order('contacted_at', { ascending: false })
      .then(({ data }) => setHistory((data as unknown as HistoryRow[]) ?? []));
  }, [client.id, supabase]);

  useEffect(() => {
    if (!history || history.length === 0) return;
    supabase
      .from('interaction_attachments')
      .select('id, interaction_id, storage_path, file_type, file_size_bytes')
      .in('interaction_id', history.map((h) => h.id))
      .then(({ data }) => {
        const grouped: Record<string, AttachmentRow[]> = {};
        for (const a of (data as AttachmentRow[]) ?? []) (grouped[a.interaction_id] ??= []).push(a);
        setAttachments(grouped);
      });
  }, [history, supabase]);

  function contact(channel: Channel) {
    const ok = openContactChannel(channel, { phone: form.phone || client.phone, email: form.email || client.email });
    if (!ok) {
      toast.error(channel === 'email' ? 'El cliente no tiene email.' : 'El cliente no tiene teléfono.');
      return;
    }
    if (!canWrite) return;
    setOutcome('answered');
    setFollowUp(null);
    setOutcomeNotes('');
    setPending(channel);
  }

  async function saveOutcome() {
    if (!pending) return;
    setSavingOutcome(true);
    const { error: iErr } = await supabase.from('interactions').insert({
      client_id: client.id,
      user_id: currentUserId,
      channel: pending,
      outcome,
      notes: outcomeNotes.trim() || null,
    });
    if (iErr) {
      setSavingOutcome(false);
      return toast.error('No se pudo guardar: ' + iErr.message);
    }
    const patch: { status: string; next_follow_up?: string } = { status: 'contacted' };
    if (followUp !== null) {
      const dt = new Date();
      dt.setDate(dt.getDate() + followUp);
      patch.next_follow_up = dt.toISOString().slice(0, 10);
    }
    await supabase.from('clients').update(patch).eq('id', client.id);
    setSavingOutcome(false);
    toast.success('Contacto registrado');
    setPending(null);
    router.refresh();
  }

  async function saveNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    const { error } = await supabase.from('interactions').insert({
      client_id: client.id,
      user_id: currentUserId,
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

  async function uploadAttachment(interactionId: string, file: File) {
    if (file.size > MAX_ATTACHMENT_BYTES) return toast.error('El archivo no puede superar 10 MB.');
    setUploadingFor(interactionId);
    const path = `${interactionId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from('interaction-attachments').upload(path, file);
    if (upErr) {
      setUploadingFor(null);
      return toast.error('No se pudo subir: ' + upErr.message);
    }
    const { error: insErr } = await supabase.from('interaction_attachments').insert({
      interaction_id: interactionId,
      uploaded_by: currentUserId,
      storage_path: path,
      file_type: file.type || 'application/octet-stream',
      file_size_bytes: file.size,
    });
    setUploadingFor(null);
    if (insErr) return toast.error('No se pudo guardar: ' + insErr.message);
    toast.success('Adjunto subido');
    const { data } = await supabase
      .from('interaction_attachments')
      .select('id, interaction_id, storage_path, file_type, file_size_bytes')
      .eq('interaction_id', interactionId);
    setAttachments((prev) => ({ ...prev, [interactionId]: (data as AttachmentRow[]) ?? [] }));
  }

  async function viewAttachment(path: string) {
    const { data, error } = await supabase.storage.from('interaction-attachments').createSignedUrl(path, 300);
    if (error || !data) return toast.error('No se pudo abrir el archivo.');
    window.open(data.signedUrl, '_blank');
  }

  async function save() {
    if (!form.full_name.trim()) return toast.error('El nombre es obligatorio.');
    setSaving(true);
    const { error } = await supabase
      .from('clients')
      .update({
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        phone_2: form.phone_2.trim() || null,
        email_2: form.email_2.trim() || null,
        company: form.company.trim() || null,
        status: form.status as ClientStatus,
        assigned_to: form.assigned_to || null,
        next_follow_up: form.next_follow_up || null,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        notes: form.notes.trim() || null,
      })
      .eq('id', client.id);
    setSaving(false);
    if (error) return toast.error('Error al guardar: ' + error.message);
    toast.success('Cliente actualizado');
    onClose();
    router.refresh();
  }

  async function remove() {
    setSaving(true);
    const { error } = await supabase.from('clients').delete().eq('id', client.id);
    setSaving(false);
    if (error) return toast.error('No se pudo borrar: ' + error.message);
    toast.success('Cliente borrado');
    onClose();
    router.refresh();
  }

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const initial = client.full_name.trim()[0]?.toUpperCase() ?? '?';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70 md:backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl animate-in slide-in-from-right duration-200">
        <header className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-lg font-semibold text-foreground">
              {initial}
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">{client.full_name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusLabel status={client.status} />
                <span className="text-xs text-muted-foreground">{ORIGIN_LABELS[client.origin]}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {!isViewer && (
            <section>
              <SectionLabel>Contactar</SectionLabel>
              <div className="grid grid-cols-4 gap-2">
                {CONTACT_ACTIONS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.channel}
                      type="button"
                      onClick={() => contact(a.channel)}
                      className="flex flex-col items-center gap-1 rounded-xl border border-border bg-background/50 py-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Icon className="h-5 w-5 text-primary-deep" />
                      {a.label}
                    </button>
                  );
                })}
              </div>
              {client.crm_contact_id && (
                <a
                  href={`https://app.gohighlevel.com/contacts/${client.crm_contact_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary-deep hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver en GoHighLevel
                </a>
              )}

              {pending && (
                <div className="mt-3 rounded-xl border border-border bg-background/50 p-4">
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
                    value={outcomeNotes}
                    onChange={(e) => setOutcomeNotes(e.target.value)}
                    rows={2}
                    placeholder="Notas (opcional)…"
                    className="mt-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
                      No se concretó
                    </Button>
                    <Button size="sm" onClick={saveOutcome} disabled={savingOutcome}>
                      {savingOutcome ? 'Guardando…' : 'Guardar'}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}

          <section>
            <SectionLabel>Datos de contacto</SectionLabel>
            {isViewer ? (
              <div className="space-y-1 text-sm">
                <p className="text-foreground">{client.full_name}</p>
                {client.phone && <p className="text-muted-foreground">📞 {client.phone}</p>}
                {client.email && <p className="text-muted-foreground">✉️ {client.email}</p>}
                {client.phone_2 && <p className="text-muted-foreground">📞 {client.phone_2} (secundario)</p>}
                {client.email_2 && <p className="text-muted-foreground">✉️ {client.email_2} (secundario)</p>}
                {client.company && <p className="text-muted-foreground">{client.company}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>Nombre *</Label>
                  <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Teléfono</Label>
                    <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={form.email} onChange={(e) => set('email', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Teléfono secundario</Label>
                    <Input value={form.phone_2} onChange={(e) => set('phone_2', e.target.value)} />
                  </div>
                  <div>
                    <Label>Email secundario</Label>
                    <Input value={form.email_2} onChange={(e) => set('email_2', e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Empresa</Label>
                  <Input value={form.company} onChange={(e) => set('company', e.target.value)} />
                </div>
              </div>
            )}
          </section>

          <section>
            <SectionLabel>Seguimiento</SectionLabel>
            {isViewer ? (
              <p className="text-sm text-muted-foreground">
                {STATUS_LABELS[client.status]}
                {client.assigned_to && sellers.find((s) => s.id === client.assigned_to)
                  ? ` · ${sellers.find((s) => s.id === client.assigned_to)?.name}`
                  : ''}
                {client.next_follow_up ? ` · Seguimiento: ${client.next_follow_up}` : ''}
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Estado</Label>
                    <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
                      {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </Select>
                  </div>
                  {isAdmin ? (
                    <div>
                      <Label>Vendedor</Label>
                      <Select value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)}>
                        <option value="">Sin asignar</option>
                        {sellers.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </Select>
                    </div>
                  ) : (
                    <div>
                      <Label>Vendedor</Label>
                      <p className="flex h-8 items-center text-sm text-muted-foreground">
                        {sellers.find((s) => s.id === client.assigned_to)?.name ?? 'Sin asignar'}
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <Label>Próximo seguimiento</Label>
                  <DateField value={form.next_follow_up} onChange={(v) => set('next_follow_up', v)} />
                </div>
              </div>
            )}
          </section>

          <section>
            <SectionLabel>Etiquetas y notas</SectionLabel>
            {isViewer ? (
              <div className="space-y-2">
                {(client.tags ?? []).length > 0 && (
                  <p className="text-xs text-muted-foreground">{client.tags.join(' · ')}</p>
                )}
                {client.notes && <p className="text-sm text-muted-foreground">{client.notes}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>Tags (separadas por coma)</Label>
                  <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="warm, evento…" />
                  {form.tags.trim() && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {form.tags
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Notas</Label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
                  />
                </div>
              </div>
            )}
          </section>

          {!isViewer && (
            <section>
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
            </section>
          )}

          <section>
            <SectionLabel>Historial de contactos</SectionLabel>
            {history === null ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin contactos registrados todavía.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((i) => (
                  <li key={i.id} className="rounded-lg border border-border bg-background/40 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        {CHANNEL_LABELS[i.channel]}
                        {i.outcome ? ` · ${OUTCOME_LABELS[i.outcome]}` : ''}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {new Date(i.contacted_at).toLocaleString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {i.user?.full_name ?? i.user?.email ?? 'Vendedor'}
                      {i.notes ? ` · ${i.notes}` : ''}
                    </p>

                    {(attachments[i.id] ?? []).length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {attachments[i.id].map((a) => (
                          <li key={a.id}>
                            <button
                              onClick={() => viewAttachment(a.storage_path)}
                              className="inline-flex items-center gap-1 text-xs text-primary-deep hover:underline"
                            >
                              <Paperclip className="h-3 w-3" />
                              {a.storage_path.split('/').pop()}
                              {a.file_size_bytes ? ` (${formatBytes(a.file_size_bytes)})` : ''}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {canWrite && (
                      <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                        <Paperclip className="h-3 w-3" />
                        {uploadingFor === i.id ? 'Subiendo…' : 'Adjuntar'}
                        <input
                          type="file"
                          accept="image/*,application/pdf,audio/*"
                          className="hidden"
                          disabled={uploadingFor === i.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadAttachment(i.id, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {canWrite && (
          <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
            {isAdmin ? (
              confirmDel ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">¿Seguro?</span>
                  <Button variant="destructive" size="sm" onClick={remove} disabled={saving}>
                    Sí, borrar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDel(false)}>
                    No
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirmDel(true)} disabled={saving}>
                  <Trash2 className="h-4 w-4" /> Borrar
                </Button>
              )
            ) : (
              <span />
            )}
            <Button onClick={save} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </footer>
        )}
      </aside>
    </div>
  );
}
