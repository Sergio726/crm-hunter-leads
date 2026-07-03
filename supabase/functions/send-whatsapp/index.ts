// Envío de WhatsApp vía WhatsApp Business Cloud API (modo 'api').
// Hoy la app usa deep links; esta función queda lista para cuando exista
// la API de WhatsApp Business: configurar los secrets y encender el switch
// whatsapp_mode = 'api' en app_settings.
//
// Secrets requeridos: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) {
    return Response.json(
      { error: "WhatsApp API no configurada: faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID" },
      { status: 501 },
    );
  }

  const { clientId, message } = await req.json();
  if (!clientId || !message) {
    return Response.json({ error: "clientId y message son requeridos" }, { status: 400 });
  }

  // Cliente con el JWT del vendedor: respeta RLS (solo ve sus clientes asignados)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );

  const { data: client, error } = await supabase
    .from("clients")
    .select("id, phone")
    .eq("id", clientId)
    .single();

  if (error || !client?.phone) {
    return Response.json({ error: "Cliente no encontrado o sin teléfono" }, { status: 404 });
  }

  const to = client.phone.replace(/[^\d]/g, "");
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    return Response.json({ error: body?.error?.message ?? "Error de WhatsApp API" }, { status: 502 });
  }

  return Response.json({ messageId: body?.messages?.[0]?.id });
});
