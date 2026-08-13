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
1. Avatar        chat con el asistente → propone filtros (editables)
2. Búsqueda      Google Places → resultados EN PANTALLA, sin guardar nada
3. Migración     seleccionás → se guardan en `prospects` (Supabase)
4. Promoción     (opcional) → pasan a `clients` y entran al circuito de vendedores
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

### 4. Promoción a clientes

**"Promover a clientes"** llama a la RPC `promote_prospects`, que crea las filas en
`clients` (estado `pending`, origen `hunter`) y marca los prospectos como
`promoted`. Un vendedor solo puede promover a su propia lista; un superadmin puede
asignar a cualquiera. Es atómica y saltea lo ya promovido.

---

## Configuración

Dos variables en el entorno de la web (`web/.env.local` en desarrollo, env del
contenedor en Dokploy):

| Variable | Obligatoria | Para qué |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | **Sí** | Buscar negocios. Google Cloud Console → habilitar **Places API (New)** → crear key → restringirla a esa API. |
| `ANTHROPIC_API_KEY` | No | El asistente que define el avatar. Sin ella, modo guiado. |

Ninguna se expone al browser: se usan solo desde los route handlers
(`/api/prospect/*`), y los módulos que las leen están marcados `server-only`.

### Costo de Places

Cada consulta a Text Search se factura, y el field mask elegido (incluye `reviews`
y `photos`) cae en el SKU más caro. Por eso hay un **tope duro de 24 consultas por
corrida** (`MAX_REQUESTS_PER_RUN` en `places.ts`); si se alcanza, la pantalla avisa
que quedaron zonas sin recorrer en vez de simular que barrió todo. Para cubrir
muchas zonas conviene hacer varias corridas.

---

## Mapa de archivos

```
supabase/migrations/0028_prospects.sql   tablas, RLS, RPCs, origin 'hunter'
web/src/lib/prospect/
  types.ts       tipos compartidos (filtros, resultado, prospecto)
  niches.ts      packs de nicho (estética, inmobiliarias, gastronomía, servicios)
  scoring.ts     score 0–100 — función pura, testeable
  places.ts      cliente de Google Places (server-only)
  agent.ts       asistente de avatar + modo guiado (server-only)
web/src/app/api/prospect/chat/route.ts     un turno de conversación
web/src/app/api/prospect/search/route.ts   ejecuta la búsqueda (no persiste)
web/src/app/prospeccion/page.tsx           la página
web/src/components/prospeccion/
  ProspectStudio.tsx   orquestador (estado, guardado, promoción)
  AvatarChat.tsx       el chat
  FiltersPanel.tsx     filtros editables
  ResultsTable.tsx     tabla con selección
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

## Pendiente

- Aplicar la migración `0028_prospects.sql` en Supabase Cloud.
- No hay pantalla de listado de `prospects` guardados todavía: la promoción se hace
  desde la misma corrida. Un `/prospeccion/guardados` es el siguiente paso natural.
- El scoring no verifica actividad real de Instagram (haría falta un scraper); hoy
  solo se detecta que el handle exista en la ficha.
