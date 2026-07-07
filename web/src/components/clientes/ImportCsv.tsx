'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
    setErr(null);
    setMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result));
      setRows(parsed);
      if (parsed.length === 0)
        setErr('No se detectaron filas. La primera fila debe tener encabezados (nombre, telefono, email, empresa, tags).');
    };
    reader.readAsText(file);
  }

  async function importRows() {
    if (rows.length === 0) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    const payload = rows.map((r) => ({
      ...r,
      origin: 'app',
      status: 'pending',
      assigned_to: sellerId || null,
    }));
    const { data, error } = await supabase.from('clients').insert(payload).select('id');
    setBusy(false);
    if (error) return setErr('Error al importar: ' + error.message);
    setMsg(`Importados ${data?.length ?? 0} clientes.`);
    setRows([]);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Importar clientes por CSV</h2>
          <p className="text-xs text-slate-400">Encabezados: nombre, telefono, email, empresa, tags.</p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          {open ? 'Cerrar' : 'Importar CSV'}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="block text-sm" />
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600">{rows.length} fila(s) detectada(s).</span>
              <select
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Sin asignar</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={importRows}
                disabled={busy}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? 'Importando…' : `Importar ${rows.length}`}
              </button>
            </div>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
          {msg && <p className="text-sm text-emerald-700">{msg}</p>}
        </div>
      )}
    </section>
  );
}
