'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import { SectionCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Field';

type Token = {
  id: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

/**
 * Los tokens de la extensión de Chrome, en Mi perfil.
 *
 * Un token es lo que la extensión pega una vez para hablar con el CRM en
 * nombre del vendedor, sin volver a iniciar sesión. Se muestra **una sola vez**
 * al generarlo: después solo existe su hash, así que si se pierde se genera
 * otro y se revoca el viejo.
 *
 * "Última vez usado" es lo que dice si una instalación sigue viva.
 */
export function ExtensionTokens() {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [label, setLabel] = useState('');
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    const r = await fetch('/api/extension/token');
    const data = (await r.json()) as { tokens?: Token[]; error?: string };
    if (!r.ok) {
      // Lo más probable: la 0055 todavía no está aplicada. Se dice, no se esconde.
      toast.error(data.error ?? 'No se pudieron leer los tokens.');
      setTokens([]);
      return;
    }
    setTokens(data.tokens ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  async function generar() {
    setBusy(true);
    try {
      const r = await fetch('/api/extension/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || null }),
      });
      const data = (await r.json()) as { token?: string; error?: string };
      if (!r.ok || !data.token) throw new Error(data.error ?? 'No se pudo generar.');
      setNuevo(data.token);
      setLabel('');
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo generar.');
    } finally {
      setBusy(false);
    }
  }

  async function revocar(id: string) {
    setBusy(true);
    try {
      const r = await fetch('/api/extension/token', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error('No se pudo revocar.');
      toast.success('Token revocado. Esa instalación dejó de funcionar.');
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo revocar.');
    } finally {
      setBusy(false);
    }
  }

  async function copiar() {
    if (!nuevo) return;
    await navigator.clipboard.writeText(nuevo);
    toast.success('Copiado. Pegalo en la extensión.');
  }

  const activos = (tokens ?? []).filter((t) => !t.revoked_at);
  const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-AR') : 'nunca');

  return (
    <SectionCard
      title="Extensión de Chrome"
      description="Para que la extensión de LinkedIn hable con el CRM en tu nombre, sin volver a iniciar sesión."
    >
      {nuevo && (
        <div className="mb-4 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium text-foreground">Tu token nuevo. Se muestra una sola vez.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pegalo en la extensión ahora. Si lo perdés, generás otro: este no se vuelve a ver.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md bg-background px-2 py-1.5 font-mono text-xs">
              {nuevo}
            </code>
            <Button size="sm" onClick={copiar}>
              <Copy className="h-4 w-4" />
              Copiar
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setNuevo(null)}>
            Ya lo pegué
          </Button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label>Nombre, para reconocerlo</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Chrome de la notebook"
            disabled={busy}
          />
        </div>
        <Button onClick={generar} disabled={busy}>
          <KeyRound className="h-4 w-4" />
          Generar token
        </Button>
      </div>

      {tokens === null ? (
        <p className="mt-3 text-xs text-muted-foreground">Cargando…</p>
      ) : activos.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Todavía no tenés ningún token. Generá uno y pegalo en la extensión.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border text-sm">
          {activos.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{t.label ?? 'Sin nombre'}</p>
                <p className="text-xs text-muted-foreground">
                  Creado el {fecha(t.created_at)} · última vez usado: {fecha(t.last_used_at)}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => revocar(t.id)} disabled={busy} title="Revocar">
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
