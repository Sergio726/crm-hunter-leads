import { requireSuperadmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { TeamManager } from '@/components/equipo/TeamManager';
import type { Profile, Role, SellerStats } from '@/lib/types';

export default async function EquipoPage() {
  const profile = await requireSuperadmin();
  const supabase = await createClient();

  const { data: members } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, role')
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

  return (
    <AppShell profile={profile} title="Equipo">
      <TeamManager
        members={(members as Profile[]) ?? []}
        stats={(stats as SellerStats[]) ?? []}
        invited={invitedPending}
        currentUserId={profile.id}
      />
    </AppShell>
  );
}
