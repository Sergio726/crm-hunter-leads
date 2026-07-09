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
    ghl_auto_import_enabled: Boolean(map.get('ghl_auto_import_enabled') ?? false),
    ghl_auto_import_tags: Array.isArray(map.get('ghl_auto_import_tags'))
      ? (map.get('ghl_auto_import_tags') as string[])
      : [],
    ghl_status_stage_map:
      typeof map.get('ghl_status_stage_map') === 'object' && map.get('ghl_status_stage_map') !== null
        ? (map.get('ghl_status_stage_map') as Record<string, string>)
        : {},
  };

  return (
    <AppShell profile={profile} title="Configuración">
      <SettingsForm initial={initial} />
    </AppShell>
  );
}
