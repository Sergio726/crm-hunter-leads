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

## 🚀 Roadmap de mejoras (propuestas 2026-07-08)

> Lluvia de ideas para priorizar. Borrá/reordená lo que no aplique.
> Prioridad: 🔴 desbloquea · 🟠 alto valor · 🟡 mejora. (Algunas se cruzan con ideas ya listadas arriba.)

### Web (panel)
| ID | Tarea | Prioridad | Notas |
|---|---|---|---|
| WEB-2 | Deploy real (Vercel o VPS) + dominio | 🔴 | hoy solo corre local |
| WEB-3 | Commit + push de todo el trabajo | 🔴 | nada está en git todavía |
| WEB-4 | Acciones en masa (reasignar / estado / borrar) | ✅ hecho | web-admin | Checkbox + barra asignar/estado/borrar (2026-07-09) |
| WEB-5 | Importar CSV mejorado (preview, dedup, plantilla) | 🟠 parcial | Preview + dedup + plantilla (2026-07-09). Falta: mapeo columnas custom |
| WEB-6 | Dashboard: tendencia por día + feed de actividad reciente | 🟠 | gráfico de línea |
| WEB-7 | Badges de "pendientes"/"vencidos" en el sidebar | 🟠 | |
| WEB-8 | Paginación / virtualización de la tabla de clientes | 🟠 | hoy trae todo |
| WEB-9 | Exportar clientes a CSV | 🟠 | |
| WEB-10 | Búsqueda global (Cmd/Ctrl+K) | 🟡 | |
| WEB-11 | Vistas / filtros guardados | 🟡 | |
| WEB-12 | Rol "supervisor" (entre vendedor y superadmin) | 🟡 | |
| WEB-13 | Asignación automática (round-robin) al importar/traer GHL | 🟡 | |
| WEB-14 | Auditoría (log de cambios de estado/asignación) | 🟡 | |
| WEB-15 | Logo desde el panel (subir a Storage) | 🟡 | hoy es archivo en el repo |
| WEB-16 | PWA · i18n · tests (Playwright) | 🟡 | |

### n8n / integración GHL
| ID | Tarea | Prioridad | Notas |
|---|---|---|---|
| N8N-0 | Organizar workflows en carpeta CRM Lite (repo + panel) | ✅ hecho | Repo: `n8n/workflows/crm-lite/`; panel manual |
| N8N-4 | Proteger webhooks (header secreto) | ✅ hecho | Credencial `rZvKjdRnF39vlXHi`; 403 sin header |
| N8N-5 | Write-back `crm_contact_id` | ✅ hecho | Migración `0011` corregida y aplicada; **probado e2e** (alta + edición, sin loop) 2026-07-09 |
| N8N-6 | Reintentos cron | ✅ hecho | `retry.json` activo (corregido: secreto vía Header Auth) |
| N8N-7 | Inbound GHL → Supabase | ✅ hecho | `inbound.json`; falta registrar URL en GHL Admin |
| N8N-8 | Alertas Discord | ✅ hecho | `shared/alerts.json` + errorWorkflow |
| N8N-9 | Auto-import por tag | ✅ hecho | `auto-import.json` + UI Configuración |
| N8N-10 | Mapeo status → stages | ✅ hecho (v1) | `pipelines.json` + JSON en Configuración |
| N8N-11 | Tags bidireccionales | ✅ hecho | Convención `crm-lite:` en push + inbound |
| N8N-12 | Plantillas HubSpot/Pipedrive | ✅ hecho | `hubspot/`, `pipedrive/` inactivas |
| N8N-13 | Rate limiting GHL | ✅ hecho | Batch+Wait en retry y auto-import |

### App móvil
| ID | Tarea | Prioridad | Notas |
|---|---|---|---|
| APP-1 | Build EAS + publicar (= PROD-1): ícono, deep link `crmlite://` prod | 🔴 | instalable sin Metro |
| APP-2 | Notificaciones push (recordatorios) — ver IDEA-3 | 🟠 | Expo push |
| APP-3 | WhatsApp API real (Evolution API del VPS) — ver WA-1 | 🟠 | |
| APP-4 | Editar cliente desde la app | 🟠 | hoy solo alta + interacción |
| APP-5 | Modo offline (encolar interacciones y sincronizar) | 🟠 | |
| APP-6 | Buscar / ver todos los clientes (no solo pendientes) | 🟠 | |
| APP-7 | Filtrar por tag / ver tags | 🟡 | |
| APP-8 | Gamificación (ranking del equipo, logros, historial de rachas) | 🟡 | |
| APP-9 | Adjuntar foto / nota de voz a una interacción | 🟡 | |
| APP-10 | Biometría / PIN para abrir la app | 🟡 | |

### Transversal
| ID | Tarea | Prioridad | Notas |
|---|---|---|---|
| TRV-1 | Seguridad: SEC-3 (JWT respaldo) + revisar advisors + proteger webhooks | 🟠 | |
| TRV-2 | CI: correr `tsc`/`lint`/`build` en cada push | 🟡 | |
| TRV-3 | Backups verificados de la base | 🟡 | |

---

## ✅ Hecho (log)

| Fecha | Tarea |
|---|---|
| 2026-07-09 | **Fix integración n8n (post-revisión)**: los flujos usaban `$credentials` en expresiones (n8n no lo permite → `p_secret` vacío, retry/auto-import fallaban en cada corrida). Ahora el secreto viaja por Header Auth nativa y los RPC lo leen de `request.headers` (nueva `private.n8n_request_secret()`). Además: guard anti-loop en `push_to_crm` (el write-back re-disparaba el push infinitamente), inbound preserva tags `crm-lite:` y no pisa el nombre, `mark_crm_dirty` incluye tags. Migración `0011` aplicada y registrada. **Write-back probado e2e** (alta + edición → `crm_contact_id` OK, 1 push por cambio, datos de prueba limpiados) |
| 2026-07-09 | **Integración n8n N8N-0→13**: carpeta `crm-lite/`, 8 flujos GHL + alertas + plantillas, credenciales webhook/integración, push con writeback, retry/inbound/auto-import/pipelines, batch rate-limit, docs `INTEGRACION-N8N.md`, `n8n/README.md`, web Configuración GHL |
| 2026-07-09 | Web `/clientes`: **rediseño UX** — stats mini, tabla sin selects inline (fila clickeable + badges), columna seguimiento, filtros vendedor/tag (combobox), drawer con WhatsApp/email/llamar + link GHL, CSV en modal con preview/dedup/plantilla. Doc: `docs/WEB-CLIENTES.md`. `tsc` OK |
| 2026-07-09 | Web `/contactos-ghl`: combobox tags, búsqueda auto, indicador “ya importado”, selección por fila/nombre |
| 2026-07-08 | Web: **modo vendedor completo** (ruteo por rol: vendedor → `/vendedor`). Mis pendientes + banner de progreso, Contactados (hoy/semana), ficha con **contactar** (wa.me/mailto/tel) + **registrar interacción** + historial, y agregar cliente. `next build` OK (16 rutas) |
| 2026-07-08 | Web — paridad con la app + más control: **ficha de cliente** (drawer con historial de interacciones + editar todo + borrar), **agregar cliente manual**, **filtro seguimientos vencidos**, y **página Configuración** (meta diaria, modo WhatsApp, zona horaria, administradores). `next build` OK |
| 2026-07-08 | **Rediseño premium web con shadcn/ui** (Base UI + tokens oklch, paleta azul, modo claro/oscuro con clase `.dark`, gráficos recharts, sombras/gradientes). `next build` OK |
| 2026-07-08 | Fix bug importar contactos GHL: índice único parcial → total en `crm_contact_id` (ON CONFLICT) — migración `0009` |
| 2026-07-07 | **Rediseño UX/UI**: web (tokens + modo claro/oscuro + UI kit + toasts + responsive + logo) y app (tema claro/oscuro + iconos + pulido + logo). Logo desde archivo documentado en README. tsc + lint OK |
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
