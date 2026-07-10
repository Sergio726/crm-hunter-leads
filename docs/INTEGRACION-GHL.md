# 🔗 Integración GHL (GoHighLevel) vía n8n — Referencia

> Recon confirmado el 2026-07-07. IDs/credenciales reales viven en `n8n-ids.local` y `crm-secrets.local.env` (git-ignored).

## API de GHL

- **Versión: v2 (LeadConnector)**. La v1 (`rest.gohighlevel.com`) da 401.
- Base: `https://services.leadconnectorhq.com`
- Auth: header `Authorization: Bearer <GHL_API_KEY>` + header `Version: 2021-07-28`.
- **Tags del location**: `GET /locations/{locationId}/tags` → `{ tags: [{ name }] }`.
- **Buscar contactos por tag**: `POST /contacts/search` con filtro `tags contains`.
- **Upsert (push)**: `POST /contacts/upsert`.

## n8n

- Instancia: `https://n8n.stlabs.ar` (API pública habilitada; API key en `crm-secrets.local.env`).
- Workflows versionados en `n8n/workflows/crm-lite/ghl/`. Ver `n8n/README.md` y `docs/INTEGRACION-N8N.md`.
- **Credencial GHL**: `gw0VVz43aChxVaFA` (httpHeaderAuth Bearer).
- **Credencial webhook**: `rZvKjdRnF39vlXHi` (`CRM Lite Webhook Secret`).
- **Credencial integración**: `kXuV2N3VSnbLhe57` (RPCs Supabase).

### Flujos activos (IDs en `n8n-ids.local`)

| Flujo | Webhook / trigger |
|-------|-------------------|
| Push | `POST /webhook/crm-push` |
| Pull | `POST /webhook/crm-ghl-search` |
| Tags | `POST /webhook/crm-ghl-tags` |
| Inbound | `POST /webhook/crm-ghl-inbound` (registrar en GHL Admin) |
| Pipelines | `POST /webhook/crm-ghl-pipelines` |
| Retry | cron 15 min |
| Auto-import | cron 1 h |
| Alerts | error workflow → Discord |

## Seguridad de webhooks

- Header obligatorio: `x-crm-lite-webhook-secret`.
- Sin header → **403** (validado en n8n).
- Supabase `push_to_crm()` y web `/api/ghl/*` envían el secreto.

## Write-back (migración `0011`)

Push actualizado: contacto normalizado con `contact.id` → GHL upsert → RPC `n8n_crm_writeback`.

**Pendiente operativo:** aplicar `0011_n8n_writeback.sql` en Supabase Cloud si aún no está en vivo.
