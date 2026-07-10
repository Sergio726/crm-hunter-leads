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
  ghl_auto_import_enabled: boolean;
  ghl_auto_import_tags: string[];
  ghl_status_stage_map: Record<string, string>;
};

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
  const [ghlAutoImport, setGhlAutoImport] = useState(initial.ghl_auto_import_enabled);
  const [ghlTags, setGhlTags] = useState(initial.ghl_auto_import_tags.join(', '));
  const [stageMapJson, setStageMapJson] = useState(
    JSON.stringify(initial.ghl_status_stage_map ?? {}, null, 2),
  );
  const [busy, setBusy] = useState<string | null>(null);

  async function saveKey(key: string, value: number | string | string[] | Record<string, string>, label: string) {
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
        title="Importación automática desde GHL"
        description="Cada hora n8n busca contactos nuevos con estos tags y los importa a CRM Lite (requiere flujo Auto-import activo en n8n)."
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
