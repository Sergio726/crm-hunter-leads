import { requireSuperadmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { TeamManager } from '@/components/equipo/TeamManager';
import type { Profile, SellerStats } from '@/lib/types';

export default async function EquipoPage() {
  const profile = await requireSuperadmin();
  const supabase = await createClient();

  const { data: members } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, role')
    .order('email');
  const { data: stats } = await supabase.from('v_seller_stats').select('*');

  // Invitados que todavía no entraron nunca: están en allowed_emails pero sin profile.
  const { data: allowedSetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'allowed_emails')
    .single();
  const allowedEmails: string[] = Array.isArray(allowedSetting?.value)
    ? (allowedSetting.value as string[])
    : [];
  const memberEmails = new Set((members ?? []).map((m) => m.email.toLowerCase()));
  const invitedPending = allowedEmails.filter((e) => !memberEmails.has(e.toLowerCase()));

  return (
    <AppShell profile={profile} title="Equipo">
      <TeamManager
        members={(members as Profile[]) ?? []}
        stats={(stats as SellerStats[]) ?? []}
        invited={invitedPending}
      />
    </AppShell>
  );
}
