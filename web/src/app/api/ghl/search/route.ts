import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';

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
  const profile = await getSessionProfile();
  if (profile?.role !== 'superadmin') {
    return NextResponse.json({ error: 'no autorizado' }, { status: 403 });
  }

  const { tag } = await request.json().catch(() => ({ tag: '' }));
  if (!tag) return NextResponse.json({ contacts: [], total: 0 });

  try {
    const res = await fetch(`${process.env.N8N_BASE_URL}/webhook/crm-ghl-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
