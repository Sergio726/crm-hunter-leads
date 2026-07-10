import { requireMember } from '@/lib/auth';
import { SellerShell } from '@/components/vendedor/SellerShell';
import { GhlBrowser } from '@/components/ghl/GhlBrowser';

export default async function VendedorContactosGhlPage() {
  const profile = await requireMember();

  return (
    <SellerShell profile={profile} title="Contactos GHL">
      <GhlBrowser selfAssignId={profile.id} />
    </SellerShell>
  );
}
