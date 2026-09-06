import { requireAccess } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';
import { ProfileForm } from '@/components/perfil/ProfileForm';

export default async function MiPerfilPage() {
  const { profile, sections } = await requireAccess(null);

  return (
    <AppShell profile={profile} sections={sections} title="Mi perfil">
      <ProfileForm profile={profile} />
    </AppShell>
  );
}
