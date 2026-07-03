# CRM Lite Mobile — Arquitectura propuesta

App móvil (Android + iOS) para que vendedores hagan seguimiento de clientes y contactos, con rol superadmin, login con Google e integración con GoHighLevel.

## Stack recomendado

| Capa | Tecnología | Por qué |
|---|---|---|
| App móvil | **React Native + Expo** (TypeScript) | Un solo código para Android e iOS; `Linking` nativo para abrir WhatsApp/SMS/email; actualizaciones OTA sin pasar por las tiendas |
| Backend + DB | **Supabase** (PostgreSQL) | Auth con Google incluida, base relacional (ideal para reportes por día/semana), Row Level Security para separar vendedores de superadmin, capa gratuita generosa |
| Lógica de servidor | **Supabase Edge Functions** (Deno/TS) | Integración con GoHighLevel y futuro envío por WhatsApp API, sin mantener un servidor propio |
| Automatizaciones | Edge Functions + `pg_cron` / webhooks de DB | Sincronización a GHL al crear/editar contactos; recordatorios de seguimiento |

## Alternativas evaluadas

- **Flutter**: excelente, pero Dart es un ecosistema aparte; RN+Expo tiene más mano de obra disponible y Expo simplifica builds/publicación.
- **Nativo (Kotlin + Swift)**: dos código bases; costo doble injustificado para un CRM simple.
- **PWA**: sin costo de tiendas, pero peor experiencia en iOS (instalación, deep links a WhatsApp menos confiables) y sin presencia en stores.
- **Firebase (Firestore)**: auth con Google igual de fácil, pero Firestore es NoSQL: las métricas "contactados por día/semana por vendedor" se vuelven incómodas y caras. Postgres las resuelve con una vista SQL.
- **Backend propio (Node + Postgres en Railway/Fly)**: máxima flexibilidad, pero hay que mantener auth, hosting y seguridad a mano. Innecesario a esta escala.

## Modelo de datos

```sql
-- Usuarios (se crea fila al primer login con Google)
create table profiles (
  id uuid primary key references auth.users,
  email text not null,
  full_name text,
  role text not null default 'seller' check (role in ('seller', 'superadmin')),
  created_at timestamptz default now()
);

-- Clientes
create table clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,               -- E.164, ej: +5491122334455
  email text,
  assigned_to uuid references profiles(id),
  status text not null default 'pending'
    check (status in ('pending', 'contacted', 'won', 'lost')),
  next_follow_up date,      -- fecha objetivo del próximo contacto
  ghl_contact_id text,      -- id del contacto en GoHighLevel (null = no sincronizado)
  ghl_synced_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Registro de cada contacto realizado
create table interactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  user_id uuid not null references profiles(id),
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'call')),
  outcome text not null check (outcome in
    ('answered', 'no_answer', 'interested', 'not_interested',
     'follow_up_scheduled', 'wrong_number', 'other')),
  notes text,
  contacted_at timestamptz not null default now()
);

-- Configuración global (switch de WhatsApp API, etc.)
create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
insert into app_settings (key, value)
  values ('whatsapp_mode', '"deeplink"');  -- 'deeplink' | 'api'
```

### Vistas para las pantallas y estadísticas

```sql
-- Pendientes por contactar (por vendedor, vía RLS)
create view v_pending_clients as
  select * from clients
  where status = 'pending'
     or (next_follow_up is not null and next_follow_up <= current_date);

-- Contactados por día / semana por vendedor (dashboard superadmin)
create view v_contacts_daily as
  select user_id, date_trunc('day', contacted_at) as day,
         channel, count(*) as total
  from interactions group by 1, 2, 3;

create view v_contacts_weekly as
  select user_id, date_trunc('week', contacted_at) as week,
         count(*) as total,
         count(distinct client_id) as unique_clients
  from interactions group by 1, 2;
```

### Row Level Security

- `seller`: ve y edita solo clientes con `assigned_to = auth.uid()`; inserta interacciones solo propias.
- `superadmin`: lectura total (clientes, interacciones, vistas de estadísticas) y gestión de asignaciones.

## Switch de WhatsApp (deep link hoy, API mañana)

Interfaz única en la app; la implementación se elige leyendo `app_settings.whatsapp_mode`:

```ts
interface MessagingProvider {
  sendWhatsApp(client: Client, message: string): Promise<SendResult>;
}

// Hoy: abre la app de WhatsApp del teléfono
class DeepLinkProvider implements MessagingProvider {
  async sendWhatsApp(client, message) {
    await Linking.openURL(
      `whatsapp://send?phone=${client.phone}&text=${encodeURIComponent(message)}`
    );
    return { mode: 'deeplink', needsManualOutcome: true };
  }
}

// Mañana: llama a la Edge Function `send-whatsapp` (WhatsApp Cloud API)
class ApiProvider implements MessagingProvider {
  async sendWhatsApp(client, message) {
    const { data } = await supabase.functions.invoke('send-whatsapp', {
      body: { clientId: client.id, message },
    });
    return { mode: 'api', needsManualOutcome: false, messageId: data.id };
  }
}
```

En ambos casos la app registra la fila en `interactions`; con deep link el vendedor confirma el resultado al volver a la app, con API el resultado puede completarse vía webhook de estado. Cambiar de modo = actualizar una fila en `app_settings`, sin tocar la app.

SMS y email usan siempre deep links del sistema (`sms:` / `mailto:`), con el mismo registro de interacción.

## Integración GoHighLevel

- Edge Function `sync-ghl`: recibe el webhook de DB al insertar/actualizar en `clients`, hace upsert en GHL (API v2, `POST /contacts/upsert`) y guarda `ghl_contact_id`.
- Reintentos: si GHL falla, `ghl_synced_at` queda null; un job `pg_cron` cada 15 min reintenta los pendientes.
- El token de GHL (Private Integration Token) vive como secret de la Edge Function, nunca en la app.

## Flujo del vendedor

1. Login con Google → Supabase Auth crea/vincula el perfil.
2. Home: lista "Pendientes" (vista `v_pending_clients`) y pestañas "Hoy" / "Esta semana" de contactados.
3. Ficha de cliente → botones WhatsApp / SMS / Email → se abre la app correspondiente.
4. Al volver, modal "¿Cómo resultó?" → guarda `interaction` con canal + resultado → el cliente pasa a `contacted` y se sincroniza a GHL.

## Costos estimados

- Supabase: **US$0** (free tier) hasta ~50k usuarios auth / 500MB DB; luego US$25/mes.
- Expo EAS: free tier para builds; opcional US$19/mes si se necesitan más.
- Google Play: US$25 una sola vez. Apple Developer: US$99/año.
- GoHighLevel: API incluida en la suscripción existente.

Total recurrente inicial: **~US$99/año** (solo Apple).
