import { requireAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { GhlBrowser } from '@/components/ghl/GhlBrowser';
import type { Profile } from '@/lib/types';

export default async function ContactosGhlPage() {
  const { profile, sections } = await requireAccess('contactos-ghl');

  // Vendedor: importa siempre a su propia lista (WEB-22, antes vivía en /vendedor/contactos-ghl).
  if (profile.role === 'seller') {
    return (
      <AppShell profile={profile} sections={sections} title="Contactos GHL">
        <GhlBrowser selfAssignId={profile.id} />
      </AppShell>
    );
  }

  const supabase = await createClient();
  const { data: sellersData } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['seller', 'superadmin'])
    .order('email');

  const sellers = ((sellersData as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []).map((s) => ({
    id: s.id,
    name: s.full_name ?? s.email,
  }));

  return (
    <AppShell profile={profile} sections={sections} title="Contactos GHL">
      <GhlBrowser sellers={sellers} />
    </AppShell>
  );
}
