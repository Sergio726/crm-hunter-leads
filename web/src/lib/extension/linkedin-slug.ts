// El identificador de un perfil de LinkedIn, normalizado.
//
// La extensión tiene que reconocer, parada en `linkedin.com/in/juan-perez-3a`,
// que ese es el lead que en el CRM tiene `linkedin = "in/juan-perez-3a"`. Y el
// dato puede venir en cualquiera de estas formas, según de dónde salió:
//
//   in/juan-perez-3a
//   /in/juan-perez-3a/
//   https://www.linkedin.com/in/juan-perez-3a
//   https://linkedin.com/in/Juan-Perez-3A/?originalSubdomain=ar
//
// Todas tienen que dar `juan-perez-3a`. Sin esto la extensión diría "no hay
// mensaje para este perfil" justo en el que sí lo hay. Módulo puro a propósito:
// lo usa el servidor y lo copia la extensión, y se testea sin nada alrededor.

/**
 * Devuelve el slug del perfil, o `null` si el texto no apunta a un perfil.
 *
 * Se descartan las páginas de empresa (`/company/`) y cualquier otra ruta:
 * el mensaje es para una persona.
 */
export function slugDeLinkedin(valor: string | null | undefined): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  if (!limpio) return null;

  // Con dominio o sin él, con o sin barra inicial, con o sin query string.
  const match = /(?:^|\/)in\/([^/?#\s]+)/i.exec(limpio);
  if (!match) return null;

  // LinkedIn no distingue mayúsculas en el slug; el CRM tampoco debería.
  const slug = decodeURIComponent(match[1]).toLowerCase();
  return slug || null;
}

/** ¿Estos dos valores apuntan al mismo perfil? */
export function mismoPerfil(a: string | null | undefined, b: string | null | undefined): boolean {
  const sa = slugDeLinkedin(a);
  const sb = slugDeLinkedin(b);
  return sa !== null && sa === sb;
}
