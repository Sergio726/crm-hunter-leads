# CRM Lite Mobile

App móvil (Android + iOS) para seguimiento de clientes por vendedores, con rol superadmin, login con Google e integración con GoHighLevel. Ver [ARCHITECTURE.md](ARCHITECTURE.md) para el diseño completo.

## Estructura

- `mobile/` — app React Native + Expo (TypeScript)
- `supabase/migrations/` — esquema de la base (ya aplicado al proyecto `crm-lite`)
- `supabase/functions/` — Edge Functions (ya desplegadas): `sync-ghl`, `send-whatsapp`

Proyecto Supabase: `crm-lite` (`zfkekquqvmktnezyslix`, región `sa-east-1`).

## Configuración pendiente (una sola vez)

### 1. Login con Google (requerido para usar la app)

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials) crear un proyecto y un **OAuth Client ID** de tipo **Web application**.
   - Authorized redirect URI: `https://zfkekquqvmktnezyslix.supabase.co/auth/v1/callback`
2. En el [dashboard de Supabase → Authentication → Providers → Google](https://supabase.com/dashboard/project/zfkekquqvmktnezyslix/auth/providers): habilitar Google y pegar el Client ID y Client Secret.
3. En Authentication → URL Configuration → **Redirect URLs**, agregar:
   - `crmlite://auth-callback` (app instalada)
   - `exp://*` (desarrollo con Expo Go)

El primer login de `sergio.sebass03@gmail.com` crea automáticamente el perfil con rol **superadmin** (configurable en `app_settings.superadmin_emails`). Todos los demás entran como vendedores.

### 2. GoHighLevel

En GHL: Settings → Private Integrations → crear token con scope de contactos (`contacts.write`). Luego cargar los secrets de las Edge Functions ([dashboard → Edge Functions → Secrets](https://supabase.com/dashboard/project/zfkekquqvmktnezyslix/functions/secrets)):

- `GHL_API_TOKEN` — el Private Integration Token
- `GHL_LOCATION_ID` — el ID de la subcuenta/location

Sin estos secrets la app funciona igual; la sincronización queda en pausa y se reanuda sola al configurarlos.

### 3. WhatsApp API (futuro, opcional)

Cuando exista la cuenta de WhatsApp Business API (Meta Cloud API):

1. Cargar secrets: `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.
2. Encender el switch "WhatsApp por API" en la pestaña Perfil de la app (solo superadmin), o ejecutar:
   ```sql
   update app_settings set value = '"api"' where key = 'whatsapp_mode';
   ```

No hay que tocar ni republicar la app: el modo se lee del servidor.

## Desarrollo

```bash
cd mobile
npm install
npx expo start        # escanear el QR con Expo Go (Android/iOS)
```

## Publicación (cuando esté listo)

- Android: `npx eas build -p android` (Google Play: US$25 una vez)
- iOS: `npx eas build -p ios` (Apple Developer: US$99/año)
