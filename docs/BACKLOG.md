# 📋 BACKLOG — Tablero de tareas

> Fuente de verdad de qué falta hacer. **Al terminar una tarea, movela a "Hecho" con fecha.** Al agregar una, poné prioridad y agente sugerido.

**Prioridad:** 🔴 urgente · 🟠 alta · 🟡 normal · ⚪ idea/futuro
**Estado:** `pendiente` · `en curso` · `bloqueada` · `hecho`
**Agentes:** `backend-supabase` · `mobile-app` · `integrations-n8n` · `web-admin` · `orchestrator`

---

## 🔴 Urgente

| ID | Tarea | Estado | Agente | Notas |
|---|---|---|---|---|
| SEC-1 | Rotar **secreto de Google OAuth** (se mostró en texto) y actualizarlo en el proyecto cloud | ✅ hecho | backend-supabase | Confirmado en logs de auth (login OK con secreto nuevo) |
| SEC-2 | Rotar **contraseña root del VPS** Hostinger (se expuso en chat) | ✅ hecho | orchestrator | Cambiada desde panel Hostinger. SSH por clave sigue OK |
| SEC-3 | Regenerar **`JWT_SECRET`** del self-hosted antes de datos reales | pendiente | backend-supabase | Baja urgencia: solo aplica al VPS de respaldo |
| SEC-4 | Borrar archivos de secretos del escritorio (`supabase-keys-NUEVAS.txt`, etc.) | pendiente | (usuario) | Acción manual del usuario |

## 🟠 Alta

| ID | Tarea | Estado | Agente | Notas |
|---|---|---|---|---|
| GIT-1 | Commitear cambios pendientes (ARCHITECTURE.md, `.env` cloud, docs/, agents/) | ✅ hecho | orchestrator | Commits `b03a1c7` y `804d843` (falta pushear) |
| N8N-1 | Renombrar `ghl_contact_id`/`ghl_synced_at` → `crm_*` (migración) | ✅ hecho | backend-supabase | Migración `0005`, trigger/índice renombrados, `types.ts` actualizado, advisors OK |
| N8N-2 | Crear **Database Webhook** Supabase → n8n al cambiar `clients` | ✅ hecho | integrations-n8n | Migración `0007` (pg_net), solo `origin='app'`. Probado end-to-end |
| N8N-3 | Workflow n8n: PUSH (upsert GHL) + PULL (buscar por tag) + TAGS | ✅ hecho | integrations-n8n | 3 workflows activos, ver `docs/INTEGRACION-GHL.md` |
| GHL-1 | Cargar secrets GHL y probar sync end-to-end | ✅ hecho | integrations-n8n | GHL API v2. PUSH y PULL probados (con contactos dummy, limpiados) |

## 🟡 Normal

| ID | Tarea | Estado | Agente | Notas |
|---|---|---|---|---|
| EDGE-1 | Desplegar/ver Edge Functions (`sync-ghl`, `send-whatsapp`) en el proyecto cloud (si no se va 100% a n8n) | pendiente | backend-supabase | Hoy solo estaban en el self-hosted |
| WEB-1 | **Web admin** (Next.js): Login+gate, Inicio, Equipo, Clientes (filtros+CSV+reasignar), Contactos GHL, Reportes | ✅ hecho (v1) | web-admin | En `web/`. Falta: deploy + allow-list localhost |
| WA-1 | Activar **WhatsApp Business API** (el switch ya existe) | pendiente | mobile-app / backend-supabase | Requiere número aprobado |
| PROD-1 | Producción: `SITE_URL` → `crmlite://auth-callback`, build EAS, publicar en tiendas | pendiente | mobile-app | Ver STATE datos clave |
| MOB-1 | Probar a fondo todas las funciones de la app en el proyecto cloud | pendiente | mobile-app | Base cloud está limpia |

## ⚪ Ideas / futuro

| ID | Tarea | Estado | Agente | Notas |
|---|---|---|---|---|
| IDEA-1 | Meta diaria configurable por el superadmin desde la app | pendiente | mobile-app | `app_settings.daily_goal` ya existe |
| IDEA-2 | Soportar más CRMs en n8n (HubSpot, Pipedrive) | pendiente | integrations-n8n | Solo agregar flujos n8n |
| IDEA-3 | Notificaciones push de recordatorio de seguimiento | pendiente | mobile-app | |

---

## ✅ Hecho (log)

| Fecha | Tarea |
|---|---|
| 2026-07-07 | **Web admin v1** (`web/`, Next.js 16): Login+gate superadmin, Inicio, Equipo, Clientes (filtros/CSV/reasignar), Contactos GHL, Reportes+CSV. tsc + lint OK |
| 2026-07-07 | **Integración GHL bidireccional**: PUSH (DB webhook `0007` → n8n → upsert) y PULL (buscar por tag → importar) probados end-to-end |
| 2026-07-07 | `origin` + `tags` en `clients` (migración `0006`); badges en la app; endurecimiento `push_to_crm` (`0008`) |
| 2026-07-07 | **N8N-1** (0.1): renombrado `ghl_*` → `crm_*` (migración 0005 + trigger/índice + `types.ts`) |
| 2026-07-07 | Seguridad: sacada la `apikeyn8n` de `mobile/.env` (versionado) → `crm-secrets.local.env` (git-ignored) |
| 2026-07-07 | **SEC-1**: rotado el secreto de Google OAuth (login OK con el nuevo) |
| 2026-07-07 | **SEC-2**: rotada la contraseña root del VPS Hostinger (desde el panel) |
| 2026-07-07 | Lanzador `iniciar-app.bat` (arranca Metro offline + IP fija) — modo oficial de arrancar la app |
| 2026-07-06 | Migración a Supabase Cloud (`CRM.LITE`): proyecto creado, migraciones 0001→0004, Google OAuth, `.env` |
| 2026-07-06 | Baja a Expo SDK 54 (compatibilidad Expo Go) |
| 2026-07-06 | Equipo por invitación (migración 0003 + pantallas) |
| 2026-07-06 | Banner motivacional meta/racha (migración 0004) |
| 2026-07-06 | `ARCHITECTURE.md` actualizado (multi-CRM vía n8n + web) |
