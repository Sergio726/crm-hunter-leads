# 🧠 DECISIONS — Registro de decisiones

> Decisiones de arquitectura/producto ya tomadas, con el porqué. Evita rediscutir lo resuelto. Formato: fecha · decisión · motivo.

| # | Fecha | Decisión | Motivo |
|---|---|---|---|
| D1 | 2026-07 | **Stack: React Native + Expo + Supabase** | Un código para Android/iOS; Supabase da auth Google + Postgres + RLS + API REST sin backend propio. Ver ARCHITECTURE §Alternativas. |
| D2 | 2026-07 | **Single-tenant por instalación** (sin capa de "organizaciones") | Cada cliente tiene su copia aislada. Simple. Multi-tenant se descartó por ahora (meterlo después es caro pero hoy no se necesita). |
| D3 | 2026-07 | **Multi-CRM vía n8n**, app/base agnósticas al CRM | Agregar un CRM = un flujo n8n, sin tocar la app. Credenciales de CRM viven en n8n. |
| D4 | 2026-07 | **No construir API propia** — usar la REST autogenerada de Supabase | La base ya expone REST documentada + RLS. La "API a documentar" es el contrato con n8n (contacto normalizado). |
| D5 | 2026-07 | **Equipo por invitación** (lista blanca de emails) | Solo entra gente autorizada; los no invitados quedan en rol `pending` sin acceso. |
| D6 | 2026-07 | **Backend en Supabase Cloud** (proyecto del cliente), self-hosted como respaldo | Consolidar en el ecosistema del cliente. Se pausó ROADMAP.APP para liberar cupo free. |
| D7 | 2026-07 | **Expo SDK 54** (bajado de 57) | El Expo Go del cliente soporta SDK 54. |
| D8 | 2026-07 | **Web admin aparte, mismo backend** | Móvil = día a día del vendedor; Web = administración pesada. Comparten Supabase y tipos. |
| D9 | 2026-07 | **Secreto n8n↔Supabase viaja en el header `x-crm-lite-webhook-secret`**, no en el body | n8n no permite leer credenciales en expresiones (`$credentials` falla). Los nodos HTTP usan Header Auth nativa y los RPC leen `request.headers` (fallback `p_secret` para pruebas manuales). Un solo secreto para ambas direcciones. |
| D10 | 2026-07 | **`push_to_crm` solo empuja registros "dirty"** (`crm_synced_at` null en UPDATE) | El write-back de n8n actualiza la fila y sin este guard re-disparaba el push en loop infinito contra GHL. `mark_crm_dirty` repone el estado dirty cuando cambian datos de contacto o tags. |
