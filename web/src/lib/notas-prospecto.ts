// Los datos del prospecto que quedaron escritos dentro de las notas del cliente.
//
// Cuando un prospecto se promueve a cliente, `promote_prospects` (migración
// `0036`) vuelca lo que sabía en un bloque de texto al principio de
// `clients.notes`:
//
//   Prospecto detectado por búsqueda.
//   Score: 72
//   Cargo: Dueño
//   Instagram: @olimpo
//   LinkedIn: https://www.linkedin.com/in/juan-perez
//   Ficha: https://maps.google.com/…
//   Sitio: https://acme.com.ar
//   <acá arrancan las notas que escribe la persona>
//
// Ese texto es la única copia de esos datos para **los clientes que ya
// existían**: el vendedor los ve como un párrafo suelto dentro de un cuadro de
// texto de tres renglones, no puede tocar el link de Google Maps y, cuando se
// redacta un mensaje, el modelo los recibe mezclados con las notas de verdad.
//
// Acá se los devuelve a su forma: cada dato por separado y las notas humanas
// aparte. Es un parser de texto y no una migración a propósito — reescribir las
// notas de todos los clientes es irreversible, y si mañana el formato cambia
// este archivo se ajusta sin tocar un solo dato.

/** Lo que el bloque de `promote_prospects` sabe de un negocio. */
export interface DatosDelProspecto {
  score: number | null;
  cargo: string | null;
  instagram: string | null;
  /** Slug de LinkedIn, sin el dominio. */
  linkedin: string | null;
  /** Ficha en Google Maps. */
  mapsUrl: string | null;
  website: string | null;
}

export interface NotasSeparadas {
  /** Los datos que dejó la búsqueda. `null` si el cliente no vino de una. */
  datos: DatosDelProspecto | null;
  /** Lo que escribió una persona. Vacío si solo estaba el bloque automático. */
  libres: string;
}

const ENCABEZADO = 'Prospecto detectado por búsqueda.';

/** Las etiquetas del bloque, en el orden en que las escribe la migración. */
const CAMPOS = ['Score', 'Cargo', 'Instagram', 'LinkedIn', 'Ficha', 'Sitio'] as const;

function limpiar(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  return s.length > 0 ? s : null;
}

/**
 * Separa el bloque automático de las notas escritas por una persona.
 *
 * Se reconoce por la línea de encabezado y por las etiquetas conocidas. Todo lo
 * que no encaje se considera nota humana: ante la duda, el texto de la persona
 * **no se pierde nunca**, que es lo único irreversible acá.
 */
export function separarNotas(notes: string | null | undefined): NotasSeparadas {
  const texto = (notes ?? '').replace(/\r\n/g, '\n');
  if (!texto.trim()) return { datos: null, libres: '' };
  if (!texto.includes(ENCABEZADO)) return { datos: null, libres: texto.trim() };

  const lineas = texto.split('\n');
  const valores: Record<string, string> = {};
  const resto: string[] = [];
  let dentroDelBloque = false;

  for (const linea of lineas) {
    const l = linea.trim();
    if (l === ENCABEZADO) {
      dentroDelBloque = true;
      continue;
    }
    const campo = dentroDelBloque
      ? CAMPOS.find((c) => l.startsWith(`${c}: `))
      : undefined;
    if (campo) {
      valores[campo] = l.slice(campo.length + 2).trim();
      continue;
    }
    // La primera línea que no es un campo conocido cierra el bloque: de ahí en
    // adelante todo es de la persona, incluso si vuelve a aparecer algo con
    // forma de etiqueta.
    if (dentroDelBloque && l !== '') dentroDelBloque = false;
    resto.push(linea);
  }

  const score = Number(valores.Score);
  return {
    datos: {
      score: Number.isFinite(score) && valores.Score ? score : null,
      cargo: limpiar(valores.Cargo),
      // Se guarda con `@` adelante; el handle sirve más sin él.
      instagram: limpiar(valores.Instagram?.replace(/^@/, '')),
      // Se guarda con el dominio pegado; el slug es lo que la app usa.
      linkedin: limpiar(valores.LinkedIn?.replace(/^https?:\/\/(www\.)?linkedin\.com\//, '')),
      mapsUrl: limpiar(valores.Ficha),
      website: limpiar(valores.Sitio),
    },
    libres: resto.join('\n').trim(),
  };
}

/**
 * Rearma el texto completo para guardarlo.
 *
 * La ficha deja editar **solo** las notas humanas, así que al guardar hay que
 * volver a poner el bloque adelante: si no, el primer guardado borraría para
 * siempre los datos de todos los clientes viejos.
 */
export function rearmarNotas(datos: DatosDelProspecto | null, libres: string): string | null {
  const limpio = libres.trim();
  if (!datos) return limpio || null;

  const lineas = [ENCABEZADO];
  if (datos.score !== null) lineas.push(`Score: ${datos.score}`);
  if (datos.cargo) lineas.push(`Cargo: ${datos.cargo}`);
  if (datos.instagram) lineas.push(`Instagram: @${datos.instagram}`);
  if (datos.linkedin) lineas.push(`LinkedIn: https://www.linkedin.com/${datos.linkedin}`);
  if (datos.mapsUrl) lineas.push(`Ficha: ${datos.mapsUrl}`);
  if (datos.website) lineas.push(`Sitio: ${datos.website}`);
  if (limpio) lineas.push(limpio);
  return lineas.join('\n');
}

/** ¿Tiene algo que valga la pena mostrar? */
export function tieneDatos(d: DatosDelProspecto | null): d is DatosDelProspecto {
  if (!d) return false;
  return Boolean(d.mapsUrl || d.website || d.instagram || d.linkedin || d.cargo || d.score !== null);
}
