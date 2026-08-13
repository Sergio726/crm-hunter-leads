# CRM Lite Mobile

App móvil (Android + iOS) para seguimiento de clientes por vendedores, con rol superadmin, login con Google e integración con GoHighLevel. Ver [ARCHITECTURE.md](ARCHITECTURE.md) para el diseño completo.

## Estructura

- `mobile/` — app React Native + Expo (TypeScript)
- `web/` — panel de administración (Next.js 16 + Tailwind)
- `supabase/migrations/` — esquema de la base y migraciones
- `n8n/workflows/` — flujos de integración con GHL (exportados)
- `docs/` — tablero del proyecto (empezá por `docs/STATE.md`)

## Prospección: generar leads propios

Además de recibir leads (alta manual, CSV, import de GHL), el panel puede **generarlos**:
un asistente de IA te ayuda a definir el avatar de cliente ideal y recomienda los filtros,
el sistema busca negocios reales en Google Places, ves los resultados en pantalla y elegís
cuáles guardar. Los leads generados **no** se sincronizan con GHL.

Necesita `GOOGLE_PLACES_API_KEY` en el entorno de la web (`ANTHROPIC_API_KEY` es opcional:
sin ella el chat corre en modo guiado). Guía completa: [`docs/PROSPECCION.md`](docs/PROSPECCION.md).

> **Nota:** el proyecto migró a **Supabase Cloud** y la sincronización con GHL ahora pasa por **n8n**
> (ver `docs/INTEGRACION-GHL.md`). Las secciones de más abajo describen el viejo setup self-hosted + Edge Functions
> y pueden estar desactualizadas.

## Logo / branding

Web y app usan un **wordmark de texto** ("CRM Lite") por defecto. Para poner tu logo:

- **Web**: colocá `web/public/brand/logo.png` (PNG, fondo transparente, ~horizontal). La web lo toma solo;
  si no existe, usa el wordmark. Se ve en el login y la barra lateral.
- **App**: colocá `mobile/assets/logo.png`, y en `mobile/src/components/Logo.tsx` descomentá las 2 líneas
  indicadas (`require` + `<Image>`) y poné `USE_IMAGE_LOGO = true` en `mobile/src/brand.ts`.
  (RN necesita el archivo presente para compilar, por eso el paso es manual.) Si no, muestra el wordmark. Se ve en el login.

> El **ícono** de la app (pantalla de inicio del celular) se define en `mobile/app.json` y requiere rebuild (EAS).

## Tema claro / oscuro

Web y app soportan **modo claro y oscuro** con toggle (web: arriba a la derecha; app: Perfil → *Modo oscuro*),
con la preferencia del sistema por defecto y recordando la elección.

## Infraestructura (Supabase self-hosted)

Corre en un VPS de Hostinger, gestionado con **Dokploy**:

- URL pública: `https://supabase.stlabs.ar` (Kong gateway, detrás de Cloudflare)
- Stack Docker: `/etc/dokploy/compose/st-labs-supabasecomplete-kjdhsw/code/docker`
- Carpeta de Edge Functions: `.../code/docker/volumes/functions/<nombre>/index.ts`
- Esquema: aplicado con `docker exec -i supabase-db psql -U postgres -d postgres`
- La app apunta al servidor vía `mobile/.env` (`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_KEY` = anon key)

> Al ser self-hosted, los backups, las actualizaciones y la seguridad del servidor
> son responsabilidad propia (no vienen incluidos como en Supabase Cloud).

## Configuración pendiente (una sola vez)

### 1. Login con Google (requerido para usar la app)

En self-hosted, Google OAuth se configura por variables de entorno en el servidor:

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials) crear un **OAuth Client ID** tipo **Web application**.
   - Authorized redirect URI: `https://supabase.stlabs.ar/auth/v1/callback`
2. En el `.env` del stack, completar:
   ```
   GOOGLE_ENABLED=true
   GOOGLE_CLIENT_ID=<client id>
   GOOGLE_SECRET=<client secret>
   ```
   y descomentar las líneas `GOTRUE_EXTERNAL_GOOGLE_*` en `docker-compose.yml`
   (incluida `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.stlabs.ar/auth/v1/callback`).
3. Redeploy: `docker compose up -d` en la carpeta del stack.

Las Redirect URLs de la app (`crmlite://auth-callback`, `exp://*`) ya están en
`ADDITIONAL_REDIRECT_URLS` del `.env`.

El primer login de `sergio.sebass03@gmail.com` crea automáticamente el perfil con rol **superadmin** (configurable en `app_settings.superadmin_emails`). Todos los demás entran como vendedores.

### 2. GoHighLevel

En GHL: Settings → Private Integrations → crear token con scope de contactos (`contacts.write`). Luego agregar estos secrets al **contenedor de Edge Functions** (en el `.env` del stack o el servicio `functions` del `docker-compose.yml`) y hacer redeploy:

- `GHL_API_TOKEN` — el Private Integration Token
- `GHL_LOCATION_ID` — el ID de la subcuenta/location

Sin estos secrets la app funciona igual; la sincronización queda en pausa y se reanuda sola al configurarlos (la función `sync-ghl` responde `skipped` hasta entonces).

### 3. WhatsApp API (futuro, opcional)

Cuando exista la cuenta de WhatsApp Business API (Meta Cloud API):

1. Cargar secrets `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` en el contenedor de Edge Functions y hacer redeploy.
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
