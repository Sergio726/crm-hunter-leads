import { requireMember } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';
import { ProfileForm } from '@/components/perfil/ProfileForm';

export default async function MiPerfilPage() {
  const profile = await requireMember();

  return (
    <AppShell profile={profile} title="Mi perfil">
      <ProfileForm profile={profile} />
    </AppShell>
  );
}
