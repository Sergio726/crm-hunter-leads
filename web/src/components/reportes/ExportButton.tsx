'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { construirXlsx } from '@/lib/excel/xlsx';

/**
 * Baja la tabla como un Excel de verdad.
 *
 * Antes bajaba un CSV, y el botón decía "Exportar Excel". Un CSV se abre, pero
 * no se lee: todas las columnas del mismo ancho, sin encabezado fijo, sin
 * filtros, y —lo peor— **los teléfonos convertidos en números**: "+54 351…"
 * pierde el signo y un "011…" pierde el cero. En una lista de prospectos, el
 * teléfono es justamente la columna por la que se paga.
 *
 * Ahora se arma un `.xlsx` (ver `lib/excel/xlsx.ts`): encabezado fijo, filtros,
 * anchos por contenido, y los teléfonos como texto.
 */
export function ExportButton({
  rows,
  filename,
  label = 'Exportar Excel',
  sheetName = 'Datos',
}: {
  rows: Record<string, string | number | null>[];
  /** Con o sin extensión: se normaliza a `.xlsx`. */
  filename: string;
  label?: string;
  sheetName?: string;
}) {
  function download() {
    if (rows.length === 0) return;

    const encabezados = Object.keys(rows[0]);
    const bytes = construirXlsx({
      nombre: sheetName,
      encabezados,
      filas: rows.map((r) => encabezados.map((h) => r[h])),
    });

    // El nombre se normaliza acá y no en cada pantalla: quien llama no tiene
    // por qué saber en qué formato termina saliendo.
    const nombre = filename.replace(/\.(csv|xlsx?)$/i, '') + '.xlsx';

    const blob = new Blob([bytes as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
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
