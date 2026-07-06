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
