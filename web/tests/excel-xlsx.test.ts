// Tests del generador de .xlsx.
//
// Lo que se prueba acá es lo que NO se ve abriendo el archivo una vez: los casos
// que rompen a los meses, con datos distintos a los de la prueba manual.
//
// La verificación de que Excel lo abre de verdad se hizo aparte, con
// `tests/generar-xlsx-de-prueba.ts` y Excel 16 por automatización. Validar que
// el ZIP y el XML estén bien formados NO alcanza: un .xlsx puede ser
// estructuralmente correcto y aun así hacer que Excel diga "archivo dañado".

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { columnaExcel, construirXlsx, crc32, esNumero } from '../src/lib/excel/xlsx';

describe('columnaExcel', () => {
  it('cuenta como Excel', () => {
    assert.equal(columnaExcel(0), 'A');
    assert.equal(columnaExcel(25), 'Z');
    assert.equal(columnaExcel(26), 'AA');
    assert.equal(columnaExcel(51), 'AZ');
    assert.equal(columnaExcel(52), 'BA');
  });
});

describe('esNumero', () => {
  it('un número es un número', () => {
    assert.equal(esNumero(95), true);
    assert.equal(esNumero('210'), true);
    assert.equal(esNumero('4.8'), true);
    assert.equal(esNumero('-3'), true);
    assert.equal(esNumero(0), true);
  });

  it('un teléfono NO es un número', () => {
    // Es el caso que más duele: como número, "+54 351…" pierde el signo y los
    // espacios, y "011…" pierde el cero de adelante. El teléfono es la columna
    // por la que se paga una búsqueda.
    assert.equal(esNumero('+54 351 352-7623'), false);
    assert.equal(esNumero('+5493514445566'), false);
    assert.equal(esNumero('011 4444-5555'), false);
    assert.equal(esNumero('0351'), false);
  });

  it('el texto y lo vacío tampoco', () => {
    assert.equal(esNumero('Ana Gómez'), false);
    assert.equal(esNumero(''), false);
    assert.equal(esNumero('   '), false);
    assert.equal(esNumero(null), false);
    assert.equal(esNumero(undefined), false);
    assert.equal(esNumero('12 unidades'), false);
  });

  it('cero solo NO es lo mismo que vacío', () => {
    // "0 reseñas" es un dato; una celda vacía es "no sé".
    assert.equal(esNumero('0'), true);
  });
});

describe('crc32', () => {
  it('da el valor conocido para una entrada conocida', () => {
    // Valor de referencia del estándar: CRC-32 de "123456789".
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  });
  it('vacío da cero', () => {
    assert.equal(crc32(new Uint8Array(0)), 0);
  });
});

describe('construirXlsx', () => {
  const bytes = construirXlsx({
    nombre: 'Prospectos',
    encabezados: ['Nombre', 'Teléfono'],
    filas: [['Café & Bar <Tres>', '+54 11 5555-6666']],
  });
  const texto = new TextDecoder().decode(bytes);

  it('es un ZIP', () => {
    // "PK" — sin esto Excel ni lo intenta.
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
  });

  it('trae las seis partes que Excel necesita', () => {
    for (const parte of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]) {
      assert.ok(texto.includes(parte), `falta ${parte}`);
    }
  });

  it('escapa el XML: los nombres los escribe el usuario', () => {
    // Un "&" sin escapar rompe el archivo entero, no solo esa celda.
    assert.ok(texto.includes('Caf&#233;'.replace('&#233;', 'é') + ' &amp; Bar &lt;Tres&gt;'));
    assert.ok(!texto.includes('<Tres>'));
  });

  it('el autofiltro va DESPUÉS de sheetData', () => {
    // El orden es parte del esquema: invertido, Excel rechaza el archivo.
    assert.ok(texto.indexOf('<autoFilter') > texto.indexOf('</sheetData>'));
  });

  it('la fila de encabezado queda fija', () => {
    assert.ok(texto.includes('state="frozen"'));
  });

  it('un nombre de hoja inválido no rompe el archivo', () => {
    // Excel prohíbe : \ / ? * [ ] y corta a 31 caracteres.
    const t = new TextDecoder().decode(
      construirXlsx({
        nombre: 'Reporte: ventas/2026 [final] con un nombre larguísimo',
        encabezados: ['a'],
        filas: [['x']],
      }),
    );
    const m = t.match(/<sheet name="([^"]*)"/);
    assert.ok(m, 'no se encontró el nombre de la hoja');
    assert.ok(!/[:\\/?*[\]]/.test(m[1]), `quedó un carácter prohibido: ${m[1]}`);
    assert.ok(m[1].length <= 31, `${m[1].length} caracteres`);
  });

  it('sin filas igual produce un archivo abrible', () => {
    const vacio = construirXlsx({ nombre: 'Vacío', encabezados: ['a', 'b'], filas: [] });
    assert.ok(vacio.length > 0);
    assert.equal(vacio[0], 0x50);
  });
});
