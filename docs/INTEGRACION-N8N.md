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
| `n8n_list_overdue_followups` | Notify Overdue cron (seguimientos vencidos) — migración `0025` |
| `n8n_mark_notified` | Notify User marca la notificación como enviada (dedupe) — migración `0025` |

Secreto: `private.integration_secrets` clave `n8n_webhook_secret` (misma para ambas direcciones). Los RPC lo validan leyendo el **header** `x-crm-lite-webhook-secret` de la request (`private.n8n_request_secret()`), porque n8n no puede leer credenciales en expresiones; los nodos HTTP de n8n usan Header Auth nativa. Guard anti-loop: `push_to_crm` solo empuja registros con `crm_synced_at` null en UPDATE (ver DECISIONS D9/D10).

## Notificaciones al vendedor (NOTIF-1, migración `0025`)

Mismo principio multi-CRM: la base emite un **payload normalizado** y n8n decide cómo enviarlo (hoy GHL SMS/WhatsApp/Email). Dos eventos:

| Evento | Cómo se dispara | Workflow n8n |
|--------|-----------------|--------------|
| `lead.assigned` | Trigger `clients_notify_lead_assigned` (pg_net) al asignar un cliente a un **vendedor** (`role='seller'`) | `notify-user.json` (webhook `/webhook/crm-notify`) |
| `followup.overdue` | Cron n8n consulta `n8n_list_overdue_followups` | `notify-overdue.json` (cron) → reenvía cada uno a `notify-user.json` |

**Contrato del payload** (estable, agnóstico al canal y al CRM):

```jsonc
{
  "event": "lead.assigned",          // lead.assigned | followup.overdue
  "user": {                           // el VENDEDOR a notificar
    "id": "uuid",
    "email": "vend@x.com",
    "phone": "+549...",
    "name": "Nombre"
  },
  "preferred_channel": "email",       // email | sms | whatsapp (de profiles.notification_prefs.channel)
  "client": { "id": "uuid", "full_name": "...", "phone": "...", "company": "...", "status": "..." },
  "message": "Nuevo cliente asignado: Juan Pérez"
}
```

- **SAFE-BY-DEFAULT**: sin `app_settings.n8n_notify_url` configurada, el trigger no dispara nada. Para activar: setear esa clave a `https://<instancia-n8n>/webhook/crm-notify` y desplegar los dos workflows.
- **Dedupe**: tabla `public.notifications` (una fila por envío). El cron de vencidos no re-notifica el mismo cliente el mismo día (índice único `(user_id, ref_id, sent_on)`).
- **Canal preferido**: `profiles.notification_prefs.channel` (jsonb). Si no está, cae a `email`.
- **⚠️ Falta verificar/testear contra GHL** (no se pudo desde el worktree, sin credenciales): en `notify-user.json`, el vendedor se upsertea como contacto interno de GHL (tag `crm-lite:internal-user`) para poder mensajearlo, y el mensaje sale por la **Conversations API** (`POST /conversations/messages`). Confirmar la versión del header (`2021-04-15`?) y la forma exacta del body (`subject`/`html` para Email, `message` para SMS/WhatsApp) antes de activar en producción. Requiere que GHL tenga configurados los canales (número SMS/WhatsApp aprobado, email).

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
