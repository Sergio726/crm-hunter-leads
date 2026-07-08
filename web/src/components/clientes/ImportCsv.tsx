'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SectionCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';

type Seller = { id: string; name: string };
type Row = {
  full_name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  tags: string[];
};

export function ImportCsv({ sellers }: { sellers: Seller[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [sellerId, setSellerId] = useState('');
  const [busy, setBusy] = useState(false);

  function parseCsv(text: string): Row[] {
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
    const out: Row[] = [];
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

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result));
      setRows(parsed);
      if (parsed.length === 0)
        toast.error('No se detectaron filas. La primera fila debe tener encabezados (nombre, telefono, email...).');
    };
    reader.readAsText(file);
  }

  async function importRows() {
    if (rows.length === 0) return;
    setBusy(true);
    const payload = rows.map((r) => ({ ...r, origin: 'app', status: 'pending', assigned_to: sellerId || null }));
    const { data, error } = await supabase.from('clients').insert(payload).select('id');
    setBusy(false);
    if (error) return toast.error('Error al importar: ' + error.message);
    toast.success(`Importados ${data?.length ?? 0} clientes`);
    setRows([]);
    setOpen(false);
    router.refresh();
  }

  return (
    <SectionCard
      title="Importar clientes por CSV"
      description="Encabezados: nombre, telefono, email, empresa, tags."
      action={
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          <Upload className="h-4 w-4" />
          {open ? 'Cerrar' : 'Importar CSV'}
        </Button>
      }
    >
      {open ? (
        <div className="space-y-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="block text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          />
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{rows.length} fila(s) detectada(s).</span>
              <Select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className="w-auto">
                <option value="">Sin asignar</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
              <Button onClick={importRows} disabled={busy}>
                {busy ? 'Importando…' : `Importar ${rows.length}`}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Subí un archivo CSV para cargar muchos leads de una vez.</p>
      )}
    </SectionCard>
  );
}
