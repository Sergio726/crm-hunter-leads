'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserPlus, Check, ShieldCheck, Eye, MailQuestion, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SectionCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatRelativeTime } from '@/lib/format-dates';
import type { Profile, Role, SellerStats } from '@/lib/types';
import { MemberAccessActions } from './MemberAccessActions';
import { invokeInvite } from './invite';

/** Último ingreso de cada miembro. Ausente = nunca entró. */
export type AccessByUser = Record<string, { lastSignInAt: string | null }>;

const INVITE_ROLE_LABELS: Record<'seller' | 'superadmin' | 'viewer', string> = {
  seller: 'Vendedor',
  viewer: 'Lector',
  superadmin: 'Administrador',
};

const GOOGLE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/** Heurística: solo Gmail es Google seguro; un dominio propio puede o no ser Workspace. */
function isLikelyGoogleEmail(email: string) {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return GOOGLE_DOMAINS.has(domain);
}

function NonGoogleWarning({ email }: { email: string }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
      <MailQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="font-medium">{email.trim()}</span> no es una cuenta de Gmail: va a poder
        entrar con el enlace del email de invitación. &quot;Continuar con Google&quot; solo le va a funcionar
        si ese email tiene cuenta de Google (los dominios de empresa con Google Workspace sí sirven).
      </span>
    </p>
  );
}

/**
 * "Nunca ingresó" o "Último ingreso hace X".
 *
 * Es la señal que faltaba: sin esto, alguien cuya invitación nunca llegó se ve
 * exactamente igual que un vendedor que trabaja todos los días.
 */
function AccessBadge({ lastSignInAt }: { lastSignInAt: string | null | undefined }) {
  if (lastSignInAt === undefined) return null;
  if (lastSignInAt === null) return <Badge tone="warning">Nunca ingresó</Badge>;
  return (
    <span className="text-xs text-muted-foreground">
      Último ingreso {formatRelativeTime(lastSignInAt)}
    </span>
  );
}

export function TeamManager({
  members,
  stats,
  invited,
  currentUserId,
  access = {},
}: {
  members: Profile[];
  stats: SellerStats[];
  invited: { email: string; role: Role }[];
  currentUserId: string;
  access?: AccessByUser;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'seller' | 'superadmin' | 'viewer'>('seller');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingRoleChange, setConfirmingRoleChange] = useState<string | null>(null);

  const statById = new Map(stats.map((s) => [s.user_id, s]));
  const pending = members.filter((m) => m.role === 'pending');
  const sellers = members.filter((m) => m.role === 'seller');
  const admins = members.filter((m) => m.role === 'superadmin');
  const viewers = members.filter((m) => m.role === 'viewer');

  async function invite(e?: React.FormEvent) {
    e?.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return;
    setBusy('invite');
    const { error } = await supabase.rpc('invite_member', { p_email: value, p_role: inviteRole });
    if (error) {
      setBusy(null);
      return toast.error(error.message);
    }

    // La autorización y el email son dos cosas distintas y pueden fallar por
    // separado. Antes el fracaso del envío se anunciaba con toast.success, así
    // que una invitación que nunca salió parecía enviada.
    try {
      await invokeInvite(supabase, {
        email: value,
        mode: 'send',
        redirectTo: `${window.location.origin}/auth/confirm`,
      });
      toast.success(`Invitación enviada por email a ${value}.`);
    } catch (error) {
      toast.warning(`${value} quedó autorizado, pero el email no se pudo enviar.`, {
        description: `${
          error instanceof Error ? error.message : 'Error desconocido.'
        } Podés pasarle el acceso con «Copiar enlace».`,
      });
    }
    setBusy(null);
    setEmail('');
    setInviteRole('seller');
    router.refresh();
  }

  async function uninvite(value: string) {
    setBusy(value);
    const { error } = await supabase.rpc('uninvite_member', { p_email: value });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Invitación a ${value} eliminada`);
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

  async function setRole(m: Profile, role: 'seller' | 'superadmin' | 'viewer') {
    setBusy(m.id);
    const { error } = await supabase.rpc('set_user_role', { target_user: m.id, new_role: role });
    setBusy(null);
    setConfirmingRoleChange(null);
    if (error) return toast.error(error.message);
    toast.success(`${m.full_name ?? m.email} ahora es ${INVITE_ROLE_LABELS[role].toLowerCase()}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Invitar a un colaborador"
        description="Le llega un email con un enlace para entrar, y también puede usar «Continuar con Google» con ese mismo email."
      >
        <form onSubmit={invite} className="flex gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colaborador@email.com"
          />
          <Select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'seller' | 'superadmin' | 'viewer')}
            className="w-40 shrink-0"
          >
            <option value="seller">Vendedor</option>
            <option value="viewer">Lector</option>
            <option value="superadmin">Administrador</option>
          </Select>
          <Button type="submit" disabled={busy === 'invite'} className="shrink-0">
            <UserPlus className="h-4 w-4" />
            {busy === 'invite' ? 'Invitando…' : 'Invitar'}
          </Button>
        </form>
        {email.includes('@') && !isLikelyGoogleEmail(email) && <NonGoogleWarning email={email} />}
      </SectionCard>

      {invited.length > 0 && (
        <SectionCard
          title={`Invitaciones pendientes (${invited.length})`}
          description="Ya están autorizados pero todavía no tienen perfil. Si el email no llegó, «Copiar enlace» les da el acceso sin depender del correo. «Quitar» saca la autorización, pero no borra la cuenta: no sirve para empezar de cero."
        >
          <ul className="space-y-2">
            {invited.map(({ email: value, role }) => (
              <li key={value} className="rounded-lg bg-muted px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{value}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {INVITE_ROLE_LABELS[role as 'seller' | 'superadmin' | 'viewer']}
                    </span>
                    {!isLikelyGoogleEmail(value) && <Badge tone="warning">no-Gmail</Badge>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <MemberAccessActions email={value} />
                    <Button size="sm" variant="ghost" onClick={() => uninvite(value)} disabled={busy === value}>
                      <X className="h-3.5 w-3.5" /> Quitar
                    </Button>
                  </div>
                </div>
                {!isLikelyGoogleEmail(value) && <NonGoogleWarning email={value} />}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

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
                <tr className="border-b border-border text-left font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
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
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <AccessBadge lastSignInAt={access[m.id]?.lastSignInAt} />
                          <MemberAccessActions
                            email={m.email}
                            phone={m.phone}
                            name={m.full_name}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{s?.clients_assigned ?? 0}</td>
                      <td className="py-2.5 text-muted-foreground">{s?.clients_pending ?? 0}</td>
                      <td className="py-2.5 text-muted-foreground">{s?.clients_won ?? 0}</td>
                      <td className="py-2.5 text-muted-foreground">{s?.contacts_this_week ?? 0}</td>
                      <td className="py-2.5 text-right">
                        {confirmingRoleChange === m.id ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">¿Hacer admin?</span>
                            <Button size="sm" onClick={() => setRole(m, 'superadmin')} disabled={busy === m.id}>
                              Sí
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmingRoleChange(null)}
                              disabled={busy === m.id}
                            >
                              No
                            </Button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmingRoleChange(m.id)}
                              disabled={busy === m.id}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" /> Hacer admin
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => revoke(m)} disabled={busy === m.id}>
                              Revocar
                            </Button>
                          </span>
                        )}
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
          {admins.map((m) => {
            const isSelf = m.id === currentUserId;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" /> admin
                </span>
                {m.full_name ?? m.email}
                <span className="text-xs text-muted-foreground">{m.email}</span>
                <AccessBadge lastSignInAt={access[m.id]?.lastSignInAt} />
                {!isSelf && (
                  <MemberAccessActions email={m.email} phone={m.phone} name={m.full_name} />
                )}
                {!isSelf &&
                  (confirmingRoleChange === m.id ? (
                    <span className="ml-auto inline-flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">¿Bajar a vendedor?</span>
                      <Button size="sm" onClick={() => setRole(m, 'seller')} disabled={busy === m.id}>
                        Sí
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmingRoleChange(null)}
                        disabled={busy === m.id}
                      >
                        No
                      </Button>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => setConfirmingRoleChange(m.id)}
                      disabled={busy === m.id}
                    >
                      Bajar a vendedor
                    </Button>
                  ))}
              </li>
            );
          })}
        </ul>
      </SectionCard>

      {viewers.length > 0 && (
        <SectionCard title={`Lectores (${viewers.length})`} description="Ven todo en modo solo lectura, no pueden editar ni contactar.">
          <ul className="space-y-2">
            {viewers.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" /> lector
                </span>
                {m.full_name ?? m.email}
                <span className="text-xs text-muted-foreground">{m.email}</span>
                <AccessBadge lastSignInAt={access[m.id]?.lastSignInAt} />
                <MemberAccessActions email={m.email} phone={m.phone} name={m.full_name} />
                {confirmingRoleChange === m.id ? (
                  <span className="ml-auto inline-flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">¿Bajar a vendedor?</span>
                    <Button size="sm" onClick={() => setRole(m, 'seller')} disabled={busy === m.id}>
                      Sí
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmingRoleChange(null)}
                      disabled={busy === m.id}
                    >
                      No
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => setConfirmingRoleChange(m.id)}
                    disabled={busy === m.id}
                  >
                    Bajar a vendedor
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
