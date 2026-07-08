'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserPlus, Check, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SectionCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Profile, SellerStats } from '@/lib/types';

export function TeamManager({ members, stats }: { members: Profile[]; stats: SellerStats[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const statById = new Map(stats.map((s) => [s.user_id, s]));
  const pending = members.filter((m) => m.role === 'pending');
  const sellers = members.filter((m) => m.role === 'seller');
  const admins = members.filter((m) => m.role === 'superadmin');

  async function invite(e?: React.FormEvent) {
    e?.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return;
    setBusy('invite');
    const { error } = await supabase.rpc('invite_member', { p_email: value });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Invitación registrada para ${value}`);
    setEmail('');
    router.refresh();
  }

  async function approve(m: Profile) {
    setBusy(m.id);
    const { error } = await supabase.rpc('invite_member', { p_email: m.email });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`${m.full_name ?? m.email} aprobado`);
    router.refresh();
  }

  async function revoke(m: Profile) {
    setBusy(m.id);
    const { error } = await supabase.rpc('revoke_member', { p_user: m.id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Acceso revocado a ${m.full_name ?? m.email}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Invitar a un vendedor"
        description="Se agrega el email a la lista de autorizados. Cuando entre con Google, queda habilitado."
      >
        <form onSubmit={invite} className="flex gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vendedor@email.com"
          />
          <Button type="submit" disabled={busy === 'invite'} className="shrink-0">
            <UserPlus className="h-4 w-4" />
            {busy === 'invite' ? 'Invitando…' : 'Invitar'}
          </Button>
        </form>
      </SectionCard>

      {pending.length > 0 && (
        <SectionCard title={`Pendientes de aprobación (${pending.length})`}>
          <ul className="space-y-2">
            {pending.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{m.full_name ?? m.email}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                <Button size="sm" onClick={() => approve(m)} disabled={busy === m.id}>
                  <Check className="h-3.5 w-3.5" /> Aprobar
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard title={`Vendedores (${sellers.length})`}>
        {sellers.length === 0 ? (
          <EmptyState
            title="Todavía no hay vendedores activos"
            description="Invitá a alguien con el formulario de arriba."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Vendedor</th>
                  <th className="pb-2 font-medium">Asignados</th>
                  <th className="pb-2 font-medium">Pendientes</th>
                  <th className="pb-2 font-medium">Ganados</th>
                  <th className="pb-2 font-medium">Semana</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {sellers.map((m) => {
                  const s = statById.get(m.id);
                  return (
                    <tr key={m.id} className="border-b border-border/60">
                      <td className="py-2.5">
                        <p className="font-medium text-foreground">{m.full_name ?? m.email}</p>
                        <p className="text-xs text-muted-foreground">{m.email}</p>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{s?.clients_assigned ?? 0}</td>
                      <td className="py-2.5 text-muted-foreground">{s?.clients_pending ?? 0}</td>
                      <td className="py-2.5 text-muted-foreground">{s?.clients_won ?? 0}</td>
                      <td className="py-2.5 text-muted-foreground">{s?.contacts_this_week ?? 0}</td>
                      <td className="py-2.5 text-right">
                        <Button size="sm" variant="outline" onClick={() => revoke(m)} disabled={busy === m.id}>
                          Revocar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title={`Administradores (${admins.length})`}>
        <ul className="space-y-2">
          {admins.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm text-foreground">
              <Badge tone="primary">
                <ShieldCheck className="mr-1 h-3 w-3" /> admin
              </Badge>
              {m.full_name ?? m.email}
              <span className="text-xs text-muted-foreground">{m.email}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
