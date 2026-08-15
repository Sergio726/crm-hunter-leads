import { requireAccess } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getPermissions, permissionsRowExists } from '@/lib/permissions';
import { AppShell } from '@/components/AppShell';
import { SettingsForm } from '@/components/config/SettingsForm';

export default async function ConfiguracionPage() {
  const { profile, sections } = await requireAccess('configuracion');
  const supabase = await createClient();

  const { data } = await supabase.from('app_settings').select('key, value');
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value]));

  // Estado de las API keys: la RPC devuelve solo si están cargadas y sus últimos
  // 4 caracteres. El valor nunca sale de la base. Si la migración 0029 todavía no
  // está aplicada, el error se ignora y la UI muestra los campos vacíos.
  const { data: secretStatus } = await supabase.rpc('integration_secret_status');

  // La matriz se lee con el mismo helper que usan las guardas, así la pantalla
  // y el control de acceso nunca muestran cosas distintas.
  const [permissions, permissionsReady] = await Promise.all([
    getPermissions(),
    permissionsRowExists(),
  ]);

  const initial = {
    daily_goal: Number(map.get('daily_goal') ?? 10),
    whatsapp_mode: (map.get('whatsapp_mode') as string) ?? 'deeplink',
    timezone: (map.get('timezone') as string) ?? 'America/Argentina/Buenos_Aires',
    superadmin_emails: (map.get('superadmin_emails') as string[]) ?? [],
    // Default true: si falta la fila (migración aún no aplicada), no mostramos "pausado".
    crm_sync_enabled: map.has('crm_sync_enabled')
      ? Boolean(map.get('crm_sync_enabled'))
      : true,
    ghl_auto_import_enabled: Boolean(map.get('ghl_auto_import_enabled') ?? false),
    ghl_auto_import_tags: Array.isArray(map.get('ghl_auto_import_tags'))
      ? (map.get('ghl_auto_import_tags') as string[])
      : [],
    ghl_status_stage_map:
      typeof map.get('ghl_status_stage_map') === 'object' && map.get('ghl_status_stage_map') !== null
        ? (map.get('ghl_status_stage_map') as Record<string, string>)
        : {},
    // Default true: si falta la fila, el asistente se considera habilitado
    // (igual degrada a modo guiado si no hay API key cargada).
    ai_enabled: map.has('ai_enabled') ? Boolean(map.get('ai_enabled')) : true,
    ai_model: typeof map.get('ai_model') === 'string' ? (map.get('ai_model') as string) : '',
    secrets: (secretStatus ?? {}) as Record<
      string,
      { configured: boolean; hint: string } | undefined
    >,
    permissions,
    /** false = falta aplicar la migración 0032; la matriz lo avisa en vez de fingir. */
    permissionsReady,
  };

  return (
    <AppShell profile={profile} sections={sections} title="Configuración">
      <SettingsForm initial={initial} />
    </AppShell>
  );
}
