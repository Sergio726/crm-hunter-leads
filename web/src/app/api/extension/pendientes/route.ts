import { NextResponse } from 'next/server';
import { puertaDeExtension } from '@/lib/extension/auth';
import { slugDeLinkedin } from '@/lib/extension/linkedin-slug';
import { esCanal, type Channel } from '@/lib/canales';

/**
 * Los mensajes listos para mandar, del vendedor del token.
 *
 * La extensión los pide al abrir un perfil y busca el que coincida con el slug
 * de la barra del navegador. Se devuelven todos los pendientes y no solo el del
 * perfil abierto, a propósito: así la extensión sabe también "tenés 6 más para
 * mandar" sin otra vuelta al servidor.
 *
 * ⚠️ Se consulta con la clave de servicio, así que el RLS no aplica: el
 * `.eq('created_by', userId)` es la única barrera entre "mis borradores" y
 * "los de todos". Está cubierto por test.
 */
export async function GET(request: Request) {
  const puerta = await puertaDeExtension(request);
  if (!puerta.ok) return puerta.response;

  const url = new URL(request.url);
  const pedido = url.searchParams.get('channel');
  const channel: Channel = esCanal(pedido) ? pedido : 'linkedin';

  const { data, error } = await puerta.admin
    .from('outbound_drafts')
    .select('id, client_id, channel, body, created_at, clients(full_name, company, linkedin, instagram)')
    .eq('created_by', puerta.userId)
    .eq('channel', channel)
    .is('sent_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[extension/pendientes]', error.message);
    return NextResponse.json({ error: 'No se pudieron leer los mensajes pendientes.' }, { status: 500 });
  }

  type Fila = {
    id: string;
    client_id: string;
    channel: string;
    body: string;
    created_at: string;
    clients: { full_name: string; company: string | null; linkedin: string | null; instagram: string | null } | null;
  };

  const pendientes = ((data ?? []) as unknown as Fila[]).map((f) => ({
    id: f.id,
    clientId: f.client_id,
    channel: f.channel,
    body: f.body,
    createdAt: f.created_at,
    nombre: f.clients?.full_name ?? '',
    empresa: f.clients?.company ?? null,
    linkedin: f.clients?.linkedin ?? null,
    // Normalizado del lado del servidor para que la extensión compare strings
    // iguales y no tenga que repetir la lógica de `slugDeLinkedin`.
    slug: slugDeLinkedin(f.clients?.linkedin),
    instagram: f.clients?.instagram ?? null,
  }));

  return NextResponse.json({ pendientes });
}
