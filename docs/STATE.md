# 🧭 STATE — Empezá acá

> **Este es el primer archivo que lee cualquier agente al iniciar el proyecto.**
> Da el estado actual, el próximo paso y lo urgente. Al terminar una sesión, **actualizá este archivo**.

_Última actualización: 2026-07-09 (fix integración n8n: secreto por header + anti-loop, write-back probado e2e)_

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
   - **Usuario**: cambiar la URL del webhook inbound en su workflow de GHL → `https://n8n.moremigracion.com/webhook/crm-ghl-inbound` (el header secreto no cambia) y avisar para verificar inbound e2e.
   - **Usuario**: desactivar los workflows en `n8n.stlabs.ar` (a mano en el panel; sin API key vieja). Mientras tanto el retry corre en ambas instancias (inofensivo, idempotente).
   - **Discord**: credencial provisoria `U0oSJTv8OyUBRPhf` — reemplazar cuando el usuario pase `DISCORD_WEBHOOK_URL`.
2. Borrar en el panel n8n las **4 plantillas duplicadas** (HubSpot/Pipedrive x2; el script ya no duplica, pero las copias viejas siguen).
3. `git push` de los commits locales acumulados a `origin` cuando el usuario lo pida.

_2026-07-09: inbound registrado en GHL y **probado e2e** (alta y edición, sin rebote). El flujo ahora re-consulta el contacto completo a la API de GHL (el payload del webhook solo necesita el `id`), así tags y empresa sincronizan sin depender del custom data de GHL — verificado. Crons retry/auto-import en verde._

## 🔴 Urgente / no olvidar

- (nada urgente — SEC-4, carpetas n8n y limpieza de Discord completados por el usuario el 2026-07-09)

## 🧱 Bloqueos actuales

- Carpetas n8n vía API bloqueadas por licencia; repo ya organizado en `crm-lite/`.

## 🔗 Datos clave (referencia rápida)

| Qué | Valor |
|---|---|
| Supabase Cloud | `rtvvamemdhbvmyxtxonb` |
| n8n | `https://n8n.stlabs.ar` — IDs en `n8n-ids.local` |
| Webhook secret cred | `rZvKjdRnF39vlXHi` |
| Integration secret cred | `kXuV2N3VSnbLhe57` |
