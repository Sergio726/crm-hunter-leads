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

  return (
    <AppShell profile={profile} title="Equipo">
      <TeamManager members={(members as Profile[]) ?? []} stats={(stats as SellerStats[]) ?? []} />
    </AppShell>
  );
}
