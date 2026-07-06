# CRM Lite Mobile — Arquitectura

App móvil (Android + iOS) para que vendedores hagan seguimiento de clientes y contactos, con rol superadmin, login con Google e integración con CRMs externos (GoHighLevel y otros).

> **Modelo de despliegue: single-tenant por instalación.** Cada cliente tiene su propia copia del sistema (su propio proyecto Supabase, su propia app, su propio n8n). No hay capa de "organizaciones" ni datos compartidos entre clientes. Esto mantiene todo simple y aislado. Si en el futuro se quisiera un único sistema multi-cliente, habría que introducir el concepto de `organization` y scopear todo por él (decisión mayor, hoy descartada).

> **Multi-CRM por diseño.** La app y la base **no conocen ningún CRM en particular**. Toda integración con CRMs externos pasa por **n8n**, que traduce un "contacto normalizado" al CRM que corresponda. Agregar un CRM nuevo = un flujo nuevo en n8n, sin tocar la app ni la base.

---

## Estado actual (implementado)

- ✅ App móvil RN + Expo (SDK 54) funcionando en dispositivo real vía Expo Go.
- ✅ Login con Google (Supabase Auth / GoTrue).
- ✅ Pantallas: Pendientes, Contactados (día/semana), Ficha de cliente (WhatsApp/SMS/Email/Llamar + resultado), Alta de cliente, Perfil.
- ✅ **Equipo por invitación** (lista blanca de emails; roles `pending` / `seller` / `superadmin`; pantalla de gestión para el superadmin).
- ✅ **Banner motivacional** en Pendientes (meta diaria + barra de progreso + racha).
- ✅ Migraciones `0001`→`0004` versionadas.
- ✅ Desplegado en **Supabase Cloud** (proyecto `CRM.LITE`, org SEBAS, región São Paulo). El **self-hosted** (VPS Hostinger + Dokploy) queda como respaldo.

### Pendiente / próximos hitos

- 🔜 Desacoplar la sincronización CRM a **n8n** (hoy hay una Edge Function `sync-ghl` directa a GHL; ver sección Integraciones).
- 🔜 **Web admin** compartiendo el mismo backend.
- 🔜 WhatsApp Business API (el switch ya está preparado).
- 🔜 Antes de producción: `SITE_URL` a `crmlite://auth-callback`, rotar secreto de Google, build EAS.

---

## Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| App móvil | **React Native + Expo** (TypeScript) | Un solo código para Android e iOS; `Linking` nativo para WhatsApp/SMS/email; OTA sin pasar por tiendas |
| Web admin (futuro) | **Next.js / React** (TypeScript) | Mismo backend Supabase; panel de administración pesada; comparte tipos con la móvil |
| Backend + DB | **Supabase** (PostgreSQL) | Auth Google, base relacional (ideal para reportes día/semana), RLS, **API REST autogenerada** |
| API | **PostgREST (REST autogenerada por Supabase)** | No se construye API propia: la base ya expone REST documentada. GraphQL (`pg_graphql`) disponible si hiciera falta |
| Lógica de servidor | **Supabase Edge Functions** (Deno/TS) + **Database Webhooks** | Disparadores hacia n8n y envío por WhatsApp API |
| Integraciones / multi-CRM | **n8n** (self-hosted en el VPS) | Orquesta la sincronización a cualquier CRM; visual, mantenible sin programar |

## Alternativas evaluadas

- **Flutter**: excelente, pero Dart es un ecosistema aparte; RN+Expo tiene más mano de obra y builds más simples.
- **Nativo (Kotlin + Swift)**: dos código bases; costo doble injustificado.
- **PWA**: sin costo de tiendas, pero peor experiencia iOS y deep links a WhatsApp menos confiables.
- **Firebase (Firestore)**: NoSQL vuelve incómodas y caras las métricas "contactados por día/semana"; Postgres las resuelve con una vista SQL.
- **Backend propio (Node + Postgres)**: máxima flexibilidad pero hay que mantener auth/hosting/seguridad a mano. Innecesario: Supabase ya lo da.
- **API propia (REST/GraphQL a mano)**: descartada — Supabase autogenera la API REST sobre la base. El esfuerzo va al **contrato con n8n**, no a reinventar una capa de API.

---

## Modelo de datos (implementado)

```sql
-- Perfiles (fila creada por trigger al primer login con Google)
-- role: pending = inició sesión pero no está invitado (sin acceso a datos)
profiles (id uuid pk → auth.users, email, full_name, avatar_url,
          role text check in ('pending','seller','superadmin'), created_at)

-- Clientes / contactos
clients (id uuid pk, full_name, phone, email, company,
         assigned_to uuid → profiles, status check in ('pending','contacted','won','lost'),
         next_follow_up date,
         crm_contact_id text, crm_synced_at timestamptz,   -- genérico (hoy: ghl_*)
         notes, created_at, updated_at)

-- Registro inmutable de cada contacto
interactions (id uuid pk, client_id → clients, user_id → profiles,
              channel check in ('whatsapp','sms','email','call'),
              send_mode check in ('deeplink','api'),
              outcome check in ('answered','no_answer','interested',
                'not_interested','follow_up_scheduled','wrong_number','other'),
              notes, contacted_at)

-- Configuración global (clave/valor)
app_settings (key pk, value jsonb, updated_at)
--   whatsapp_mode: 'deeplink' | 'api'
--   superadmin_emails: ["..."]      (quién entra como superadmin)
--   allowed_emails:   ["..."]       (lista blanca de vendedores invitados)
--   daily_goal:       10            (meta diaria para el banner)
--   timezone:         "America/Argentina/Buenos_Aires"
```

> **Nota de nomenclatura:** hoy la tabla usa `ghl_contact_id` / `ghl_synced_at`. Al pasar a n8n conviene renombrarlos a `crm_contact_id` / `crm_synced_at` (genéricos), ya que el CRM concreto lo decide n8n por instalación.

### Vistas para pantallas y estadísticas (todas `security_invoker`)

- `v_pending_clients` — pendientes por contactar (respeta RLS por vendedor).
- `v_contacts_daily` / `v_contacts_weekly` — contactados por día / semana.
- `v_seller_stats` — resumen por vendedor para el dashboard del superadmin.
- RPC `my_progress()` — números del propio vendedor (hoy, semana, pendientes, ganados, meta, racha) para el banner.

### Seguridad (RLS)

- `seller`: ve/edita solo clientes con `assigned_to = auth.uid()`; inserta solo interacciones propias. **Requiere ser miembro activo** (`private.is_active_member()`), lo que bloquea a los `pending`.
- `superadmin`: lectura total + gestión; invita/revoca vendedores vía RPC (`invite_member`, `revoke_member`).
- Vistas con `security_invoker = true` (respetan el RLS del que consulta).
- Funciones `SECURITY DEFINER` con chequeo interno de permisos (superadmin o `auth.uid()`).

---

## Equipo por invitación

- Solo entran como vendedores los emails en `allowed_emails`. El superadmin los carga desde la app (pantalla Equipo) o se agregan al aprobar a un `pending`.
- Quien entra sin estar invitado queda en rol `pending` → ve una pantalla de "esperando autorización" y no puede leer ni crear nada (bloqueado también a nivel base).
- `superadmin_emails` define quién es admin (hoy: el dueño).

## Switch de WhatsApp (deep link hoy, API mañana)

Interfaz única en la app; la implementación se elige leyendo `app_settings.whatsapp_mode`:

```ts
interface MessagingProvider {
  sendWhatsApp(client: Client, message: string): Promise<SendResult>;
}
// DeepLinkProvider → abre la app de WhatsApp del teléfono (whatsapp://send?...)
// ApiProvider     → Edge Function `send-whatsapp` (WhatsApp Cloud API)
```

En ambos casos se registra la fila en `interactions`. Cambiar de modo = actualizar una fila en `app_settings`, sin tocar la app. SMS y email usan siempre deep links del sistema (`sms:` / `mailto:`).

---

## Integraciones / Multi-CRM vía n8n

**Principio:** la app y la base son agnósticas al CRM. n8n es el único que conoce las particularidades de cada CRM.

```
App móvil ─┐
Web admin ─┼─→  Supabase (base + auth + RLS + REST)
           │            │
           │            └─ Database Webhook (insert/update en clients)
           │                        │
           │                        ▼
           │                      n8n  ──► GoHighLevel
           │                        │  ──► HubSpot
           └── (n8n escribe de vuelta el id externo) ◄──  ──► Pipedrive / etc.
```

### Flujo saliente (app → CRM)

1. Se crea/edita un cliente → **Database Webhook de Supabase** dispara un POST a un webhook de n8n con el **contacto normalizado** (ver contrato abajo).
2. n8n mapea los campos al CRM configurado para esa instalación y hace el upsert.
3. n8n escribe de vuelta en Supabase (vía REST) el `crm_contact_id` y `crm_synced_at`.
4. Si n8n/CRM falla, `crm_synced_at` queda null; un reintento (workflow programado en n8n o `pg_cron`) reprocesa los pendientes.

> Esto **reemplaza** la Edge Function `sync-ghl` directa. La Edge Function queda como opción B; el webhook a n8n es el camino recomendado por ser multi-CRM y mantenible sin código.

### Contrato: "contacto normalizado" (la API a documentar de verdad)

Este JSON es el **contrato estable** entre la app y n8n. Los CRMs cambian; este formato no.

```jsonc
{
  "event": "contact.upserted",        // contact.upserted | contact.deleted
  "installation": "cliente-x",         // identifica la instalación (single-tenant)
  "contact": {
    "id": "uuid-en-supabase",          // id interno (fuente de verdad)
    "full_name": "Juan Pérez",
    "phone": "+5491122334455",         // E.164
    "email": "juan@ejemplo.com",
    "company": "Acme",
    "status": "contacted",             // pending | contacted | won | lost
    "assigned_to_email": "vend@x.com", // vendedor responsable
    "tags": ["crm-lite"],
    "last_interaction": {              // opcional
      "channel": "whatsapp",
      "outcome": "interested",
      "at": "2026-07-06T19:00:00Z"
    }
  }
}
```

- **Credenciales de cada CRM** (tokens de GHL/HubSpot/etc.) viven **en n8n**, nunca en la app ni en la base.
- El mapeo de campos (p. ej. `status: won` → etapa del pipeline de GHL) se define en n8n por instalación.

### Flujo entrante (CRM → app, opcional)

Si un CRM debe empujar cambios de vuelta (p. ej. estado actualizado desde GHL), n8n recibe el webhook del CRM, normaliza y escribe en Supabase vía REST (`PATCH /rest/v1/clients?id=eq...`) con una service key guardada en n8n.

---

## Estrategia de API

- **No se construye API propia.** Supabase expone automáticamente una **API REST (PostgREST)** documentada sobre la base, protegida por RLS. La app móvil y la web la consumen con `supabase-js`.
- **GraphQL** (`pg_graphql`) está disponible en Supabase si la web necesitara consultas muy anidadas; hoy no hace falta.
- La **API que sí se documenta a mano** es el **contrato con n8n** (el "contacto normalizado" de arriba) y los webhooks entrantes de cada CRM.
- Documentación viva: las docs REST autogeneradas por Supabase + este archivo + los workflows de n8n (exportables como JSON y versionables en el repo).

---

## Web admin (futuro)

- **Mismo backend** que la móvil: mismo proyecto Supabase, mismo login Google, mismas reglas RLS.
- Reparto de responsabilidades:
  - **Móvil** = día a día del vendedor (pendientes, contactar, registrar).
  - **Web** = administración pesada: alta/edición masiva de clientes, importar CSV, asignar clientes a vendedores, configurar integraciones, reportes y tableros, gestión del equipo.
- **Compartir tipos**: extraer `src/lib/types.ts` a un paquete compartido (monorepo) para que móvil y web usen las mismas definiciones.
- Stack sugerido: Next.js + `@supabase/ssr` + los mismos tipos.

---

## Despliegue (single-tenant por cliente)

Cada cliente = una instalación aislada:

- **Proyecto Supabase propio** (cloud o self-hosted) con las migraciones aplicadas.
- **App móvil** apuntando a ese proyecto (`.env` con URL + publishable key — valores públicos).
- **n8n propio** con los workflows de los CRMs de ese cliente y sus credenciales.
- **Google OAuth**: provider configurado en ese proyecto; callback del proyecto agregado en Google Cloud.

Config actual del cliente de ejemplo: proyecto cloud `CRM.LITE` (São Paulo). Self-hosted como fallback.

---

## Costos estimados (por instalación)

- Supabase: **US$0** (free tier) hasta ~50k auth / 500MB DB; luego US$25/mes.
- n8n: **US$0** si se autohospeda en el VPS existente (Dokploy); o plan cloud desde ~US$20/mes.
- Expo EAS: free tier para builds; opcional US$19/mes.
- Google Play: US$25 pago único. Apple Developer: US$99/año.
- CRM (GHL/otro): API incluida en la suscripción del cliente.

Total recurrente inicial: **~US$99/año** (solo Apple) si se autohospeda n8n.

---

## Roadmap sugerido

1. **Pulir la móvil** y confirmar GHL andando end-to-end.
2. **Migrar la sync a n8n**: renombrar `ghl_*` → `crm_*`, crear el Database Webhook, montar el workflow n8n con el contacto normalizado, escribir de vuelta el id externo.
3. **Web admin** (Next.js) compartiendo backend y tipos.
4. **WhatsApp API** (activar el switch) cuando haya número aprobado.
5. **Producción**: `SITE_URL` definitivo, rotar secreto Google, builds EAS y publicación en tiendas.
