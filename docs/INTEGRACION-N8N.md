# Integración n8n — CRM Lite (multi-CRM)

> Workflows en `n8n/workflows/crm-lite/`. Instancia: `https://n8n.stlabs.ar`.

## Principio

La app y Supabase hablan un **contrato estable** (contacto normalizado). n8n traduce a GHL/HubSpot/Pipedrive por instalación.

## Estructura de carpetas

```
n8n/workflows/crm-lite/
├── ghl/           Flujos activos GoHighLevel
├── hubspot/       Plantillas (inactivas)
├── pipedrive/     Plantillas (inactivas)
└── shared/        Alertas de error (Discord)
```

En el panel n8n, organizar manualmente bajo **CRM Lite/** (requiere n8n >= 1.85; la API de carpetas necesita licencia).

## RPCs Supabase (migración `0011`)

| RPC | Uso |
|-----|-----|
| `n8n_crm_writeback` | Push → guarda `crm_contact_id` + `crm_synced_at` |
| `n8n_crm_list_pending` | Retry cron |
| `n8n_crm_upsert_inbound` | Inbound GHL + auto-import |
| `n8n_get_integration_settings` | Auto-import lee tags/flags |

Secreto: `private.integration_secrets` clave `n8n_webhook_secret` (misma para ambas direcciones). Los RPC lo validan leyendo el **header** `x-crm-lite-webhook-secret` de la request (`private.n8n_request_secret()`), porque n8n no puede leer credenciales en expresiones; los nodos HTTP de n8n usan Header Auth nativa. Guard anti-loop: `push_to_crm` solo empuja registros con `crm_synced_at` null en UPDATE (ver DECISIONS D9/D10).

## Tags bidireccionales

- Prefijo `crm-lite:` = tags propios de la app (no se envían a GHL en push).
- Tags de GHL se importan en inbound/auto-import.

## Agregar otro CRM (ej. Kommo)

1. Copiar plantilla desde `hubspot/` o `ghl/` a `crm-lite/kommo/`.
2. Mapear API del CRM en nodos HTTP.
3. Activar solo esa subcarpeta en n8n de la instalación.
4. Opcional: generalizar web (`/api/crm/*`) en lugar de `/api/ghl/*`.

## Despliegue

```powershell
.\n8n\deploy-workflows.ps1
```

IDs en `n8n-ids.local`.

## Migración base

`supabase/migrations/0011_n8n_writeback.sql` — aplicada y registrada en cloud (2026-07-09). `scripts/apply-0011-operational.sql` queda como referencia.
