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
| SEC-4 | Borrar archivos de secretos del escritorio (`supabase-keys-NUEVAS.txt`, etc.) | ✅ hecho | (usuario) | Completado por el usuario 2026-07-09 |
| WEB-17 | **Convertir vendedor existente en administrador** | en curso (otra rama) | web-admin | Implementado en `worktree-purrfect-pondering-bengio` (commit `3b55623`, más completo que un primer intento descartado acá: ascender + bajar rol, confirmación inline, migración `0014` con guard anti-autodegradación/anti-último-admin). Falta mergear esa rama a `main`. **Ojo**: esa misma rama reusó el ID `WEB-17` para una tarea distinta (glitch visual en `/clientes` mobile) en la sección Roadmap Web más abajo — hay que renumerar una de las dos antes de mergear |
| N8N-14 | **Bug: retry de n8n no reintenta nada** | ✅ hecho (2026-07-10) | integrations-n8n + usuario | Dos bugs en el workflow `GHL Retry`, ambos corregidos y verificados contra el servidor real (`n8n.moremigracion.com`): (1) nodo "To Push Payloads" asumía que `$input.first().json` era un array — corregido vía API, verificado con la ejecución 150 (pasó de 0 a 1 ítem producido). (2) nodo "Batch" (Split in Batches) tenía la salida "done" (índice 0) conectada a "Re-Push" en vez de la salida "loop" (índice 1) — **corregido manualmente por el usuario en el panel de n8n** (el subagente de integraciones no acepta autorizaciones relayadas por el orquestador para cambios de producción, correctamente), confirmado con `GET` posterior del workflow. Archivo local `n8n/workflows/crm-lite/ghl/retry.json` sincronizado con ambos fixes. Nota: como el pendiente de sync bajó a 0 (se resolvió el duplicado N8N-15), no hubo un caso real para ver el retry completo en acción con datos reales — la próxima vez que algo falle en el push inicial será la primera prueba end-to-end real del mecanismo ya arreglado |
| N8N-15 | **Duplicado de cliente bloqueando sync** ("Francy Diaz Ortegon") | ✅ hecho (2026-07-10) | backend-supabase | Dos filas en `clients` para el mismo lead. Resuelto: se conservó la fila `a1563759…` (ya sincronizada a GHL), se migró la interacción de la fila `f760e792…` y se borró esa fila. Verificado con `get_advisors`, sin efectos colaterales |

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
| WEB-2 | Deploy real (Dokploy en servidor nuevo) + dominio | 🟠 en curso | Docker listo (`web/Dockerfile` + compose, build verificado local). Falta: servidor con Dokploy + DNS → ver `docs/MIGRACION-SERVIDOR.md` |
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
| WEB-17 | **Convertir vendedor existente en administrador** | ✅ hecho (2026-07-10) | RPC `set_user_role` endurecida (migración `0014_set_user_role_guard.sql`: impide que un admin se autodegrade y evita dejar el sistema sin ningún superadmin, probado con transacción revertida en Supabase). Panel Equipo: botón "Hacer admin" en Vendedores y "Bajar a vendedor" en Administradores, con confirmación inline. Caso puntual `soporte@justmore.net` ya resuelto a mano por SQL el 2026-07-10 |
| WEB-26 | Investigar glitch visual (estática/ruido de colores) al entrar a `/clientes` en mobile real | 🟠 | Confirmado por el usuario en vivo (celular real, no solo foto), pasa apenas entra. Se descartó: blur sin proteger (`md:backdrop-blur`), hydration mismatch (sin warnings en consola), FOUC de tema (ya tiene script anti-flash). No reproducido en local/dev a 390px. **Pendiente: video de pantalla del usuario** para ver el instante exacto |
| WEB-18 | **Invitar colaborador con selector de rol** | 🟠 | `TeamManager.tsx`: renombrar "Invitar a un vendedor" → "Invitar a un colaborador"; sumar selector Vendedor/Administrador al formulario. Backend: `invite_member(p_email)` (migración `0003`) no acepta rol — extenderlo (ej. `invite_member(p_email, p_role)`) para que si es admin agregue a `superadmin_emails` en vez de `allowed_emails` y promueva directo a `superadmin` si la persona ya estaba en `pending` |

### Unificar vistas admin/vendedor (eliminar `/vendedor`)
> Decisión 2026-07-10 (pedido del usuario + recomendación UX/CRM): el vendedor debe ver lo mismo que el admin, salvo lo que sea información sensible o una acción de gestión. Hallazgo clave: el RLS de `clients`/`interactions` (migración `0001`) **ya** limita a cada vendedor a `assigned_to = auth.uid()` — si usa el mismo componente que el admin, la consulta se recorta sola, no hace falta reescribir queries. Lo único que hay que ocultar por rol son controles de UI y accesos de nav. `v_seller_stats` (Reportes) sí compara vendedores entre sí → queda admin-only (estándar en CRMs: leaderboard es vista de manager). "Contactados" se fusiona como filtro dentro de Clientes en vez de página aparte (menos vistas, menos desalineación de datos). Conviene secuenciar junto con **PERM-1** (rol lector): mismo patrón de "ocultar según rol" en vez de un tercer árbol de vistas.

| ID | Tarea | Prioridad | Notas |
|---|---|---|---|
| WEB-19 | `AppShell` único con nav condicional por rol | 🟠 | Reemplaza `AppShell` + `SellerShell` (hoy dos shells separados) por uno solo que arma el menú según `profile.role`: vendedor no ve los ítems "Configuración" ni "Equipo" (no solo bloqueados por redirect, directamente ocultos). Base para todo lo demás de esta sección |
| WEB-20 | Unificar `/` (Inicio) | 🟠 | Misma ruta, contenido según rol: admin ve el dashboard agregado actual (`page.tsx`); vendedor ve "Mis pendientes" + banner de meta/racha (hoy vive en `vendedor/page.tsx`, componentes `ProgressBanner`/`SellerClients`). No es restricción de seguridad, es un flujo de trabajo distinto sobre la misma página |
| WEB-21 | Unificar `/clientes` | 🟠 | Una sola página (`ClientsTable`) para todos — el RLS ya filtra las filas de un vendedor. Ocultar si `role==='seller'`: reasignar a otro vendedor, borrar, importar/exportar CSV masivo, filtro "por vendedor". Efecto colateral bueno: el vendedor pasa a ver y filtrar *todos* sus clientes (no solo pendientes como hoy en `/vendedor`) |
| WEB-22 | Unificar `/contactos-ghl` | 🟡 | Fusionar con `vendedor/contactos-ghl/page.tsx` — ya comparten casi el mismo componente `GhlBrowser`; aplicar `selfAssignId` solo cuando `role==='seller'` |
| WEB-23 | Fusionar "Contactados" como filtro en Clientes | 🟡 | Elimina `vendedor/contactados/page.tsx` (`ContactadosList`); agregar filtro/tab "contactados esta semana" dentro de `/clientes`, disponible para todos los roles |
| WEB-24 | Reportes queda admin-only (confirmado, sin cambio técnico) | ⚪ | `v_seller_stats` compara vendedores entre sí — se mantiene bloqueado por `requireSuperadmin()` tal cual está. Documentado acá para que quede la decisión, no una omisión |
| WEB-25 | Limpieza: borrar `web/src/app/vendedor/` y componentes sin uso | 🟡 | Último paso, después de WEB-19→23: borrar la carpeta y los componentes que queden huérfanos (`SellerShell`, `SellerClients`, `ContactadosList`, revisar `ProgressBanner`) |

### Permisos y seguimiento (rol lector, edición propia, adjuntos)
> Charla 2026-07-10: expansión de 3 ideas del usuario. Diseño acordado, falta bajar a migración.

| ID | Tarea | Prioridad | Notas |
|---|---|---|---|
| PERM-1 | Rol **lector** (viewer, global, app + web) | 🟠 | Nuevo valor `viewer` en `profiles_role_check`. Ve todo (clientes/interacciones/adjuntos) en modo solo-lectura — mismo alcance que superadmin pero sin `INSERT`/`UPDATE`/`DELETE`. Se invita con el mismo flujo de `allowed_emails`/`invite_member` (agregar rol al invitar, ver WEB-18). En la UI (app y web) ocultar botones de editar/contactar/asignar cuando `role='viewer'`, no solo bloquear por RLS |
| PERM-2 | Edición de cliente en la app + **auditoría automática** | 🟠 | La base ya permite que cada vendedor edite sus propios clientes (RLS `assigned_to = auth.uid()`); falta la pantalla en el celular — es **APP-4**. Sumar tabla de auditoría (`client_changes` o similar: cliente, quién, campo, valor viejo→nuevo, cuándo) poblada por trigger en `UPDATE` de `clients` — no depende de que cada pantalla lo reporte a mano. Mostrar como historial en la ficha del cliente (web y app) |
| PERM-3 | Adjuntar **fotos, PDFs y notas de voz** al seguimiento | 🟡 | Es **APP-9**, ahora con alcance definido: bucket nuevo en Supabase Storage (privado) + tabla `interaction_attachments` (interacción, quién subió, tipo, tamaño). Reglas de acceso calcadas de `clients` (vendedor ve solo lo suyo; lector/superadmin ven todo). Límite de tamaño por archivo + comprimir imágenes antes de subir. **No sincroniza a GHL** (queda interno, no se suma al contrato normalizado de n8n) |

### Modernización UX/UI del panel (sprints)
> Recomendación 2026-07-10, a ejecutar en orden — cada sprint es entregable por separado.
> **Actualizado 2026-07-10**: se investigó [21st.dev](https://21st.dev/community/components) (librería de componentes React/Tailwind) como fuente de inspiración/base para cada sprint — ver columna "Fuente 21st.dev" y la nota técnica debajo de la tabla.

| ID | Tarea | Prioridad | Notas | Fuente 21st.dev |
|---|---|---|---|---|
| UX-1 | Fundamentos y consistencia | 🟡 | Auditoría de espaciado/tipografía/iconografía entre pantallas; estados vacíos/carga/error prolijos donde falten (hoy varios son genéricos) | Bajo valor acá: `ui/EmptyState.tsx` y `ui/Skeleton.tsx` propios ya son sólidos — no reemplazar, solo generalizar su uso donde falte. Si se quiere pulir más, categoría **Empty States** como referencia visual únicamente |
| UX-2 | Microinteracciones y transiciones | 🟡 | Animaciones en modales/drawers/toasts (Framer Motion), feedback en botones (loading/hover/press), transición entre páginas. Mayor impacto visual con menor riesgo | **Prerequisito**: `framer-motion` no está instalado en `web/package.json` todavía (`npm install framer-motion`). Categorías **Dialogs/Modals** (94) y **Toggles** (83) como referencia de patrones de animación a adaptar sobre `ClientDrawer.tsx`/`AddClientDialog.tsx` (los toasts ya animan bien vía `sonner`, no tocar) |
| UX-3 | Navegación y layout | 🟡 | Sidebar colapsable, breadcrumbs, búsqueda global Cmd/Ctrl+K (= WEB-10), responsive tablet | Categoría **Sidebars** (24) para el patrón colapsable — hoy `SidebarNav.tsx` es una lista fija sin collapse; conviene resolverlo junto con **WEB-19** (mismo archivo, nav condicional por rol, evita tocarlo dos veces). Categoría **Command Menu** (10, estilo cmdk) para Cmd/Ctrl+K — aditivo, bajo riesgo, no reemplaza nada existente |
| UX-4 | Tablas y dashboard | 🟡 | Rediseño de tablas (= WEB-8 paginación/virtualización), gráficos con mejor storytelling (= WEB-6 tendencia diaria), badges de vencidos/pendientes (= WEB-7) | Categoría **Tables** (76, varias con paginación/orden/filtro incorporados) como referencia de patrón para `ClientsTable.tsx` (hoy sin paginación, trae todo). Dashboards/**Charts** (30 bloques de dashboard) como referencia visual para `SellerChart.tsx` — la librería de charting sigue siendo `recharts`, no se reemplaza, solo el layout/storytelling. Para los badges de vencidos ver también SEM-1 más abajo (categoría **Badges**) |
| UX-5 | Accesibilidad y pulido final | 🟡 | Contraste, foco por teclado, revisión modo oscuro/claro pantalla por pantalla | No aplica una categoría de 21st.dev puntual — es auditoría manual sobre lo ya construido en los sprints anteriores |

> **Nota técnica — cómo usar 21st.dev en este proyecto**: el panel usa **shadcn/ui + Base UI + Tailwind v4** con wrappers propios (`components/ui/*`), no shadcn "puro". Los componentes de 21st.dev sirven como **referencia de patrón/estructura para adaptar**, no para copiar y pegar tal cual — hay que ajustarlos a los tokens oklch y a los wrappers existentes (`Button`, `Card`, `Badge`, etc.) para no romper la consistencia visual ya lograda (rediseño premium 2026-07-08). El MCP `21st-dev-magic` (herramientas `21st_magic_component_builder`/`_inspiration`/`_refiner`) está conectado en esta sesión pero **devolvió error al usarse** — la causa más probable es que falta o es inválida la `API_KEY` (se obtiene gratis en `21st.dev/magic/console` y se configura en `~/.claude.json` → `mcpServers.21st-dev-magic.env.API_KEY`). Sin eso, hay que navegar el sitio a mano para copiar código de un componente puntual.
>
> **Decisión 2026-07-10**: el usuario evaluó 21st.dev vs. shadcn/ui y confirmó **shadcn/ui** como fuente preferida (`web/components.json` ya tiene la CLI configurada — `style: "base-nova"`, Base UI, mismo sistema de diseño del panel, cero fricción de adaptación). 21st.dev queda como inspiración puntual secundaria, no como fuente principal.

### 10 recomendaciones concretas de UX/UI (dashboard, reportes, login, tarjetas)
> Investigado 2026-07-10 con 3 agentes de exploración sobre el código real (login/shell, dashboard/tarjetas, reportes/tabla) a pedido del usuario. Cruza con `UX-1`…`UX-5`, `WEB-6`, `WEB-7`, `WEB-19`, `SEM-1` donde corresponde — no los duplica. Deja afuera a propósito la paginación de `ClientsTable` (= WEB-8) y la animación del `ClientDrawer` (= UX-2) para no repetir lo ya listado.

| ID | Tarea | Prioridad | Notas |
|---|---|---|---|
| UXR-1 | Mostrar el error de login OAuth en vez de fallar en silencio | ✅ hecho (2026-07-10) | `login/page.tsx` ahora lee `?error=auth` (envuelto en `Suspense` por `useSearchParams`) y muestra `toast.error`, limpiando la URL con `router.replace`. `tsc`/`lint`/`build` OK |
| UXR-2 | Bug: tokens de color rotos en el logo de respaldo | ✅ hecho (2026-07-10) | `components/brand/Logo.tsx`: `text-primary-fg`→`text-primary-foreground`, `text-text`→`text-foreground` |
| UXR-3 | Reemplazar el `UserMenu` "casero" por un `DropdownMenu` real | 🟡 | Hoy es `useState` + `fixed inset-0` manual en vez de un primitivo de Base UI/shadcn — pierde focus trap, navegación por teclado y ARIA que vendrían gratis |
| UXR-4 | Sidebar colapsable + breadcrumbs en el header | 🟡 | `SidebarNav.tsx` es una lista fija de 240px sin modo compacto; `AppShell.tsx` solo pinta `<h1>{title}</h1>` sin jerarquía de ruta. Mismo alcance que **UX-3**; conviene resolverlo junto con **WEB-19** (mismo archivo, nav condicional por rol) |
| UXR-5 | Unificar y potenciar las stat cards (fusionar `StatCard` + lógica ad-hoc de `ClientesStats`) | 🟡 | Son dos implementaciones paralelas casi idénticas sin componente compartido; solo `ClientesStats` tiene color condicional (`highlight` → `text-destructive`). Ninguna es clicable — ej. "Pendientes" podría linkear a `/clientes?status=pending` |
| UXR-6 | Dashboard: sumar tendencia temporal + feed de actividad reciente | 🟠 | = **WEB-6**. `app/page.tsx` (Inicio admin) solo muestra números absolutos del momento, sin comparación vs. período anterior ni lista de últimos clientes agregados/contactados/ganados, pese a que `recharts` ya está integrado con tokens del tema en `SellerChart.tsx` |
| UXR-7 | Badges de pendientes/vencidos visibles en dashboard y sidebar | 🟡 | = **WEB-7**, ligado a **SEM-1**. `Badge.tsx` ya existe con tonos `warning`/`danger` pero solo se usa en tablas de clientes — el dashboard no señaliza urgencia (todas las `StatCard` usan el mismo tono `primary`) |
| UXR-8 | Conectar `Skeleton.tsx` a loading states reales | 🟡 | El primitivo existe pero **no tiene ningún consumidor** en `web/src/`; no hay `loading.tsx` en ninguna ruta. Los estados de carga actuales son solo texto plano ("Redirigiendo…", "Entrando…", "Cargando…" en login, `auth/confirm` e historial de `ClientDrawer`) |
| UXR-9 | Reportes: funnel interactivo + selector de período + indicar el truncado de vendedores | 🟡 | El embudo de conversión son `<div>` con `width: %` a mano (no recharts); `SellerChart` trunca a `.slice(0, 8)` vendedores sin avisar que hay más; no hay comparación semana vs. semana anterior ni selector de rango |
| UXR-10 | Feedback visual en `ExportButton` + ampliar qué exporta | 🟡 | La descarga de CSV no dispara ningún `toast` ni loading (inconsistente con el resto de la app, que usa `sonner` en casi todo); solo exporta la tabla de vendedores, no el funnel ni los totales |

### Semáforo de estado de seguimiento (colores)
> Idea del usuario 2026-07-10 + hallazgo: app y web hoy usan colores **distintos** para el mismo estado `lost` (rojo en la app vs gris en la web) — no es solo una idea nueva, corrige una inconsistencia real.

| ID | Tarea | Prioridad | Notas |
|---|---|---|---|
| SEM-1 | Unificar semáforo de estado en app + web | 🟡 | 🟢 `won` (ya es verde en ambos, no cambia) · 🟠 `pending`/`contacted` en dos tonos de la misma familia (ámbar claro = sin contactar, naranja pleno = ya en conversación — para no perder esa distinción operativa) · 🔴 `lost` (hoy gris en la web, se pasa a rojo). Tocar: mobile `components/ClientCard.tsx` (`statusColor`); web `components/clientes/ClientsTable.tsx` **y** `components/clientes/ClientDrawer.tsx` (`STATUS_TONE` está duplicado en los dos archivos — de paso unificarlo en un solo lugar, ej. `lib/types.ts`); `app/reportes/page.tsx` (`FUNNEL_COLORS`) para que el embudo coincida |
| SEM-2 | Que "vencido" no se muestre en clientes `lost` | 🟡 | El rojo ya significa "vencido" (badge aparte por fecha de seguimiento pasada) — si `lost` también pasa a rojo, un cliente perdido y vencido a la vez pisaría el mismo color con dos significados. Ajustar la lógica de `isFollowUpOverdue`/badge "vencido" (`ClientsTable.tsx` y equivalente en la app) para que no aplique cuando `status==='lost'` (ni `'won'`, ya no tiene sentido perseguir la fecha) |

### Comentario rápido en el seguimiento
> Idea del usuario 2026-07-10.

| ID | Tarea | Prioridad | Notas |
|---|---|---|---|
| NOTE-1 | Comentario rápido (nota libre) en el seguimiento | 🟡 | Reutilizar `interactions` en vez de crear tabla/vista nueva: sumar `'note'` a `interactions_channel_check` (hoy `'whatsapp'\|'sms'\|'email'\|'call'`) y permitir `outcome` nulo para ese canal. UI: botón/ícono de "comentario rápido" en la tarjeta del cliente (app) y en la ficha (web) que abre solo un cuadro de texto — sin elegir canal/resultado. Aparece en el mismo historial de siempre |

### Editar mi perfil
> Idea del usuario 2026-07-10. Chequeado: no hay riesgo de seguridad al sumar campos — `profiles` ya usa permiso a nivel de columna (`grant update (full_name, avatar_url) ... to authenticated`, migración `0001` línea 91), así que un vendedor nunca pudo auto-promoverse el `role` por acá.

| ID | Tarea | Prioridad | Notas |
|---|---|---|---|
| PROF-1 | Pantalla "Mi perfil" (app + web) | 🟡 | Columnas nuevas en `profiles`: `phone`, `secondary_email` (evaluar `notification_prefs jsonb` pensando en NOTIF-1). Extender el `grant update (...)` existente para incluir las columnas nuevas — mismo mecanismo que ya usan `full_name`/`avatar_url`, no hay que tocar RLS. Bucket de Storage `avatars` para que cada uno suba su propia foto (hoy `avatar_url` solo lo llena Google en el login). Es prerequisito de NOTIF-1 (hace falta el teléfono guardado para poder notificar) |

### Notificaciones al vendedor por email/WhatsApp/SMS
> Idea del usuario 2026-07-10, usando los servicios de envío de GHL vía n8n, preparado para otros CRMs a futuro (mismo principio multi-CRM de `ARCHITECTURE.md`).

| ID | Tarea | Prioridad | Notas |
|---|---|---|---|
| NOTIF-1 | Workflow n8n "CRM Lite — Notify User" | 🟡 | Evento (seguimiento vencido, lead nuevo asignado — arrancar con estos dos, el resto se suma después con el mismo mecanismo) dispara un webhook a n8n con payload normalizado `{ evento, usuario: { email, phone }, canal_preferido, mensaje }`. n8n decide cómo mandarlo — hoy vía GHL (ya tiene número aprobado y API de SMS/WhatsApp/Email); mañana, otro flujo para otro CRM, sin tocar la app ni la base. Depende de PROF-1 (teléfono del vendedor guardado). Nota: **podría destrabar WA-1** (usar el número ya aprobado de GHL en vez de esperar aprobación propia de Meta) |

### Segundo contacto del cliente
> Idea del usuario 2026-07-10.

| ID | Tarea | Prioridad | Notas |
|---|---|---|---|
| CONT-1 | Segundo teléfono/email en `clients` | 🟡 | Columnas `phone_2`/`email_2`. **Antes de mapear al contrato normalizado**: verificar en la documentación actual de la API v2 de GHL si el objeto `contact` soporta un segundo email/teléfono (candidato: `additionalEmails`) — si no, el campo queda como dato exclusivo de CRM Lite, sin sync (no rompe el principio multi-CRM, simplemente ese campo no viaja). Sumar a los formularios de alta/edición de cliente — bundlear con APP-4 (editar cliente en la app), son los mismos formularios |

### Plan de sprints (orden de ejecución sugerido)
> Para que otra sesión, otro desarrollador u otro agente sepa por dónde arrancar sin releer toda la conversación del 2026-07-10. Cada sprint es un entregable separado; los agentes sugeridos son los de `.claude/agents/`.

| Sprint | Contenido | Agente(s) | Depende de |
|---|---|---|---|
| 0 — Urgente | Fix retry n8n (bug de auto-recuperación roto) · WEB-17 (UI convertir vendedor en admin) | `integrations-n8n`, `web-admin` | — |
| 1 — Migraciones base | PERM-1 (rol lector) · PROF-1 (columnas de perfil) · CONT-1 (`phone_2`/`email_2`) · PERM-2 (auditoría) · PERM-3 (adjuntos) · NOTE-1 (canal `'note'`) | `backend-supabase` (una sola sesión, tocan las mismas tablas) | Sprint 0 |
| 2 — Pantallas | Mi perfil · APP-4 (editar cliente) · comentario rápido · adjuntos en ficha · WEB-18 (invitar con rol) | `mobile-app` y `web-admin` en paralelo | Sprint 1 |
| 3 — Unificar vistas | WEB-19→25 (elimina `/vendedor`, nav condicional por rol) | `web-admin` | Sprint 1 (para diseñar el nav ya con el rol lector) |
| 4 — Notificaciones | NOTIF-1 | `integrations-n8n` + `backend-supabase` | Sprint 1/2 (teléfono del vendedor) |
| 5 — Semáforo | SEM-1/2 | `mobile-app` + `web-admin` | — (sin dependencias, cualquier hueco libre) |
| 6 — Modernización | UX-1→5 | `web-admin` | Idealmente al final |

### n8n / integración GHL
| ID | Tarea | Prioridad | Notas |
|---|---|---|---|
| N8N-0 | Organizar workflows en carpeta CRM Lite (repo + panel) | ✅ hecho | Repo: `n8n/workflows/crm-lite/`; panel manual |
| N8N-4 | Proteger webhooks (header secreto) | ✅ hecho | Credencial `rZvKjdRnF39vlXHi`; 403 sin header |
| N8N-5 | Write-back `crm_contact_id` | ✅ hecho | Migración `0011` corregida y aplicada; **probado e2e** (alta + edición, sin loop) 2026-07-09 |
| N8N-6 | Reintentos cron | ✅ hecho | `retry.json` activo (corregido: secreto vía Header Auth) |
| N8N-7 | Inbound GHL → Supabase | ✅ hecho | Webhook registrado en GHL y **probado e2e** (alta+edición+tags+empresa) 2026-07-09. El flujo re-consulta la API de GHL: el payload solo necesita `id` |
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
| TRV-0 | **Migración servidor nuevo** (web Docker + n8n) | 🔴 en curso | Preparado 2026-07-09: repo `somosmore/CRM-Lite`, `web/Dockerfile`, script n8n parametrizado, guía `MIGRACION-SERVIDOR.md`. Bloqueado por: instalar Dokploy + DNS (usuario) |
| TRV-1 | Seguridad: SEC-3 (JWT respaldo) + revisar advisors + proteger webhooks | 🟠 | |
| TRV-2 | CI: correr `tsc`/`lint`/`build` en cada push | 🟡 | |
| TRV-3 | Backups verificados de la base | 🟡 | |

---

## ✅ Hecho (log)

| Fecha | Tarea |
|---|---|
| 2026-07-10 | **Gestión de roles desde Equipo**: activada la RPC `set_user_role` (existía sin usar) con protección anti-autodegradación y anti-último-admin (migración `0014`, probada con transacción de prueba revertida). Panel: botón "Hacer admin" en Vendedores y "Bajar a vendedor" en Administradores, con confirmación inline |
| 2026-07-10 | **UXR-1 + UXR-2**: login muestra el error de OAuth (`login/page.tsx` lee `?error=auth`, envuelto en `Suspense`); fix de clases de color rotas en el logo de respaldo (`brand/Logo.tsx`). `tsc`/`lint`/`build` OK (lint tiene 9 errores preexistentes en otros archivos no tocados, regla `react-hooks/set-state-in-effect`, fuera de alcance) |
| 2026-07-10 | **Contactos GHL para vendedores**: página `/vendedor/contactos-ghl` (nav + `GhlBrowser` con `selfAssignId` — importa siempre a su propia lista, sin selector de vendedor), APIs search/tags abiertas a sellers, RPC `ghl_import_status` (migración `0013`, security definer) para que la detección de "ya importado" sea global entre vendedores |
| 2026-07-10 | **Clientes: fix filtros + vista móvil**: combobox mostraba solo la opción seleccionada al abrir (filtraba por el texto de la selección); móvil con tarjetas + botones WhatsApp/Llamar/Email, filtros colapsables, sin CSV/stats/selección masiva |
| 2026-07-09 | **Invitaciones con email real**: edge function `invite-user` (Supabase Auth invite, valida superadmin), sección "Invitaciones pendientes" en Equipo con Reenviar/Quitar (RPC `uninvite_member`, migración `0012`), advertencias para cuentas no-Gmail, login alternativo por **enlace de email** (`signInWithOtp` + página `/auth/confirm` para links con hash). Pendiente menor: SMTP propio (el de Supabase manda pocos emails/hora desde noreply@mail.app.supabase.io) |
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
