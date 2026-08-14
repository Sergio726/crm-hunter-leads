'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SectionCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Label } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';

type Settings = {
  daily_goal: number;
  whatsapp_mode: string;
  timezone: string;
  superadmin_emails: string[];
  crm_sync_enabled: boolean;
  ghl_auto_import_enabled: boolean;
  ghl_auto_import_tags: string[];
  ghl_status_stage_map: Record<string, string>;
  ai_enabled: boolean;
  ai_model: string;
  /** Estado de las API keys guardadas: si están cargadas y sus últimos 4 caracteres. Nunca el valor. */
  secrets: Record<string, { configured: boolean; hint: string } | undefined>;
};

/** Sugerencias de modelo. El campo es libre — OpenRouter expone cientos. */
const MODEL_SUGGESTIONS = [
  { id: '', label: 'Automático (openrouter/auto)' },
  { id: 'anthropic/claude-sonnet-4.5', label: 'anthropic/claude-sonnet-4.5' },
  { id: 'openai/gpt-4.1-mini', label: 'openai/gpt-4.1-mini' },
  { id: 'google/gemini-2.5-flash', label: 'google/gemini-2.5-flash' },
];

const TIMEZONES = [
  'America/Argentina/Buenos_Aires',
  'America/Montevideo',
  'America/Santiago',
  'America/Bogota',
  'America/Mexico_City',
  'America/Lima',
  'America/Sao_Paulo',
];

export function SettingsForm({ initial }: { initial: Settings }) {
  const supabase = createClient();
  const router = useRouter();
  const [goal, setGoal] = useState(String(initial.daily_goal));
  const [waMode, setWaMode] = useState(initial.whatsapp_mode);
  const [tz, setTz] = useState(initial.timezone);
  const [admins, setAdmins] = useState<string[]>(initial.superadmin_emails);
  const [newAdmin, setNewAdmin] = useState('');
  const [crmSyncEnabled, setCrmSyncEnabled] = useState(initial.crm_sync_enabled);
  const [ghlAutoImport, setGhlAutoImport] = useState(initial.ghl_auto_import_enabled);
  const [ghlTags, setGhlTags] = useState(initial.ghl_auto_import_tags.join(', '));
  const [stageMapJson, setStageMapJson] = useState(
    JSON.stringify(initial.ghl_status_stage_map ?? {}, null, 2),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(initial.ai_enabled);
  const [aiModel, setAiModel] = useState(initial.ai_model);
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [placesKey, setPlacesKey] = useState('');
  const [apifyToken, setApifyToken] = useState('');

  /**
   * Guarda una API key vía RPC. El valor viaja a Postgres y queda en
   * `private.integration_secrets`: no vuelve nunca al navegador ni se guarda en
   * `app_settings` (que sí es legible por cualquier usuario autenticado).
   */
  async function saveSecret(key: string, value: string, label: string) {
    setBusy(key);
    const { error } = await supabase.rpc('set_integration_secret', {
      p_key: key,
      p_value: value,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(value.trim() ? `${label} guardada` : `${label} borrada`);
    if (key === 'openrouter_api_key') setOpenrouterKey('');
    if (key === 'google_places_api_key') setPlacesKey('');
    if (key === 'apify_api_token') setApifyToken('');
    router.refresh();
  }

  async function saveKey(
    key: string,
    value: number | string | string[] | boolean | Record<string, string>,
    label: string,
  ) {
    setBusy(key);
    const { error } = await supabase.from('app_settings').update({ value }).eq('key', key);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`${label} guardado`);
    router.refresh();
  }

  async function addAdmin() {
    const email = newAdmin.trim().toLowerCase();
    if (!email.includes('@')) return toast.error('Email inválido');
    if (admins.includes(email)) return toast.error('Ya está en la lista');
    const next = [...admins, email];
    setAdmins(next);
    setNewAdmin('');
    await saveKey('superadmin_emails', next, 'Administradores');
  }

  async function removeAdmin(email: string) {
    const next = admins.filter((e) => e !== email);
    setAdmins(next);
    await saveKey('superadmin_emails', next, 'Administradores');
  }

  const tzOptions = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];

  return (
    <div className="max-w-2xl space-y-6">
      <SectionCard title="Meta diaria del equipo" description="Cuántos contactos por día son la meta de cada vendedor (afecta el banner de la app).">
        <div className="flex items-end gap-2">
          <div className="w-32">
            <Label>Contactos / día</Label>
            <Input type="number" min={1} value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <Button onClick={() => saveKey('daily_goal', Number(goal) || 1, 'Meta diaria')} disabled={busy === 'daily_goal'}>
            Guardar
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Envío de WhatsApp" description="Deeplink: abre WhatsApp en el teléfono. API: envío directo (requiere credenciales en el servidor).">
        <div className="flex items-end gap-2">
          <div className="w-56">
            <Label>Modo</Label>
            <Select value={waMode} onChange={(e) => setWaMode(e.target.value)}>
              <option value="deeplink">Deeplink (abre la app)</option>
              <option value="api">API (envío directo)</option>
            </Select>
          </div>
          <Button onClick={() => saveKey('whatsapp_mode', waMode, 'Modo WhatsApp')} disabled={busy === 'whatsapp_mode'}>
            Guardar
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Prospección — asistente de IA"
        description="El asistente que ayuda a definir el avatar en la sección Prospección. Corre sobre OpenRouter. Si lo apagás o no cargás la key, Prospección sigue funcionando en modo guiado (los filtros se cargan a mano)."
      >
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span>
              Asistente <strong>{aiEnabled ? 'activo' : 'apagado'}</strong>
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveKey('ai_enabled', aiEnabled, 'Asistente de IA')}
              disabled={busy === 'ai_enabled'}
            >
              Guardar
            </Button>
          </label>

          <div>
            <Label>API key de OpenRouter</Label>
            <div className="flex items-end gap-2">
              <Input
                type="password"
                autoComplete="off"
                value={openrouterKey}
                onChange={(e) => setOpenrouterKey(e.target.value)}
                placeholder={
                  initial.secrets.openrouter_api_key?.configured
                    ? `Configurada (termina en ${initial.secrets.openrouter_api_key.hint})`
                    : 'sk-or-v1-…'
                }
              />
              <Button
                onClick={() => saveSecret('openrouter_api_key', openrouterKey, 'API key de OpenRouter')}
                disabled={busy === 'openrouter_api_key' || openrouterKey.trim().length === 0}
              >
                Guardar
              </Button>
              {initial.secrets.openrouter_api_key?.configured && (
                <Button
                  variant="destructive"
                  onClick={() => saveSecret('openrouter_api_key', '', 'API key de OpenRouter')}
                  disabled={busy === 'openrouter_api_key'}
                >
                  Borrar
                </Button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Se guarda en un esquema privado de la base, fuera del alcance de la API pública, y no
              vuelve al navegador. Se saca en openrouter.ai → Keys.
            </p>
          </div>

          <div>
            <Label>Modelo</Label>
            <div className="flex items-end gap-2">
              <Input
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="openrouter/auto"
                list="modelos-openrouter"
              />
              <datalist id="modelos-openrouter">
                {MODEL_SUGGESTIONS.filter((m) => m.id).map((m) => (
                  <option key={m.id} value={m.id} />
                ))}
              </datalist>
              <Button
                onClick={() => saveKey('ai_model', aiModel.trim(), 'Modelo')}
                disabled={busy === 'ai_model'}
              >
                Guardar
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Vacío = <code>openrouter/auto</code> (OpenRouter elige). Conviene un modelo que
              soporte tool calling; si no lo soporta, el asistente igual funciona porque acepta la
              propuesta como bloque JSON.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Prospección — Google Places"
        description="La búsqueda de negocios usa Google Places API (New). Sin esta key, la sección Prospección no puede buscar."
      >
        <div>
          <Label>API key de Google Places</Label>
          <div className="flex items-end gap-2">
            <Input
              type="password"
              autoComplete="off"
              value={placesKey}
              onChange={(e) => setPlacesKey(e.target.value)}
              placeholder={
                initial.secrets.google_places_api_key?.configured
                  ? `Configurada (termina en ${initial.secrets.google_places_api_key.hint})`
                  : 'AIza…'
              }
            />
            <Button
              onClick={() => saveSecret('google_places_api_key', placesKey, 'API key de Places')}
              disabled={busy === 'google_places_api_key' || placesKey.trim().length === 0}
            >
              Guardar
            </Button>
            {initial.secrets.google_places_api_key?.configured && (
              <Button
                variant="destructive"
                onClick={() => saveSecret('google_places_api_key', '', 'API key de Places')}
                disabled={busy === 'google_places_api_key'}
              >
                Borrar
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Google Cloud Console → habilitar <strong>Places API (New)</strong> → crear key →
            restringirla a esa API. Cada búsqueda se factura, así que conviene ponerle un límite de
            gasto en Google Cloud.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Prospección — Instagram (Apify)"
        description="Opcional. Permite traer seguidores y última publicación de los prospectos guardados, para distinguir una cuenta viva de una abandonada. Sin este token, el botón Enriquecer no funciona; el resto de Prospección sí."
      >
        <div>
          <Label>Token de Apify</Label>
          <div className="flex items-end gap-2">
            <Input
              type="password"
              autoComplete="off"
              value={apifyToken}
              onChange={(e) => setApifyToken(e.target.value)}
              placeholder={
                initial.secrets.apify_api_token?.configured
                  ? `Configurado (termina en ${initial.secrets.apify_api_token.hint})`
                  : 'apify_api_…'
              }
            />
            <Button
              onClick={() => saveSecret('apify_api_token', apifyToken, 'Token de Apify')}
              disabled={busy === 'apify_api_token' || apifyToken.trim().length === 0}
            >
              Guardar
            </Button>
            {initial.secrets.apify_api_token?.configured && (
              <Button
                variant="destructive"
                onClick={() => saveSecret('apify_api_token', '', 'Token de Apify')}
                disabled={busy === 'apify_api_token'}
              >
                Borrar
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            console.apify.com → Settings → Integrations. Se consulta el actor{' '}
            <code>apify/instagram-profile-scraper</code>, hasta 25 perfiles por lote. Cada consulta
            consume crédito de Apify.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Zona horaria" description="Se usa para agrupar los reportes por día y semana.">
        <div className="flex items-end gap-2">
          <div className="w-72">
            <Label>Zona horaria</Label>
            <Select value={tz} onChange={(e) => setTz(e.target.value)}>
              {tzOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
          <Button onClick={() => saveKey('timezone', tz, 'Zona horaria')} disabled={busy === 'timezone'}>
            Guardar
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Sincronización con GHL"
        description="Pausa o reactiva toda la comunicación automática vía n8n: push, inbound, auto-import, reintentos y notificaciones. No borra las URLs ni las credenciales. Al reactivar, el retry retoma los clientes pendientes."
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={crmSyncEnabled}
              onChange={(e) => setCrmSyncEnabled(e.target.checked)}
              className="rounded border-border"
            />
            Sync automática activa
          </label>
          {!crmSyncEnabled && (
            <p className="text-sm text-muted-foreground">
              Pausada: los cambios en clientes se guardan igual y quedan pendientes hasta que reactivés.
            </p>
          )}
          <Button
            onClick={() => saveKey('crm_sync_enabled', crmSyncEnabled, 'Sincronización GHL')}
            disabled={busy === 'crm_sync_enabled'}
          >
            Guardar
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Importación automática desde GHL"
        description="Cada hora n8n busca contactos nuevos con estos tags y los importa a CRM Lite (requiere flujo Auto-import activo en n8n). Si la sync maestra está pausada, el auto-import no corre aunque este switch esté on."
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ghlAutoImport}
              onChange={(e) => setGhlAutoImport(e.target.checked)}
              className="rounded border-border"
            />
            Activar auto-import por cron
          </label>
          <div>
            <Label>Tags de GHL (separados por coma)</Label>
            <Input
              value={ghlTags}
              onChange={(e) => setGhlTags(e.target.value)}
              placeholder="warm lead, cliente nuevo"
            />
          </div>
          <Button
            onClick={async () => {
              const tags = ghlTags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
              setBusy('ghl_import');
              const e1 = await supabase
                .from('app_settings')
                .update({ value: ghlAutoImport })
                .eq('key', 'ghl_auto_import_enabled');
              const e2 = await supabase
                .from('app_settings')
                .update({ value: tags })
                .eq('key', 'ghl_auto_import_tags');
              setBusy(null);
              if (e1.error || e2.error) return toast.error(e1.error?.message ?? e2.error?.message);
              toast.success('Importación GHL guardada');
              router.refresh();
            }}
            disabled={busy === 'ghl_import'}
          >
            Guardar
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Mapeo estado → stage GHL"
        description='JSON: { "pending": "<stageId>", "contacted": "...", "won": "...", "lost": "..." }. Usá /api/ghl/pipelines para ver IDs.'
      >
        <textarea
          className="w-full min-h-[120px] rounded-md border border-border bg-background p-3 font-mono text-xs"
          value={stageMapJson}
          onChange={(e) => setStageMapJson(e.target.value)}
        />
        <Button
          className="mt-2"
          onClick={async () => {
            let parsed: Record<string, string>;
            try {
              parsed = JSON.parse(stageMapJson) as Record<string, string>;
            } catch {
              return toast.error('JSON inválido');
            }
            await saveKey('ghl_status_stage_map', parsed, 'Mapeo GHL');
          }}
          disabled={busy === 'ghl_status_stage_map'}
        >
          Guardar mapeo
        </Button>
      </SectionCard>

      <SectionCard
        title="Administradores"
        description="Emails que entran como superadmin al iniciar sesión. (No cambia el rol de quien ya inició sesión.)"
      >
        <div className="flex gap-2">
          <Input
            type="email"
            value={newAdmin}
            onChange={(e) => setNewAdmin(e.target.value)}
            placeholder="admin@email.com"
          />
          <Button onClick={addAdmin} disabled={busy === 'superadmin_emails'} className="shrink-0">
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {admins.length === 0 ? (
            <li className="text-sm text-muted-foreground">Sin administradores en la lista.</li>
          ) : (
            admins.map((e) => (
              <li key={e}>
                <Badge tone="primary" className="gap-1 pr-1">
                  {e}
                  <button onClick={() => removeAdmin(e)} aria-label={`Quitar ${e}`} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              </li>
            ))
          )}
        </ul>
      </SectionCard>
    </div>
  );
}
