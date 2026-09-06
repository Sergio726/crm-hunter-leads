// Genera un .xlsx de prueba para abrirlo con Excel de verdad.
//
// No es un test: escribe un archivo y termina. Se corre a mano:
//
//   npx tsx tests/generar-xlsx-de-prueba.ts <ruta-de-salida>
//
// Existe porque validar que el ZIP y el XML estén bien formados NO alcanza: un
// .xlsx puede ser estructuralmente correcto y aun así hacer que Excel diga que
// el archivo está dañado. La única prueba que vale es abrirlo.
//
// Los datos de ejemplo son a propósito los casos que rompen:
//   · comillas y ángulos en un nombre → escapado del XML
//   · un teléfono con "+" y otro con cero adelante → no deben volverse números
//   · celdas vacías
//   · un cero real, que sí es un número

import { writeFileSync } from 'node:fs';
import { construirXlsx } from '../src/lib/excel/xlsx';

const salida = process.argv[2];
if (!salida) {
  console.error('Falta la ruta de salida.');
  process.exit(1);
}

const bytes = construirXlsx({
  nombre: 'Prospectos',
  encabezados: ['Nombre', 'Cargo', 'Empresa', 'Email', 'Teléfono', 'Calificación', 'Reseñas'],
  filas: [
    ['Ana Gorodisch', 'Co-Founder & CEO', 'Kuvia AI', 'ana@kuvia.ai', '+54 351 352-7623', 95, 210],
    ['Estudio Pilates "Núñez"', null, null, null, '011 4444-5555', 61, 34],
    ['Café & Bar <Tres>', 'Dueño', 'Tres SRL', 'hola@tres.com.ar', '+54 11 5555-6666', 74, 0],
  ],
});

writeFileSync(salida, bytes);
console.log(`escrito: ${salida} (${bytes.length} bytes)`);
