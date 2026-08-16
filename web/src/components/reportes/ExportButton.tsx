'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function ExportButton({
  rows,
  filename,
  label = 'Exportar CSV',
}: {
  rows: Record<string, string | number | null>[];
  filename: string;
  label?: string;
}) {
  function download() {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const esc = (v: string | number | null) => {
      const s = v == null ? '' : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Punto y coma, no coma: Excel en español usa el punto y coma como
    // separador de lista, así que un CSV con comas se abre entero en una sola
    // columna. La marca de codificación (BOM) al principio es lo que hace que
    // los acentos se vean bien. Con las dos cosas, el archivo se abre
    // directamente con doble clic y sin asistente de importación.
    const csv = [
      headers.join(';'),
      ...rows.map((r) => headers.map((h) => esc(r[h])).join(';')),
    ].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={download} disabled={rows.length === 0}>
      <Download className="h-4 w-4" />
      {label}
    </Button>
  );
}
