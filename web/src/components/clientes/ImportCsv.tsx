'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Upload, X, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import type { Client } from '@/lib/types';

type Seller = { id: string; name: string };
type Row = {
  full_name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  tags: string[];
  duplicate?: boolean;
};

const TEMPLATE_CSV = 'nombre,telefono,email,empresa,tags\nJuan Pérez,+5491112345678,juan@empresa.com,Empresa SA,warm;evento';

function normPhone(p: string | null) {
  return (p ?? '').replace(/\D/g, '');
}
function normEmail(e: string | null) {
  return (e ?? '').trim().toLowerCase();
}

function parseCsv(text: string): Omit<Row, 'duplicate'>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iName = idx(['nombre', 'name', 'full_name', 'contacto']);
  const iPhone = idx(['telefono', 'teléfono', 'phone', 'celular', 'whatsapp']);
  const iEmail = idx(['email', 'correo', 'mail']);
  const iCompany = idx(['empresa', 'company', 'compañia', 'compania']);
  const iTags = idx(['tags', 'etiquetas']);
  const out: Omit<Row, 'duplicate'>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep);
    const name = (iName >= 0 ? cols[iName] : cols[0] ?? '').trim();
    if (!name) continue;
    out.push({
      full_name: name,
      phone: iPhone >= 0 ? cols[iPhone]?.trim() || null : null,
      email: iEmail >= 0 ? cols[iEmail]?.trim() || null : null,
      company: iCompany >= 0 ? cols[iCompany]?.trim() || null : null,
      tags:
        iTags >= 0 && cols[iTags]
          ? cols[iTags].split(/[|;]/).map((t) => t.trim()).filter(Boolean)
          : [],
    });
  }
  return out;
}

function markDuplicates(rows: Omit<Row, 'duplicate'>[], existing: Client[]): Row[] {
  const phones = new Set(existing.map((c) => normPhone(c.phone)).filter(Boolean));
  const emails = new Set(existing.map((c) => normEmail(c.email)).filter(Boolean));
  return rows.map((r) => {
    const phoneDup = normPhone(r.phone) && phones.has(normPhone(r.phone));
    const emailDup = normEmail(r.email) && emails.has(normEmail(r.email));
    return { ...r, duplicate: !!(phoneDup || emailDup) };
  });
}

export function ImportCsvDialog({
  sellers,
  existingClients,
}: {
  sellers: Seller[];
  existingClients: Client[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [sellerId, setSellerId] = useState('');
  const [busy, setBusy] = useState(false);

  const importable = useMemo(() => rows.filter((r) => !r.duplicate), [rows]);
  const duplicateCount = rows.length - importable.length;

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result));
      const marked = markDuplicates(parsed, existingClients);
      setRows(marked);
      if (parsed.length === 0) {
        toast.error('No se detectaron filas. La primera fila debe tener encabezados (nombre, telefono, email...).');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-clientes.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setRows([]);
    setSellerId('');
  }

  async function importRows() {
    if (importable.length === 0) return;
    setBusy(true);
    const payload = importable.map((r) => ({
      full_name: r.full_name,
      phone: r.phone,
      email: r.email,
      company: r.company,
      tags: r.tags,
      origin: 'app' as const,
      status: 'pending' as const,
      assigned_to: sellerId || null,
    }));
    const { data, error } = await supabase.from('clients').insert(payload).select('id');
    setBusy(false);
    if (error) return toast.error('Error al importar: ' + error.message);
    toast.success(
      `Importados ${data?.length ?? 0}${duplicateCount > 0 ? ` · ${duplicateCount} duplicados omitidos` : ''}`,
    );
    close();
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" />
        Importar CSV
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Importar clientes por CSV</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Encabezados: nombre, telefono, email, empresa, tags
                </p>
              </div>
              <button onClick={close} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-6 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={onFile}
                  className="block text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:text-foreground"
                />
                <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                  <Download className="h-4 w-4" />
                  Plantilla
                </Button>
              </div>

              {rows.length > 0 && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {rows.length} fila(s) · {importable.length} nuevas
                    {duplicateCount > 0 ? ` · ${duplicateCount} duplicado(s)` : ''}
                  </p>
                  <div className="max-h-64 overflow-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Nombre</th>
                          <th className="px-3 py-2 font-medium">Teléfono</th>
                          <th className="px-3 py-2 font-medium">Email</th>
                          <th className="px-3 py-2 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} className="border-b border-border/60">
                            <td className="px-3 py-2">{r.full_name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.phone ?? '—'}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.email ?? '—'}</td>
                            <td className="px-3 py-2">
                              {r.duplicate ? (
                                <Badge tone="warning">Duplicado</Badge>
                              ) : (
                                <Badge tone="success">Nuevo</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-4">
              <Select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className="w-auto min-w-40">
                <option value="">Sin asignar</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
              <div className="flex gap-2">
                <Button variant="outline" onClick={close} disabled={busy}>
                  Cancelar
                </Button>
                <Button onClick={importRows} disabled={busy || importable.length === 0}>
                  {busy ? 'Importando…' : `Importar ${importable.length}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
