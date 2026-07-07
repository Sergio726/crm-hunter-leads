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
- **Credencial GHL**: tipo `httpHeaderAuth`, id `gw0VVz43aChxVaFA` (guarda el `Authorization: Bearer ...`). El header `Version` va en cada nodo HTTP.
- **Flujo PULL** (✅ activo y probado): workflow id `PxWmAFfaKMk3lugD`, definición en `n8n/workflows/ghl-pull.json`.
  - Webhook: `POST https://n8n.stlabs.ar/webhook/crm-ghl-search` con body `{ "tag": "warm lead" }` → devuelve `{ contacts, total }`.
- IDs no secretos en `n8n-ids.local`.

## Pendiente

- **Flujo PUSH**: Supabase (insert/update en `clients`, `origin='app'`) → webhook → n8n → `POST /contacts/upsert` en GHL.
- **Database Webhook** de Supabase → n8n (pg_net / net.http_post).
- **Web**: pantalla "Contactos GHL" que llama al webhook pull, muestra resultados, permite seleccionar + asignar + importar a `clients` (`origin='ghl'`).
