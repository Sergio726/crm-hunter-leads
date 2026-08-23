# 💬 El mensaje que rompe el hielo (MSG-1)

> Plan por fases. Pedido del usuario (2026-08-23): *"al momento de contactarme
> con los clientes, ya sea por WhatsApp, por mail o por LinkedIn, tener a mano
> información relevante del cliente y que el sistema me arroje un mensaje
> personalizado que sirva de rompehielo"*.
>
> Estado: **fases 1, 3, 4 y 5 implementadas (2026-08-23, PR #63).**
> Falta la fase 2 completa (varias ofertas) y la 6 (qué funciona).
> ⏳ **Requiere aplicar la migración `0048`.**

---

## Lo que ya existe

Esto está construido **para prospectos**, no para clientes. En
`/prospeccion/guardados` hay un botón **Primer mensaje** que abre
`ApproachDialog` → `/api/prospect/approach` → `lib/prospect/approach.ts`.

Ya resuelve lo difícil, y conviene no volver a resolverlo:

- **Los tres canales que pidió el usuario, con reglas propias.** WhatsApp: 45
  palabras, un párrafo, tuteo rioplatense, tiene que entrar entero en la
  notificación. Email: asunto de menos de 8 palabras y cuerpo de 60 a 90.
  LinkedIn: 60 palabras, profesional, sin fórmulas de plantilla.
- **Se apoya en datos, no en aire**: bio de Instagram, seguidores, si la cuenta
  está viva, rubro declarado, zona, estrellas y reseñas de Google, cargo,
  empresa, si tiene web propia.
- **Se paga por lead**, así que corre a pedido y de a uno. Es la única pieza del
  sistema con ese costo: automatizarla sobre 100 prospectos multiplicaría por
  cien el gasto para mensajes que nadie va a leer.

## El problema de fondo

**Al promover un prospecto a cliente, los datos que hacen bueno al mensaje se
pierden.**

`clients` tiene doce columnas: nombre, teléfono, email, empresa, vendedor,
estado, próximo seguimiento, los ids de GHL y unas notas. La bio, los
seguidores, las estrellas y las reseñas terminan **aplastados en un párrafo de
texto dentro de `notes`** (ver el insert de `promote_prospects`, migración
`0036`), y no queda **ningún vínculo** con el prospecto de origen.

Consecuencia concreta: poner hoy el mismo botón en la ficha del cliente daría un
mensaje sensiblemente peor que el que se conseguía diez minutos antes, cuando el
mismo negocio todavía era un prospecto. Por eso la primera fase no es la
pantalla: es el vínculo.

---

## Fase 1 — Que el cliente recuerde de dónde salió ✅ HECHA

**El plan estaba equivocado en el cómo.** Pedía agregar
`clients.prospect_id`, y al implementarlo apareció que **el vínculo ya
existe en la dirección contraria**: `prospects.promoted_client_id`, que
escribe `promote_prospects` desde la `0028`. Agregar la columna del otro
lado habría duplicado la relación, con dos fuentes que se pueden
desincronizar.

Lo que faltaba era otra cosa, y más importante: **un índice** (sin él ir
del cliente al prospecto es un scan) y **una forma de leerlo**. El RLS de
`prospects` es "los míos o soy superadmin", así que en el caso más común
—el superadmin busca, guarda y le asigna los leads a un vendedor— *ese
vendedor no puede leer el prospecto de su propio cliente*. El mensaje le
habría salido genérico justo a quien lo necesita.

Migración `0048`: el índice y `client_message_context(uuid)`, una función
`security definer` que devuelve cliente + prospecto de origen + historial
reciente, verificando primero que quien pregunta pueda ver ese cliente.
Se eligió una función y no abrir la tabla: el vendedor accede al contexto
de su cliente, y a nada más.

**Los clientes ya promovidos quedan sin vínculo.** Se podría intentar
re-vincularlos por nombre y teléfono, pero un falso positivo mezcla los datos de
dos negocios distintos dentro de una ficha, y eso es peor que no tener el dato.
Los viejos siguen con lo que hay en `notes`.

## Fase 2 — Qué vendemos (decisión del usuario: varias ofertas) ⏳ PENDIENTE

Hoy "qué vendés" vive en **`localStorage`** (`lib/prospect/offer.ts`): es del
navegador, así que entrar desde el celular deja el mensaje sin oferta y sin
avisar.

Se elige entre **varias ofertas guardadas**, según el cliente. Para no abrir una
tabla nueva, van como una clave de `app_settings` (que ya es `key`/`jsonb`):

```
offers = [{ id, nombre, descripcion, activa }]
```

- Se administran en **Configuración → Prospección**, junto a lo que ya está.
- El diálogo las ofrece en un selector, con la última usada preseleccionada.
- `localStorage` queda como respaldo: si no hay ninguna cargada, el diálogo
  sigue funcionando como hoy, escribiéndola a mano.

> **Se parte en dos a propósito.** La primera entrega puede salir con la oferta
> actual y el selector llegar después: la lista de ofertas es la parte más
> pesada de las tres decisiones y no debería frenar al resto.

## Fase 3 — El mensaje en la ficha del cliente ✅ HECHA

Es el corazón del pedido: *"tener a mano información relevante"* y el mensaje,
en el mismo lugar.

La ficha ya tiene los botones de **WhatsApp · Llamar · Email**, y hoy abren el
canal **vacío**. El cambio: antes de abrirlo, mostrar el mensaje listo.

- Se reusa `ApproachDialog`, extendido para aceptar un cliente además de un
  prospecto. El motor (`approach.ts`) no cambia: cambia de dónde salen sus datos.
- **Panel de contexto** al lado del mensaje, que es la otra mitad del pedido:
  quién es, de dónde salió, cuándo fue el último contacto, por qué canal y con
  qué resultado. Todo eso ya está en la base.
- LinkedIn se suma a los botones de contacto cuando el cliente tiene perfil.

## Fase 4 — Que quede en el historial ✅ HECHA

Al copiar el mensaje se registra en `interactions` con `channel = 'note'`.

- **No se paga dos veces** por el mismo mensaje.
- Se ve qué se le dijo, que es lo primero que hace falta para el segundo
  contacto.
- La política de la `0047` ya permite borrar una nota propia, así que un
  mensaje descartado se limpia sin tocar nada más.

No se registra como contacto real (`whatsapp`/`email`): copiar un mensaje no es
haberlo mandado, y contarlo como contacto inflaría las métricas del vendedor.

## Fase 5 — El segundo mensaje, que es el difícil ✅ HECHA

El rompehielo es el mensaje fácil. El difícil es el que sigue: *"le escribí hace
ocho días, no contestó, ¿qué le digo ahora sin repetir lo mismo?"*. Ahí es donde
se caen las ventas, y es donde el sistema tiene una ventaja que una persona no
tiene a mano: **ya guarda cada contacto, su canal, su resultado y su fecha**.

- Mismo motor, otro modo: recibe además el historial y los días transcurridos.
- Regla dura: **no repetir el ángulo del mensaje anterior** — de ahí que la fase
  4 sea requisito de esta.
- El sistema ya sabe a quién le toca (`next_follow_up` vencido), así que el
  mensaje puede ofrecerse desde la misma lista de seguimientos.

## Fase 6 — Qué rompehielo funciona

Con los mensajes guardados (fase 4) y el resultado de cada contacto —que ya se
registra: contestó, no contestó, interesado, no interesado— se puede mostrar qué
tipo de primer mensaje está teniendo mejor respuesta.

Es la fase más ambiciosa y la única que **necesita volumen**: con veinte
mensajes no dice nada. Se deja anotada, no se construye hasta que haya datos.

---

## Riesgos y decisiones tomadas

| Tema | Decisión |
|---|---|
| **Costo** | Cada mensaje se paga (OpenRouter). A pedido y de a uno, nunca automático sobre una lista. Igual que en prospección. |
| **Presupuesto** | ⚠️ El freno de D52/D54 cubre Apify y Google, **no OpenRouter**. El chat de Turbo ya gasta sin control por ese lado; es un hueco conocido y previo, no lo abre esta función — pero conviene cerrarlo antes de multiplicar las llamadas. |
| **Clientes viejos** | Sin vínculo al prospecto. Se acepta: inventar el vínculo por nombre es peor. |
| **Copiar ≠ enviar** | El mensaje copiado se guarda como comentario, no como contacto. |
| **Qué NO se hace** | Mandar el mensaje por el sistema. Sale por el canal del vendedor, como hoy: es su relación y su número. |

## Orden sugerido

1. Fase 1 (vínculo) + Fase 3 (el diálogo en la ficha) — juntas es la primera
   entrega que se nota.
2. Fase 4 (historial), que habilita la siguiente.
3. Fase 5 (segundo mensaje).
4. Fase 2 completa (varias ofertas) en cualquier momento; conviene antes de la 5.
5. Fase 6 cuando haya volumen.

---

## Lo que quedó afuera de la primera entrega

- **La fase 2 completa.** "Qué vendés" sigue viviendo en `localStorage`, así que
  entrar desde otro dispositivo lo deja vacío. Funciona igual —el campo se
  escribe a mano— pero el selector de varias ofertas no está.
- **El panel de contexto es mínimo.** Dice de dónde salió el cliente y cuántas
  veces se lo contactó; no repite la ficha, que está justo arriba y ya muestra
  los datos y el historial completo. Si al usarlo falta algo puntual, se suma.
- **La fase 6** (qué rompehielo funciona) sigue esperando volumen.
