import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';

type GhlContact = {
  id: string;
  contactName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  tags?: string[];
};

export async function POST(request: Request) {
  // Mismo criterio que la pantalla de Contactos GHL, según la matriz. Quien
  // importa lo hace a su propia lista: eso lo sigue garantizando el RLS.
  const gate = await apiSectionGuard('contactos-ghl');
  if (!gate.ok) return gate.response;

  const { tag } = await request.json().catch(() => ({ tag: '' }));
  if (!tag) return NextResponse.json({ contacts: [], total: 0 });

  try {
    const res = await fetch(`${process.env.N8N_BASE_URL}/webhook/crm-ghl-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-crm-lite-webhook-secret': process.env.N8N_WEBHOOK_SECRET ?? '',
      },
      body: JSON.stringify({ tag }),
      cache: 'no-store',
    });
    const data = await res.json();
    const contacts = (Array.isArray(data?.contacts) ? (data.contacts as GhlContact[]) : []).map((c) => ({
      id: c.id,
      name:
        c.contactName ||
        [c.firstName, c.lastName].filter(Boolean).join(' ') ||
        c.email ||
        c.phone ||
        '(sin nombre)',
      email: c.email ?? null,
      phone: c.phone ?? null,
      company: c.companyName ?? null,
      tags: Array.isArray(c.tags) ? c.tags : [],
    }));
    return NextResponse.json({ contacts, total: data?.total ?? contacts.length });
  } catch {
    return NextResponse.json({ error: 'no se pudo consultar GHL' }, { status: 502 });
  }
}
