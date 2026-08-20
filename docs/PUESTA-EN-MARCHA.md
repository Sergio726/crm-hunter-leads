# 🏁 Puesta en marcha — instalar Hunter Leads para un cliente

> Para levantar una instalación nueva desde cero. Cada cliente tiene **su propia
> copia**: su proyecto de Supabase, su despliegue y sus cuentas de servicios
> (ver D2, single-tenant por instalación).
>
> Si lo que querés es solo redesplegar el panel de una instalación que ya existe,
> el documento es [`DEPLOY-VERCEL.md`](DEPLOY-VERCEL.md).

---

## Lo primero: qué cuesta y qué es opcional

Esta tabla es la conversación que hay que tener con el cliente **antes** de
instalar nada. Media hora acá evita una sorpresa a la semana.

| Servicio | Para qué | Plan gratis | Si no lo tiene |
|---|---|---|---|
| **Supabase** | Base de datos, login y archivos | Alcanza para empezar | No hay producto |
| **Vercel** | El panel web y la tarea diaria | Alcanza. Las tareas programadas corren **una vez por día** | No hay producto |
| **Google Places** | Buscar negocios en Maps | **1.000 consultas por mes**; después US$ 40 cada 1.000 | Sin búsqueda en Maps |
| **OpenRouter** | Turbo, el asistente | Se paga por uso, centavos | Turbo pasa a modo guiado: los filtros se cargan a mano |
| **Apify** | LinkedIn e Instagram | ⚠️ **No alcanza** — ver abajo | Sin LinkedIn ni Instagram |
| **Resend** | Los recordatorios por mail | 3.000 mails por mes | No salen mails; los avisos igual se ven en el panel |
| **GoHighLevel** | Sincronizar con un CRM externo | — | **Totalmente opcional.** El sistema funciona solo |

### ⚠️ Apify: el plan gratis no alcanza, y conviene decirlo de entrada

El actor de LinkedIn (`harvestapi/linkedin-profile-search`) **limita a 10
corridas a los usuarios del plan gratis de Apify**. Cuando se alcanza el tope, el
actor arranca, **no busca nada**, termina como exitoso y cobra US$ 0 — o sea que
para la API el trabajo salió perfecto y no hay ningún error.

Diez corridas se queman en dos días de uso real. El sistema lo detecta y lo
explica con un cartel, pero **la única salida es un plan pago de Apify**.

Instagram y el enriquecimiento de contactos usan actores oficiales de Apify y
**no** tienen ese tope: funcionan con el plan gratis.

### ⚠️ Resend: sin dominio propio, los mails caen en spam

Se puede arrancar con el remitente de prueba de Resend para comprobar que todo
anda. Para un cliente real hay que **verificar su dominio** en Resend (unos
registros DNS). Sin eso, el recordatorio llega a la carpeta de correo no
deseado y es como si no llegara.

---

## 1. Supabase

1. Crear un proyecto nuevo. Anotar la URL y la *publishable key*.
2. **Aplicar las migraciones en orden**, de la `0001` a la última de
   `supabase/migrations/`.
3. Verificar con los *advisors* de seguridad: ninguna tabla de `public` sin RLS,
   ninguna función `security definer` sin `search_path`.

> **Cómo se aplican.** Pegándolas en el editor SQL del panel de Supabase. Por eso
> las migraciones de este proyecto se escriben con **líneas cortas y sin bloques
> `do $$`** (ver D42): una línea larga se corta al pegar y Postgres devuelve
> `unterminated quoted string`, que ya nos pasó. Por conexión directa hay que ir
> por el *pooler* en modo sesión — el host `db.<ref>.supabase.co` es IPv6-only y
> no resuelve.

4. **Login con Google**: crear un cliente OAuth en Google Cloud y cargarlo en
   Authentication → Providers. El callback es
   `https://<ref>.supabase.co/auth/v1/callback`.
5. **Desplegar la Edge Function `invite-user`** desde el panel. Sin ella, las
   invitaciones al equipo no llegan.

> ⚠️ Al crear una función "Via Editor", el nombre que aparece precargado **es el
> de la URL** y después no se puede renombrar. Tiene que decir `invite-user`
> antes de guardar.

## 2. El panel web

Seguir [`DEPLOY-VERCEL.md`](DEPLOY-VERCEL.md). Los dos pasos que más se olvidan:

- **Root Directory: `web`**. El repositorio tiene `web/` y `mobile/` al lado; sin
  esto el build falla.
- **Site URL y Redirect URLs en Supabase** apuntando al dominio nuevo. Sin eso el
  login no funciona y los enlaces de invitación caen en `localhost`.

Las variables están todas en `web/.env.example`, cada una con qué pasa si falta.

## 3. Las claves de los servicios

Dos caminos, y conviene elegir uno:

- **Desde el panel** (Configuración → Prospección): las claves quedan guardadas
  en la base, cifradas, y se cambian sin volver a desplegar. Requiere cargar
  `SUPABASE_SERVICE_ROLE_KEY` en Vercel.
- **Como variables de entorno**: `GOOGLE_PLACES_API_KEY`, `OPENROUTER_API_KEY`,
  `APIFY_API_TOKEN`. No hace falta la service key, pero cada cambio pide un
  despliegue nuevo.

`RESEND_API_KEY` y `CRON_SECRET` van **siempre** como variables de entorno.

## 4. El equipo

1. Entrar con la cuenta que va a ser superadmin.
2. **Equipo** → invitar a los vendedores. Si el mail no llega, está el botón
   *Copiar enlace*, que no depende del correo.
3. **Configuración → Permisos** si hace falta ajustar qué ve cada rol.

## 5. Comprobar que quedó bien

En este orden. Cada paso confirma una parte distinta:

1. **Entrar y ver el panel.** Confirma Supabase, el login y las variables.
2. **Buscar en Google Maps** desde Prospección. Confirma la clave de Places y a
   Turbo.
3. **Guardar dos prospectos y asignarlos** a un vendedor. Confirma la promoción
   a clientes y **tiene que aparecer un número al lado de Clientes** en el menú.
4. **Disparar la tarea de notificaciones a mano** (el `curl` de
   `DEPLOY-VERCEL.md`) y confirmar que llega el mail.
5. **Entrar con un vendedor** y confirmar que ve **solo** los suyos.

El paso 5 es el que más se saltea y el único que prueba el aislamiento entre
vendedores. Hacelo antes de entregar.

---

## Lo que NO hace falta

- **GoHighLevel.** El sistema avisa por sus propios medios. El interruptor de
  Configuración apaga toda la integración sin romper nada; los recordatorios y
  los avisos siguen andando igual (ver D45).
- **n8n.** Solo hace falta si el cliente quiere sincronizar con un CRM externo.
- **La app móvil.** El panel web funciona en el teléfono.

## Costo mensual, en criollo

Con el plan gratis de todo, una instalación chica **no cuesta nada** salvo:

- **Apify**, si el cliente quiere LinkedIn. Es el único gasto obligado.
- **Google Places**, si pasa de 1.000 búsquedas al mes.
- **OpenRouter**, centavos por conversación con Turbo.

Conviene decidir de entrada quién pone esas cuentas: si las pone el cliente, el
costo es suyo y la configuración es más trabajo; si las ponés vos, hay que
ponerle un tope de uso por instalación para que una no te vacíe la cuenta.
