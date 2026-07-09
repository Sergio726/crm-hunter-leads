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

1. **Registrar webhook inbound** en GHL Admin → `https://n8n.stlabs.ar/webhook/crm-ghl-inbound` (con header `x-crm-lite-webhook-secret`), y probar inbound e2e.
2. Confirmar que los crons de retry/auto-import quedaron verdes en n8n (fallaban por el bug de `$credentials`; corregidos 2026-07-09 ~20:18).
3. Organizar carpetas **CRM Lite/** en panel n8n (manual; API de proyectos sin licencia).
4. Revisar duplicados de plantillas HubSpot/Pipedrive en n8n: `deploy-workflows.ps1` crea copias nuevas en cada corrida (mejorar el script).

## 🔴 Urgente / no olvidar

- SEC-4 (borrar secretos del escritorio) — acción del usuario.
- Revisar el canal Discord de alertas: quedó spam de errores de los crons rotos (cada 15 min entre el deploy de Cursor y el fix).

## 🧱 Bloqueos actuales

- Carpetas n8n vía API bloqueadas por licencia; repo ya organizado en `crm-lite/`.

## 🔗 Datos clave (referencia rápida)

| Qué | Valor |
|---|---|
| Supabase Cloud | `rtvvamemdhbvmyxtxonb` |
| n8n | `https://n8n.stlabs.ar` — IDs en `n8n-ids.local` |
| Webhook secret cred | `rZvKjdRnF39vlXHi` |
| Integration secret cred | `kXuV2N3VSnbLhe57` |
