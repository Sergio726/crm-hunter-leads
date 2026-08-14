# 🚀 Desplegar el panel web en Vercel

> Guía para publicar `web/` (Next.js 16) en Vercel. La app móvil y n8n **no**
> se tocan: siguen donde están.
>
> Hoy la web corre en Dokploy (`crmlite.moremigracion.com`) con Docker. Las dos
> formas pueden convivir: el proyecto detecta dónde está corriendo y ajusta el
> build solo (`next.config.ts`). No hay que elegir de antemano.

---

## 1. Crear el proyecto en Vercel

1. Entrá a <https://vercel.com/new> e importá el repositorio
   `Sergio726/crm-hunter-leads`.
2. **Root Directory: `web`** ← el paso que más se olvida. El repositorio tiene
   `web/` y `mobile/` uno al lado del otro; si no se indica, Vercel busca un
   Next.js en la raíz y el build falla con "No Next.js version detected".
3. Framework Preset: **Next.js** (se detecta solo una vez apuntado a `web`).
4. Build Command, Output Directory e Install Command: **dejarlos en automático**.
5. **No despliegues todavía** — primero cargá las variables del punto 2, porque
   las `NEXT_PUBLIC_*` se incrustan durante el build y un deploy sin ellas queda
   roto hasta que se vuelva a construir.

## 2. Variables de entorno

En **Project Settings → Environment Variables**. Marcá los tres entornos
(Production, Preview, Development) salvo que quieras valores distintos.

### Obligatorias

| Variable | Valor | Cuándo se usa |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://koyihquworbcxuydyslm.supabase.co` | Build |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la publishable key del proyecto | Build |

Son públicas por diseño (van al navegador), pero **si faltan, la app no arranca**.

Ojo con esto: si las olvidás, **el build igual sale verde** — las páginas que
las usan son dinámicas y no se pre-renderizan, así que el problema recién
aparece al abrir el sitio. Un deploy exitoso no prueba que estén cargadas.
Desde esta versión el error dice exactamente qué variable falta y dónde
cargarla, en vez del "Invalid URL" sin contexto que salía antes.

### Necesarias según qué uses

| Variable | Para qué | Si falta |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Leer las API keys guardadas en Configuración → Prospección | Prospección no encuentra sus keys |
| `N8N_BASE_URL` | Pantalla "Contactos GHL" | Esa pantalla falla |
| `N8N_WEBHOOK_SECRET` | Igual que arriba. **Es el único secreto real de esta lista** | Igual que arriba |
| `NEXT_PUBLIC_SITE_URL` | Atribución de uso en el panel de OpenRouter | Cosmético |

Alternativa a `SUPABASE_SERVICE_ROLE_KEY`: cargar directo
`GOOGLE_PLACES_API_KEY`, `OPENROUTER_API_KEY` y `APIFY_API_TOKEN` como
variables. Ver `web/.env.example`, que explica el criterio (y D17 en
`DECISIONS.md`).

> ⚠️ Cada vez que cambies una `NEXT_PUBLIC_*` hay que **volver a desplegar**.
> Las de servidor toman efecto sin rebuild.

## 3. Apuntar Supabase al dominio nuevo

**Este paso no es opcional**: sin él el login no funciona y los enlaces de
invitación caen en `localhost`.

En el dashboard de Supabase (proyecto `hunter-leads`) →
**Authentication → URL Configuration**:

- **Site URL**: la URL de producción de Vercel (o el dominio propio, si le
  ponés uno).
- **Redirect URLs**, agregá las tres:
  - `https://<tu-proyecto>.vercel.app/auth/callback`
  - `https://<tu-proyecto>.vercel.app/auth/confirm`
  - `https://<tu-proyecto>-*.vercel.app/**` ← para que los deploys de preview
    también puedan loguear. Omitila si preferís que solo funcione producción.

Y en **Google Cloud Console** → Credentials → el OAuth Client del proyecto:

- **Authorized JavaScript origins**: `https://<tu-proyecto>.vercel.app`
- **Authorized redirect URIs**: sigue siendo la de Supabase
  (`https://koyihquworbcxuydyslm.supabase.co/auth/v1/callback`) — esa no cambia
  al mudar de hosting.

Si mantenés Dokploy en paralelo, **no borres** las URLs viejas: agregá las
nuevas.

## 4. ⚠️ Límite de tiempo de las funciones (mirá esto antes de pagar)

Vercel corta las funciones por tiempo, y el tope depende del plan:

| Ruta | Declara | Hobby (gratis, tope 60 s) | Pro (tope 300 s) |
|---|---|---|---|
| `/api/prospect/search` | 60 s | ✅ justo en el límite | ✅ |
| `/api/prospect/enrich` | 300 s | ❌ **excede el plan** | ✅ |

`enrich` es el enriquecimiento con Instagram vía Apify, que puede tardar
minutos con lotes grandes. **En plan Hobby ese valor no es válido**: hay que
bajar `maxDuration` a `60` en `web/src/app/api/prospect/enrich/route.ts` y
enriquecer de a lotes chicos, o pasar a Pro.

No se dejó configurable por variable porque Next exige que `maxDuration` sea un
número literal, no una expresión.

El resto de la app son páginas y consultas cortas: no se acercan al límite.

## 5. Qué NO cambia

- **n8n** sigue en `n8n.moremigracion.com`. Los webhooks de Supabase le pegan
  directo, sin pasar por la web.
- **La app móvil** habla con Supabase directo; no le afecta dónde esté la web.
- **El dominio `moremigracion.com`** puede seguir usándose: es infraestructura,
  no marca (ver `IDENTIDAD-VISUAL.md`).
- **Docker/Dokploy** sigue funcionando: `next.config.ts` mantiene el build
  `standalone` cuando no está en Vercel.

## 6. Verificar que quedó bien

Después del primer deploy, en orden:

1. Abrí la URL: tiene que aparecer el **login con la identidad ST Labs** (fondo
   negro, logo, `/ ACCESO` en verde). Si ves un error de configuración, falta
   una variable del punto 2.
2. Entrá con Google. Si rebota, revisá el punto 3.
3. Ya adentro: **Inicio** (las tarjetas cargan números), **Clientes** (lista y
   tablero) y **Configuración** (que es admin-only).
4. **Prospección**: mandale un mensaje a Turbo. Si responde en modo guiado,
   falta la key de OpenRouter; que responda ya prueba que el servidor lee los
   secretos.
5. Revisá los **logs de Runtime** en Vercel: no debería haber errores de
   variables faltantes.

## 7. Dominio propio (opcional)

En **Settings → Domains** agregás el dominio y Vercel da los registros DNS. Si
lo hacés, **repetí el punto 3** con el dominio final: el Site URL de Supabase
tiene que ser el que usa la gente, no el `.vercel.app`.
