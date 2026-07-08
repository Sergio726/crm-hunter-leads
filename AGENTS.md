# CRM Lite Mobile — Protocolo de trabajo para agentes IA

App móvil (RN + Expo) de seguimiento de clientes para vendedores, con superadmin, login Google y **multi-CRM vía n8n**. Despliegue **single-tenant por instalación**.

## 🚦 Al iniciar CADA sesión (obligatorio, en orden)

1. Leé **`docs/STATE.md`** → estado actual, próximo paso y lo urgente.
2. Leé **`docs/BACKLOG.md`** → tareas pendientes con prioridad y estado.
3. Si hace falta contexto de "por qué", mirá **`docs/DECISIONS.md`** y **`ARCHITECTURE.md`**.
4. Elegí la tarea siguiente respetando prioridad: 🔴 urgente → 🟠 alta → 🟡 normal.
5. Confirmá con el usuario antes de empezar algo grande o irreversible.

## ✍️ Al TERMINAR una tarea o sesión (obligatorio)

1. Actualizá **`docs/BACKLOG.md`**: mové la tarea a "Hecho" (con fecha) o cambiá su estado.
2. Actualizá **`docs/STATE.md`**: "Próximo paso", "Urgente" y la fecha.
3. Si tomaste una decisión de arquitectura/producto, agregá una fila en **`docs/DECISIONS.md`**.
4. No dejes el tablero desactualizado: es la única fuente de verdad entre sesiones.

## 🤖 Agentes especializados (`.Codex/agents/`)

Delegá al agente que corresponda según el área (el usuario debe pedir explícitamente usar subagentes):

- **`orchestrator`** — coordina, lee el estado, reparte tareas, mantiene el tablero. Punto de entrada por defecto.
- **`backend-supabase`** — base de datos, migraciones, RLS, funciones, Edge Functions, advisors.
- **`mobile-app`** — app Expo/React Native (pantallas, navegación, UX).
- **`integrations-n8n`** — n8n, webhooks, multi-CRM, contrato de "contacto normalizado".
- **`web-admin`** — futura web de administración (Next.js), comparte backend y tipos.

## 📏 Reglas del proyecto

- **Idioma con el usuario: español** (es no-técnico; explicá simple, hacé las cosas por él).
- **Secretos**: nunca en el repo ni en el chat. En `mobile/.env` solo van URL pública + publishable key. Tokens de CRM viven en n8n; `service_role`/JWT/contraseñas nunca se materializan.
- **Multi-CRM**: la app y la base son agnósticas al CRM. Toda integración pasa por n8n (ver `ARCHITECTURE.md`).
- **Migraciones**: versionadas en `supabase/migrations/`. En cloud aplicar vía MCP `apply_migration`; verificar con `get_advisors`.
- **Antes de commitear/pushear**: solo cuando el usuario lo pide. Chequear que no se cuele ningún secreto.
- **Nota**: `mobile/` tiene su propio `AGENTS.md`/`AGENTS.md` con detalles de la versión de Expo.
