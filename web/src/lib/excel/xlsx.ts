// Genera un archivo .xlsx de verdad, sin dependencias.
//
// POR QUÉ NO UN CSV
//
// El botón decía "Exportar Excel" y bajaba un CSV. Un CSV se abre, pero no se
// lee: todas las columnas del mismo ancho, sin encabezado fijo, sin filtros, y
// los teléfonos convertidos en números —"+54 351…" pierde el signo y los ceros
// a la izquierda desaparecen—.
//
// POR QUÉ SIN LIBRERÍA
//
// Un .xlsx es un ZIP con cinco archivos XML. Meter una librería de planillas
// (~1 MB) en el paquete que baja el navegador para generar una tabla de texto no
// se justifica. Está verificado abriendo el resultado con Excel de verdad, no
// solo comprobando que el ZIP esté bien formado.
//
// El ZIP se arma SIN compresión (método "stored"). Excel lo acepta igual y evita
// implementar DEFLATE; para unos cientos de filas la diferencia de tamaño es
// irrelevante.

export interface HojaExcel {
  /** Nombre de la pestaña. Excel corta a 31 caracteres y prohíbe : \ / ? * [ ] */
  nombre: string;
  encabezados: string[];
  filas: (string | number | null | undefined)[][];
  /** Ancho de cada columna, en caracteres. Si falta, se calcula por contenido. */
  anchos?: number[];
}

// ── XML ──────────────────────────────────────────────────────────────────────

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Los caracteres de control rompen el archivo entero: Excel lo da por
    // corrupto y no abre nada.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/** 0 → A, 25 → Z, 26 → AA. */
export function columnaExcel(indice: number): string {
  let n = indice + 1;
  let out = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    out = String.fromCharCode(65 + resto) + out;
    n = Math.floor((n - resto) / 26);
  }
  return out;
}

/**
 * ¿Se guarda como número o como texto?
 *
 * Un teléfono NO es un número: "+54 351 352-7623" perdería el signo, y un
 * código con ceros a la izquierda los perdería. Solo pasa como número lo que es
 * inequívocamente numérico y no empieza con `+` ni con un cero seguido de otro
 * dígito.
 */
export function esNumero(v: string | number | null | undefined): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s === '') return false;
  if (/^[+]/.test(s)) return false;
  if (/^0\d/.test(s)) return false;
  return /^-?\d+([.,]\d+)?$/.test(s) && Number.isFinite(Number(s.replace(',', '.')));
}

function celda(ref: string, valor: string | number | null | undefined, estilo: number): string {
  if (valor === null || valor === undefined || valor === '') {
    return `<c r="${ref}" s="${estilo}"/>`;
  }
  if (esNumero(valor)) {
    const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
    return `<c r="${ref}" s="${estilo}"><v>${n}</v></c>`;
  }
  // `inlineStr` evita tener que armar la tabla de cadenas compartidas, que es
  // el archivo que más se rompe cuando se genera a mano.
  return `<c r="${ref}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${esc(
    String(valor),
  )}</t></is></c>`;
}

function anchoSugerido(encabezado: string, filas: HojaExcel['filas'], col: number): number {
  let max = encabezado.length;
  for (const f of filas) {
    const v = f[col];
    if (v === null || v === undefined) continue;
    const largo = String(v).length;
    if (largo > max) max = largo;
  }
  // Techo de 60: una biografía de 500 caracteres no puede volver la columna
  // impracticable. El texto sigue completo en la celda.
  return Math.min(60, Math.max(10, max + 2));
}

function hojaXml(hoja: HojaExcel): string {
  const { encabezados, filas } = hoja;
  const ultimaCol = columnaExcel(Math.max(0, encabezados.length - 1));
  const anchos = encabezados.map(
    (h, i) => hoja.anchos?.[i] ?? anchoSugerido(h, filas, i),
  );

  const cols = anchos
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const filaEncabezado = `<row r="1">${encabezados
    .map((h, i) => celda(`${columnaExcel(i)}1`, h, 1))
    .join('')}</row>`;

  const cuerpo = filas
    .map((f, fi) => {
      const r = fi + 2;
      const celdas = encabezados
        .map((_, ci) => celda(`${columnaExcel(ci)}${r}`, f[ci], 0))
        .join('');
      return `<row r="${r}">${celdas}</row>`;
    })
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:${ultimaCol}${filas.length + 1}"/>` +
    // La fila de encabezado queda fija al desplazarse: con 50 leads, saber qué
    // columna se está mirando es la diferencia entre leerlo y no.
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${filaEncabezado}${cuerpo}</sheetData>` +
    // El autofiltro va DESPUÉS de sheetData: el orden de los elementos es parte
    // del esquema y Excel rechaza el archivo si se invierte.
    `<autoFilter ref="A1:${ultimaCol}${filas.length + 1}"/>` +
    `</worksheet>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="3">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFEFEFEF"/>` +
  `<bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="1"><border/></borders>` +
  `<cellStyleXfs count="1"><xf/></cellStyleXfs>` +
  `<cellXfs count="2">` +
  `<xf xfId="0"/>` +
  `<xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1"/>` +
  `</cellXfs>` +
  `</styleSheet>`;

// ── ZIP (método "stored", sin compresión) ────────────────────────────────────

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i += 1) {
    c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface Entrada {
  nombre: string;
  datos: Uint8Array;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

function armarZip(entradas: Entrada[]): Uint8Array {
  const locales: number[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const e of entradas) {
    const nombre = Array.from(new TextEncoder().encode(e.nombre));
    const crc = crc32(e.datos);
    const tam = e.datos.length;

    const cabecera = [
      ...u32(0x04034b50),
      ...u16(20), // versión mínima
      ...u16(0),
      ...u16(0), // método 0 = stored
      ...u16(0),
      ...u16(0), // fecha/hora: 0, no aporta nada y evita depender del reloj
      ...u32(crc),
      ...u32(tam),
      ...u32(tam),
      ...u16(nombre.length),
      ...u16(0),
      ...nombre,
    ];
    locales.push(...cabecera, ...Array.from(e.datos));

    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(tam),
      ...u32(tam),
      ...u16(nombre.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...nombre,
    );
    offset += cabecera.length + tam;
  }

  const fin = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entradas.length),
    ...u16(entradas.length),
    ...u32(central.length),
    ...u32(offset),
    ...u16(0),
  ];

  return new Uint8Array([...locales, ...central, ...fin]);
}

// ── El armado final ──────────────────────────────────────────────────────────

/** Excel prohíbe estos caracteres en el nombre de la pestaña, y corta a 31. */
function nombreDeHoja(nombre: string): string {
  const limpio = nombre.replace(/[:\\/?*[\]]/g, ' ').trim();
  return (limpio || 'Hoja1').slice(0, 31);
}

export function construirXlsx(hoja: HojaExcel): Uint8Array {
  const enc = new TextEncoder();
  const nombre = nombreDeHoja(hoja.nombre);

  const archivos: Entrada[] = [
    {
      nombre: '[Content_Types].xml',
      datos: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `</Types>`,
      ),
    },
    {
      nombre: '_rels/.rels',
      datos: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`,
      ),
    },
    {
      nombre: 'xl/workbook.xml',
      datos: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
          `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="${esc(nombre)}" sheetId="1" r:id="rId1"/></sheets>` +
          `</workbook>`,
      ),
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      datos: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`,
      ),
    },
    { nombre: 'xl/styles.xml', datos: enc.encode(STYLES_XML) },
    { nombre: 'xl/worksheets/sheet1.xml', datos: enc.encode(hojaXml(hoja)) },
  ];

  return armarZip(archivos);
}
