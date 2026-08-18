# Plan — Turbo se hace cargo

> **Estado**: propuesto 2026-08-17, esperando aprobación.
> **Origen**: una prueba en vivo donde el agente hizo de Turbo y el usuario
> comparó las dos experiencias.
> **Relacionados**: [`PLAN-TURBO-MULTIFUENTE.md`](PLAN-TURBO-MULTIFUENTE.md)

---

## 1. De qué se trata

En una prueba en vivo, el agente tomó el mismo pedido que resuelve Turbo y el
usuario notó la diferencia. Su devolución, textual:

> *«Salieron a la luz varias cosas interesantes y las resolviste de la mejor
> forma, incluso me diste opciones y cuando no pudiste algo investigaste… eso
> debe hacer Turbo.»*

La diferencia **no es la inteligencia del modelo**. Es que Turbo hoy no tiene
manera de mirar nada: solo de proponer.

| Lo que pasó en la prueba | ¿Turbo puede? |
|---|---|
| LinkedIn devolvió 0 → probé la zona con y sin la aclaración y encontré la causa | ❌ no tiene con qué probar |
| Tres países dieron 0 → aislé el caso y **frené de gastar** | ❌ no sabe cuándo parar |
| Encontré que la cuenta tiene un tope de US$ 5 y quedaban US$ 2,76 | ❌ no sabe cuánta plata hay |
| Pedí 50, traje 44 → lo dije y expliqué por qué | ❌ muestra 44 y se calla |
| Conté lo que iba haciendo mientras corría | ❌ solo un contador |

**Turbo es un asistente que propone. Lo que hace falta es uno que se haga cargo.**

## 2. Lo que se verificó en el código

No es impresión, está chequeado:

- **Turbo tiene exactamente dos herramientas**: proponer una búsqueda (una por
  fuente) y preguntar con opciones. Ninguna lee nada.
- **Nada en el código consulta el saldo de Apify.** El único `limits` que existe
  es la paginación del tablero de clientes, sin relación.
- **Nada compara lo pedido con lo entregado.** La tarjeta de resultados muestra
  cuántos matchearon, no cuántos faltaron ni por qué.

---

## 3. Las cuatro piezas

### 3.1 · Herramientas para mirar

Hoy Turbo solo puede *proponer*. Se le suman tres herramientas de **lectura**, y
una de prueba **barata y acotada**:

| Herramienta | Qué hace | Costo |
|---|---|---|
| `ver_ultima_corrida` | Lee el resultado crudo de la última búsqueda: cuántos devolvió el proveedor, cuántos se descartaron y por qué motivo | gratis |
| `ver_presupuesto` | Cuánto se gastó este mes y cuánto queda | gratis |
| `probar_variante` | Repite la búsqueda cambiando **una sola cosa** (la zona, un cargo) para testear una hipótesis | 1 página, tope propio |

El dato de `ver_ultima_corrida` **ya existe y ya se guarda** —`prospect_runs.result`
y `DiscardReasons`—, solo que Turbo nunca lo ve. Es la pieza más barata de todas
y la que más cambia: es exactamente lo que permitió deducir que el problema no
era el filtro sino la consulta, porque *todos* los motivos de descarte estaban en
cero.

⚠️ **La puerta de aprobación no se toca.** `probar_variante` es lo único que
gasta sin preguntar, y por eso va acotada: **una página como máximo**, tiene que
declarar qué hipótesis está probando, y queda registrada en `prospect_runs` como
cualquier otra corrida. Turbo sigue sin poder lanzar una búsqueda completa por su
cuenta.

### 3.2 · Un informe después de cada corrida

Cuando termina una búsqueda, una tarjeta que diga la verdad completa:

> Pediste **50**, traje **44**.
> Faltaron 6: Argentina, Chile y Perú devolvieron cero — es del proveedor, no de
> tus filtros.
> Costó **US$ 1,50**. Te quedan **US$ 2,76** este mes.

**Los números se calculan, la frase la escribe Turbo.** Calcular es confiable y
gratis; interpretar es lo que aporta el modelo. Al revés sería pagarle a un
modelo para que sume.

Lo importante es el segundo renglón: **decir qué faltó y de quién es la culpa.**
Hoy una corrida que trae menos de lo prometido se ve igual que una que salió
perfecta.

### 3.3 · Presupuesto visible

La cuenta de Apify está en el **plan gratis: US$ 5 por mes**. Con eso entran unas
50 páginas de LinkedIn o 1.900 perfiles de Instagram — y después se corta *todo*:
búsquedas, enriquecimiento, contactos. Hoy nadie lo sabe hasta que falla.

- Leer el saldo real de Apify (`/v2/users/me/limits`, verificado: devuelve
  `maxMonthlyUsageUsd` y `monthlyUsageUsd`), con cache de unos minutos.
- Mostrarlo **en el Plan de Caza**, al lado del costo: *«esta corrida sale
  US$ 0,12 · te quedan US$ 2,76 este mes»*.
- Si el plan no entra en lo que queda, Turbo lo dice **antes** y propone algo más
  chico.

**Google no se puede leer igual**: no hay un endpoint equivalente sin configurar
Cloud Billing. Pero cada corrida ya queda registrada en `prospect_searches`, así
que el gasto propio se puede **estimar de nuestros propios registros** —
consultas × US$ 0,04 — y avisar cuando se acerca a las 1.000 gratis del mes. Es
una estimación y se va a decir que lo es.

### 3.4 · Contar lo que está haciendo

Hoy hay un contador que sube. Se cambia por frases: *«buscando en Colombia…»*,
*«23 perfiles, buscando los emails…»*, *«listo, ordenando por calificación»*.

Es lo más chico de las cuatro y lo dejo último a propósito: **una corrida que
narra pero miente sobre el resultado no sirve de nada.** Primero el informe
honesto, después la narración.

---

## 4. Lo que NO se hace, a propósito

- **Turbo no reintenta solo.** Si una búsqueda falla, diagnostica y *propone*;
  no vuelve a gastar por su cuenta. La plata se gasta cuando el vendedor
  aprueba, y esa regla no se relaja para que el agente parezca más autónomo.
- **No se automatiza el "buscá hasta llegar a 50".** Suena bien y es la mejor
  forma de vaciar el presupuesto persiguiendo los últimos leads, que es
  justamente lo que en la prueba en vivo se decidió **no** hacer.
- **No se le da acceso a la base para escribir.** Las herramientas nuevas son de
  lectura, más una prueba acotada.

## 5. Archivos principales

| Archivo | Qué cambia |
|---|---|
| `web/src/lib/prospect/agent.ts` | Las tres herramientas nuevas y el criterio de cuándo usarlas |
| `web/src/lib/prospect/budget.ts` *(nuevo)* | Saldo de Apify + estimación del gasto en Google |
| `web/src/app/api/prospect/budget/route.ts` *(nuevo)* | Lo expone a la interfaz |
| `web/src/app/api/prospect/chat/route.ts` | Resuelve las herramientas de lectura |
| `web/src/components/prospeccion/HuntPlan.tsx` | El saldo al lado del costo |
| `web/src/components/prospeccion/RunReport.tsx` *(nuevo)* | El informe posterior |
| `web/src/components/prospeccion/ProspectStudio.tsx` | Narración del avance |

## 6. Verificación

| Qué | Cómo |
|---|---|
| El diagnóstico | Forzar una búsqueda que dé cero y ver que Turbo dice **cuál** fue la causa, no "no encontré nada" |
| El presupuesto | Contrastar lo que muestra contra `/v2/users/me/limits` a mano |
| El tope | Proponer una búsqueda más cara que el saldo y ver que avisa antes |
| El informe | Pedir 50 en una búsqueda que traiga menos y ver que lo dice |
| `probar_variante` | Que gaste **una** página y quede registrada en `prospect_runs` |
| Lo de siempre | `npm test`, `tsc`, `next build`, `eslint` |

**Costo estimado de las pruebas**: menos de US$ 1 — pero ojo, **quedan US$ 2,76
del mes**. Si se ejecuta este plan antes de que se renueve el ciclo, conviene
hacer las pruebas con lotes mínimos o esperar.
