// Acceso de un colaborador al CRM: manda el email o devuelve el enlace.
// La llama la web (Equipo) con el JWT del superadmin; el service role
// nunca sale de Supabase (lo inyecta la plataforma).
//
// Dos modos:
//   mode: 'send' (default) → manda el email.
//   mode: 'link'           → devuelve el enlace SIN mandar nada, para pasarlo
//                            por WhatsApp. Es la salida cuando el correo falla.
//
// Por qué existe el modo 'link': el remitente compartido de Supabase tiene un
// tope de emails por hora. Cuando se topa, la invitación no llega y no hay nada
// que hacer desde la app. El enlace copiado no depende del correo.
//
// OJO — el enlace se genera SIEMPRE del lado del servidor, nunca desde el
// navegador. El cliente del browser usa PKCE: guardaría el `code_verifier` en
// la máquina del admin, y cuando el invitado abriera el enlace en la suya
// llegaría un `?code=` sin verificador ("code verifier should be non-empty").
// Generado acá, el enlace sale con `token_hash`, que es el formato que
// `/auth/confirm` ya sabe manejar.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      // El enlace es una credencial de un solo uso: que no quede en ningún caché.
      "Cache-Control": "no-store",
    },
  });
}

/** ¿El error dice que el usuario ya existe? */
function isExistsError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "email_exists" ||
    /already.*registered|already.*exists|user.*exists/i.test(error.message ?? "");
}

/** ¿El error dice que el usuario no existe? */
function isMissingError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "user_not_found" ||
    /user not found|no user|not found/i.test(error.message ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "no autorizado" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Cliente con el JWT del llamador: verifica que sea superadmin.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await caller.auth.getUser();
  if (!userData?.user) return json({ error: "no autorizado" }, 401);

  const { data: profile } = await caller
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profile?.role !== "superadmin") return json({ error: "solo superadmin" }, 403);

  const { email, redirectTo, mode } = await req.json().catch(() => ({}));
  const norm = String(email ?? "").trim().toLowerCase();
  if (!norm || !norm.includes("@")) return json({ error: "email inválido" }, 400);
  const wantsLink = mode === "link";

  // El destino tiene que ser del sitio propio. Antes se aceptaba cualquier URL
  // que empezara con "http", y el fallback apuntaba al dominio de la marca
  // anterior (crmlite.moremigracion.com), que ya no existe: el enlace llevaba
  // a la nada. Ahora el fallback sale de la config y lo de afuera se rechaza.
  const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") ?? "").replace(/\/+$/, "");
  const fallback = siteUrl ? `${siteUrl}/auth/confirm` : null;
  let target = fallback;
  if (typeof redirectTo === "string" && redirectTo.startsWith("http")) {
    if (!siteUrl || redirectTo.startsWith(siteUrl)) target = redirectTo;
  }
  if (!target) {
    return json({
      error:
        "Falta configurar PUBLIC_SITE_URL en la función para saber a dónde debe llevar el enlace.",
      code: "missing_site_url",
    }, 500);
  }

  // Cliente admin: crea el usuario invitado, genera enlaces y dispara emails.
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---------------------------------------------------------------
  // mode: 'link' — devolver el enlace sin mandar correo
  // ---------------------------------------------------------------
  if (wantsLink) {
    // Se prueba primero como usuario existente (el caso de un reenvío) y se cae
    // a invitación si no existe. `generateLink` no manda email en ningún caso;
    // con type 'invite' además crea la fila en auth.users.
    let { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: norm,
      options: { redirectTo: target },
    });
    let existed = true;

    if (error && isMissingError(error)) {
      existed = false;
      ({ data, error } = await admin.auth.admin.generateLink({
        type: "invite",
        email: norm,
        options: { redirectTo: target },
      }));
    }

    if (error) {
      return json({ error: error.message, code: error.code }, error.status ?? 502);
    }
    const link = data?.properties?.action_link;
    if (!link) return json({ error: "Supabase no devolvió el enlace." }, 502);

    // Nunca se loguea el enlace: quien lo tenga entra como esa persona.
    return json({ ok: true, link, existed });
  }

  // ---------------------------------------------------------------
  // mode: 'send' (default) — mandar el email
  // ---------------------------------------------------------------
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(norm, {
    redirectTo: target,
  });

  if (!inviteError) return json({ ok: true, sent: true, existed: false });

  if (!isExistsError(inviteError)) {
    // El motivo real viaja al front. El caso más común es
    // over_email_send_rate_limit: el remitente compartido de Supabase se topó.
    return json(
      { error: inviteError.message, code: inviteError.code },
      inviteError.status ?? 502,
    );
  }

  // El usuario ya existe: `inviteUserByEmail` no reenvía. Antes se devolvía
  // { ok: true, alreadyRegistered: true } con 200 sin haber mandado nada, y el
  // superadmin quedaba convencido de que la invitación había salido.
  //
  // Un magic link sí se le puede mandar a alguien que ya existe. Se pide desde
  // acá con un cliente anon del servidor (nunca desde el navegador, ver arriba).
  const sender = createClient(supabaseUrl, anonKey);
  const { error: otpError } = await sender.auth.signInWithOtp({
    email: norm,
    options: { emailRedirectTo: target, shouldCreateUser: false },
  });

  if (otpError) {
    return json({ error: otpError.message, code: otpError.code }, otpError.status ?? 502);
  }

  return json({ ok: true, sent: true, existed: true });
});
