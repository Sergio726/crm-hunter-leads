# 📇 Enriquecimiento de contacto de prospectos (PROSP-6)

> Plan por fases para que los prospectos lleguen al vendedor **con forma de
> contactarlos**. Complementa [`PROSPECCION.md`](PROSPECCION.md) (búsqueda con
> Places) y el enriquecimiento de Instagram de PROSP-5.
>
> Estado: **Fase 0 hecha y aprobada** (2026-08-14). Fases 1–4 pendientes.

---

## El problema

Un prospecto guarda `full_name`, `phone`, `website`, `instagram`, `company`…
**pero no `email`**. Y `promote_prospects` (migración `0028`) copia a `clients`
solo `full_name, phone, company, assigned_to, status, origin, tags, notes`.

Consecuencia: **todo lead que sale de prospección le llega al vendedor sin
email**. La ficha tiene el botón de mandar mail, pero no hay dirección adonde
mandarlo. `clients.email` existe desde la migración `0001` — está vacío porque
nadie lo llena.

Google Places no expone el email del negocio: da el **sitio web**. El puente
entre una cosa y la otra es entrar a esa web y leer el contacto.

---

## Fase 0 — Validar el actor antes de escribir código ✅ HECHA

**Regla que se siguió**: no construir la cañería sin saber si el dato existe.

- **Actor**: [`vdrmota/contact-info-scraper`](https://apify.com/vdrmota/contact-info-scraper)
  ("Contact Details Scraper"), público, id `9Sk4JJhEma9vBKqrg`.
- **Prueba real** (2026-08-14): 5 sitios de negocios argentinos del perfil que
  busca el CRM — 3 inmobiliarias y 2 clínicas de estética.
- **Parámetros**: 3 páginas por sitio, profundidad 1, mismo dominio, contactos
  fusionados, sin browser. **Todos los add-ons pagos desactivados**
  (enriquecimiento de leads, verificación de emails y perfiles sociales cuestan
  $0.1 por evento en el tier gratuito: no se usan).

### Resultados

| Sitio | Email | Teléfono | WhatsApp | Redes |
|---|---|---|---|---|
| buenosairesinmob.com.ar | ✅ | ✅ | ✅ 2 | IG, FB, TikTok |
| brick.com.ar | ✅ | ✅ 3 | ✅ 2 | IG, FB |
| dramarialucchesi.com | ✅ | — | ✅ | IG, FB, TikTok, LinkedIn |
| izr.com.ar | ✅ 2 | ✅ 2 | ✅ 2 | IG, FB, LinkedIn |
| clinicarobles.com | ❌ | ❌ | ❌ | — |

- **Tasa de email: 4 de 5 (80 %)** — bastante mejor que el 40–60 % que se
  estimó de entrada.
- **WhatsApp: 4 de 5**, con el número ya resuelto en el link.
- **Duración**: 38 s para los 5 sitios, en una sola llamada síncrona.
- **Costo real: $0.024** por 12 páginas ⇒ **≈ $0.005 por sitio**. Proyectado:
  ~$0.50 cada 100 prospectos.

### Qué devuelve por sitio

`emails`, `phones`, `phonesUncertain`, `whatsapps`, `instagrams`, `facebooks`,
`tiktoks`, `linkedIns`, `twitters`, `youtubes` y algunos más, además de
`scrapedUrls` (para auditar cuántas páginas se pagaron).

### El caso que falló

`clinicarobles.com` devolvió **0 páginas escaneadas**: el scraper no pudo abrir
el sitio (probablemente lo bloqueó o depende de JavaScript). No es que no tenga
email — no se llegó a leer. Con `useBrowser: true` podría resolverse, a un
extra de $0.003 por página. **Recomendación**: dejarlo apagado por defecto y
evaluarlo después con datos; encarecer todas las corridas por un caso de cada
cinco no se justifica todavía.

### Veredicto

**Sí, se sigue.** El dato existe, es barato y llega rápido.

### ⚠️ Hallazgo que amplía el alcance

La corrida devuelve **mucho más que el email**, en la misma llamada y sin costo
adicional. Dos datos valen tanto o más que el email:

1. **WhatsApp** (4 de 5 sitios). `prospects` ya tiene `whatsapp_phone` y es
   **el canal principal del vendedor**; el score incluso premia tenerlo. Hoy se
   infiere del teléfono; acá viene el número que el negocio publica para
   escribirle.
2. **Redes que Places no detectó.** Sirven para completar `instagram` cuando la
   búsqueda no lo encontró — y eso alimenta el enriquecimiento de PROSP-5, que
   hoy no puede correr sobre prospectos sin handle.

Por eso las fases siguientes tratan esto como **enriquecimiento de contacto**,
no solo "buscar emails". Ignorar datos que ya vienen pagos en la misma
respuesta no tendría sentido.

---

## Fase 1 — Base de datos (migración `0031`)

- `prospects`: agregar **`email`**, y campos de control calcados de los `ig_*`
  ya existentes — `contact_enriched_at` y `contact_status`
  (`ok` / `not_found` / `unreachable` / `error`).
- Completar `whatsapp_phone` e `instagram`/redes **solo cuando estén vacíos**:
  el dato de Places es de primera mano y no se pisa.
- **`promote_prospects`: sumar `email` al insert de `clients`.** Es la línea que
  cierra el circuito; sin esto el email se junta pero nunca llega al vendedor.

**No se toca el score** (misma regla que D18 en `DECISIONS.md`): si el score
cambiara al enriquecer, un mismo número significaría cosas distintas según si
el prospecto pasó o no por el scraper, y dejaría de ser comparable.

## Fase 2 — Backend

- `lib/prospect/contacts.ts` — espejo de `apify.ts`: tope de sitios por
  corrida, add-ons apagados de forma explícita, normalización del WhatsApp
  (viene como link `wa.me` / `api.whatsapp.com`, hay que extraer el número) y
  mapeo de estados.
- **Ruta nueva** `/api/prospect/enrich-contacts`, no un modo dentro de la
  existente: el enriquecimiento de Instagram funciona y no conviene arriesgarlo
  por comodidad. Reusa el guard de rol, la lectura del token desde
  Configuración y el manejo de errores de la ruta actual.
- Solo corre sobre prospectos **con `website`**: sin web no hay nada que leer.
- `maxDuration`: 60 s alcanza (38 s para 5 sitios), lo que además lo mantiene
  dentro del plan gratuito de Vercel — ver [`DEPLOY-VERCEL.md`](DEPLOY-VERCEL.md).

## Fase 3 — Interfaz

- Botón **"Buscar datos de contacto"** junto a "Enriquecer con Instagram", con
  el mismo patrón: dice cuántos prospectos tienen web (los únicos elegibles) y
  avisa que cada consulta se paga.
- **Dos botones separados, no uno**: son dos corridas que se pagan aparte:
  juntarlas obligaría a pagar Instagram para negocios que solo interesaban por
  email.
- Mostrar el email en la tabla de prospectos y en `SavedProspects`.

## Fase 4 — Verificación

- `tsc` + `next build`.
- Una corrida real sobre pocos prospectos.
- **La prueba que importa, punta a punta**: buscar → guardar → enriquecer →
  promover a cliente → **que el email aparezca en la ficha del vendedor**. Si
  no llega ahí, no sirvió de nada.

---

## Decisiones tomadas

| Decisión | Motivo |
|---|---|
| Enriquecer **después** de guardar | Se paga solo por los prospectos que el usuario decidió conservar, no por el ruido que descarta (misma lógica que D18). |
| **Un solo email** por prospecto | Un sitio suele publicar varios (`info@`, `ventas@`). El vendedor le escribe a uno; guardar la lista completa complica la interfaz sin agregar valor. Los demás quedan en el JSON crudo por si algún día hacen falta. |
| **No pisar** datos de Places | Places es fuente de primera mano; el scraper completa huecos, no reemplaza. |
| **Browser apagado** por defecto | Encarecería todas las corridas para recuperar ~1 de cada 5 sitios. Se reevalúa con datos reales. |
| Add-ons de Apify **desactivados** | En el tier gratuito cuestan $0.1 por evento — 20 veces el costo de la corrida entera. |

## Riesgos asumidos

- **Cobertura parcial por diseño**: los negocios sin web quedan afuera, y
  algunos sitios bloquean al scraper. Se pasa de *cero* emails a tenerlos en
  buena parte de los leads; no en todos.
- **Deuda de mantenimiento**: un scraper depende de webs ajenas y del actor de
  un tercero. Puede romperse sin aviso.
- **Términos de servicio**: vale para todo scraping, incluido el de Instagram
  que ya está en uso. Este caso es el más benigno del lote — se leen sitios
  públicos de negocios que justamente publican esos datos para que los
  contacten.
