# n8n — CRM Lite workflows

Workflows versionados para la integración multi-CRM. La instancia en vivo es `https://n8n.stlabs.ar`.

## Estructura en n8n (panel)

Crear manualmente en **Personal** (n8n >= 1.85; la API de proyectos/carpetas requiere licencia):

```
CRM Lite/
├── GHL/           ← flujos activos de GoHighLevel
├── HubSpot/       ← plantillas (inactivas hasta configurar)
├── Pipedrive/     ← plantillas (inactivas hasta configurar)
└── Compartidos/   ← alertas de error
```

## Mapa webhook

| Workflow | Path | Quién llama |
|----------|------|-------------|
| GHL Push | `POST /webhook/crm-push` | Supabase `push_to_crm()` |
| GHL Pull | `POST /webhook/crm-ghl-search` | Web `/api/ghl/search` |
| GHL Tags | `POST /webhook/crm-ghl-tags` | Web `/api/ghl/tags` |
| GHL Inbound | `POST /webhook/crm-ghl-inbound` | GHL Admin (webhook) |
| GHL Pipelines | `POST /webhook/crm-ghl-pipelines` | Web `/api/ghl/pipelines` |
| GHL Retry | cron 15 min | n8n |
| GHL Auto-import | cron 1 h | n8n |

Header requerido en webhooks: `x-crm-lite-webhook-secret`.

> **Importante**: n8n no permite leer credenciales en expresiones (`$credentials` no resuelve). Por eso los nodos HTTP que llaman a los RPC de Supabase usan **Header Auth nativa** con la credencial "CRM Lite Webhook Secret", y los RPC leen el secreto del header `x-crm-lite-webhook-secret` (vía `private.n8n_request_secret()`); `p_secret` en el body queda solo como fallback para pruebas manuales.

## Desplegar en n8n

Desde la raíz del repo (requiere `crm-secrets.local.env` con `apikeyn8n`):

```powershell
.\n8n\deploy-workflows.ps1
```

## Migración Supabase

`supabase/migrations/0011_n8n_writeback.sql` ya está aplicada en el proyecto cloud `CRM.LITE` (2026-07-09, registrada en el historial). El secreto es el mismo `n8n_webhook_secret` cargado en la 0010 — no hace falta cargar uno aparte. Para rotarlo:

```sql
insert into private.integration_secrets (key, secret_value)
values ('n8n_webhook_secret', '<nuevo-secreto>')
on conflict (key) do update set secret_value = excluded.secret_value;
```

(y actualizar el mismo valor en la credencial de n8n y en `web/.env.local`).

## Credenciales en n8n (IDs en `n8n-ids.local`)

| Credencial | Uso |
|------------|-----|
| CRM Lite Webhook Secret | Validar webhooks entrantes |
| CRM Lite Integration Secret | RPCs Supabase desde n8n |
| GHL LeadConnector | API v2 GHL |

## Tags bidireccionales

- Tags con prefijo `crm-lite:` son propios de la app; no se envían a GHL en push.
- Tags de GHL se importan en inbound/auto-import.

Ver también `docs/INTEGRACION-N8N.md` y `docs/INTEGRACION-GHL.md`.
