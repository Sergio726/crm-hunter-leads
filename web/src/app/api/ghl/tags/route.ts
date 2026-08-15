import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';

// Proxy servidor → n8n (evita CORS y mantiene la URL de n8n del lado servidor).
export async function GET() {
  // Quién puede listar tags sale de la matriz de Configuración, igual que el
  // acceso a la pantalla de Contactos GHL: así no se contradicen.
  const gate = await apiSectionGuard('contactos-ghl');
  if (!gate.ok) return gate.response;

  try {
    const res = await fetch(`${process.env.N8N_BASE_URL}/webhook/crm-ghl-tags`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-crm-lite-webhook-secret': process.env.N8N_WEBHOOK_SECRET ?? '',
      },
      body: '{}',
      cache: 'no-store',
    });
    const data = await res.json();
    const tags: string[] = Array.isArray(data?.tags)
      ? data.tags.map((t: { name?: string }) => t?.name).filter(Boolean)
      : [];
    return NextResponse.json({ tags: tags.sort() });
  } catch {
    return NextResponse.json({ error: 'no se pudo consultar GHL' }, { status: 502 });
  }
}
