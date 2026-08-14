import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { ProspectStudio } from '@/components/prospeccion/ProspectStudio';
import type { Profile } from '@/lib/types';

export default async function ProspeccionPage() {
  const profile = await requireMember();
  // viewer es solo lectura del CRM: no genera prospectos.
  if (profile.role === 'viewer') redirect('/no-autorizado');

  const isSuperadmin = profile.role === 'superadmin';
  let sellers: { id: string; name: string }[] = [];

  if (isSuperadmin) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .in('role', ['seller', 'superadmin'])
      .order('email');
    sellers = ((data as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []).map((s) => ({
      id: s.id,
      name: s.full_name ?? s.email,
    }));
  }

  return (
    <AppShell profile={profile} title="Prospección">
      <ProspectStudio userId={profile.id} isSuperadmin={isSuperadmin} sellers={sellers} />
    </AppShell>
  );
}
