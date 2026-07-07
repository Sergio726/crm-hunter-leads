import { requireSuperadmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { GhlBrowser } from '@/components/ghl/GhlBrowser';
import type { Profile } from '@/lib/types';

export default async function ContactosGhlPage() {
  const profile = await requireSuperadmin();
  const supabase = await createClient();

  const { data: sellers } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['seller', 'superadmin'])
    .order('email');

  return (
    <AppShell profile={profile} title="Contactos GHL">
      <GhlBrowser sellers={(sellers as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []} />
    </AppShell>
  );
}
