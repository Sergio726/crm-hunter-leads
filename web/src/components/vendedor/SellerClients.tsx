'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SellerClientDrawer } from './SellerClientDrawer';
import type { Client } from '@/lib/types';

const TODAY = new Date().toISOString().slice(0, 10);
const overdue = (c: Client) => !!c.next_follow_up && c.next_follow_up <= TODAY;

const EMPTY = { full_name: '', phone: '', email: '', company: '', notes: '' };

export function SellerClients({ clients, sellerId }: { clients: Client[]; sellerId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [selected, setSelected] = useState<Client | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) return toast.error('El nombre es obligatorio.');
    setSaving(true);
    const { error } = await supabase.from('clients').insert({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      company: form.company.trim() || null,
      notes: form.notes.trim() || null,
      origin: 'app',
      status: 'pending',
      assigned_to: sellerId,
    });
    setSaving(false);
    if (error) return toast.error('Error: ' + error.message);
    toast.success('Cliente agregado');
    setForm({ ...EMPTY });
    setAdding(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{clients.length} pendiente(s)</p>
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Nuevo cliente
        </Button>
      </div>

      {clients.length === 0 ? (
        <EmptyState title="No tenés clientes pendientes" description="¡Buen trabajo! 🎉" />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className="rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{c.full_name}</p>
                  {c.company && <p className="text-xs text-muted-foreground">{c.company}</p>}
                  {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                </div>
                {overdue(c) && <Badge tone="danger">vencido</Badge>}
              </div>
            </button>
          ))}
        </div>
      )}

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !saving && setAdding(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Nuevo cliente</h2>
              <button onClick={() => setAdding(false)} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={add} className="space-y-3">
              <div>
                <Label>Nombre *</Label>
                <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} autoFocus />
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
              <div>
                <Label>Notas</Label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setAdding(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selected && <SellerClientDrawer client={selected} sellerId={sellerId} onClose={() => setSelected(null)} />}
    </div>
  );
}
