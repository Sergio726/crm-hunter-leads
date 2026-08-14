# 🧭 STATE — Empezá acá

> **Este es el primer archivo que lee cualquier agente al iniciar el proyecto.**
> Da el estado actual, el próximo paso y lo urgente. Al terminar una sesión, **actualizá este archivo**.

_Última actualización: 2026-08-14 (**Backend propio + módulo de prospección**. Este producto pasa a tener su propio proyecto Supabase: `hunter-leads` / `koyihquworbcxuydyslm` (ca-central-1); `CRM.LITE` es de otro producto y ya no se referencia acá. Las **30 migraciones aplicadas y verificadas** (RLS, grants del Data API, secreto solo para `service_role`). `Dockerfile`, `mobile/.env` y los 6 workflows de n8n reapuntados. **Falta**: service_role key, Google OAuth en el proyecto nuevo, cargar las API keys en Configuración y probar prospección contra servicios reales. — Previo 2026-08-13: módulo de prospección (PROSP-1/3/5) mergeado a main; interruptor de sync GHL (D12).)_

---

## ✅ Estado actual (qué funciona hoy)

- App móvil **RN + Expo SDK 54** + login Google contra **Supabase Cloud** (`hunter-leads`). ⚠️ El OAuth de Google todavía no está configurado en ese proyecto.
- Panel web v1 (`web/`) con modo vendedor, clientes, contactos GHL, reportes, configuración.
- **n8n** (`https://n8n.stlabs.ar`): 8 flujos GHL activos + alertas Discord + plantillas HubSpot/Pipedrive.
- **N8N-4 cerrado**: webhooks validan `x-crm-lite-webhook-secret` (403 sin header).
- **Write-back funcionando y probado e2e** (2026-07-09): alta/edición de lead → push → GHL upsert → `crm_contact_id`/`crm_synced_at` en Supabase, un solo push por cambio (guard anti-loop). Migración `0011` aplicada y registrada vía MCP.
- Secreto n8n↔Supabase por **header** (`x-crm-lite-webhook-secret`, ver D9): los RPC lo leen de `request.headers`; los nodos n8n usan Header Auth nativa (las expresiones `$credentials` no funcionan en n8n).
- Workflows versionados en `n8n/workflows/crm-lite/` + `n8n/deploy-workflows.ps1`.
- Docs: `docs/INTEGRACION-GHL.md`, `docs/INTEGRACION-N8N.md`, `n8n/README.md`.

## 👉 Próximo paso (lo que sigue ahora)

0. **Backend propio creado (2026-08-14).** Este producto tiene su **propio proyecto Supabase**: `hunter-leads` / `koyihquworbcxuydyslm`, región **ca-central-1**. `CRM.LITE` (`rtvvamemdhbvmyxtxonb`) es de **otro producto** y no se toca desde acá.
   - ✅ **Las 30 migraciones aplicadas y verificadas** (`0001`→`0030`, incluida la `0027` que estaba pendiente). Registro en `public.schema_migrations`.
   - ✅ Verificado: RLS activo en las 9 tablas; `get_integration_secret` ejecutable **solo por `service_role`**; ninguna función `SECURITY DEFINER` sin `search_path`; `clients.origin` acepta `hunter`.
   - ✅ **Grants del Data API otorgados a `authenticated`**, derivados de las políticas de cada tabla. Hacía falta: en un proyecto nuevo las tablas creadas por SQL no reciben privilegios y PostgREST devolvía `42501` pese al RLS correcto. `anon` quedó sin acceso a ninguna tabla (el CRM exige login) y se preservó el `UPDATE` acotado por columnas de `profiles`, para que nadie pueda cambiarse el `role`.
   - ✅ `web/Dockerfile`, `mobile/.env` y `web/.env.local` apuntan al proyecto nuevo.
   - **Falta**: (a) la **`service_role` key** de `hunter-leads` en el entorno del servidor (Project Settings → API keys → secret key); (b) configurar **Google OAuth** en el proyecto nuevo — sin eso no hay login, y el primer ingreso de `sergio.sebass03@gmail.com` crea el superadmin; (c) cargar las API keys en **Configuración → Prospección**; (d) probar el circuito de prospección, que nunca corrió contra servicios reales.
   - ✅ **Workflows de n8n reapuntados** a `hunter-leads` (6 archivos: `push`, `retry`, `inbound`, `auto-import`, `notify-user`, `notify-overdue`; URL y publishable key). Antes escribían en la base del otro producto. **Antes de desplegarlos** hay que cargar en n8n el secreto `x-crm-lite-webhook-secret` de este proyecto y las credenciales de GHL, y setear `n8n_push_url`/`n8n_notify_url` en `app_settings`.
0c. **Frame de trabajo autónomo instalado (2026-08-14).** El proyecto ya llevaba tablero propio (`docs/STATE.md`, `docs/BACKLOG.md`, `docs/DECISIONS.md`), así que **no se duplicó nada**: se agregó solo lo que faltaba — `HANDOFF.md` (protocolo de continuidad, con el mapeo de qué archivo cumple cada rol), `.cursor/rules/` con las tres reglas (la carpeta existía vacía: Cursor trabajaba sin contexto mientras Claude Code sí lo tenía) y la skill `/handoff` en `.claude/skills/`. Generado con [`autonomous-agent-setup`](https://github.com/s-tlabs/Autonomous-agent-setup-) v2; `npx autonomous-agent-setup check` verifica que siga completo.
0d. **Identidad visual externalizada (2026-08-14).** El manual y los assets de ST Labs/Turbo viven en el repositorio hermano <https://github.com/Sergio726/crm-hunter-leads-brand> (copia local en `C:\Project\Project\crm-hunter-leads-brand`) para no mezclar diseño con el código del producto. Este repo conserva únicamente [`docs/IDENTIDAD-VISUAL.md`](IDENTIDAD-VISUAL.md) como guía de consulta. La UI de web/mobile queda sin cambios de esta tarea.
0e. **La UI todavía NO aplica esa identidad — anotado como `BRAND-2` (2026-08-14).** Al revisar el código se confirmó que conviven dos identidades: el panel usa la **paleta azul** del rediseño de julio (`globals.css`, `--primary` hue 264) en vez del negro/verde eléctrico del manual; `layout.tsx` carga **Geist**, no Consolas para títulos y cifras; y el logo de `web/public/brand/` sigue siendo el de **More Migraciones** (`LOGO MORE LIGHT.png`), mientras `mobile/assets/` conserva los íconos por defecto de Expo. Los definitivos ya están en el repo de marca. Ver `docs/BACKLOG.md` → **BRAND-2** para el detalle y las advertencias de alcance (cambiar los tokens toca el semáforo de SEM-1 en toda la app). Conviene hacerlo junto con **UX-1** y **después** de que haya login en el backend nuevo, para verificar en pantalla real.

1. **Sprint 4 — Notificaciones** (`NOTIF-1`): backend ✅ + **workflows desplegados y activos** (usuario, 2026-07-17). Apareció un `429 too many requests` de GHL en el nodo `GHL Send Message` → se aplicó **reintento con backoff** (`retryOnFail`/`maxTries:5`/`waitBetweenTries:5000`) en los 2 nodos GHL de `notify-user.json` + se suavizó `notify-overdue.json` (batch 3, wait 1.5s). Descartado que sea un loop del trigger. El usuario ya activó "Retry On Fail" a mano en los 2 nodos (verificado por API, con defaults 3/1s). **Verificado e2e el 2026-07-17**: token GHL válido + envío probado (upsert 201 + conversations/messages 201 "Email queued successfully") → la Conversations API queda confirmada. Fix de paso: `notify-overdue.json` versionado apuntaba a `stlabs.ar` (viejo) → corregido a `moremigracion.com`. Pendiente menor: subir el retry a 5/5s en un redeploy, borrar el contacto de prueba `CRM Lite Test` en GHL, y sacar `GHL_API_KEY` de `mobile/.env`. Ver `docs/BACKLOG.md` (NOTIF-1). **NOTIF-1 queda funcional.**
2. **Probar en sesión/dispositivo real todo lo de esta sesión (Sprints 2 y 3)** — nada se probó de forma interactiva todavía, solo `tsc`/`build`/`expo export` (bundling) y SQL contra la base real: Mi perfil, invitar con rol, comentario rápido, editar cliente, adjuntos (foto/PDF/nota de voz — la app instaló 4 paquetes nativos nuevos: `expo-image-picker`, `expo-document-picker`, `expo-audio`, `expo-file-system`, permisos de cámara/galería/micrófono sin probar en un teléfono real). Y sobre todo **el Sprint 3** (`/vendedor` se eliminó y se unificó todo por rol) — es el cambio de mayor riesgo de toda la sesión, conviene loguearse como vendedor real y como admin antes de dar por cerrado el sprint.
2. **Glitch visual en `/clientes` mobile (WEB-26, pendiente)**: el usuario lo confirmó en vivo en su celular (no es artefacto de foto), aparece apenas entra a la pantalla. Se descartaron las causas más comunes (blur sin proteger, hydration mismatch, FOUC de tema) sin reproducirlo en local. **Falta**: el usuario va a grabar un video de pantalla del celular mostrando el momento exacto.
3. **Migración a servidor nuevo — switch de push HECHO** (2026-07-09): `n8n.moremigracion.com` con 12 workflows verificados; `n8n_push_url` en Supabase y `N8N_BASE_URL` (web local + Dokploy) apuntan al nuevo; push e2e verificado por la instancia nueva. Fix de paso: pipelines de GHL usaba header `Location-Id` en vez de query param — nunca había funcionado; corregido y verificado (4 pipelines). ⚠️ `apikeyn8n` en `crm-secrets.local.env` ahora es la del n8n NUEVO (la vieja se pisó). Falta:
   - ✅ Inbound migrado y **verificado e2e** (GHL → n8n nuevo → Supabase con tags+empresa, 2026-07-09).
   - **Usuario**: desactivar los 8 workflows CRM Lite en `n8n.stlabs.ar` (a mano en el panel; sin API key vieja — o guardar una nueva como `apikeyn8n_viejo` y lo hace el agente). Mientras tanto el retry corre en ambas instancias (inofensivo, idempotente).
   - ✅ **Discord**: credencial real conectada a las alertas (webhook probado, mensaje de prueba enviado; URL en `crm-secrets.local.env`). Nota: la URL se pegó en el chat — si se quiere, regenerar el webhook en Discord y actualizar credencial.
   - ✅ **Web en Dokploy**: `https://crmlite.moremigracion.com` desplegada y verificada (login 200, `/` redirige a login, APIs protegidas sin sesión). Detrás de Cloudflare. Nota: las `NEXT_PUBLIC_*` van como defaults del Dockerfile (públicas por diseño) porque Dokploy no pasaba build args.
   - ✅ Login Google verificado por el usuario en la web nueva.
2. **Invitaciones con email** (2026-07-09): al invitar llega email real (edge `invite-user`); Equipo muestra invitados pendientes con advertencia no-Gmail; login alternativo por enlace de email (`/auth/confirm`). **Usuario debe**: (a) agregar `https://crmlite.moremigracion.com/auth/confirm` a Redirect URLs de Supabase, (b) redeploy de la web en Dokploy, (c) probar reenviando la invitación a un email suyo. Mejora futura: SMTP propio (Resend/Brevo) — el de Supabase tiene límite bajo de emails/hora.
2. Borrar en el panel n8n las **4 plantillas duplicadas** (`HubSpot Push`, `HubSpot Pull`, `Pipedrive Push`, `Pipedrive Pull` — el script ya no duplica por nombre, pero las copias viejas de antes de ese fix siguen ahí). **Requiere `apikeyn8n`** (en `crm-secrets.local.env`, no versionado) — resolver desde el checkout principal, no desde un worktree sin ese archivo. Referencia de autenticación: `n8n/deploy-workflows.ps1` (usa `X-N8N-API-KEY` contra `https://n8n.stlabs.ar/api/v1`); listar con `GET /api/v1/workflows?limit=200`, identificar los IDs duplicados por nombre y borrar con `DELETE /api/v1/workflows/{id}` — o hacerlo a mano en el panel.
3. ~~`git push` de los commits locales acumulados~~ — verificado 2026-07-11: `main` está al día con `origin/main`, no hay nada pendiente.

_2026-07-09: inbound registrado en GHL y **probado e2e** (alta y edición, sin rebote). El flujo ahora re-consulta el contacto completo a la API de GHL (el payload del webhook solo necesita el `id`), así tags y empresa sincronizan sin depender del custom data de GHL — verificado. Crons retry/auto-import en verde._

## 👉 Nota de la última sesión (2026-07-10, UX/UI)

Se investigó [21st.dev/community/components](https://21st.dev/community/components) como fuente para el sprint "Modernización UX/UI del panel" (`UX-1` a `UX-5` en `docs/BACKLOG.md`) y se documentó qué categoría de componentes usar en cada uno. Luego el usuario evaluó la alternativa y **se decidió por shadcn/ui** (`web/components.json` ya tiene la CLI configurada, mismo sistema de diseño del panel, cero fricción de adaptación) — 21st.dev queda como inspiración secundaria. Con esa base se investigó a fondo login/shell/dashboard/tarjetas/reportes (3 agentes de exploración sobre el código real) y se documentaron **10 recomendaciones concretas** (`UXR-1`…`UXR-10` en `docs/BACKLOG.md`), incluyendo dos bugs reales encontrados: error de OAuth que falla en silencio (`UXR-1`) y clases de color rotas en el logo de respaldo (`UXR-2`). Ninguna se implementó todavía, es solo investigación + backlog.

Dos hallazgos técnicos accionables:
- `framer-motion` **no está instalado** en `web/package.json` — es prerequisito de UX-2 (microinteracciones).
- El MCP `21st-dev-magic` está conectado pero **falla al usarse** (probable falta de `API_KEY` — se saca gratis en `21st.dev/magic/console`). Sin eso no se puede bajar código de un componente puntual por MCP, solo navegar el sitio a mano.

## 🔴 Urgente / no olvidar

- ~~**WEB-17**: convertir vendedor existente en administrador~~ — **resuelto y mergeado a `main` el 2026-07-10** (PR #2). RPC `set_user_role` endurecida (migración `0014`, guard anti-autodegradación/anti-último-admin) + botones "Hacer admin"/"Bajar a vendedor" en Equipo con confirmación inline. Caso puntual `soporte@justmore.net` ya resuelto a mano por SQL el 2026-07-10. Falta tildar el único ítem pendiente del test plan de la PR: confirmar visualmente en el panel real.
- ~~**N8N-14**: retry de n8n roto~~ — **resuelto 2026-07-10**. Dos bugs en `GHL Retry` (código del nodo "To Push Payloads" + cableado del nodo "Batch"), ambos corregidos y verificados contra el servidor real. El segundo lo aplicó el usuario manualmente en el panel de n8n. Sin pendientes de sync para probarlo con un caso real todavía — atento la próxima vez que algo falle en el push inicial.
- ~~**N8N-15**: duplicado "Francy Diaz Ortegon"~~ — **resuelto 2026-07-10**, fusionado (se conservó la fila ya sincronizada a GHL, se migró su interacción).

## 🧱 Bloqueos actuales

- Carpetas n8n vía API bloqueadas por licencia; repo ya organizado en `crm-lite/`.

## 🔗 Datos clave (referencia rápida)

| Qué | Valor |
|---|---|
| Supabase Cloud | `koyihquworbcxuydyslm` (proyecto `hunter-leads`, ca-central-1) |
| n8n | `https://n8n.stlabs.ar` — IDs en `n8n-ids.local` |
| Webhook secret cred | `rZvKjdRnF39vlXHi` |
| Integration secret cred | `kXuV2N3VSnbLhe57` |
