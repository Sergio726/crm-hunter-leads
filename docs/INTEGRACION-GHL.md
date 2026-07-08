# 🔗 Integración GHL (GoHighLevel) vía n8n — Referencia

> Recon confirmado el 2026-07-07. IDs/credenciales reales viven en `n8n-ids.local` y `crm-secrets.local.env` (git-ignored).

## API de GHL

- **Versión: v2 (LeadConnector)**. La v1 (`rest.gohighlevel.com`) da 401.
- Base: `https://services.leadconnectorhq.com`
- Auth: header `Authorization: Bearer <GHL_API_KEY>` + header `Version: 2021-07-28`.
- **Tags del location**: `GET /locations/{locationId}/tags` → `{ tags: [{ name }] }` (hay 27).
- **Buscar contactos por tag**: `POST /contacts/search`
  ```json
  { "locationId": "<loc>", "pageLimit": 50,
    "filters": [ { "field": "tags", "operator": "contains", "value": "<tag>" } ] }
  ```
  → `{ contacts: [...], total }`. Campos útiles del contacto: `id, contactName, firstName, lastName, email, phone, companyName, tags`.
- **Upsert (push)**: `POST /contacts/upsert` (pendiente de cablear).

## n8n

- Instancia: `https://n8n.stlabs.ar` (API pública habilitada; API key en `crm-secrets.local.env`).
- Protección de webhooks preparada con header `x-crm-lite-webhook-secret`. El valor vive en `crm-secrets.local.env` y `web/.env.local`; al aplicar en vivo debe cargarse también en una credencial `httpHeaderAuth` de n8n.
- **Credencial GHL**: tipo `httpHeaderAuth`, id `gw0VVz43aChxVaFA` (guarda el `Authorization: Bearer ...`). El header `Version` va en cada nodo HTTP.
- **Flujo PULL** (✅ activo y probado): workflow id `PxWmAFfaKMk3lugD`, definición en `n8n/workflows/ghl-pull.json`.
  - Webhook: `POST https://n8n.stlabs.ar/webhook/crm-ghl-search` con body `{ "tag": "warm lead" }` → devuelve `{ contacts, total }`.
- IDs no secretos en `n8n-ids.local`.

## Seguridad de webhooks

- Web/admin → n8n: los route handlers agregan `x-crm-lite-webhook-secret` desde `N8N_WEBHOOK_SECRET`.
- Supabase → n8n: `push_to_crm()` lee `private.integration_secrets.key = 'n8n_webhook_secret'` y manda el mismo header.
- n8n debe validar los 3 webhooks (`crm-push`, `crm-ghl-search`, `crm-ghl-tags`) con una credencial `httpHeaderAuth`. Los workflows exportados ya incluyen el placeholder `__N8N_WEBHOOK_SECRET_CRED_ID__`.
