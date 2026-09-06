import { requireAccess } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';
import { ProfileForm } from '@/components/perfil/ProfileForm';
import { ExtensionTokens } from '@/components/perfil/ExtensionTokens';

export default async function MiPerfilPage() {
  const { profile, sections } = await requireAccess(null);

  return (
    <AppShell profile={profile} sections={sections} title="Mi perfil">
      <div className="space-y-6">
        <ProfileForm profile={profile} />
        <ExtensionTokens />
      </div>
    </AppShell>
  );
}
