'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserPlus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input, Select, Label } from '@/components/ui/Field';

type Seller = { id: string; name: string };

const EMPTY = {
  full_name: '',
  phone: '',
  email: '',
  phone_2: '',
  email_2: '',
  company: '',
  tags: '',
  assigned_to: '',
  notes: '',
};

export function AddClientDialog({
  sellers,
  defaultAssignedTo,
}: {
  sellers: Seller[];
  /** Si viene seteado (vendedor), oculta el selector y asigna siempre a esta persona. */
  defaultAssignedTo?: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY, assigned_to: defaultAssignedTo ?? '' });

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) return toast.error('El nombre es obligatorio.');
    setSaving(true);
    const { error } = await supabase.from('clients').insert({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      phone_2: form.phone_2.trim() || null,
      email_2: form.email_2.trim() || null,
      company: form.company.trim() || null,
      notes: form.notes.trim() || null,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      origin: 'app',
      status: 'pending',
      assigned_to: form.assigned_to || null,
    });
    setSaving(false);
    if (error) return toast.error('Error al guardar: ' + error.message);
    toast.success('Cliente agregado');
    setForm({ ...EMPTY });
    setOpen(false);
    router.refresh();
  }

  const inputBase =
    'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30';

  return (
    <>
      {/* En el teléfono la barra no entraba: los cuatro controles de la
          derecha sumaban más que el ancho de la pantalla y "Nuevo cliente"
          quedaba cortado contra el borde. Acá el rótulo se acorta; el resto lo
          resuelve el `flex-wrap` de la barra. */}
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Nuevo<span className="hidden sm:inline">&nbsp;cliente</span>
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 md:backdrop-blur-sm"
            onClick={() => !saving && setOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Nuevo cliente</h2>
              <button onClick={() => setOpen(false)} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={save} className="space-y-3">
              <div>
                <Label>Nombre *</Label>
                <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Juan Pérez" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Teléfono</Label>
                  <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+54 9 11 …" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="juan@empresa.com" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Teléfono secundario</Label>
                  <Input value={form.phone_2} onChange={(e) => set('phone_2', e.target.value)} placeholder="+54 9 11 …" />
                </div>
                <div>
                  <Label>Email secundario</Label>
                  <Input type="email" value={form.email_2} onChange={(e) => set('email_2', e.target.value)} placeholder="otro@empresa.com" />
                </div>
              </div>
              <div>
                <Label>Empresa</Label>
                <Input value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Empresa SA" />
              </div>
              <div className={defaultAssignedTo ? '' : 'grid grid-cols-2 gap-3'}>
                {!defaultAssignedTo && (
                  <div>
                    <Label>Asignar a</Label>
                    <Select value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)}>
                      <option value="">Sin asignar</option>
                      {sellers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Tags (separadas por coma)</Label>
                  <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="warm, evento" />
                </div>
              </div>
              <div>
                <Label>Notas</Label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={2}
                  placeholder="Contexto, interés, origen del contacto…"
                  className={inputBase}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
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
    </>
  );
}
