# CRM Lite Mobile — Arquitectura

App móvil (Android + iOS) para que vendedores hagan seguimiento de clientes y contactos, con rol superadmin, login con Google e integración con CRMs externos (GoHighLevel y otros).

> **Modelo de despliegue: single-tenant por instalación.** Cada cliente tiene su propia copia del sistema (su propio proyecto Supabase, su propia app, su propio n8n). No hay capa de "organizaciones" ni datos compartidos entre clientes. Esto mantiene todo simple y aislado. Si en el futuro se quisiera un único sistema multi-cliente, habría que introducir el concepto de `organization` y scopear todo por él (decisión mayor, hoy descartada).

> **Multi-CRM por diseño.** La app y la base **no conocen ningún CRM en particular**. Toda integración con CRMs externos pasa por **n8n**, que traduce un "contacto normalizado" al CRM que corresponda. Agregar un CRM nuevo = un flujo nuevo en n8n, sin tocar la app ni la base.

---

## Estado actual (implementado)

- ✅ **Panel web** (Next.js 16) desplegado en Vercel, con login Google. Es hoy la
  interfaz principal: clientes, prospección, reportes, equipo y configuración.
- ✅ **Prospección con Turbo**, el agente de IA: entrevista al vendedor sobre su
  oferta, elige la fuente (Google Maps · LinkedIn · Instagram), muestra el Plan
  de Caza con el costo antes de gastar, y deja registrado en `prospect_request_log`
  qué se le pidió a cada proveedor y qué contestó.
- ✅ **Notificaciones propias**, sin depender de ningún CRM (ver sección abajo).
- ✅ App móvil RN + Expo (SDK 54). Sin probar en dispositivo desde el rebranding.
- ✅ **Equipo por invitación** (roles `pending` / `seller` / `viewer` / `superadmin`)
  y matriz de permisos por sección editable desde Configuración.
- ✅ Backend propio en **Supabase Cloud**: proyecto `hunter-leads`
  (`koyihquworbcxuydyslm`, ca-central-1). Migraciones `0001`→`0044` versionadas
  en `supabase/migrations/`.

### Pendiente / próximos hitos

- 🔜 **Web admin** compartiendo el mismo backend.
- 🔜 WhatsApp Business API (el switch ya está preparado).
- ✅ **`sync-ghl` borrada** (SEC-6, 2026-08-20). Estaba rota desde la `0005` y no
  verificaba quién la llamaba. Ese trabajo lo hace n8n desde hace meses.

---

## Notificaciones — el sistema avisa por sus propios medios

**Principio: un CRM es un destino de sincronización, no la cañería por la que el
sistema avisa cosas suyas.**

Antes no era así, y se rompía de la peor manera. Los dos avisos —"te asignaron un
cliente" y "se te venció un seguimiento"— salían por n8n hacia GoHighLevel,
**incluido el respaldo por email**. Consecuencias que se vieron en producción:

- Un cliente que no usa GHL no tenía avisos.
- El disparador de la base hacía `net.http_post`: Postgres atado a que n8n esté
  vivo.
- Si faltaba la URL de n8n, el disparador **retornaba sin dejar registro**: no
  avisaba y no quedaba rastro de que debía avisar.
- El interruptor de sincronización con el CRM apagaba también los avisos, **en
  silencio**: la tarea corría, recibía una lista vacía y terminaba sin error.

Hoy hay cuatro responsabilidades separadas:

```
detectar   → disparador en la base (solo ANOTA, no sale a la red)
             es el único punto que ve los cinco caminos por los que
             se asigna un cliente
registrar  → `notifications` funciona como COLA (`sent_at` nulo = pendiente)
entregar   → la app: tarea diaria de Vercel → Resend
mostrar    → badge en el panel, que no depende de que el mail salga
```

Tres eventos: `lead.assigned`, `followup.overdue` y `client.stale` (nadie tocó
al cliente en N días). El último existe porque el de vencidos dependía de que
alguien se acordara de agendar una fecha — medido sobre datos reales, de 163
clientes **ninguno** la tenía.

**Nada de esto mira `crm_sync_enabled`.** Apagar la sincronización con un CRM
externo no puede dejar al equipo sin sus avisos. Ver D46.

---

## Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| App móvil | **React Native + Expo** (TypeScript) | Un solo código para Android e iOS; `Linking` nativo para WhatsApp/SMS/email; OTA sin pasar por tiendas |
| Panel web | **Next.js 16 / React 19** (TypeScript) | Es hoy la interfaz principal: clientes, prospección, reportes, equipo y configuración. Desplegado en Vercel |
| Prospección | **Google Places · Apify · OpenRouter** | Buscar prospectos en Maps, LinkedIn e Instagram; el modelo entrevista al vendedor y arma la consulta |
| Recordatorios | **Vercel Cron + Resend** | Una tarea diaria vacía la cola de `notifications` y manda los mails. Sin CRM de por medio |
| Backend + DB | **Supabase** (PostgreSQL) | Auth Google, base relacional (ideal para reportes día/semana), RLS, **API REST autogenerada** |
| API | **PostgREST (REST autogenerada por Supabase)** | No se construye API propia: la base ya expone REST documentada. GraphQL (`pg_graphql`) disponible si hiciera falta |
| Lógica de servidor | **Route handlers de Next.js** + **Database Webhooks** + **Edge Functions** | La lógica nueva vive en el panel (corre en el servidor, con `server-only`). Las Edge Functions quedan para `invite-user`; los webhooks, para avisarle a n8n |
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
          role text check in ('pending','seller','viewer','superadmin'), created_at)

-- Clientes / contactos
clients (id uuid pk, full_name, phone, phone_2, email, email_2, secondary_email,
         company, assigned_to uuid → profiles,
         status check in ('pending','contacted','won','lost'),
         next_follow_up date,
         origin check in ('app','ghl'),                    -- de dónde salió
         tags text[],                                      -- acá viaja el RUBRO
                                                           -- (inmobiliarias, gimnasios…):
                                                           -- no hay columna propia
         notification_prefs jsonb,
         crm_contact_id text, crm_synced_at timestamptz,   -- genérico, agnóstico al CRM
         notes, created_at, updated_at)

-- Registro inmutable de cada contacto
interactions (id uuid pk, client_id → clients, user_id → profiles,
              channel check in ('whatsapp','sms','email','call'),
              send_mode check in ('deeplink','api'),
              outcome check in ('answered','no_answer','interested',
                'not_interested','follow_up_scheduled','wrong_number','other'),
              notes, contacted_at)

-- Una búsqueda de prospección, con el avatar que redactó el agente
prospect_searches (id uuid pk, created_by → profiles,
                   icp_summary text,          -- el avatar en una línea
                   filters jsonb,             -- los filtros efectivos
                   results_count, saved_count, created_at)

-- Prospectos: lo encontrado, antes de convertirlo en cliente
prospects (id uuid pk,
           source check in ('google','linkedin','instagram'),
           source_ref text,                   -- el id del proveedor
           kind   check in ('person','business'),   -- derivado de source (0037)
           business_name, role_title, company_name,
           address, area, country, niche,
           phone, whatsapp_phone, email, website, instagram, linkedin, maps_url,
           google_place_id, rating, reviews_count, photos_count,
           ig_followers, ig_posts_count,
           has_own_website boolean,           -- la señal que vale para vender webs
           score int check (0..100),
           contact_enriched_at, contact_status,
           status check in ('new','promoted','discarded'),
           search_id → prospect_searches, promoted_client_id → clients,
           created_by → profiles, notes, created_at, updated_at)
--   unique (source, source_ref) → el mismo perfil no entra dos veces

-- Auditoría de cada búsqueda: qué se le pidió al proveedor y qué contestó
-- Existe porque una búsqueda que devuelve cero no dice por qué (ver D40)
prospect_request_log (id uuid pk, created_by → profiles, source, job,
                      filters jsonb, provider_input jsonb,   -- lo EXACTO que se mandó
                      outcome check in ('ok','empty','provider_skipped','error'),
                      returned_count, matched_count, discarded jsonb, relaxed,
                      provider_run_id, provider_status,
                      provider_message,      -- acá vive "free user run limit reached"
                      cost_usd, error, duration_ms, created_at)

-- Cola de notificaciones: sent_at nulo = pendiente de entregar
notifications (id uuid pk, user_id → profiles,
               event check in ('lead.assigned','followup.overdue','client.stale'),
               ref_id uuid,                 -- el cliente al que se refiere
               channel text,                -- informativo
               sent_on date default current_date,   -- fecha explícita: sent_at::date
                                            -- no es IMMUTABLE y no sirve en un índice
               sent_at timestamptz,         -- NULO = pendiente de entregar
               read_at timestamptz, delivery_error text)
--   unique (user_id, ref_id, sent_on) where event = 'followup.overdue'
--   → el anti-duplicado diario, resuelto por el índice y no por código

-- Configuración global (clave/valor)
app_settings (key pk, value jsonb, updated_at)
--   whatsapp_mode: 'deeplink' | 'api'
--   superadmin_emails: ["..."]      (quién entra como superadmin)
--   allowed_emails:   ["..."]       (lista blanca de vendedores invitados)
--   daily_goal:       10            (meta diaria para el banner)
--   timezone:         "America/Argentina/Buenos_Aires"
--   crm_sync_enabled: false         (apaga TODA la integración con el CRM)
--   role_permissions: {...}         (qué sección ve cada rol)
--   prospect_*:                     (claves de los proveedores, cifradas)
```

> **Nota de nomenclatura:** los campos del CRM se llamaban `ghl_*` y la `0005`
> los renombró a `crm_*`, porque el CRM concreto lo decide n8n por instalación.
> La Edge Function `sync-ghl` nunca se actualizó, quedó rota, y se borró.

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

**Principio:** la app y la base son agnósticas al CRM. n8n es el único que conoce
las particularidades de cada CRM.

**Alcance: solo sincronizar datos de clientes.** Esta cañería no lleva
notificaciones — eso es del sistema y sale por sus propios medios (sección
arriba). Toda la integración es **opcional**: el interruptor `crm_sync_enabled`
de Configuración la apaga entera, y sin ella el producto funciona completo.

```
App móvil ─┐
Panel web ─┼─→  Supabase (base + auth + RLS + REST)
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

> Esto **reemplazó** a la Edge Function `sync-ghl` directa, que quedó rota y sin
> uso hasta que se borró. El webhook a n8n es el camino: multi-CRM y mantenible
> sin escribir código.

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

## Panel web y app móvil

El reparto original era: móvil para el día a día del vendedor, web para la
administración pesada. **En los hechos se invirtió.** El panel web (Next.js 16 +
`@supabase/ssr`) hace hoy las dos cosas —incluida la prospección con Turbo, que
nunca estuvo en la móvil— y anda bien en el teléfono. La móvil no se prueba
desde el rebranding.

Comparten backend: mismo proyecto Supabase, mismo login Google, las mismas
reglas RLS. Lo que **no** comparten son los tipos: cada uno tiene su
`src/lib/types.ts`. Unificarlos en un paquete solo vale la pena si la móvil
vuelve a estar en juego.

---

## Despliegue (single-tenant por cliente)

Cada cliente = una instalación aislada:

- **Proyecto Supabase propio** (cloud o self-hosted) con las migraciones aplicadas.
- **App móvil** apuntando a ese proyecto (`.env` con URL + publishable key — valores públicos).
- **n8n propio** con los workflows de los CRMs de ese cliente y sus credenciales.
- **Google OAuth**: provider configurado en ese proyecto; callback del proyecto agregado en Google Cloud.

- **Cuentas de servicios propias** por instalación: Google Places, OpenRouter,
  Apify y Resend. Cuáles hacen falta, cuáles son opcionales y qué cuesta cada
  una está en [`docs/PUESTA-EN-MARCHA.md`](docs/PUESTA-EN-MARCHA.md).

Instalación actual: proyecto cloud `hunter-leads` (ca-central-1), panel en Vercel.

---

## Costos (por instalación)

La tabla de qué servicio cuesta plata, cuál alcanza con el plan gratis y qué se
pierde si el cliente no lo contrata está en
[`docs/PUESTA-EN-MARCHA.md`](docs/PUESTA-EN-MARCHA.md), que es la fuente única.
El resumen: con los planes gratis una instalación chica no cuesta nada, salvo
**Apify** si el cliente quiere LinkedIn — ese es el único gasto obligado.

---

## Roadmap sugerido

1. **Cerrar SEC-5**: las RPC de n8n leen todos los clientes detrás de un secreto
   compartido. No es un agujero, pero es el punto donde ese secreto filtrado
   expone la base entera. Es una decisión de producto: rotarlo periódicamente, o
   acotar las funciones a lo que n8n realmente necesita.
2. **Verificar una instalación limpia** siguiendo
   [`docs/PUESTA-EN-MARCHA.md`](docs/PUESTA-EN-MARCHA.md) de punta a punta. Es lo
   que habilita a vender.
3. **Dominio propio en Resend**, sin el cual el recordatorio cae en spam.
4. **Retomar la móvil** o decidir discontinuarla: no se prueba desde el
   rebranding y el panel web ya funciona en el teléfono.
5. **WhatsApp API** (activar el switch) cuando haya número aprobado.
