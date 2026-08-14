# 🎯 PROSPECCIÓN — Generar leads propios desde el CRM

Hasta ahora el CRM **recibía** leads (alta manual, CSV, import de GHL). Este módulo
los **genera**: definís a quién buscás con ayuda de un asistente de IA, el sistema
busca negocios reales en Google Places, ves los resultados en pantalla y elegís
cuáles se guardan.

**GHL queda fuera a propósito en esta etapa.** Los clientes creados desde acá
nacen con `origin = 'hunter'` y `push_to_crm()` solo empuja cuando `origin = 'app'`,
así que no se sincronizan con GoHighLevel. Es una decisión, no un olvido (D13).

---

## El flujo, en cuatro pasos

```
1. Avatar         chat con el asistente → propone filtros (editables)
2. Búsqueda       Google Places → resultados EN PANTALLA, sin guardar nada
3. Migración      seleccionás → se guardan en `prospects` (Supabase)
4. Enriquecimiento (opcional) → Apify trae los datos reales de su Instagram
5. Promoción      (opcional) → pasan a `clients` y entran al circuito de vendedores
```

Los pasos 2 y 3 están separados a propósito: una búsqueda no ensucia la base. Solo
se persiste lo que elegís, y recién en el paso 4 un prospecto se convierte en un
cliente que alguien tiene que trabajar.

### 1. Avatar (el chat)

El asistente pregunta lo mínimo — **qué rubro y dónde** — y en cuanto lo tiene
propone una búsqueda concreta: términos, zonas, país, señales exigidas y umbral de
score. También recomienda: sugiere zonas parecidas y qué señales conviene pedir.

Todo lo que propone es editable en el panel de la derecha. Si preferís saltear el
chat, **"Cargar filtros a mano"** abre el panel vacío.

> **Sin `ANTHROPIC_API_KEY` el módulo sigue funcionando.** El chat degrada a un modo
> guiado que arma filtros con heurísticas simples y lo dice explícitamente. La
> búsqueda, el guardado y la promoción no dependen de la IA.

### 2. Búsqueda

Se recorre cada combinación de zona × término contra Google Places (Text Search).
Por cada candidato se evalúa:

| Señal | Qué significa |
|---|---|
| **Sin web propia** | Si el sitio de la ficha es Instagram, un link-in-bio o un portal del rubro (ZonaProp, Doctoralia, PedidosYa…), cuenta como *sin web* — y suele ser el mejor prospecto. |
| **Celular** | Proxy de WhatsApp. Para AR se acepta el formato sin el 9 que Google a veces publica, o se perderían leads válidos. |
| **Instagram** | Handle detectado en la ficha. |
| **Score 0–100** | Fotos, reseñas, rating, Instagram y actividad reciente, ponderados por el pack de nicho. |

Los resultados **se ordenan por score y recién ahí se recortan** al máximo pedido:
así se devuelven los N mejores del lote, no los primeros N que pasaron el filtro.

La pantalla informa cuántos se descartaron y por qué motivo, para que un embudo
vacío se pueda diagnosticar (casi siempre: señales demasiado exigentes).

### 3. Migración a Supabase

El botón **"Migrar a Supabase"** guarda los seleccionados en `prospects`. Antes de
mostrar la tabla se consulta qué negocios ya tiene guardados alguien —vía RPC,
porque el RLS no deja ver los de otro vendedor— y esos aparecen marcados y no se
pueden seleccionar. El dedupe duro es el `UNIQUE` sobre `google_place_id`.

Cada corrida deja además una fila en `prospect_searches` con el avatar y los
filtros usados, para poder auditar de dónde salió cada lead.

### 4. Enriquecimiento con Instagram (opcional)

La búsqueda detecta el handle de Instagram, pero no sabe **si esa cuenta está
viva**: un negocio que no publica hace tres años puntúa igual que uno que publica
todas las semanas. El botón **"Enriquecer con Instagram"** llama a Apify (actor
`apify/instagram-profile-scraper`) y trae seguidores, cantidad de publicaciones,
bio y fecha del último post.

Con esa fecha se clasifica la cuenta:

| `ig_activity` | Última publicación |
|---|---|
| **activo** | hace menos de 60 días |
| **tibio** | entre 60 y 180 días |
| **dormido** | más de 180 días, o sin publicaciones |

Va **después** del guardado a propósito: cada consulta consume crédito de Apify,
así que solo se paga por los prospectos que ya decidiste conservar. El lote está
acotado a **25 perfiles por corrida**.

Casos que no son "cuenta muerta" y se informan aparte: `not_found` (el handle
cambió o no existe), `private` (cuenta privada — se ven seguidores pero no
publicaciones) y `error` (falló la consulta; se puede reintentar).

> **El score NO se recalcula al enriquecer.** Un mismo número tiene que seguir
> significando lo mismo para todos los prospectos, enriquecidos o no. La señal
> nueva vive en `ig_activity`, que ya es accionable por sí sola.

### 5. Promoción a clientes

**"Promover a clientes"** llama a la RPC `promote_prospects`, que crea las filas en
`clients` (estado `pending`, origen `hunter`) y marca los prospectos como
`promoted`. Un vendedor solo puede promover a su propia lista; un superadmin puede
asignar a cualquiera. Es atómica y saltea lo ya promovido.

---

## Configuración

Las dos API keys se cargan desde el panel: **Configuración → Prospección**
(solo superadmin). Quedan guardadas en `private.integration_secrets`, no en
`app_settings` — que sí es legible por cualquier usuario autenticado.

| Key | Obligatoria | Para qué |
|---|---|---|
| **Google Places** | **Sí** | Buscar negocios. Google Cloud Console → habilitar **Places API (New)** → crear key → restringirla a esa API. |
| **OpenRouter** | No | El asistente que define el avatar. Sin ella, modo guiado. |
| **Apify** | No | Enriquecer prospectos con datos de Instagram. Sin él, ese botón no funciona; el resto sí. console.apify.com → Settings → Integrations. |

Además, en Configuración se elige el **modelo** de OpenRouter (vacío =
`openrouter/auto`) y hay un **interruptor** para apagar el asistente sin perder la
key.

### Cómo llegan las keys al servidor

Un vendedor autenticado no puede leerlas, y ese es el punto del diseño:

| RPC | Quién puede ejecutarla | Devuelve |
|---|---|---|
| `set_integration_secret` | `authenticated` + chequeo interno de superadmin | nada |
| `integration_secret_status` | `authenticated` + chequeo de superadmin | si está cargada y sus últimos 4 caracteres |
| `get_integration_secret` | **solo `service_role`** | el valor |

Por eso el servidor necesita `SUPABASE_SERVICE_ROLE_KEY` en su entorno (sin
prefijo `NEXT_PUBLIC_`: nunca entra al bundle del navegador). Si preferís no
dársela a la web, el módulo cae a las variables `GOOGLE_PLACES_API_KEY` y
`OPENROUTER_API_KEY` del entorno.

### Sobre el modelo elegido

El asistente pide la propuesta por *tool calling* (formato OpenAI, que OpenRouter
traduce a cada proveedor). Como no todos los modelos lo soportan igual, también
acepta la propuesta como un bloque ` ```json ` en el texto: con cualquiera de las
dos vías la búsqueda queda armada. Aun así, conviene un modelo con tool calling.

### Costo de Places

Cada consulta a Text Search se factura, y el field mask elegido (incluye `reviews`
y `photos`) cae en el SKU más caro. Por eso hay un **tope duro de 24 consultas por
corrida** (`MAX_REQUESTS_PER_RUN` en `places.ts`); si se alcanza, la pantalla avisa
que quedaron zonas sin recorrer en vez de simular que barrió todo. Para cubrir
muchas zonas conviene hacer varias corridas.

---

## Mapa de archivos

```
supabase/migrations/0028_prospects.sql            tablas, RLS, RPCs, origin 'hunter'
supabase/migrations/0029_ai_provider_settings.sql API keys en Configuración
web/src/lib/prospect/
  types.ts       tipos compartidos (filtros, resultado, prospecto, países)
  niches.ts      packs de nicho (estética, inmobiliarias, gastronomía, servicios)
  scoring.ts     score 0–100 — función pura, testeable
  places.ts      cliente de Google Places (server-only)
  apify.ts       enriquecimiento de Instagram (server-only)
  secrets.ts     lectura de API keys: Supabase o entorno (server-only)
  agent.ts       asistente de avatar sobre OpenRouter + modo guiado (server-only)
web/src/app/api/prospect/chat/route.ts     un turno de conversación
web/src/app/api/prospect/search/route.ts   ejecuta la búsqueda (no persiste)
web/src/app/api/prospect/enrich/route.ts   enriquece prospectos guardados
web/src/app/prospeccion/page.tsx           la página
web/src/components/prospeccion/
  ProspectStudio.tsx   orquestador (estado, guardado, enriquecido, promoción)
  AvatarChat.tsx       el chat
  FiltersPanel.tsx     filtros editables
  ResultsTable.tsx     tabla con selección
  SavedProspects.tsx   los guardados, con sus datos de Instagram
```

## Agregar un nicho

Los packs son datos, no código: sumar una entrada a `NICHE_PACKS` en `niches.ts`
con sus queries, los dominios que no cuentan como web propia, las palabras que
descalifican por nombre y los pesos de scoring. Aparece solo en el selector y el
asistente empieza a recomendarlo.

## Modelo de datos

**`prospects`** — candidatos guardados, antes del circuito comercial. RLS: cada
quien ve lo suyo, superadmin ve todo. `status`: `new` → `promoted` / `discarded`.

**`prospect_searches`** — una fila por corrida: avatar, filtros, cuántos dieron
match y cuántos se guardaron.

**RPCs** (`security definer`, ambas con chequeos internos):
- `prospect_import_status(text[])` → qué place_ids ya están tomados y por quién.
- `promote_prospects(uuid[], uuid)` → promueve en lote; devuelve `{promoted, skipped}`.

## Qué tipo de leads sirve (y cuáles no)

La búsqueda es **agnóstica al rubro** — los packs son datos y las queries se
escriben libres — pero **no** es agnóstica al *tipo* de lead. Todo sale de Google
Places, así que el módulo encuentra **negocios con presencia física registrada en
Google Maps**.

Funciona bien con: comercios y servicios locales (estética, gastronomía, retail,
talleres, gimnasios), profesionales con local (estudios, consultorios,
inmobiliarias) y cadenas con sucursales.

**No** sirve para: empresas sin ficha en Maps (SaaS, e-commerce puro,
freelancers), leads B2B por tamaño/industria/tecnología (eso es Apollo, LinkedIn
Sales Navigator o Clearbit), ni personas físicas. Tampoco filtra por facturación,
cantidad de empleados o stack tecnológico: Places no expone esos datos.

El **scoring también está sesgado a negocio local** (fotos, reseñas, rating). Para
un rubro donde eso no aplica, conviene ajustar los pesos del pack.

## Pendiente

- Aplicar las migraciones `0028_prospects.sql` y `0029_ai_provider_settings.sql`
  en Supabase Cloud.
- No hay pantalla de listado de `prospects` guardados todavía: la promoción se hace
  desde la misma corrida. Un `/prospeccion/guardados` es el siguiente paso natural.
- El scoring no verifica actividad real de Instagram (haría falta un scraper); hoy
  solo se detecta que el handle exista en la ficha.
