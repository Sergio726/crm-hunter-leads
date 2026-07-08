import { requireSuperadmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { SettingsForm } from '@/components/config/SettingsForm';

export default async function ConfiguracionPage() {
  const profile = await requireSuperadmin();
  const supabase = await createClient();

  const { data } = await supabase.from('app_settings').select('key, value');
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value]));

  const initial = {
    daily_goal: Number(map.get('daily_goal') ?? 10),
    whatsapp_mode: (map.get('whatsapp_mode') as string) ?? 'deeplink',
    timezone: (map.get('timezone') as string) ?? 'America/Argentina/Buenos_Aires',
    superadmin_emails: (map.get('superadmin_emails') as string[]) ?? [],
  };

  return (
    <AppShell profile={profile} title="Configuración">
      <SettingsForm initial={initial} />
    </AppShell>
  );
}
