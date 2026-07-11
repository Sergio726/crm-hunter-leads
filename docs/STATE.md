# 🧭 STATE — Empezá acá

> **Este es el primer archivo que lee cualquier agente al iniciar el proyecto.**
> Da el estado actual, el próximo paso y lo urgente. Al terminar una sesión, **actualizá este archivo**.

_Última actualización: 2026-07-10 (UXR-1 + UXR-2 implementados: error de login OAuth visible + fix del logo de respaldo. WEB-17 se descartó de esta rama — ver nota abajo)_

---

## ✅ Estado actual (qué funciona hoy)

- App móvil **RN + Expo SDK 54** + login Google contra **Supabase Cloud** (`CRM.LITE`).
- Panel web v1 (`web/`) con modo vendedor, clientes, contactos GHL, reportes, configuración.
- **n8n** (`https://n8n.stlabs.ar`): 8 flujos GHL activos + alertas Discord + plantillas HubSpot/Pipedrive.
- **N8N-4 cerrado**: webhooks validan `x-crm-lite-webhook-secret` (403 sin header).
- **Write-back funcionando y probado e2e** (2026-07-09): alta/edición de lead → push → GHL upsert → `crm_contact_id`/`crm_synced_at` en Supabase, un solo push por cambio (guard anti-loop). Migración `0011` aplicada y registrada vía MCP.
- Secreto n8n↔Supabase por **header** (`x-crm-lite-webhook-secret`, ver D9): los RPC lo leen de `request.headers`; los nodos n8n usan Header Auth nativa (las expresiones `$credentials` no funcionan en n8n).
- Workflows versionados en `n8n/workflows/crm-lite/` + `n8n/deploy-workflows.ps1`.
- Docs: `docs/INTEGRACION-GHL.md`, `docs/INTEGRACION-N8N.md`, `n8n/README.md`.

## 👉 Próximo paso (lo que sigue ahora)

1. **Migración a servidor nuevo — switch de push HECHO** (2026-07-09): `n8n.moremigracion.com` con 12 workflows verificados; `n8n_push_url` en Supabase y `N8N_BASE_URL` (web local + Dokploy) apuntan al nuevo; push e2e verificado por la instancia nueva. Fix de paso: pipelines de GHL usaba header `Location-Id` en vez de query param — nunca había funcionado; corregido y verificado (4 pipelines). ⚠️ `apikeyn8n` en `crm-secrets.local.env` ahora es la del n8n NUEVO (la vieja se pisó). Falta:
   - ✅ Inbound migrado y **verificado e2e** (GHL → n8n nuevo → Supabase con tags+empresa, 2026-07-09).
   - **Usuario**: desactivar los 8 workflows CRM Lite en `n8n.stlabs.ar` (a mano en el panel; sin API key vieja — o guardar una nueva como `apikeyn8n_viejo` y lo hace el agente). Mientras tanto el retry corre en ambas instancias (inofensivo, idempotente).
   - ✅ **Discord**: credencial real conectada a las alertas (webhook probado, mensaje de prueba enviado; URL en `crm-secrets.local.env`). Nota: la URL se pegó en el chat — si se quiere, regenerar el webhook en Discord y actualizar credencial.
   - ✅ **Web en Dokploy**: `https://crmlite.moremigracion.com` desplegada y verificada (login 200, `/` redirige a login, APIs protegidas sin sesión). Detrás de Cloudflare. Nota: las `NEXT_PUBLIC_*` van como defaults del Dockerfile (públicas por diseño) porque Dokploy no pasaba build args.
   - ✅ Login Google verificado por el usuario en la web nueva.
2. **Invitaciones con email** (2026-07-09): al invitar llega email real (edge `invite-user`); Equipo muestra invitados pendientes con advertencia no-Gmail; login alternativo por enlace de email (`/auth/confirm`). **Usuario debe**: (a) agregar `https://crmlite.moremigracion.com/auth/confirm` a Redirect URLs de Supabase, (b) redeploy de la web en Dokploy, (c) probar reenviando la invitación a un email suyo. Mejora futura: SMTP propio (Resend/Brevo) — el de Supabase tiene límite bajo de emails/hora.
2. Borrar en el panel n8n las **4 plantillas duplicadas** (HubSpot/Pipedrive x2; el script ya no duplica, pero las copias viejas siguen).
3. `git push` de los commits locales acumulados a `origin` cuando el usuario lo pida.

_2026-07-09: inbound registrado en GHL y **probado e2e** (alta y edición, sin rebote). El flujo ahora re-consulta el contacto completo a la API de GHL (el payload del webhook solo necesita el `id`), así tags y empresa sincronizan sin depender del custom data de GHL — verificado. Crons retry/auto-import en verde._

## 👉 Nota de la última sesión (2026-07-10, UX/UI)

Se investigó [21st.dev/community/components](https://21st.dev/community/components) como fuente para el sprint "Modernización UX/UI del panel" (`UX-1` a `UX-5` en `docs/BACKLOG.md`) y se documentó qué categoría de componentes usar en cada uno. Luego el usuario evaluó la alternativa y **se decidió por shadcn/ui** (`web/components.json` ya tiene la CLI configurada, mismo sistema de diseño del panel, cero fricción de adaptación) — 21st.dev queda como inspiración secundaria. Con esa base se investigó a fondo login/shell/dashboard/tarjetas/reportes (3 agentes de exploración sobre el código real) y se documentaron **10 recomendaciones concretas** (`UXR-1`…`UXR-10` en `docs/BACKLOG.md`), incluyendo dos bugs reales encontrados: error de OAuth que falla en silencio (`UXR-1`) y clases de color rotas en el logo de respaldo (`UXR-2`). Ninguna se implementó todavía, es solo investigación + backlog.

Dos hallazgos técnicos accionables:
- `framer-motion` **no está instalado** en `web/package.json` — es prerequisito de UX-2 (microinteracciones).
- El MCP `21st-dev-magic` está conectado pero **falla al usarse** (probable falta de `API_KEY` — se saca gratis en `21st.dev/magic/console`). Sin eso no se puede bajar código de un componente puntual por MCP, solo navegar el sitio a mano.

## 🔴 Urgente / no olvidar

- **WEB-17**: convertir vendedor en administrador — **no se resolvió en esta rama**. Se armó un botón "Hacer admin" acá pero se descartó porque `worktree-purrfect-pondering-bengio` (commit `3b55623`) ya lo había resuelto mejor (ascender + bajar rol, confirmación inline, migración `0014_set_user_role_guard.sql` con protección anti-autodegradación/anti-último-admin). Falta mergear esa rama a `main`. **Pendiente por resolver**: esa rama reusó el ID `WEB-17` en el roadmap para una tarea distinta (glitch visual en `/clientes` mobile) — hay colisión de IDs a renumerar antes de mergear ambas ramas.
- ~~**N8N-14**: retry de n8n roto~~ — **resuelto 2026-07-10**. Dos bugs en `GHL Retry` (código del nodo "To Push Payloads" + cableado del nodo "Batch"), ambos corregidos y verificados contra el servidor real. El segundo lo aplicó el usuario manualmente en el panel de n8n. Sin pendientes de sync para probarlo con un caso real todavía — atento la próxima vez que algo falle en el push inicial.
- ~~**N8N-15**: duplicado "Francy Diaz Ortegon"~~ — **resuelto 2026-07-10**, fusionado (se conservó la fila ya sincronizada a GHL, se migró su interacción).

## 🧱 Bloqueos actuales

- Carpetas n8n vía API bloqueadas por licencia; repo ya organizado en `crm-lite/`.

## 🔗 Datos clave (referencia rápida)

| Qué | Valor |
|---|---|
| Supabase Cloud | `rtvvamemdhbvmyxtxonb` |
| n8n | `https://n8n.stlabs.ar` — IDs en `n8n-ids.local` |
| Webhook secret cred | `rZvKjdRnF39vlXHi` |
| Integration secret cred | `kXuV2N3VSnbLhe57` |
