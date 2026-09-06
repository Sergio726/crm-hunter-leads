import { requireAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { TeamManager, type AccessByUser } from '@/components/equipo/TeamManager';
import type { Profile, Role, SellerStats } from '@/lib/types';

export default async function EquipoPage() {
  const { profile, sections } = await requireAccess('equipo');
  const supabase = await createClient();

  const { data: members } = await supabase
    .from('profiles')
    // phone hace falta para el botón de WhatsApp de MemberAccessActions.
    .select('id, email, full_name, avatar_url, role, phone')
    .order('email');
  const { data: stats } = await supabase.from('v_seller_stats').select('*');

  // Invitados que todavía no entraron nunca: están en alguna de las 3 listas pero sin profile.
  const { data: settings } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['allowed_emails', 'superadmin_emails', 'viewer_emails']);
  const listByKey = new Map((settings ?? []).map((s) => [s.key, s.value]));
  const asEmails = (key: string): string[] =>
    Array.isArray(listByKey.get(key)) ? (listByKey.get(key) as string[]) : [];
  const memberEmails = new Set((members ?? []).map((m) => m.email.toLowerCase()));
  const invitedPending: { email: string; role: Role }[] = [
    ...asEmails('allowed_emails').map((email) => ({ email, role: 'seller' as Role })),
    ...asEmails('superadmin_emails').map((email) => ({ email, role: 'superadmin' as Role })),
    ...asEmails('viewer_emails').map((email) => ({ email, role: 'viewer' as Role })),
  ].filter((i) => !memberEmails.has(i.email.toLowerCase()));

  // Quién nunca entró. `last_sign_in_at` vive en auth.users, así que va por RPC
  // (0034). Si falla o el que mira no es superadmin, devuelve vacío y la
  // pantalla simplemente no muestra la señal: no es motivo para romperla.
  const { data: accessRows } = await supabase.rpc('member_access_status');
  const access: AccessByUser = Object.fromEntries(
    ((accessRows as { user_id: string; last_sign_in_at: string | null }[]) ?? []).map((r) => [
      r.user_id,
      { lastSignInAt: r.last_sign_in_at },
    ]),
  );

  return (
    <AppShell profile={profile} sections={sections} title="Equipo">
      <TeamManager
        members={(members as Profile[]) ?? []}
        stats={(stats as SellerStats[]) ?? []}
        invited={invitedPending}
        currentUserId={profile.id}
        access={access}
      />
    </AppShell>
  );
}
