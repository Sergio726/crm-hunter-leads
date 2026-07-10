import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';

// Proxy servidor → n8n (evita CORS y mantiene la URL de n8n del lado servidor).
export async function GET() {
  const profile = await getSessionProfile();
  // Vendedores también pueden listar tags (para el navegador de contactos GHL)
  if (profile?.role !== 'superadmin' && profile?.role !== 'seller') {
    return NextResponse.json({ error: 'no autorizado' }, { status: 403 });
  }

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
