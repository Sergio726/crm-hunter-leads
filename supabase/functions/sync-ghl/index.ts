// Sincroniza clientes con GoHighLevel (upsert de contactos, API v2).
// Procesa todos los clientes con ghl_synced_at IS NULL, así cualquier
// falla puntual se recupera en el próximo disparo.
//
// Secrets requeridos: GHL_API_TOKEN (Private Integration Token), GHL_LOCATION_ID

import { createClient } from "npm:@supabase/supabase-js@2";

const GHL_UPSERT_URL = "https://services.leadconnectorhq.com/contacts/upsert";
const GHL_API_VERSION = "2021-07-28";

Deno.serve(async (_req) => {
  const token = Deno.env.get("GHL_API_TOKEN");
  const locationId = Deno.env.get("GHL_LOCATION_ID");
  if (!token || !locationId) {
    return Response.json({
      synced: 0,
      skipped: true,
      reason: "GHL no configurado: faltan los secrets GHL_API_TOKEN / GHL_LOCATION_ID",
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, full_name, phone, email, company, ghl_contact_id")
    .is("ghl_synced_at", null)
    .limit(50);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  let synced = 0;
  const failures: { id: string; error: string }[] = [];

  for (const client of clients ?? []) {
    try {
      const res = await fetch(GHL_UPSERT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Version: GHL_API_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locationId,
          name: client.full_name,
          phone: client.phone ?? undefined,
          email: client.email ?? undefined,
          companyName: client.company ?? undefined,
          source: "crm-lite",
        }),
      });

      if (!res.ok) {
        failures.push({ id: client.id, error: `GHL ${res.status}: ${await res.text()}` });
        continue;
      }

      const body = await res.json();
      const contactId = body?.contact?.id ?? client.ghl_contact_id;

      await supabase
        .from("clients")
        .update({ ghl_contact_id: contactId, ghl_synced_at: new Date().toISOString() })
        .eq("id", client.id);
      synced++;
    } catch (e) {
      failures.push({ id: client.id, error: String(e) });
    }
  }

  return Response.json({ synced, pending: (clients?.length ?? 0) - synced, failures });
});
