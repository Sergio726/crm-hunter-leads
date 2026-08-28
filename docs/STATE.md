# 🧭 STATE — Empezá acá

> **Primer archivo que lee cualquier agente.** Estado actual, próximo paso y lo
> urgente. Al terminar una sesión, **actualizá este archivo** — y mantenelo
> corto: la narración de lo que ya pasó va a [`HISTORIAL.md`](HISTORIAL.md).

_Última actualización: **2026-08-26** — PRs #45 a #65._

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
- **El mensaje usa la oferta del rubro del lead** (MSG-2): las ofertas se cargan
  en Configuración con los rubros para los que sirven, y el sistema elige sola.
  Antes había una sola frase global y el rubro de la última búsqueda aparecía en
  cualquier lead. **Necesita la `0049`.**
- **Turbo escribe el mensaje para contactar a un cliente** (MSG-1) — ✅ **probado
  en vivo el 2026-08-27**: el mensaje sale. Es lo primero de toda esta cadena
  que se confirma con datos reales. En la ficha,
  elige canal y redacta. Distingue solo entre el **rompehielo** y el mensaje de
  **seguimiento**, que usa el historial para no repetir lo ya dicho. Lo copiado
  queda anotado como comentario. **Necesita la `0048`.**
- **Los prospectos ya pueden tener email** (PROSP-6): el botón *Buscar email y
  WhatsApp* lee el sitio web del negocio —lo único que da Google Maps— y saca
  el email y el WhatsApp que publica. Al promover, el email viaja a la ficha
  del cliente. **Sin probar con una corrida real.**
- **Todo lo que gasta pasa por el freno** de presupuesto: búsqueda,
  enriquecimiento de Instagram y lectura de sitios (D54).
- **Notificaciones propias** (PR #49/#50): tres eventos —`lead.assigned`,
  `followup.overdue` y `client.stale`— se anotan en la cola `notifications` y
  las entrega `/api/cron/notificaciones`. **No miran `crm_sync_enabled`.**
- **Configuración** con llaves on/off y apagado en cascada: con la sync de GHL
  apagada, sus subsecciones se deshabilitan y *Contactos GHL* desaparece del
  menú.
- Base propia: `hunter-leads` / `koyihquworbcxuydyslm` (ca-central-1).
  **Migraciones `0001`→`0050` aplicadas**; ⏳ quedan la `0051` (link de agenda) y la `0052` (el último post) (la `0050`, el 2026-08-27, con su
  comprobación en verde). No quedan migraciones sin aplicar.
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
2. ~~Apify~~ — **pagado el 2026-08-27**. Lo que queda es de un minuto: hacer una
   búsqueda de LinkedIn y confirmar que ahora devuelve resultados.
3. **Google Cloud.** Ponerle al proyecto un **presupuesto con alerta**. El
   freno que se agregó (PROSP-4) corta según *nuestra* estimación; el presupuesto
   de Google es la red de seguridad de verdad, la que corta aunque la estimación
   se quede corta.
4. **n8n — pendiente y ahora con apuro.** Desactivar *CRM Lite · Notify User*
   y *CRM Lite · Notify Overdue* en <https://n8n.stlabs.ar> (la llave *Active*).
   La `0045` **ya se corrió**, así que las dos RPC que esos flujos leían no
   existen más: cada vez que se ejecuten van a fallar con "function does not
   exist". No rompe nada —esos avisos hoy los manda la app— pero llenan el panel
   de errores. Se explicó paso a paso el 2026-08-26.
5. **Cargar las ofertas** en Configuración → *Prospección — Qué vendés*, con los
   rubros de cada una. Sin ninguna cargada, el mensaje sigue pidiendo escribir a
   mano qué vendés y vuelve el riesgo del rubro equivocado (MSG-2).

### 🧪 Lo que falta verificar y necesita una sesión real

Ninguna de estas se puede hacer desde un agente:

1. **Un segundo vendedor**: que vea **solo** sus clientes. Es la prueba de
   aislamiento y es la que más se saltea.
2. **El teléfono**: Plan de Caza, Calificación, ficha de detalle y chat nunca se
   vieron en pantalla angosta. El **dashboard** (UX-8) y **Clientes** (UX-10) sí
   se rehicieron y se midieron con el CSS compilado dentro de un iframe, pero
   **medir no es lo mismo que verlo**: falta abrirlos en un teléfono con datos
   reales. En Clientes hay algo puntual para mirar: el cambio de tamaño táctil
   toca el componente `Button`, o sea **todas las pantallas del panel en móvil**,
   y solo se revisó Clientes.
3. **El badge**: asignar un cliente y ver el número al lado de Clientes.
4. **El comentario rápido** del seguimiento, que ahora aparece al instante
   (PR #47).
5. **El circuito completo**: buscar → guardar → enriquecer → asignar → que el
   email llegue a la ficha del cliente. De este circuito ya está confirmado el
   tramo final —**el mensaje se genera desde la ficha** (2026-08-27)—; falta el
   resto: copiar y que quede en el historial, el mensaje de seguimiento sobre un
   cliente ya contactado, y que el rubro sea el correcto (para eso hay que
   cargar las ofertas en Configuración).

### 🔍 Pregunta abierta

`encolar_clientes_inactivos()` devolvió **0**. Falta correr la consulta de
antigüedad (`con_mas_de_10_dias`) para saber si es que ningún cliente es lo
bastante viejo o si hay un bug. Sin eso, el evento `client.stale` está sin
probar.

---

## 🧹 El tablero se limpió el 2026-08-27

Tenía **contradicciones que lo volvían poco confiable**: decía que faltaba
crear el proyecto en Vercel —cuando el panel está en uso ahí— y que "nada está
en git todavía", con 70 PRs mergeados. Un tablero que se contradice deja de
servir como fuente de verdad.

Qué se hizo, para que no sorprenda:

- **7 estados corregidos** (Apify pagado, Vercel desplegado, git, WEB-17 hecho).
- **23 ideas de julio que nunca se empezaron** salieron de la lista de tareas a
  una sección propia, *Ideas sin comprometer*. No se borró ninguna: una tarea
  que lleva meses sin moverse no es una tarea, es una idea, y mezclarlas hacía
  parecer que había 65 cosas en curso cuando eran la mitad.
- **`TRV-3` (backups verificados) se rescató de esas ideas**: cumplía el filtro
  —nunca se empezó— pero no es una idea, es un riesgo. Hay datos de clientes
  reales y nadie probó restaurar un backup.
- **`SEC-3` bajó de Urgente a Normal**: su propia nota decía "baja urgencia".
  Estar arriba le quitaba peso a lo que sí es urgente.
- **La migración a servidor propio (WEB-2, TRV-0) sigue en pie**, decidido por
  el usuario, pero pasa a "planeado, sin fecha": decía "en curso" y no se movía
  desde julio.

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

**Una migración se puede probar antes de pedirle al usuario que la corra.**
Hay Docker en la máquina: se levanta un `postgres:16` efímero, se crea un
andamiaje mínimo con los roles, esquemas y tablas que la migración toca, y se
corre el script con `ON_ERROR_STOP=1`. Sirvió para descubrir que un
`comment on ... is` con `||` no compila —`COMMENT` exige un literal, no una
expresión— después de que ese error le fallara al usuario al pegar el script.
Ojo con Git Bash: convierte las rutas del contenedor, hay que anteponer
`MSYS_NO_PATHCONV=1` a `docker exec`.

**El MCP de Supabase de estas sesiones no tiene permisos** sobre `hunter-leads`.
Las migraciones **las aplica el usuario** pegándolas en el editor SQL.

**Que el código esté escrito no significa que se ejecute alguna vez.** La ruta
`/api/prospect/enrich-contacts` estaba entera —con su librería, sus tests y su
migración aplicada— y **ningún componente la llamaba**: la cañería construida y
sin grifo. Nunca se buscó un solo email. El tablero, mientras tanto, la daba por
"fases pendientes" y no por "hecha a medias". Antes de dar por listo algo que
tiene backend, **buscar quién lo llama** (`grep` de la ruta en `components/`).

**No se puede emular un teléfono cambiando el tamaño de la ventana**:
`resize_window` reporta éxito y el viewport sigue igual. Lo que sí funciona es
un **iframe** con el ancho deseado.

**Medir contraste leyendo el CSS no sirve**: el navegador devuelve `lab()` /
`oklab()`, no `rgb()`. Hay que leer el píxel por canvas. Y ojo con el CSS viejo
en caché, que hace parecer que un arreglo no funcionó.

**Un dato que "está en la base" no está en el prompt hasta que alguien lo
escribe ahí.** El bug del rubro equivocado (MSG-2) tuvo cinco causas, y la más
silenciosa fue esta: `client_message_context` devolvía los `tags` del cliente
—donde vive el rubro— y la función que arma el texto para el modelo **no los
usaba**. Aparecían en el tipo de TypeScript y en ninguna línea más. Al revisar
por qué una IA "inventa" algo, mirar primero **qué se le mandó de verdad**, no
qué había disponible.

**Cuando no alcanzan los colores, cambiá de eje.** En UX-9 hacían falta cuatro
escalones y el sistema no tiene cuatro colores en gradiente sin repetir familia
—de ahí los dos verdes—. Buscar un cuarto color era el camino equivocado: la
solución fue que la escala **se apague** (color, texto pleno, texto apagado,
nada) en vez de cambiar de tono. Y antes de elegir se compararon cinco variantes
en un banco de pruebas midiendo la distancia entre escalones contiguos, que es
lo que dice si dos se van a confundir al escanear.

**El editor SQL de Supabase corre SIN sesión de usuario.** `auth.uid()` es
null ahí, así que una comprobación que **ejecute** una función `security
definer` con guard de sesión va a fallar con "not authenticated" — le pasó al
usuario con la primera versión de la `0050`. Lo que sí se puede comprobar sin
sesión es el **cuerpo** de la función (`pg_get_functiondef` + `like`), que
igual es mucho más que mirar si existe. Para ejecutarla de verdad, el lugar es
un Postgres aparte con `auth.uid()` simulado.

**El esquema de un actor de Apify se puede verificar sin gastar.** La lección
vieja decía "correlo una vez y mirá un ítem real": es cierta para la SALIDA,
pero **correrlo cuesta plata cada vez** y con el plan al límite devuelve cero.
Para la ENTRADA hay algo gratis y autoritativo: el `inputSchema` del último
build (`GET /v2/acts/{actor}/builds`), en `tests/verificar-actor-apify.ts`.

**Una regla de otro sistema no se copia sin mirar para qué idioma se escribió.**
El código del desafío borra `¿` y `¡` de los mensajes — correcto en inglés,
donde no existen. Copiarlo habría metido una falta de ortografía en cada
pregunta que escribe Turbo.

**Una función de Postgres puede crearse con una columna que no existe.**
plpgsql valida la sintaxis al crearla, pero los nombres de columna recién al
ejecutarla: por eso la `0048` dio "ok" y el botón fallaba con `record "pro" has
no field "ig_category"`. **Una comprobación que solo mira que la función exista
no prueba nada**. La de la `0050` lee el cuerpo de la función y verifica que
tenga el arreglo, que es lo más fuerte que se puede comprobar sin sesión.

**Y un andamiaje de prueba escrito a mano confirma tus suposiciones.** La
primera validación con Docker no encontró el bug porque las tablas las escribí
yo con las columnas que creía. Ahora el andamiaje se **genera leyendo las
migraciones del repo** (`tmp/generar-andamio.py` del job): si una columna no
existe, no existe tampoco en la prueba.

**Un dato puede estar guardado y aun así ser inservible.** Los clientes viejos
tenían la ficha de Maps, el sitio y el Instagram… adentro de un campo de texto
libre. La app los "tenía" y no servían para nada: no se podían tocar, no se
leían, y al modelo le llegaban como un párrafo. Antes de dar por perdido un dato
—o por hecha una función que lo usa— **mirar en qué forma está guardado**, no si
está.

**Medir no alcanza: hay que mirar la captura.** En UX-10 las cifras daban todo
en verde —sin desborde, sin texto cortado, ningún control chico— y el buscador
había quedado reducido a un cuadrado de 44px, inutilizable. Ninguna métrica lo
detectaba porque no era ni un desborde ni un recorte. **Sacar siempre la captura
además de los números.**

**Y el CSS compilado no contiene las clases que ya nadie usa.** Para medir un
"antes / después" de UI hay que compilar el CSS **antes** de tocar el código, o
reponer a mano las reglas quitadas: si no, el "antes" se mide sin ellas y da de
menos. Pasó midiendo UX-6 — el primer resultado decía que el chip verde ocupaba
0 px².

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

- ~~Apify en el tope del plan gratis~~ → **resuelto el 2026-08-27**: el usuario
  pagó el plan. Queda confirmarlo con una búsqueda real de LinkedIn, que hasta
  ahora devolvía cero por este motivo y no por los filtros.
- Carpetas n8n vía API bloqueadas por licencia; el repo ya está organizado en
  `crm-lite/`.

## 🎯 Hacia dónde va

**Que Turbo deje de escribir y empiece a operar.** El plan completo está en
[`PROSPECCION-AUTOMATICA.md`](PROSPECCION-AUTOMATICA.md), nacido de la propuesta
de Nexum que trajo el usuario el 2026-08-27.

- **Fase 1 ✅** — el mensaje apunta a agendar una llamada (MSG-6, D62).
- **Fase 2 — enviar sin copiar y pegar** (MSG-5, MSG-8). ⚠️ **Investigado a
  fondo el 2026-08-27** ([`PLAN-ENVIO-LINKEDIN.md`](PLAN-ENVIO-LINKEDIN.md)):
  LinkedIn **no expone el envío a terceros en ningún nivel ni a ningún precio**,
  así que toda ruta automática va contra sus términos y **~40% de las cuentas
  que usaron herramientas no conformes recibió restricciones en Q1 2026**.
  La recomendación es empezar por una **extensión asistida** —prepara el mensaje,
  el vendedor aprieta enviar— que quita casi toda la fricción sin el riesgo, y
  decidir sobre el envío automático después, con datos de uso propios.
- **Fase 3 — el setter**: leer respuestas y sostener la conversación.
- **Fase 4 — agenda, estados y recordatorio.**

⚠️ **Riesgo a tener presente**: hoy, si Turbo escribe una pavada, el vendedor la
ve antes de mandarla. Con envío automático **no hay quien mire**. La fase 2 tiene
que salir con tope diario y con la opción de aprobar los primeros mensajes antes
de liberar el resto.

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
| El mensaje de primer contacto (diseño) | [`PRIMER-MENSAJE.md`](PRIMER-MENSAJE.md) |
| Hacia dónde va la prospección | [`PROSPECCION-AUTOMATICA.md`](PROSPECCION-AUTOMATICA.md) |
| Cómo escribirle al lead sin copiar y pegar | [`PLAN-ENVIO-LINKEDIN.md`](PLAN-ENVIO-LINKEDIN.md) |
| Redesplegar el panel | [`DEPLOY-VERCEL.md`](DEPLOY-VERCEL.md) |
| Lo que ya pasó | [`HISTORIAL.md`](HISTORIAL.md) |
