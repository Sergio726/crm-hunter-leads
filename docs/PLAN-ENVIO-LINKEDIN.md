# 📨 Escribirle al lead sin copiar y pegar — opciones y plan

> Pedido del usuario (2026-08-27): *"entendí que LinkedIn no tiene API, entonces
> podríamos crear una extensión de Chrome o un agente que tome control del
> navegador… no descartaría intentar una inyección de JavaScript. Repensá todo,
> validá opciones."*
>
> Estado: **decisión pendiente**. Este documento existe para tomarla informado.

---

## El dato que ordena todo lo demás

**LinkedIn no expone el envío de mensajes a terceros. En ningún nivel, a ningún
precio.** No es que sea caro o difícil de conseguir: no está disponible.

- Las APIs oficiales **no** mandan solicitudes de conexión, **no** mandan
  mensajes entre miembros y **no** buscan perfiles arbitrarios. Ninguna de las
  tres, a ningún partner.
- Existe un *Compliance Program* para acceder a datos de mensajería, pero sus
  reglas **prohíben expresamente el envío automatizado o programado**.
- Los partners aprobados pagan del orden de **US$ 10.000 a 50.000+ al año** y
  aun así no pueden hacerlo.

**Consecuencia:** cualquier ruta que mande el mensaje sola —proveedor,
extensión, robot de navegador— **va contra los términos de LinkedIn**. No hay
una opción limpia y otra sucia: hay grados de riesgo, y alguien lo asume.

Esto no es una opinión sobre si conviene hacerlo. Es su cuenta y su decisión de
negocio. Lo que no puede pasar es que se decida sin saberlo.

### Cuánto riesgo, en números

- **Solicitudes de conexión**: 20 a 40 por día en cuentas maduras; **5 a 15** en
  cuentas nuevas o inactivas.
- **Mensajes**: 30 a 60 salientes por día.
- **Zona de riesgo**: más de 40 conexiones o más de 200 acciones automáticas
  diarias.
- Los límites **no son fijos**: dependen de la antigüedad de la cuenta, su
  actividad y su tasa de aceptación. Si la aceptación cae por debajo del 20-30 %,
  hay que bajar el volumen a la mitad.
- Un análisis de Q1 2026 estima que **~40 % de las cuentas que usaron
  herramientas no conformes recibió alguna restricción** entre enero y marzo.

Lo que dispara la detección no es el volumen solo: es el **patrón**. Tiempos
regulares, secuencias repetidas y ráfagas exactas se detectan aunque el volumen
sea bajo.

---

## Las cuatro opciones, comparadas

### Una aclaración primero

**La "inyección de JavaScript" y la "extensión de Chrome" no son dos caminos
distintos.** Una extensión funciona inyectando un *content script* en la página:
la extensión **es** la forma ordenada de hacer esa inyección. La alternativa
—pegar código en la consola del navegador— hace lo mismo pero sin poder
distribuirlo, sin permisos declarados y sin sobrevivir a una recarga. Como
producto no existe; como prueba de concepto, sirve un rato.

| | Proveedor (Unipile, HeyReach…) | Extensión propia | Robot de navegador (Playwright) | **Asistida (recomendada)** |
|---|---|---|---|---|
| **Cómo** | Le das tu cuenta y ellos exponen una API | Corre en tu Chrome, con tu sesión | Servidor con sesión guardada | Prepara todo, vos apretás enviar |
| **Corre sin vos** | Sí, 24/7 | No: navegador abierto | Sí, 24/7 | No |
| **Costo** | ~€49/mes mínimo (~€5 por cuenta) | Desarrollo propio | Servidor + mantenimiento | Desarrollo propio, menor |
| **Riesgo de cuenta** | Real. HeyReach tuvo restricciones masivas | Real, y depende de cómo se comporte | **El más alto**: IP de datacenter | **Prácticamente nulo** |
| **A quién le das tu sesión** | **A un tercero** | A nadie | A tu propio servidor | A nadie |
| **Fragilidad** | Baja (ellos la mantienen) | Media: cambia el HTML y se rompe | Alta | Media |

### Sobre el mito de "mi navegador es más seguro"

Suena lógico que usar tu Chrome y tu IP sea lo más parecido a un humano, y en
parte lo es. Pero **el comportamiento pesa más que el lugar**: una extensión que
manda a las 9:00, 9:02 y 9:04 todos los días es más detectable que un servicio
que varía. Varios proveedores publican que las extensiones son "las más
detectables" — hay que leerlos sabiendo que **venden la alternativa**, pero el
argumento del patrón es correcto.

La ventaja real de la extensión no es la IP: es que **no le entregás tu cuenta a
nadie**. Con un proveedor, un tercero queda con acceso completo a tu LinkedIn.

---

## La opción que no estaba sobre la mesa

**Asistir en vez de automatizar.** Una extensión que:

1. Toma el lead y el mensaje que Turbo ya escribió.
2. Abre el chat correcto en LinkedIn.
3. **Deja el mensaje escrito en el campo, listo.**
4. Vos leés y apretás enviar.
5. Al enviarse, avisa al CRM y el estado se mueve solo.

**Qué se gana:** desaparece el copiar, buscar el perfil, abrir el chat, pegar,
volver al CRM y cambiar el estado a mano. Eso es el 90 % del trabajo.

**Qué se conserva:** no hay envío automatizado. Un humano aprueba cada mensaje,
con lo cual el riesgo de restricción es el de usar LinkedIn normalmente. Y
—esto importa— **alguien lee el mensaje antes de que salga**, que es la
protección que hoy tenemos y que la automatización total elimina.

**Qué no se gana:** no corre mientras dormís, y no sostiene la conversación
sola.

> Vale decirlo: la propuesta de Nexum pide explícitamente que **todo corra
> solo**, y bajo esa vara esta opción no califica. Pero para *operar el negocio*,
> quita casi toda la fricción con casi todo el riesgo afuera.

---

## Recomendación

**Fase A — la extensión asistida.** Es lo que más dolor quita por unidad de
riesgo, no necesita pagar nada, y **lo que se construye sirve igual** si después
se decide automatizar: la parte difícil de una extensión es encontrar el chat y
poner el texto, no el clic final.

**Fase B — decidir sobre el envío automático**, ya con la extensión andando y
sabiendo cuántos mensajes por día se mandan de verdad. Si en ese momento el
volumen lo justifica, la discusión pasa a ser proveedor contra extensión con
envío, con datos propios en vez de suposiciones.

**Descartado por ahora: el robot en servidor (Playwright).** Es el que más
riesgo tiene —IP de datacenter, sesión guardada, cualquier cambio de interfaz lo
rompe— y el que menos aporta frente a las otras dos.

---

## Plan de tareas

### Fase A · Extensión asistida

| # | Tarea | Detalle |
|---|---|---|
| A1 | **Decidir el alcance con el usuario** | Confirmar que la asistida es el camino, y si el mensaje se abre desde el CRM o desde LinkedIn |
| A2 | **Un token para la extensión** | La extensión tiene que hablar con el CRM sin las credenciales del panel. Token por vendedor, revocable, guardado en `app_settings` o tabla propia |
| A3 | **Endpoint `GET /api/extension/pendientes`** | Devuelve los leads con mensaje listo del vendedor autenticado: perfil de LinkedIn, texto y `client_id` |
| A4 | **La extensión** | Manifest v3, permiso solo sobre `linkedin.com`. Detecta el perfil abierto, pide el mensaje al CRM y lo escribe en el campo del chat |
| A5 | **Endpoint `POST /api/extension/enviado`** | La extensión avisa que se envió → se registra la interacción y el estado se mueve, sin que nadie toque el kanban |
| A6 | **Fricción cero en el otro sentido** | Desde el CRM, un botón *Abrir en LinkedIn* que lleve al perfil correcto |

### Fase B · Si se decide automatizar

| # | Tarea | Detalle |
|---|---|---|
| B1 | **Elegir ruta** | Proveedor (~€49/mes, le das tu cuenta) o extensión con envío (gratis, corre solo con el navegador abierto) |
| B2 | **Tope diario y cadencia irregular** | No negociable: 15-20 por día para arrancar, con intervalos variables. Ya existe `envioDirecto` en `lib/canales.ts` como punto de extensión |
| B3 | **Aprobar los primeros** | Revisar los primeros N mensajes de cada tanda y liberar el resto — es lo que reemplaza al humano que hoy lee cada mensaje |
| B4 | **Cuenta de prueba** | El perfil principal no se toca hasta que esté estable |
| B5 | **Frenar solo** | Si la tasa de aceptación cae por debajo del 25 %, bajar el volumen automáticamente |

### En paralelo · Mejorar lo que ya tenemos

Salen de revisar el código del desafío. No dependen de ninguna decisión y se
notan en la calidad de los mensajes:

| # | Tarea | Por qué, y cómo lo haríamos mejor |
|---|---|---|
| C1 | **Traer el último post del perfil** | Es lo que más mejora el mensaje: referenciar algo real y reciente. Actor `harvestapi/linkedin-profile-posts`, ~US$ 0,002 por post, `maxPosts: 1`, sin reposts. **Mejor que ellos**: guardarlo en `prospects` en vez de usarlo y tirarlo, usarlo también en el mensaje de **seguimiento**, y **descartarlo si es viejo** — referenciar un post de hace ocho meses delata el bot |
| C2 | **Sanitizador determinístico** | Ellos aplican las reglas dos veces: el prompt las pide y una función las fuerza. **Mejor que ellos**: que sea **por canal** —en WhatsApp un emoji está bien y en LinkedIn no— y que además controle el **largo**, no solo los caracteres |
| C3 | **Decir qué falta, no omitirlo** | Cuando no hay post, ellos escriben *"no disponible, no referencies ningún post"*. Nosotros omitimos el campo, que es el hueco por donde se coló el bug del rubro. **Mejor que ellos**: generalizarlo a **todos** los datos ausentes |
| C4 | **Verificar el esquema del actor sin gastar** | Leer el `inputSchema` del último build (`GET /v2/acts/{actor}/builds`) en vez de la doc pública. Nuestra lección actual —"corré el actor y mirá un ítem real"— **cuesta plata cada vez** |

---

## Orden sugerido

1. **C1 a C4** primero: no dependen de ninguna decisión, mejoran el mensaje ya y
   se pueden hacer sin riesgo.
2. **A1**: confirmar el alcance de la extensión.
3. **A2 a A6**: la extensión asistida.
4. **B**: recién con datos de uso real.

## Fuentes

- [Unipile — API pricing](https://www.unipile.com/pricing-api/) y
  [reseña con precios 2026](https://www.swarmhit.com/blog/unipile-review)
- [PhantomBuster — límites seguros 2026](https://phantombuster.com/blog/linkedin-automation/linkedin-automation-safe-limits-2026/)
- [Northlight — automatizar sin que te bloqueen](https://northlight.ai/blog/linkedin-automation-without-getting-banned)
- [ConnectSafely — guía de la API de LinkedIn 2026](https://connectsafely.ai/articles/linkedin-api-complete-guide-2026)
- [Cloud vs extensión, comparación](https://www.leadshark.io/blog/cloud-based-linkedin-automation)
  (proveedor cloud: leer sabiendo que vende la alternativa)
