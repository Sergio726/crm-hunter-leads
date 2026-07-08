import { requireMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { SellerShell } from '@/components/vendedor/SellerShell';
import { ContactadosList, type ContactadoItem } from '@/components/vendedor/ContactadosList';

export default async function ContactadosPage() {
  const profile = await requireMember();
  const supabase = await createClient();

  const start = new Date();
  const day = (start.getDay() + 6) % 7; // lunes = 0
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('interactions')
    .select('id, channel, outcome, notes, contacted_at, clients(*)')
    .gte('contacted_at', start.toISOString())
    .order('contacted_at', { ascending: false });

  return (
    <SellerShell profile={profile} title="Contactados">
      <ContactadosList items={(data as unknown as ContactadoItem[]) ?? []} sellerId={profile.id} />
    </SellerShell>
  );
}
