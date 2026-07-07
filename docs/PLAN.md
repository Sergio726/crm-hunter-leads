# 🎯 PLAN — Entregable: Panel web de administración + Sincronización con GHL

> Deliverable elegido (2026-07-07): el jefe/superadmin administra desde una **web**, y todo lo que
> pasa en la app se **sincroniza al CRM del cliente (GHL)** vía n8n. Dos frentes que se pueden avanzar
> en paralelo porque comparten el mismo backend Supabase.

**Estado backend hoy:** cloud `CRM.LITE` (`rtvvamemdhbvmyxtxonb`), `clients` vacía con columnas `crm_*` + `origin` + `tags`, RLS ok, superadmin creado.

## 🔁 Diseño clave: contactos de GHL + leads propios conviven (2026-07-07)

Requisito del usuario: la web debe **ver contactos de GHL filtrando por tags**, **diferenciar** los leads
cargados en app/web de los venidos de GHL, y que **convivan** (los seleccionados de GHL se usan para
seguimiento desde app/web).

**Modelo (ya aplicado, migración `0006`):**
- `clients.origin` = `app` | `ghl` → distingue el origen. Los dos conviven en la misma tabla/lista.
- `clients.tags text[]` → etiquetas; en los de GHL vienen de GHL (índice GIN para filtrar).
- `clients.crm_contact_id` **único** (cuando no es null) → un contacto de GHL no se importa dos veces.

**Sincronización bidireccional con GHL (vía n8n):**
- **PULL (traer):** web busca contactos de GHL por tag → el usuario selecciona → se importan como
  `clients` (`origin='ghl'`, con tags y `crm_contact_id`) → se asignan a un vendedor → aparecen en su app.
- **PUSH (empujar):** lead nuevo en app/web (`origin='app'`) → webhook → n8n → upsert en GHL → escribe
  `crm_contact_id`/`crm_synced_at` de vuelta.

**Impacto en la app:** `Client` ahora tiene `origin` + `tags` (`types.ts` actualizado). Los importados de
GHL aparecen en "Pendientes" del vendedor una vez asignados. Falta: mostrar etiqueta de origen + tags en
la ficha/lista (cambio menor).

---

## Fase 0 — Preparación (arrancar ya)

| Paso | Qué | Quién | Depende de |
|---|---|---|---|
| 0.1 | ✅ **N8N-1 hecho**: renombrado `ghl_*` → `crm_*` (migración `0005` + trigger `mark_crm_dirty` + índice + `types.ts`). Advisors sin issues nuevos. | backend-supabase | — |
| 0.2 | ✅ **hecho**: n8n corriendo en `https://n8n.stlabs.ar` (Dokploy), API pública OK y API key válida (puedo crear flujos/credenciales por API). | integrations-n8n | acceso SSH |
| 0.3 | **Vos**: conseguir credenciales **GHL** del cliente: `API token` + `Location ID`. Van en n8n, nunca en el repo/chat. | usuario | cuenta GHL del cliente |
| 0.4 | Decidir **hosting de la web**. Recomendado: **Vercel** (gratis, integra con Supabase). | orchestrator | — |

## Fase A — Sincronización con GHL (n8n)

> **Avances 2026-07-07**: ✅ GHL API v2 confirmada + recon (ver `docs/INTEGRACION-GHL.md`). ✅ Credencial GHL en n8n. ✅ **Flujo PULL activo y probado** (`webhook/crm-ghl-search` devuelve contactos por tag). Falta: PUSH (upsert) + Database Webhook + cablear la pantalla web.

| Paso | Qué | Quién | Depende de |
|---|---|---|---|
| A.1 | **N8N-2**: Database Webhook de Supabase en `clients` (insert/update) → POST "contacto normalizado" a n8n (contrato en `ARCHITECTURE.md`). | integrations-n8n | 0.1, 0.2 |
| A.2 | **N8N-3**: workflow n8n: recibir contacto → mapear a GHL → upsert → escribir `crm_contact_id`/`crm_synced_at` de vuelta (REST). | integrations-n8n | A.1 |
| A.3 | **GHL-1**: cargar credenciales en n8n y **probar end-to-end** (cargar cliente en app → aparece en GHL → id de vuelta). | integrations-n8n | 0.3, A.2 |

> **✅ Parte autónoma COMPLETA (2026-07-07)**: A1-A4 (push/webhook/tags/limpieza), B1-B4 (Contactos GHL, Reportes, Clientes CSV/reasignar/editar), C1 (badges app), D (advisors OK). tsc + lint verdes. Pendiente sólo lo que requiere al usuario (deploy, allow-list localhost, commit).

## Fase B — Web admin (Next.js) — en paralelo a A

| Paso | Qué | Quién | Depende de |
|---|---|---|---|
| B.1 | ✅ **hecho**: proyecto Next.js 16 en `web/` (App Router, TS, Tailwind, `@supabase/ssr`). Shell + nav + dashboard con métricas. tsc OK. Ojo: Next 16 usa `proxy.ts` (ex-`middleware`). | web-admin | — |
| B.2 | 🔨 **login Google hecho en código** (page /login + callback + gate superadmin). **Falta**: agregar `http://localhost:3000/**` al allow-list de Supabase para probar en dev. | web-admin | B.1 |
| B.3 | ✅ **hecho**: Inicio (métricas) + **Equipo** (invitar/aprobar/revocar + stats) + **Clientes** (lista con filtros por origen/estado/tag/búsqueda). tsc OK. | web-admin | B.2 |
| B.4 | **WEB-1d**: gestión **masiva**: importar CSV, asignar clientes a vendedores, alta/edición. | web-admin | B.3 |
| B.5 | **WEB-1e**: reportes / tableros. | web-admin | B.3 |
| B.6 | **WEB-1f**: **deploy** (Vercel) + variables públicas. | web-admin | B.3 |

## Fase C — Cierre

| Paso | Qué |
|---|---|
| C.1 | Prueba integral: app + web + sync GHL funcionando juntos. |
| C.2 | Documentar (README de la web, cómo agregar otro CRM en n8n). |
| C.3 | Entregar al cliente. |

---

## 🔑 Lo que necesito de vos para destrabar

1. **Credenciales GHL** (API token + Location ID) — las conseguís en la cuenta GHL del cliente. Bloquean solo A.3.
2. **¿n8n ya está instalado en el VPS?** (si no sabés, lo verifico yo por SSH).
3. **Hosting de la web**: ¿Vercel (recomendado) o el ecosistema del cliente?

## ▶️ Se puede arrancar YA (sin esperar nada)

- **0.1** (renombrar `crm_*`) y **B.1** (crear el proyecto Next.js) no dependen de nada. Empezamos por ahí.
