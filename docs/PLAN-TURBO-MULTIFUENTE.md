# Plan — Turbo como cerebro multi-fuente

> **Estado**: ✅ **ejecutado el 2026-08-16** (rama `feat/turbo-multifuente`).
> Migraciones `0036`→`0038` aplicadas y verificadas en producción.
> Lo que cambió respecto de lo planificado está al final, en «Qué salió distinto».
> **Alcance**: convertir Hunter Leads de "un buscador de Google Maps con un chat adelante"
> en lo que dice el nombre: un cazador de leads que elige dónde cazar.
> **Documentos relacionados**: [`PROSPECCION.md`](PROSPECCION.md) ·
> [`PROSPECCION-CONTACTOS.md`](PROSPECCION-CONTACTOS.md) · [`DECISIONS.md`](DECISIONS.md)

---

## 1. El cambio, en una frase

Hoy Turbo llena un formulario de Google Maps. Mañana Turbo entiende qué vende el
usuario y a quién, **elige la fuente** donde están esos clientes (Maps, LinkedIn,
Instagram, TikTok), **muestra el plan antes de gastar un peso**, y recién con el
visto bueno sale a buscar.

Las cuatro piezas ya están contratadas y funcionando: OpenRouter (el cerebro),
Google Places (negocios locales), Apify (todo lo social) y Supabase (la base).
No hay que sumar proveedores. Hay que conectarlos bien.

---

## 2. Por qué no alcanza con hacer a Turbo más inteligente

Esto no es una opinión, está medido contra el código y contra la base de producción.

**Todo lo que está debajo de Turbo asume Google Maps.**

- Su instrucción actual dice, textualmente, que la búsqueda corre contra Google
  Places y que los filtros tienen que ser cosas que Places pueda responder.
- Los filtros *son* conceptos de Maps: zona, país, rating, "tiene web propia".
  Una búsqueda de personas en LinkedIn no tiene nada de eso — tiene cargo,
  antigüedad, industria y tamaño de empresa.
- `prospects.google_place_id` es **obligatorio y único**. Una persona de LinkedIn
  no tiene uno. Ya hubo que falsificarlo para importar el Excel de 119
  inmobiliarias (`xlsx:ticket1500:…`). Ese parche se vuelve estructural si no se
  arregla ahora.
- El puntaje se calcula con fotos, reseñas y rating de Google. Una persona de
  LinkedIn no tiene ninguna de las tres, así que hoy puntuaría 0.

**El puente entre las fuentes que ya tenemos es angosto.** De los 47 prospectos que
encontró Turbo, solo **17 tienen Instagram** y **0 tienen LinkedIn** — sobre 166
prospectos totales en la base. La causa: el handle se extrae *únicamente* del
campo "sitio web" de la ficha de Google, así que solo aparece cuando el negocio
puso su Instagram como si fuera su web. El filtro "requiere LinkedIn" que se
construyó a pedido **devuelve cero siempre**, y va a seguir devolviendo cero
hasta que se arregle esto.

**Conclusión**: si solo se mejora el prompt, Turbo va a proponer búsquedas
brillantes que el sistema no puede ejecutar.

---

## 3. Los números que ordenan las decisiones

Precios verificados en la documentación de cada proveedor (agosto 2026):

| Fuente | Precio real | Para qué sirve |
|---|---|---|
| **Google Places** (nuestro field mask) | US$ 40 / 1.000 consultas · ~20 negocios c/u · **1.000 consultas gratis por mes** | descubrir negocios locales |
| **LinkedIn** (`harvestapi`, sin cookies) | US$ 0,10 por página de 25 perfiles | descubrir personas B2B |
| **Instagram** (`apify/instagram-profile-scraper`) | US$ 1,60–2,60 / 1.000 perfiles | verificar y descubrir |
| **TikTok** (`apidojo/tiktok-profile-scraper`) | US$ 0,30 / 1.000 perfiles | verificar y descubrir |
| **Contactos web** (`vdrmota/contact-info-scraper`) | ~US$ 0,005 por sitio | email, WhatsApp y redes |
| **OpenRouter** (Turbo) | centavos por conversación | decidir |

**La lectura que importa**: todo es barato. Mil leads cuestan dos dólares. Lo caro
es el tiempo del vendedor llamando a mil leads mal apuntados. Por eso el objetivo
de optimización de este plan **no es el gasto de API sino la precisión** — y por
eso la puerta de aprobación antes de buscar vale más que cualquier microahorro.

Segunda lectura: **una corrida de Google (≈US$ 0,96) cuesta cuatro veces más que
enriquecer 92 perfiles de Instagram (≈US$ 0,24)**. Descubrir es lo caro; verificar
es lo barato. Hoy el sistema raciona lo barato y deja libre lo caro.

---

## 4. Decisiones de diseño

### D-A · Una tabla de prospectos, no cuatro

Un negocio de Maps, una persona de LinkedIn y una cuenta de TikTok son entidades
distintas, pero **lo que viene después es idéntico**: calificar, asignar a un
vendedor, convertir en cliente, contactar por WhatsApp. Separar en tablas
triplicaría el RLS, las pantallas y los permisos para no ganar nada.

Se usa una tabla con un discriminador `source` + `kind`, columnas propias para lo
que se consulta y ordena, y un espacio libre (`source_data`) para el resto.

### D-B · Sin subagente para elegir la fuente

Se le declaran a Turbo cuatro herramientas y el modelo elige cuál llamar en la
misma respuesta. Un agente aparte para esa decisión paga dos veces el mismo
razonamiento y duplica la demora, sin ganar precisión.

Donde **sí** entra un subagente es en leer al prospecto y redactar el
acercamiento (Fase 7): es trabajo pesado, separable y **a pedido**. Hacerlo
automático sobre 100 leads es lo único de todo el sistema que se pone caro.

### D-C · Todo se ejecuta asíncrono

Un raspado de LinkedIn puede tardar varios minutos. El plan Hobby de Vercel corta
cualquier petición a los **60 segundos**, y la llamada síncrona de Apify muere a
los 300 con un error 408 **que sigue facturando el trabajo igual**. Hoy
`/api/prospect/enrich` declara 300 segundos, o sea que ya está fuera de ese límite.

Se cambia a: arrancar el trabajo, guardar el identificador, devolver enseguida, y
que la pantalla vaya preguntando cómo viene. Nada tarda más de un segundo por
petición. De paso desaparece la trampa de la doble facturación.

Se descarta el mecanismo de avisos de Apify (webhooks) porque necesita una Edge
Function y **esas no se pueden desplegar desde esta cuenta**. Consultar el estado
no necesita permisos que no tengamos.

### D-D · El score deja de ser un número desnudo

Es un pedido explícito del usuario: *"el usuario no sabe qué es el ranking, el
score"*. Y se agrava con varias fuentes, porque cada una puntúa por motivos
distintos.

Cada fuente calcula su propio puntaje con sus propios factores, pero **todas
devuelven lo mismo**: un 0–100, una palabra (Muy bueno / Bueno / Regular / Flojo)
y la lista de razones en castellano. Las razones ya se calculan hoy — están
escondidas en un tooltip que en el teléfono no existe. Pasan a verse.

### D-E · Exportar en formato que Excel abra bien

CSV con marca de codificación UTF-8 y punto y coma como separador: Excel en
español lo abre en columnas y con los acentos correctos, sin instalar nada ni
sumar dependencias al proyecto. Un `.xlsx` de verdad queda como mejora posterior
si hace falta formato.

---

## 5. Las fases

Cada fase se puede verificar sola y deja el sistema funcionando. Las fases 1, 2 y
3 no cambian nada en pantalla: son la fundación, y saltearlas es lo que hace que
estos proyectos se traben en la fase 6.

---

### Fase 0 · Cerrar la deuda de Apify y ensanchar el puente

**Sin migración.** Es lo analizado el 2026-08-16 y lo que más leads recupera por
peso invertido.

1. **Guardar los campos que ya pagamos y tiramos.** El actor de Instagram
   devuelve, en el mismo resultado facturado, el **sitio web de la bio**, si la
   cuenta está **verificada**, el **rubro declarado** y **a cuántos sigue** (que
   delata seguidores comprados). Hoy se descartan los cuatro.
2. **Topes de gasto de verdad.** Reemplazar el límite arbitrario de 25 perfiles
   por los controles nativos de Apify (`maxItems` y `maxTotalChargeUsd`), que los
   aplica el servidor y no dependen de que nuestro código acierte.
3. **Errores honestos.** Distinguir el 408 (se pasó de tiempo, el trabajo sigue y
   se factura igual — no reintentar a ciegas) del 402 (se acabó el crédito).
4. **El puente**: cuando Google devuelve un sitio web real, pasarlo por
   `vdrmota/contact-info-scraper` — el actor **ya validado en la Fase 0 de
   PROSP-6**, con 80% de acierto en email sobre sitios reales del ICP y ~US$ 0,005
   por sitio. Trae email, WhatsApp **y los links de redes**, que es lo único que
   puede llenar el Instagram y el LinkedIn que Places no publica.

**Verificación**: corrida real contra 5 sitios del ICP; contar cuántos Instagram y
LinkedIn nuevos aparecen sobre los 22 prospectos que hoy tienen web cargada.

**Queda visible**: más prospectos con Instagram, y el LinkedIn dejando de ser una
columna vacía.

---

### Fase 1 · Fundación de datos — migración `0036`

La única migración estructural del plan. Se hace en etapas para que nada se rompa:
agregar, rellenar, cambiar las lecturas, y recién mucho después borrar lo viejo.

| Qué | Por qué |
|---|---|
| `source` + `source_ref`, únicos en conjunto | reemplaza al `google_place_id` obligatorio; un prospecto de LinkedIn no tiene ficha de Google |
| `kind`: negocio · persona · cuenta | la pantalla necesita saber si muestra "Razón social" o "Nombre y cargo" |
| `full_name`, `role_title`, `company_name` | los datos de una persona, que hoy no tienen dónde ir |
| `email` | `promote_prospects` nunca copió el email al cliente porque la columna no existe (PROSP-6) |
| `audience_size`, `audience_activity` | tamaño y actividad **sin importar la red**, para poder ordenar una lista mezclada. Se rellenan desde `ig_followers`/`ig_activity`, que quedan como el detalle de Instagram |
| `source_data` (jsonb) | todo lo específico de cada fuente sin inventar una columna por campo |
| tabla `prospect_runs` | las ejecuciones asíncronas de la Fase 3 |
| `prospect_searches` += `plan`, `approved_at` | guardar el plan que el usuario aprobó, para saber qué se prometió y qué se entregó |

`google_place_id` pasa a admitir vacío y **se conserva**; se elimina en una
migración posterior recién cuando esté confirmado que nada lo usa.

**Solo una función hay que reescribir**: `prospect_import_status` es la única que
menciona `google_place_id` (`promote_prospects` no lo toca). Está verificado
contra la base.

**Verificación**: los 166 prospectos existentes siguen visibles y con el mismo
dueño; el Excel importado pasa de la clave falsa `xlsx:…` a `source='import'`;
`get_advisors` sin alertas nuevas.

---

### Fase 2 · El concepto de "fuente" en el código

Puro reordenamiento, **sin un solo cambio de comportamiento**. Cada fuente pasa a
declarar cinco cosas: qué sabe filtrar, cómo se ejecuta, cómo traduce lo que
devuelve al formato común, cómo puntúa, y cuánto cuesta.

Google Places se convierte en la primera implementación de esa interfaz. Es la
fase más aburrida y la que decide si las siguientes son fáciles o imposibles.

**Verificación**: la misma búsqueda antes y después devuelve exactamente los
mismos resultados, con los mismos puntajes. Es comparable porque el scoring es una
función pura.

---

### Fase 3 · Ejecución asíncrona

Arrancar el trabajo → devolver el identificador → la pantalla pregunta cómo viene
→ al terminar se guardan los resultados. Ninguna petición pasa de 60 segundos.

Arregla tres cosas de una: el tope del plan Hobby, la trampa del 408 que factura
sin devolver nada, y la imposibilidad actual de correr algo que tarde minutos —
que es exactamente lo que va a hacer LinkedIn.

**Verificación**: una corrida de Instagram de 60 perfiles (hoy imposible: se corta
en 25) terminando completa, con la barra de progreso avanzando.

---

### Fase 4 · El Plan de Caza y una pantalla que se entienda

Acá vuelve a haber cosas para ver, y son las dos que pidió el usuario.

**El Plan de Caza.** Antes de gastar, Turbo muestra una tarjeta en castellano:

> **A quién**: dueños de inmobiliarias chicas, sin web propia
> **Dónde**: Google Maps · *porque es un negocio con dirección física y querés visitarlos*
> **Cuántos**: hasta 30
> **Cuánto cuesta**: ≈ US$ 0,96 · **Cuánto tarda**: ~40 segundos
> **[ Aprobar y buscar ]  [ Editar ]  [ Pedir otra opción ]**

Turbo **siempre llega con una recomendación armada y el motivo**, no con
preguntas. El usuario aprueba, edita o pide otra. El plan aprobado se guarda.

**La pantalla de resultados.** Hoy dice "Score 72" y nadie sabe qué es.

- La columna pasa a llamarse **Calificación**, con el número, la palabra
  (Muy bueno / Bueno / Regular / Flojo) y **las razones visibles** — que ya se
  calculan y hoy viven en un tooltip invisible en el teléfono.
- Un "¿qué es esto?" que explica, para esa fuente en particular, qué se midió. Y
  que aclara lo importante: **estima si vale la pena llamarlo, no si va a comprar.**
- Columna **Actividad** con el dato de Instagram, ordenable.
- **Exportar a Excel** sobre los resultados en pantalla y sobre los guardados
  (cierra PROSP-9), porque el usuario tiene que poder llevarse la lista sin
  cargarla como clientes.

---

### Fase 5 · Turbo elige la fuente

Se reescribe su instrucción: de "traductor de filtros de Places" a experto en
ventas y armado de oferta que primero entiende **qué vende el usuario y qué dolor
resuelve**, y de ahí deduce dónde está ese cliente.

Una herramienta por fuente, con el criterio de cuándo usar cada una:

| Si el cliente del usuario es… | Fuente |
|---|---|
| un negocio con local, o importa la cercanía | Google Maps |
| un profesional, cargo o empresa B2B | LinkedIn |
| una marca de consumo o un creador | Instagram |
| audiencia joven, contenido corto | TikTok |

**Dos ajustes de costo concretos**: fijar un modelo conocido en lugar de
`openrouter/auto`, que hoy puede rutear a uno malo justo en la conversación que
importa; y una vez elegida y aprobada la fuente, dejar de mandar en cada turno las
herramientas de las otras tres.

---

### Fase 6 · LinkedIn como segunda fuente real

La que abre el caso de las mentorías y demuestra que la arquitectura sirve.

Actor `harvestapi/linkedin-profile-search`, elegido **por no pedir cookies**: hay
opciones más baratas que requieren la sesión de LinkedIn del usuario y pueden
hacer que le restrinjan la cuenta personal. Filtra por cargo, antigüedad,
industria, tamaño de empresa y ubicación. Usa el **mismo token de Apify que ya
está cargado** — no hay credenciales nuevas.

Scoring propio para personas: antigüedad en el cargo, tamaño de la empresa,
coincidencia con el avatar. Nada de fotos ni reseñas.

---

### Fase 7 · Descubrimiento social y acercamiento asistido

Instagram y TikTok dejan de ser solo verificación y pasan a ser fuentes de
búsqueda. Y el subagente que lee las últimas publicaciones del prospecto para
redactar el primer mensaje — **a pedido, lead por lead**, nunca en lote.

---

## 6. Qué puedo hacer solo (y qué no)

El usuario pidió explícitamente que el plan no dependa de su intervención. Lo
verifiqué antes de escribirlo, no lo estoy suponiendo.

**Puedo, sin pedir nada:**

- **Aplicar migraciones** directo contra la base de producción por el pooler. Ya
  se hizo así con la `0033`, `0034` y `0035`.
- **Probar contra las APIs reales.** Las tres claves están disponibles localmente:
  Google Places, OpenRouter y Apify. No es solo compilar — puedo correr búsquedas
  y conversaciones de verdad y ver qué devuelven.
- Escribir el código, correr `tsc`, `eslint` y `next build`, verificar la base y
  dejar todo commiteado y pusheado.

**No puedo, y por eso el plan los evita:**

- **Desplegar Edge Functions** — esta cuenta da 403. *Ninguna fase necesita una.*
- **Tocar variables de entorno en Vercel** — *ninguna fase pide una credencial
  nueva*; LinkedIn reusa el token de Apify que ya está.
- **Mergear a `main`** — no lo hago nunca por regla. Para reducirlo al mínimo:
  **una sola rama y un solo PR al final**, un clic tuyo.

**Lo que sí cuesta plata tuya**: probar contra las APIs reales gasta de verdad.
Estimado de todas las pruebas del plan completo, con lotes chicos a propósito
(2 leads, 3 perfiles, 1 página de LinkedIn): **menos de US$ 2 en total**. Lo digo
por adelantado para que no aparezca como sorpresa en la factura.

---

## 7. Riesgos, dichos como son

**Legal y de plataforma.** Google Maps es una API oficial: riesgo cero. Instagram,
TikTok y LinkedIn son datos públicos pero raspados contra los términos de esas
plataformas. La mitigación concreta es el actor sin cookies, que evita exponer la
cuenta personal del usuario. Como LinkedIn son **personas** y no comercios,
conviene guardar solo lo que se usa y dejar hecho el camino para borrar a pedido:
está contemplado en la Fase 1.

**El dedupe entre fuentes.** La misma inmobiliaria puede aparecer por Maps y por
Instagram como dos prospectos distintos. La clave `source` + `source_ref` no lo
detecta, a propósito: cruzar identidades por nombre genera falsos positivos que
son peores que un duplicado. Queda anotado, no resuelto.

**La actividad se pudre.** Un prospecto marcado "activo" hace ocho meses hoy no
significa nada. A estos precios conviene volver a consultar antes de cada
campaña; no hay nada automático que lo haga.

**Lo que este plan NO hace**: no toca la app móvil, no toca la integración con
n8n/GoHighLevel, no cambia el flujo de clientes ni el de permisos.

---

## 8. Qué salió distinto al ejecutarlo (2026-08-16)

Se ejecutaron las 7 fases. Cuatro cosas no salieron como estaban escritas, y una
de ellas corrige algo que este mismo documento afirmaba mal.

### ⚠️ Las claves estaban en el otro archivo — y las pruebas reales encontraron 3 bugs

Primero se dio por hecho que no se podía probar contra los proveedores, porque
las tres claves estaban vacías en `web/.env.local`. **Estaban vacías en el del
worktree**, que es una copia aparte: el del checkout principal
(`C:\Project\Project\crm-hunter-leads\web\.env.local`) las tenía completas. Lo
notó el usuario.

Con eso **sí se corrieron las pruebas reales**, y encontraron tres defectos que
ningún test unitario podía ver — los tres publicados en el mismo commit:

| Bug | Causa | Cómo se veía |
|---|---|---|
| Turbo respondía cortado a mitad de palabra y sin proponer nada | `openrouter/auto` rutea a modelos que **razonan antes de responder**, y ese razonamiento se descuenta del mismo `max_tokens`. Con 1500 no quedaba lugar para la llamada a la herramienta | El vendedor veía media frase y ningún plan |
| El primer mensaje asistido devolvía vacío | Lo mismo con `max_tokens: 400`: el modelo gastaba todo pensando | «El modelo no devolvió ningún mensaje» |
| El rubro de una cuenta se guardaba como el texto `"None"` | El actor de Instagram devuelve el `None` de Python como string | @agogebox_ mostraba «None» como rubro |

Y mirar los datos reales destapó **dos defectos más**, que no eran fallas sino
supuestos equivocados:

- **El campo «sitio web» de los prospectos suele ser un `wa.me`.** Lógico: el
  filtro por defecto busca negocios *sin web propia*. Mandar eso al scraper de
  contactos es pagar por raspar un link de WhatsApp. Ahora se filtra antes.
- **Dos prospectos pueden compartir dominio** (`sites.google.com/view/gym-a` y
  `.../gym-b`, caso real en esta base). El mapeo por dominio le habría dado al
  segundo los contactos del primero. Ahora se resuelve por URL exacta y el
  dominio solo se usa si no es ambiguo.

**Resultado de las pruebas reales** (costo total: menos de US$ 1):

| Prueba | Resultado |
|---|---|
| Turbo, caso «páginas web para inmobiliarias» | Eligió **Google Maps** y explicó por qué |
| Turbo, caso «mentorías a gerentes comerciales» | Eligió **LinkedIn** y respetó el «quiero 5 contactos» |
| Búsqueda real en Places, límite 2 | 2 resultados, 3 consultas (US$ 0,12), límite respetado |
| Enriquecimiento de Instagram, 3 perfiles | Los 4 campos nuevos en 3/3. `dptos.com.ar`: 22.827 seguidores siguiendo a 120 — audiencia real |
| Contactos sobre un sitio del ICP | WhatsApp + Instagram + **el primer LinkedIn de toda la base** (`company/betrainer-oficial`) |
| Primer mensaje asistido | 36 palabras, usa los datos reales, una idea y una pregunta |

**Lo que sigue sin probarse**: LinkedIn e Instagram como fuentes de búsqueda
(corren en segundo plano y necesitan la app levantada para el ciclo completo de
arrancar y cosechar).

Lo que ya se verificaba antes de esto:

| Verificado de verdad | Cómo |
|---|---|
| Las migraciones | Aplicadas en producción y comprobadas **por comportamiento**, no por estructura: insertando y revirtiendo |
| La lógica pura | 54 tests con el runner de Node (`npm test`) |
| Que compile y construya | `tsc` limpio y `next build` verde en cada fase |
| Que no se ensucie el código | `eslint` sin un solo problema en los archivos nuevos |
| La base | RLS activo en las tres tablas y `search_path` fijo en las 31 funciones `security definer` |

⚠️ **Ojo con esto en la próxima sesión**: `web/.env.local` **no se comparte
entre worktrees** — es un archivo ignorado por git, así que cada worktree tiene
el suyo y el que se crea nuevo sale vacío. Si las claves parecen faltar, mirar
primero el del checkout principal antes de concluir que no están.

### 🔁 La Fase 1 se hizo antes que la Fase 0

Estaban al revés. Los campos nuevos de Apify y el email del puente necesitan
columnas donde guardarse, y esas las crea la migración de la fundación. Hacer la
0 primero habría significado escribirla dos veces.

### 🐛 Una migración salió con un error, y lo encontró la verificación

La `0036` le puso `DEFAULT` a `source` y `kind` **y además** escribió un trigger
que los completa. No funciona: Postgres aplica los `DEFAULT` *antes* de correr
los `BEFORE triggers`, así que el trigger nunca veía un `NULL` y su rama de
derivación era código muerto. El síntoma: insertar una persona de LinkedIn la
guardaba como `business`.

Lo detectó la verificación **porque probaba comportamiento en vez de
estructura** — insertar y revertir, en lugar de comprobar que las columnas
existieran. Corregido en la `0037`.

### ➖ TikTok quedó afuera, a propósito

Las otras tres fuentes están implementadas. TikTok es el mercado más chico para
venta B2B y sumarlo era una integración que nadie pidió. El catálogo lo describe
—así la decisión queda a la vista y no parece un olvido— pero no tiene ejecutor,
y la ruta lo dice con todas las letras en vez de fallar de forma rara.

### Dos cosas que el plan no preveía

- **No había ningún framework de tests en el proyecto.** Se agregó `npm test`
  con el runner nativo de Node y `tsx` como única dependencia de desarrollo. Sin
  eso, «verificado» habría querido decir nada más que «compila».
- **El CSV de Reportes tenía el mismo problema de Excel** que el export nuevo:
  con coma como separador, un Excel en español abre todo en una sola columna. Se
  arregló en el componente compartido, así que quedó corregido también ahí.

## 9. Lo que falta probar

Las pruebas 1, 2, 4, 5 y 6 de la lista original **ya se corrieron contra los
proveedores reales** (ver la tabla de la sección 8). Queda pendiente lo que
necesita la app levantada y una sesión de verdad:

1. **Las búsquedas en segundo plano** (LinkedIn e Instagram): el ciclo completo
   de arrancar el trabajo, ver el avance y cosechar el resultado.
2. **El circuito que cierra todo**: buscar → guardar → enriquecer → asignar →
   **que el email aparezca en la ficha del cliente**. Es la prueba que confirma
   que el agujero de PROSP-6 quedó tapado de punta a punta.
3. **El recorte por RLS** entre un vendedor y el superadmin en la pantalla de
   guardados.
4. **La pantalla en un teléfono real**: el Plan de Caza y la nueva columna de
   Calificación nunca se vieron en un viewport angosto.

### Un hallazgo de estrategia que conviene decidir

El puente de contactos funciona —encontró el primer LinkedIn de la base— pero
**choca con el filtro por defecto**. `requireNoWebsite: true` busca negocios sin
web propia, y justamente esos son los que no tienen un sitio para leer: su campo
«web» es un `wa.me` o un link-in-bio. O sea que **el filtro que define el ICP
excluye a los prospectos donde el puente rinde**.

No se resolvió acá porque es una decisión de producto, no un bug. Las opciones:
dejarlo así y aceptar que el puente rinde poco; o aflojar el filtro cuando el
vendedor quiere datos de contacto por encima de «no tiene web».
