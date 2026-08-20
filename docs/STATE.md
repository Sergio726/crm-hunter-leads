# 🧭 STATE — Empezá acá

> **Primer archivo que lee cualquier agente.** Estado actual, próximo paso y lo
> urgente. Al terminar una sesión, **actualizá este archivo** — y mantenelo
> corto: la narración de lo que ya pasó va a [`HISTORIAL.md`](HISTORIAL.md).

_Última actualización: **2026-08-19** — PRs #45 a #53._

---

## 📌 En una línea

Las notificaciones dejaron de depender de un CRM: se detectan en la base, se
encolan, y una tarea diaria de Vercel las manda por Resend. Falta que el usuario
cree la cuenta de Resend y cargue tres variables; hasta entonces los avisos se
ven en el panel pero **no sale ningún mail**.

## ✅ Estado actual (qué funciona hoy)

- **Panel web desplegado y en uso**: <https://crm-hunter-leads.vercel.app>
  (Vercel, Root Directory `web`). Login Google funcionando.
- **Prospección con Turbo**: entrevista, elige entre Google Maps · LinkedIn ·
  Instagram, muestra el Plan de Caza con el costo antes de gastar, y deja el
  pedido y la respuesta del proveedor en `prospect_request_log`.
  **Exportar a Excel baja un `.xlsx` de verdad**, no un CSV disfrazado.
- **Notificaciones propias** (PR #49/#50): tres eventos —`lead.assigned`,
  `followup.overdue` y `client.stale`— se anotan en la cola `notifications` y
  las entrega `/api/cron/notificaciones`. **No miran `crm_sync_enabled`.**
- **Configuración** con llaves on/off y apagado en cascada: con la sync de GHL
  apagada, sus subsecciones se deshabilitan y *Contactos GHL* desaparece del
  menú.
- Base propia: `hunter-leads` / `koyihquworbcxuydyslm` (ca-central-1).
  **Migraciones `0001`→`0044` aplicadas**; la `0045` espera a que se
  desactiven los flujos de aviso de n8n.
- **n8n** (`https://n8n.stlabs.ar`): 8 flujos GHL activos + alertas Discord +
  plantillas HubSpot/Pipedrive. **Write-back probado e2e**: alta/edición → push →
  upsert en GHL → `crm_contact_id`/`crm_synced_at` de vuelta, un solo push por
  cambio. Los webhooks validan `x-crm-lite-webhook-secret` y devuelven 403 sin el
  header; el secreto viaja **por header** y los RPC lo leen de `request.headers`
  (D9 — las expresiones `$credentials` no funcionan en n8n). Versionados en
  `n8n/workflows/crm-lite/` + `n8n/deploy-workflows.ps1`.
  ⚠️ *Notify User* y *Notify Overdue* **siguen activos y ya no deberían estar**.
- App móvil RN + Expo SDK 54. **Sin probar en un teléfono desde el rebranding.**
- Guía de instalación para un cliente nuevo:
  [`PUESTA-EN-MARCHA.md`](PUESTA-EN-MARCHA.md).

---

## 👉 Arrancá por acá

### 🔴 Lo que solo puede hacer el usuario (bloquea lo demás)

1. **Resend.** Crear la cuenta y cargar en Vercel `RESEND_API_KEY`,
   `CRON_SECRET` y `REMINDER_FROM`. **Sin esto no sale ningún mail**, aunque la
   cola se llene bien. Para un cliente real hace falta además verificar un
   dominio propio, o el recordatorio cae en spam.
2. **Apify.** La cuenta sigue en el tope de **10 corridas del plan gratis**, así
   que LinkedIn devuelve cero sin importar los filtros. Es plan pago o nada.
3. **n8n.** Desactivar *Notify User* y *Notify Overdue*: quedaron sin uso y
   pueden mandar avisos duplicados por GHL. **Después** de eso, correr la
   migración `0045`, que borra las dos RPC que esos flujos leían. En ese orden:
   al revés, los flujos empiezan a fallar con "function does not exist" en vez
   de terminar en silencio.

### 🧪 Lo que falta verificar y necesita una sesión real

Ninguna de estas se puede hacer desde un agente:

1. **Un segundo vendedor**: que vea **solo** sus clientes. Es la prueba de
   aislamiento y es la que más se saltea.
2. **El teléfono**: Plan de Caza, Calificación, ficha de detalle y chat nunca se
   vieron en pantalla angosta.
3. **El badge**: asignar un cliente y ver el número al lado de Clientes.
4. **El comentario rápido** del seguimiento, que ahora aparece al instante
   (PR #47).
5. **El circuito completo**: buscar → guardar → enriquecer → asignar → que el
   email llegue a la ficha del cliente.

### 🔍 Pregunta abierta

`encolar_clientes_inactivos()` devolvió **0**. Falta correr la consulta de
antigüedad (`con_mas_de_10_dias`) para saber si es que ningún cliente es lo
bastante viejo o si hay un bug. Sin eso, el evento `client.stale` está sin
probar.

---

## 🧪 Qué se intentó y NO funcionó (leer antes de repetirlo)

Esto es lo que evita que la próxima sesión gaste plata y tiempo en callejones ya
recorridos.

**Un `SUCCEEDED` de Apify con 0 ítems NO significa "no encontré a nadie".** Un
actor que llegó al tope de corridas del plan gratis arranca, no busca y termina
bien. La única señal está en el `statusMessage` del run.
⚠️ **Corrección de una regla que estaba escrita acá y era falsa**: se había
anotado que "un costo de US$ 0 es la señal más confiable". **No lo es** — la
corrida bloqueada real costó **US$ 0,004** con `itemCount` en null. La detección
va **solo** por palabras del mensaje (`providerDidNotRun`, `apify-runs.ts`), y
esa versión también tuvo que corregirse: la primera disparaba con cualquier
mensaje, e Instagram devuelve `"Scraper finished"` **cuando sale bien**.

**Los filtros del actor de LinkedIn se combinan con AND entre sí.** Dentro de un
filtro los valores son OR; entre filtros distintos, AND. `currentJobTitles` y
`locations` son de **coincidencia exacta**. **Cada filtro que se agrega
multiplica, no suma.**

**La documentación de los actores de Apify no es confiable.** El modo `Short`
devuelve otros nombres de campo que el `Full` que documenta la doc. **Antes de
mapear un actor nuevo, correrlo una vez y mirar un ítem real.**

**Buscar en LinkedIn por país es inconsistente.** México y Colombia devuelven
resultados; Argentina, Chile y Perú devolvieron **cero** en la misma tanda, y las
capitales también — pero `Buenos Aires` había funcionado un rato antes con otro
cargo. Se aisló con una prueba mínima: no es el código. **No seguir probando
combinaciones a ciegas**, cuesta US$ 0,10 cada una.
Y la zona no puede llevar aclaraciones: `Colombia (todo el país)` → 0;
`Colombia` → 3, medido con dos corridas idénticas. Resuelto en `cleanLocation`,
pero es la causa a sospechar primero ante un cero.

**Postgres aplica los DEFAULT de columna ANTES de los triggers `BEFORE`.** Es la
causa de un bug que costó una vuelta entera: el trigger veía el valor por
defecto, no el que no se había mandado.

**El bloque `do $$ … $$` falla al pegarlo** en el editor SQL de Supabase: una
línea larga se corta y Postgres devuelve `unterminated quoted string`. Acá las
migraciones se aplican a mano → **líneas cortas y sin dollar-quoting** (D42).

**`/api/cron` tiene que ser ruta pública en `middleware.ts`.** Sin la excepción,
el proxy manda la tarea a `/login`: un 307 parece una respuesta exitosa y la
tarea no ejecuta nada, sin error visible.

**No se puede leer cualquier tabla con la clave de servicio.** Las migraciones
otorgan permisos solo a `authenticated`; hace falta un `grant` explícito por
tabla.

**El MCP de Supabase de estas sesiones no tiene permisos** sobre `hunter-leads`.
Las migraciones **las aplica el usuario** pegándolas en el editor SQL.

**No se puede emular un teléfono cambiando el tamaño de la ventana**:
`resize_window` reporta éxito y el viewport sigue igual. Lo que sí funciona es
un **iframe** con el ancho deseado.

**Medir contraste leyendo el CSS no sirve**: el navegador devuelve `lab()` /
`oklab()`, no `rgb()`. Hay que leer el píxel por canvas. Y ojo con el CSS viejo
en caché, que hace parecer que un arreglo no funcionó.

**Turbo no es determinista, y eso se mide.** Con el mismo guion, una corrida dio
4/4 y la siguiente 2/4. Un banco de pruebas que corta la charla en un turno fijo
mide la suerte. `tests/turbo-conversaciones.ts` corre a mano (gasta plata).

**`max_tokens` no sirve para forzar brevedad**: `openrouter/auto` rutea a
modelos que razonan, y ese razonamiento se descuenta del mismo presupuesto. El
largo se controla con la instrucción.

**`web/.env.local` NO se comparte entre worktrees.** Las claves están en el
checkout principal.

**El orden de los merges rompió cosas siete veces** (#23, #26, #27, #31, #33,
#35, #41): se mergeó antes de que llegara el último push y hubo que recuperar
con `git cherry-pick`. **El agente avisa "listo para mergear"; hasta entonces no
se toca.**

**Descartado a propósito**: la herramienta `probar_variante`, que dejaba a Turbo
gastar solo para testear hipótesis. Con el contexto de la última corrida
inyectado ya diagnostica y **propone** la corrección por el camino normal, el que
pasa por la aprobación. Mismo resultado sin relajar la regla de que no gasta solo.

---

## 🔴 Urgente / no olvidar

- **Sin Resend configurado no sale ningún mail.** La cola se llena igual, así
  que el problema no se ve hasta que alguien pregunta por qué no le avisaron.
- **Si `sync-ghl` llegó a desplegarse alguna vez en Supabase, hay que borrarla
  también desde el panel.** Se sacó del repo (SEC-6), pero eso no la baja del
  proyecto: si está viva sigue siendo un endpoint sin autenticar. Según el
  historial nunca se desplegó, pero conviene mirar la lista de Edge Functions.
- **Las RPC de n8n leen los clientes detrás de un secreto compartido** (SEC-5).
  Quedan cuatro: se borraron las dos de avisos, que ya no se usaban. La decisión
  sobre las otras —rotar el secreto o acotarlas— sigue abierta.

## 🧱 Bloqueos actuales

- **Apify en el tope del plan gratis** → LinkedIn devuelve cero. Único bloqueo
  que impide probar una función completa.
- Carpetas n8n vía API bloqueadas por licencia; el repo ya está organizado en
  `crm-lite/`.

## 🔗 Datos clave (referencia rápida)

| Qué | Valor |
|---|---|
| Panel | <https://crm-hunter-leads.vercel.app> |
| Supabase Cloud | `koyihquworbcxuydyslm` (proyecto `hunter-leads`, ca-central-1) |
| n8n | `https://n8n.stlabs.ar` — IDs en `n8n-ids.local` |
| Webhook secret cred | `rZvKjdRnF39vlXHi` (id de credencial en n8n, no el secreto) |
| Integration secret cred | `kXuV2N3VSnbLhe57` (id de credencial en n8n, no el secreto) |

## 🗺 Dónde está cada cosa

| Para qué | Archivo |
|---|---|
| Tareas pendientes | [`BACKLOG.md`](BACKLOG.md) |
| Por qué se decidió algo | [`DECISIONS.md`](DECISIONS.md) |
| Cómo está armado | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Instalar para un cliente | [`PUESTA-EN-MARCHA.md`](PUESTA-EN-MARCHA.md) |
| Redesplegar el panel | [`DEPLOY-VERCEL.md`](DEPLOY-VERCEL.md) |
| Lo que ya pasó | [`HISTORIAL.md`](HISTORIAL.md) |
