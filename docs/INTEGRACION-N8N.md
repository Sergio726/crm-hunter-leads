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
| ~~`n8n_list_overdue_followups`~~ | **Sin uso**: la borra la `0045`. Era la única que devolvía datos del vendedor |
| ~~`n8n_mark_notified`~~ | **Sin uso**: la borra la `0045` |

Secreto: `private.integration_secrets` clave `n8n_webhook_secret` (misma para ambas direcciones). Los RPC lo validan leyendo el **header** `x-crm-lite-webhook-secret` de la request (`private.n8n_request_secret()`), porque n8n no puede leer credenciales en expresiones; los nodos HTTP de n8n usan Header Auth nativa. Guard anti-loop: `push_to_crm` solo empuja registros con `crm_synced_at` null en UPDATE (ver DECISIONS D9/D10).

## Notificaciones — YA NO PASAN POR ACÁ

> **Esta sección describía cómo n8n mandaba los avisos por GoHighLevel. Eso se
> desarmó** el 2026-08-19 (ver D46). Un CRM es un destino de sincronización, no
> la cañería por la que el sistema avisa cosas suyas: un cliente sin GHL se
> quedaba sin avisos, el disparador hacía `net.http_post` desde Postgres, y
> apagar la sincronización apagaba los avisos **en silencio**.
>
> Hoy los avisos se detectan en un disparador que solo anota, se encolan en
> `notifications` y los entrega la app por Resend. Nada de eso mira
> `crm_sync_enabled`. Está documentado en
> [`../ARCHITECTURE.md`](../ARCHITECTURE.md#notificaciones--el-sistema-avisa-por-sus-propios-medios).

Lo que queda por hacer del lado de n8n:

1. **Desactivar los flujos `Notify User` y `Notify Overdue`** en el panel
   (OPS-4). Mientras sigan activos pueden duplicar avisos por GHL.
2. **Después**, correr la migración `0045`, que borra las dos RPC que leían.

`deploy-workflows.ps1` ya dejó de desplegarlos: si no, la próxima corrida los
reactivaba solos. Los archivos `notify-user.json` y `notify-overdue.json` se
conservan como registro de lo que llegó a estar corriendo.

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
