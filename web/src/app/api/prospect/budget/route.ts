import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';
import { readBudget } from '@/lib/prospect/budget';
import { getSecret } from '@/lib/prospect/secrets';

/**
 * Cuánta plata queda para prospectar.
 *
 * Lo consume el Plan de Caza, para poder poner el saldo al lado del costo: hasta
 * ahora se prometía "esta corrida sale US$ 0,12" sin decir que el mes tiene un
 * techo de US$ 5 y que podía estar por agotarse.
 */
export const maxDuration = 30;

export async function GET() {
  const gate = await apiSectionGuard('prospeccion');
  if (!gate.ok) return gate.response;

  const supabase = await createClient();
  const apiToken = await getSecret('apify_api_token');
  const budget = await readBudget(apiToken, supabase);

  return NextResponse.json(budget, {
    // Cambia despacio y se pide en cada apertura del panel: un minuto de cache
    // evita golpear la API de Apify en cada tecla sin mostrar un dato viejo.
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
}
