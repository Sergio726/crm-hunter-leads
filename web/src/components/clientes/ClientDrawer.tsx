'use client';

import { useCallback, useEffect, useState } from 'react';
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
import {
  OPCIONES_SEGUIMIENTO,
  PROXIMO_POR_DEFECTO,
  cierraElCliente,
  estadoSegunResultado,
  fechaDeProximo,
  type Proximo,
} from '@/lib/seguimiento';

type Seller = { id: string; name: string };
type HistoryRow = Pick<Interaction, 'id' | 'channel' | 'outcome' | 'notes' | 'contacted_at' | 'user_id'> & {
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
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes: number | null) {
  if (!bytes) return '';
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

/**
 * Ruta única para un adjunto.
 *
 * Vive fuera del componente porque `Date.now()` es impuro: llamado desde el
 * cuerpo de un componente, React no puede garantizar que dé lo mismo en cada
 * render y el linter lo marca. Acá se llama desde un manejador de eventos, que
 * es un uso legítimo, y sacarlo del componente lo deja claro además de callar
 * la advertencia.
 */
function attachmentPath(interactionId: string, fileName: string): string {
  return `${interactionId}/${Date.now()}-${fileName}`;
}

/**
 * La ficha en campos de texto.
 *
 * En un solo lugar a propósito: esto estaba escrito dos veces —en el estado
 * inicial y en el efecto que lo reiniciaba— y esa duplicación es la que hace
 * que un día alguien agregue un campo en una copia y no en la otra.
 */
function formFromClient(client: Client) {
  return {
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
  };
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
  const [form, setForm] = useState(() => formFromClient(client));

  // Contactar + registrar resultado
  const [pending, setPending] = useState<Channel | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('answered');
  const [proximo, setProximo] = useState<Proximo>(PROXIMO_POR_DEFECTO);
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [savingOutcome, setSavingOutcome] = useState(false);

  // Comentario rápido
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);

  // Al pasar a OTRO cliente el formulario se reinicia, y solo entonces.
  //
  // Antes esto era un `useEffect` con `[client]` en las dependencias, y `client`
  // es un objeto: si el padre lo recreaba al renderizar —aunque fuera el mismo
  // cliente— el efecto corría y **borraba lo que la persona estaba tipeando**.
  // Ahora se compara el `id`, que es lo que de verdad significa "otro cliente".
  //
  // Ajustar el estado durante el render es el patrón que recomienda React para
  // esto (https://react.dev/learn/you-might-not-need-an-effect): corre antes de
  // pintar, sin el parpadeo de un efecto y sin la cascada de renders que el
  // linter marcaba.
  const [clienteMostrado, setClienteMostrado] = useState(client.id);
  if (clienteMostrado !== client.id) {
    setClienteMostrado(client.id);
    setForm(formFromClient(client));
  }

  /**
   * El seguimiento del cliente.
   *
   * Está en una función y no suelto dentro del efecto porque hay que volver a
   * pedirlo **cada vez que se agrega algo**. Antes se cargaba una sola vez al
   * abrir la ficha: al guardar un comentario se llamaba a `router.refresh()`,
   * que refresca lo que arma el servidor, pero esta lista vive en la ventana y
   * nadie le avisaba. El comentario recién aparecía al cerrar y volver a abrir,
   * que es cuando el efecto corre de nuevo.
   */
  const cargarHistorial = useCallback(async () => {
    const { data } = await supabase
      .from('interactions')
      .select('id, channel, outcome, notes, contacted_at, user_id, user:profiles(full_name, email)')
      .eq('client_id', client.id)
      .order('contacted_at', { ascending: false });
    setHistory((data as unknown as HistoryRow[]) ?? []);
  }, [client.id, supabase]);

  useEffect(() => {
    // Pedirle el seguimiento a la base es hablar con un sistema externo: es
    // exactamente para lo que sirve un efecto. El estado lo escribe la
    // respuesta, no el cuerpo del efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarHistorial();
  }, [cargarHistorial]);

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
    setProximo(PROXIMO_POR_DEFECTO);
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
    // `next_follow_up` se escribe SIEMPRE, incluso cuando queda en null. Antes
    // solo se escribía si se elegía una fecha, así que "Sin seguimiento" dejaba
    // intacta la fecha vencida y el cliente seguía en rojo para siempre —
    // generando además un mail de recordatorio por día.
    const patch = {
      status: estadoSegunResultado(outcome),
      next_follow_up: fechaDeProximo(proximo),
    };
    await supabase.from('clients').update(patch).eq('id', client.id);
    setSavingOutcome(false);
    toast.success(
      patch.status === 'lost' ? 'Contacto registrado. El cliente pasó a Perdido.' : 'Contacto registrado',
    );
    setPending(null);
    // Mismo motivo que en el comentario: registrar un contacto también agrega
    // una línea al seguimiento, y tampoco se veía sin cerrar la ficha.
    await cargarHistorial();
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
    // Se vuelve a pedir el seguimiento: es lo que hace que el comentario
    // aparezca al instante en vez de al reabrir la ficha.
    await cargarHistorial();
    router.refresh();
  }

  /**
   * Borra un comentario propio.
   *
   * Solo comentarios: los contactos son un registro inmutable y la política de
   * la base (`0047`) tampoco los deja. Acá se filtra igual por `channel` para
   * que el botón ni siquiera aparezca, en vez de dejar que la base lo rechace.
   */
  async function borrarComentario(id: string) {
    setBorrando(id);
    const { error } = await supabase.from('interactions').delete().eq('id', id).eq('channel', 'note');
    setBorrando(null);
    if (error) return toast.error('No se pudo borrar: ' + error.message);
    toast.success('Comentario borrado');
    await cargarHistorial();
    router.refresh();
  }

  async function uploadAttachment(interactionId: string, file: File) {
    if (file.size > MAX_ATTACHMENT_BYTES) return toast.error('El archivo no puede superar 10 MB.');
    setUploadingFor(interactionId);
    const path = attachmentPath(interactionId, file.name);
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
                  {cierraElCliente(outcome) && (
                    // El resultado ahora decide el estado. Se avisa antes de
                    // guardar: cerrar un cliente en silencio sería peor que el
                    // problema que esto resuelve.
                    <p className="mt-3 rounded-lg border border-destructive/30 bg-[var(--badge-danger-bg)] px-3 py-2 text-xs text-destructive">
                      Al guardar, el cliente pasa a <strong>Perdido</strong> y deja de aparecer en
                      pendientes. Se puede revertir cambiando el estado abajo.
                    </p>
                  )}

                  <p className="mt-3 mb-1 text-xs font-medium text-muted-foreground">Próximo seguimiento</p>
                  <div className="flex flex-wrap gap-1.5">
                    {OPCIONES_SEGUIMIENTO.map((f) => (
                      <button
                        key={f.label}
                        onClick={() => setProximo({ tipo: 'dias', dias: f.dias })}
                        className={`rounded-full border px-3 py-1 text-xs transition ${
                          proximo.tipo === 'dias' && proximo.dias === f.dias
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-foreground hover:bg-muted'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setProximo({ tipo: 'ninguno' })}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        proximo.tipo === 'ninguno'
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-foreground hover:bg-muted'
                      }`}
                    >
                      Sin seguimiento
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">o el día</span>
                    <input
                      type="date"
                      value={proximo.tipo === 'fecha' ? proximo.fecha : ''}
                      onChange={(e) => setProximo({ tipo: 'fecha', fecha: e.target.value })}
                      className={`rounded-lg border bg-card px-2 py-1 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 ${
                        proximo.tipo === 'fecha' ? 'border-primary' : 'border-border'
                      }`}
                    />
                  </div>
                  {proximo.tipo === 'ninguno' && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Se borra la fecha que tuviera y deja de avisar por este cliente.
                    </p>
                  )}
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
                {history.map((i) => {
                  // Un comentario no es un contacto, y hasta ahora se veían
                  // idénticos: la misma tarjeta, el mismo peso. El comentario va
                  // más apagado y sin la línea de "resultado", que no tiene.
                  const esComentario = i.channel === 'note';
                  const puedeBorrar = esComentario && canWrite && i.user_id === currentUserId;
                  return (
                  <li
                    key={i.id}
                    className={`rounded-lg border px-3 py-2 ${
                      esComentario
                        ? 'border-dashed border-border bg-transparent'
                        : 'border-border bg-background/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        {esComentario ? (
                          <MessageSquarePlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : null}
                        {esComentario ? 'Comentario' : CHANNEL_LABELS[i.channel]}
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

                    {puedeBorrar && (
                      <button
                        onClick={() => borrarComentario(i.id)}
                        disabled={borrando === i.id}
                        className="mt-1.5 mr-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        {borrando === i.id ? 'Borrando…' : 'Borrar'}
                      </button>
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
                  );
                })}
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
