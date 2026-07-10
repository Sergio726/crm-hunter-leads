'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { X, Trash2, Save, MessageCircle, Mail, Phone, MessageSquare, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { openContactChannel } from '@/lib/contact-links';
import { Button } from '@/components/ui/Button';
import { Input, Select, Label } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { DateField } from '@/components/ui/DateField';
import type { Channel, Client, ClientStatus, Interaction } from '@/lib/types';
import { STATUS_LABELS, ORIGIN_LABELS, CHANNEL_LABELS, OUTCOME_LABELS } from '@/lib/types';

type Seller = { id: string; name: string };
type HistoryRow = Pick<Interaction, 'id' | 'channel' | 'outcome' | 'notes' | 'contacted_at'> & {
  user: { full_name: string | null; email: string } | null;
};

const STATUS_TONE: Record<ClientStatus, 'warning' | 'primary' | 'success' | 'neutral'> = {
  pending: 'warning',
  contacted: 'primary',
  won: 'success',
  lost: 'neutral',
};

const CONTACT_ACTIONS: { channel: Channel; label: string; icon: typeof Mail }[] = [
  { channel: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { channel: 'sms', label: 'SMS', icon: MessageSquare },
  { channel: 'email', label: 'Email', icon: Mail },
  { channel: 'call', label: 'Llamar', icon: Phone },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

export function ClientDrawer({
  client,
  sellers,
  onClose,
}: {
  client: Client;
  sellers: Seller[];
  onClose: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [form, setForm] = useState({
    full_name: client.full_name,
    phone: client.phone ?? '',
    email: client.email ?? '',
    company: client.company ?? '',
    status: client.status as string,
    assigned_to: client.assigned_to ?? '',
    next_follow_up: client.next_follow_up ?? '',
    tags: (client.tags ?? []).join(', '),
    notes: client.notes ?? '',
  });

  useEffect(() => {
    setForm({
      full_name: client.full_name,
      phone: client.phone ?? '',
      email: client.email ?? '',
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

  function contact(channel: Channel) {
    const ok = openContactChannel(channel, { phone: form.phone || client.phone, email: form.email || client.email });
    if (!ok) {
      const msg =
        channel === 'email' ? 'El cliente no tiene email.' : 'El cliente no tiene teléfono.';
      toast.error(msg);
    }
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
      <div className="absolute inset-0 bg-black/50 md:backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl animate-in slide-in-from-right duration-200">
        <header className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-semibold text-primary">
              {initial}
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">{client.full_name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge tone={STATUS_TONE[client.status]}>{STATUS_LABELS[client.status]}</Badge>
                <Badge tone={client.origin === 'ghl' ? 'accent' : 'neutral'}>{ORIGIN_LABELS[client.origin]}</Badge>
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
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
                    <Icon className="h-5 w-5 text-primary" />
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
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Ver en GoHighLevel
              </a>
            )}
          </section>

          <section>
            <SectionLabel>Datos de contacto</SectionLabel>
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
              <div>
                <Label>Empresa</Label>
                <Input value={form.company} onChange={(e) => set('company', e.target.value)} />
              </div>
            </div>
          </section>

          <section>
            <SectionLabel>Seguimiento</SectionLabel>
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
                <div>
                  <Label>Vendedor</Label>
                  <Select value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)}>
                    <option value="">Sin asignar</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <Label>Próximo seguimiento</Label>
                <DateField value={form.next_follow_up} onChange={(v) => set('next_follow_up', v)} />
              </div>
            </div>
          </section>

          <section>
            <SectionLabel>Etiquetas y notas</SectionLabel>
            <div className="space-y-3">
              <div>
                <Label>Tags (separadas por coma)</Label>
                <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="warm, evento…" />
                {form.tags.trim() && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {form.tags
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .map((t) => (
                        <Badge key={t} tone="accent">{t}</Badge>
                      ))}
                  </div>
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
          </section>

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
                        {CHANNEL_LABELS[i.channel]} · {OUTCOME_LABELS[i.outcome]}
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
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          {confirmDel ? (
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
          )}
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </footer>
      </aside>
    </div>
  );
}
