# 📋 BACKLOG — Tablero de tareas

> Fuente de verdad de qué falta hacer. **Al terminar una tarea, movela a "Hecho" con fecha.** Al agregar una, poné prioridad y agente sugerido.

**Prioridad:** 🔴 urgente · 🟠 alta · 🟡 normal · ⚪ idea/futuro
**Estado:** `pendiente` · `en curso` · `bloqueada` · `hecho`
**Agentes:** `backend-supabase` · `mobile-app` · `integrations-n8n` · `web-admin` · `orchestrator`

---

## 🔴 Urgente

| ID | Tarea | Estado | Agente | Notas |
|---|---|---|---|---|
| SEC-1 | Rotar **secreto de Google OAuth** (se mostró en texto) y actualizarlo en el proyecto cloud + self-hosted | pendiente | backend-supabase | Google Cloud → Credentials → Reset secret |
| SEC-2 | Rotar **contraseña root del VPS** Hostinger (se expuso en chat) | pendiente | orchestrator | Acceso SSH por clave ya está OK |
| SEC-3 | Regenerar **`JWT_SECRET`** del self-hosted antes de datos reales | pendiente | backend-supabase | Solo aplica al VPS de respaldo |
| SEC-4 | Borrar archivos de secretos del escritorio (`supabase-keys-NUEVAS.txt`, etc.) | pendiente | (usuario) | Acción manual del usuario |

## 🟠 Alta

| ID | Tarea | Estado | Agente | Notas |
|---|---|---|---|---|
| GIT-1 | Commitear cambios pendientes (ARCHITECTURE.md, `.env` cloud, docs/, agents/) | pendiente | orchestrator | Repo privado `s-tlabs/crm-lite-mobile` |
| N8N-1 | Renombrar `ghl_contact_id`/`ghl_synced_at` → `crm_*` (migración) | pendiente | backend-supabase | Ver ARCHITECTURE §Integraciones |
| N8N-2 | Crear **Database Webhook** Supabase → n8n al cambiar `clients` | pendiente | integrations-n8n | Payload = "contacto normalizado" |
| N8N-3 | Workflow n8n: recibir contacto normalizado → upsert en GHL → escribir `crm_contact_id` de vuelta | pendiente | integrations-n8n | Reemplaza Edge Function `sync-ghl` |
| GHL-1 | Cargar secrets GHL (`GHL_API_TOKEN`, `GHL_LOCATION_ID`) y probar sync end-to-end | pendiente | integrations-n8n | Esperando credenciales del usuario |

## 🟡 Normal

| ID | Tarea | Estado | Agente | Notas |
|---|---|---|---|---|
| EDGE-1 | Desplegar/ver Edge Functions (`sync-ghl`, `send-whatsapp`) en el proyecto cloud (si no se va 100% a n8n) | pendiente | backend-supabase | Hoy solo estaban en el self-hosted |
| WEB-1 | Iniciar **web admin** (Next.js) compartiendo backend + tipos | pendiente | web-admin | Ver ARCHITECTURE §Web admin |
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
| 2026-07-06 | Migración a Supabase Cloud (`CRM.LITE`): proyecto creado, migraciones 0001→0004, Google OAuth, `.env` |
| 2026-07-06 | Baja a Expo SDK 54 (compatibilidad Expo Go) |
| 2026-07-06 | Equipo por invitación (migración 0003 + pantallas) |
| 2026-07-06 | Banner motivacional meta/racha (migración 0004) |
| 2026-07-06 | `ARCHITECTURE.md` actualizado (multi-CRM vía n8n + web) |
