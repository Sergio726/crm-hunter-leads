import { redirect } from 'next/navigation';

/**
 * La sección se llama **Leads** desde 2026-09-05 y vive en `/leads`.
 *
 * Esto queda para que no se rompa nada que apunte a la dirección vieja: un
 * enlace guardado en favoritos, el aviso por mail de la tarea diaria, o una
 * pestaña que alguien dejó abierta.
 *
 * Se conservan los parámetros de la URL —`?status=pending`, `?overdue=1`—
 * porque son los que usan las tarjetas del Inicio para abrir la lista ya
 * filtrada. Sin esto, un enlace viejo llevaría a la lista completa y el filtro
 * se perdería en silencio, que es peor que un error.
 *
 * Es una redirección temporal a propósito: una permanente se le queda cacheada
 * al navegador para siempre y complica volver atrás si hiciera falta.
 */
export default async function ClientesRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const query = new URLSearchParams();

  for (const [clave, valor] of Object.entries(sp)) {
    if (typeof valor === 'string') query.set(clave, valor);
    else if (Array.isArray(valor)) for (const v of valor) query.append(clave, v);
  }

  const cadena = query.toString();
  redirect(cadena ? `/leads?${cadena}` : '/leads');
}
