'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SectionCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  EDITABLE_ROLES,
  SECTIONS,
  type EditableRole,
  type PermissionMap,
} from '@/lib/sections';

const ROLE_LABELS: Record<'superadmin' | EditableRole, string> = {
  superadmin: 'Administrador',
  seller: 'Vendedor',
  viewer: 'Lector',
};

/**
 * Matriz de permisos: qué rol entra a qué sección del panel.
 *
 * Guardado explícito con botón, no al tildar: seis casillas serían seis
 * escrituras peleando entre sí, y un toque accidental queda reversible mientras
 * no se guarde.
 */
export function PermissionsMatrix({
  initial,
  ready,
}: {
  initial: PermissionMap;
  /** false = la migración 0032 no se aplicó todavía. */
  ready: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [perms, setPerms] = useState<PermissionMap>(initial);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(perms) !== JSON.stringify(initial),
    [perms, initial],
  );

  function toggle(sectionId: string, role: EditableRole) {
    setPerms((prev) => ({
      ...prev,
      [sectionId]: { ...prev[sectionId as keyof PermissionMap], [role]: !prev[sectionId as keyof PermissionMap][role] },
    }));
  }

  async function save() {
    setSaving(true);
    // Solo se manda lo configurable. Administrador y las secciones bloqueadas no
    // viajan: son invariantes del código, y el trigger de la base los descarta
    // igual si alguien los inyecta.
    const sections: Record<string, Record<string, boolean>> = {};
    for (const s of SECTIONS) {
      if (s.editableFor.length === 0) continue;
      sections[s.id] = Object.fromEntries(
        s.editableFor.map((r) => [r, perms[s.id][r]]),
      );
    }

    const { data, error } = await supabase
      .from('app_settings')
      .upsert({ key: 'role_permissions', value: { version: 1, sections } }, { onConflict: 'key' })
      .select('key');

    setSaving(false);

    if (error) return toast.error(error.message);
    // `update` sobre una fila inexistente afecta 0 filas y no da error: sin este
    // chequeo el cartel diría "guardado" sin haber guardado nada.
    if (!data?.length) {
      return toast.error('No se pudo guardar: falta aplicar la migración 0032 en la base.');
    }

    toast.success('Permisos guardados');
    router.refresh();
  }

  return (
    <SectionCard
      title="Quién ve cada sección"
      description="Tildá lo que cada rol puede abrir en el panel. El cambio se aplica al instante."
      action={
        dirty ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPerms(initial)} disabled={saving}>
              Descartar
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        ) : null
      }
    >
      {!ready && (
        <p className="mb-4 rounded-lg border border-warning/30 bg-[var(--badge-warning-bg)] px-3 py-2 text-xs text-warning">
          Falta aplicar la migración <code>0032</code> en la base. Hasta entonces el cuadro muestra
          los valores de fábrica y no se puede guardar.
        </p>
      )}

      {/* Escritorio: tabla */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
              <th className="py-2 pr-4 font-medium">Sección</th>
              {(['superadmin', ...EDITABLE_ROLES] as const).map((r) => (
                <th key={r} className="w-28 py-2 text-center font-medium">
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((s) => {
              const locked = s.editableFor.length === 0;
              return (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      {s.label}
                      {locked && <Lock className="h-3 w-3 text-muted-foreground" aria-label="No configurable" />}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                    {s.note && <p className="mt-1 text-xs text-muted-foreground/80">{s.note}</p>}
                  </td>
                  {/* Administrador: siempre todo, y no se puede tocar. */}
                  <td className="text-center">
                    <input type="checkbox" checked readOnly disabled title="El administrador ve todo" />
                  </td>
                  {EDITABLE_ROLES.map((role) => (
                    <td key={role} className="text-center">
                      <input
                        type="checkbox"
                        checked={perms[s.id][role]}
                        disabled={locked || saving}
                        onChange={() => toggle(s.id, role)}
                        aria-label={`${ROLE_LABELS[role]} puede ver ${s.label}`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Móvil: una tarjeta por sección. Nada de tabla con scroll horizontal. */}
      <div className="space-y-3 md:hidden">
        {SECTIONS.map((s) => {
          const locked = s.editableFor.length === 0;
          return (
            <div key={s.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                {s.label}
                {locked && <Lock className="h-3 w-3 text-muted-foreground" aria-label="No configurable" />}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
              {s.note && <p className="mt-1 text-xs text-muted-foreground/80">{s.note}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="flex min-h-11 items-center gap-2 rounded-lg bg-muted px-3 text-sm text-muted-foreground">
                  <input type="checkbox" checked readOnly disabled /> {ROLE_LABELS.superadmin}
                </span>
                {EDITABLE_ROLES.map((role) => (
                  <label
                    key={role}
                    className={`flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                      perms[s.id][role] ? 'border-primary/40 bg-[var(--badge-primary-bg)]' : 'border-border'
                    } ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={perms[s.id][role]}
                      disabled={locked || saving}
                      onChange={() => toggle(s.id, role)}
                    />
                    {ROLE_LABELS[role]}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        Esto controla <strong>qué pantallas</strong> ve cada rol en el panel web. No cambia qué
        datos guarda o lee la base, ni afecta la app del celular. El menú de los demás usuarios se
        actualiza cuando cambien de pantalla; el acceso, en cambio, se aplica al instante.
      </p>
    </SectionCard>
  );
}
