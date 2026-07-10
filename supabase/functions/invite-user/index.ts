// Envía el email de invitación al vendedor (Supabase Auth invite).
// La llama la web (Equipo) con el JWT del superadmin; el service role
// nunca sale de Supabase (lo inyecta la plataforma).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "no autorizado" }, 401);

  // Cliente con el JWT del llamador: verifica que sea superadmin.
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await caller.auth.getUser();
  if (!userData?.user) return json({ error: "no autorizado" }, 401);

  const { data: profile } = await caller
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profile?.role !== "superadmin") return json({ error: "solo superadmin" }, 403);

  const { email, redirectTo } = await req.json().catch(() => ({}));
  const norm = String(email ?? "").trim().toLowerCase();
  if (!norm || !norm.includes("@")) return json({ error: "email inválido" }, 400);

  const target = typeof redirectTo === "string" && redirectTo.startsWith("http")
    ? redirectTo
    : "https://crmlite.moremigracion.com/auth/confirm";

  // Cliente admin: crea el usuario invitado y dispara el email.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error } = await admin.auth.admin.inviteUserByEmail(norm, { redirectTo: target });

  if (error) {
    const exists = error.code === "email_exists" || /already.*registered|exists/i.test(error.message);
    if (exists) return json({ ok: true, alreadyRegistered: true });
    return json({ error: error.message }, 502);
  }

  return json({ ok: true, sent: true });
});
