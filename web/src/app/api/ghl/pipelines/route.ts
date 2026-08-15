import { NextResponse } from 'next/server';
import { apiSectionGuard } from '@/lib/api-auth';

export async function POST() {
  const gate = await apiSectionGuard('configuracion');
  if (!gate.ok) return gate.response;
  const profile = gate.profile;

  try {
    const res = await fetch(`${process.env.N8N_BASE_URL}/webhook/crm-ghl-pipelines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-crm-lite-webhook-secret': process.env.N8N_WEBHOOK_SECRET ?? '',
      },
      body: '{}',
      cache: 'no-store',
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: 'no se pudo consultar pipelines GHL' }, { status: 502 });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'no se pudo consultar pipelines GHL' }, { status: 502 });
  }
}
