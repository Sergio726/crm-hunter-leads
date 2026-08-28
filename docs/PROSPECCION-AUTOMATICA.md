# 🤖 Que Turbo deje de escribir y empiece a operar

> Plan del salto de **semiautomático** a **automático**. Nace de la propuesta
> *Desafío Nexum · Prospección automática por LinkedIn* que trajo el usuario el
> 2026-08-27, cruzada con lo que Hunter Leads ya tiene.
>
> Estado: **planificado**. La fase 1 es lo único empezado (los mensajes ya
> apuntan a agendar).

---

## El muro, descrito por otro

La propuesta de Nexum define el límite de su plataforma con una frase que
describe **exactamente** el estado de Hunter Leads:

> *"Te busca los leads y te escribe el mensaje, pero después tenés que copiarlo,
> ir a LinkedIn, pegarlo, volver y cambiar el estado a mano. Y si la persona
> responde, ya quedaste vos manejando el chat."*

Eso es literalmente lo que hacemos hoy. Que dos equipos hayan llegado al mismo
muro por caminos distintos dice que el muro es real, y dónde está el valor que
falta.

## Lo que ya tenemos (y no hay que rehacer)

- Búsqueda multi-fuente con Apify y Google Places, con costo estimado antes de
  gastar y **freno por presupuesto** (D52, D54).
- Análisis del prospecto: rubro, zona, reseñas, bio, actividad de la cuenta.
- **Mensaje personalizado por canal**, con ofertas por rubro elegidas solas
  (MSG-1, MSG-2) y mensaje de **seguimiento** que no repite el ángulo anterior.
- Historial de cada contacto con su canal, resultado y fecha.
- Kanban de estados y seguimiento con fechas.

Comparado con la base que reparte el desafío, lo que falta es lo mismo: **operar**.

---

## Fase 1 — El mensaje apunta a la llamada ✅ HECHA (2026-08-27)

Cambio de criterio, decidido por el usuario: antes la pregunta final pedía *"una
respuesta corta, no una reunión"*; ahora **cada mensaje empuja a una llamada**,
que es lo que hace un setter.

Con eso entraron tres reglas de la propuesta:

- **Sin link de agenda no se inventan horarios.** El modelo no sabe la
  disponibilidad de nadie. Se agregó `app_settings.agenda_url` (`0051`) y el
  campo en Configuración; si está vacío, el mensaje pide la llamada sin proponer
  nada.
- **Máximo dos seguimientos.** Después, el lead queda frío. Perseguir a quien no
  contesta quema el contacto y la cuenta.
- **Fuera de guion, escala.** Si piden un precio cerrado o un detalle técnico
  fino, el mensaje dice que lo consulta en vez de inventar.

## Fase 2 — Enviar sin copiar y pegar (MSG-5)

**Es el próximo paso, decidido por el usuario.** Sin esto, todo lo demás queda a
mitad de camino.

LinkedIn **no tiene API pública de mensajería** — esa era la duda que quedó
abierta al preparar MSG-5, y la propuesta la responde con tres caminos:

| Ruta | Qué es | Costo |
|---|---|---|
| **A · Proveedores** | Unipile, PhantomBuster, HeyReach conectan la cuenta y exponen una API para enviar, leer respuestas y mandar solicitudes | Pago, pero resuelve el envío rápido |
| **B · Actores de Apify** | Hay actores de mensajería además de los de scraping. Mismo ecosistema que ya usamos | Bajo |
| **C · Navegador propio** | Playwright con la sesión logueada | Casi cero, y lo más frágil: cualquier cambio de interfaz lo rompe |

**Recomendación de la propuesta, y coincido: la ruta A.** Resuelve el envío en
poco tiempo y deja el esfuerzo donde está el valor, que es el agente.

### Los límites operativos, que no son opcionales

Esto no es un detalle de implementación: es lo que evita que bloqueen la cuenta.

- **15 a 20 contactos por día** para arrancar, y subir de a poco.
- **Cadencia con tiempos irregulares.** Nada de un mensaje exacto cada 60
  segundos: eso es lo que detecta cualquier plataforma.
- **Cuenta de prueba primero.** El perfil principal no se toca hasta que el
  sistema esté estable.
- **Tope diario configurable**, y que el sistema lo respete solo.

El catálogo `lib/canales.ts` ya tiene `envioDirecto` como punto de extensión: hoy
`false` en los cuatro canales, con un test que lo fija.

## Fase 3 — El setter: que Turbo sostenga la conversación

Cuando el lead responde, hoy el vendedor queda solo con el chat. La fase 3 es que
Turbo lea la respuesta y siga la conversación hasta agendar.

Necesita tres cosas que **no** tenemos:

1. **Leer respuestas** (webhook o consulta periódica del proveedor de la fase 2).
2. **Memoria de la conversación**, no solo del último mensaje.
3. **Una salida clara a humano** cuando el lead se va del guion.

Es donde se va la mayor parte del trabajo, y está bien que así sea.

## Fase 4 — Agenda, estados y recordatorio

El lead acepta → se registra la reunión, el estado se mueve solo a *reunión
agendada*, y sale un recordatorio antes de la llamada. Nadie arrastra tarjetas a
mano.

Buena parte ya existe: tenemos estados, fechas de seguimiento y una tarea diaria
que manda avisos. Lo que falta es conectar la agenda y que los estados los mueva
el sistema.

---

## Lo que NO se toma de la propuesta

- **El plazo y el formato de desafío.** Es de julio de 2026 y venció el 5 de
  agosto; acá interesa lo técnico.
- **"Presupuesto infinito".** Hunter Leads tiene un freno de gasto puesto a
  propósito (D52) porque el usuario pidió que se frene por plata. Eso no se
  relaja.
- **Empezar de cero.** La propuesta ofrece una base para importar; nosotros
  tenemos algo más avanzado en búsqueda, presupuesto y seguimiento.

## Riesgo que conviene decir ahora

Automatizar el envío cambia la naturaleza del sistema: hoy, si Turbo escribe una
pavada, el vendedor la ve antes de mandarla. **Con envío automático no hay quien
mire.** Por eso la propuesta insiste tanto en revisar los primeros mensajes y en
volúmenes chicos — y por eso la fase 2 tiene que salir con tope diario y con la
opción de aprobar los primeros antes de liberar el resto.
