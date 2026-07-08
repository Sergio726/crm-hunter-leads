import { requireMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { SellerShell } from '@/components/vendedor/SellerShell';
import { ProgressBanner } from '@/components/vendedor/ProgressBanner';
import { SellerClients } from '@/components/vendedor/SellerClients';
import type { Client, MyProgress } from '@/lib/types';

export default async function VendedorPage() {
  const profile = await requireMember();
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from('v_pending_clients')
    .select('*')
    .order('next_follow_up', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  const { data: progressData } = await supabase.rpc('my_progress');
  const progress = (Array.isArray(progressData) ? progressData[0] : progressData) as MyProgress | null;

  return (
    <SellerShell profile={profile} title="Mis pendientes">
      <div className="space-y-4">
        <ProgressBanner progress={progress} />
        <SellerClients clients={(clients as Client[]) ?? []} sellerId={profile.id} />
      </div>
    </SellerShell>
  );
}
