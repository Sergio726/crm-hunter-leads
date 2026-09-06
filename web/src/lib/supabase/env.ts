/**
 * Lectura validada de las variables públicas de Supabase.
 *
 * Sin esto, un deploy al que se le olvidó cargar las variables no falla de
 * forma evidente: los clientes se construyen con `undefined` y el error que ve
 * el usuario es un críptico "Invalid URL" o un 500 sin contexto. Acá se corta
 * temprano y con un mensaje que dice exactamente qué falta y dónde cargarlo.
 *
 * Las referencias a `process.env.NEXT_PUBLIC_*` tienen que quedar **literales**:
 * Next las reemplaza por su valor al compilar, y leerlas de forma dinámica
 * (`process.env[nombre]`) rompe esa sustitución y deja el bundle sin valores.
 */
export function supabasePublicEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    const faltan = [
      !url && 'NEXT_PUBLIC_SUPABASE_URL',
      !key && 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    ]
      .filter(Boolean)
      .join(', ');

    throw new Error(
      `Falta configurar ${faltan}. ` +
        'En Vercel se cargan en Project Settings → Environment Variables (y hay que ' +
        'volver a desplegar: las NEXT_PUBLIC_ se incrustan durante el build). ' +
        'En local van en web/.env.local — ver web/.env.example.',
    );
  }

  return { url, key };
}
