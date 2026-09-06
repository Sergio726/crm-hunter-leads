# 🏢 De un cliente a muchos — plan por sprints

> Documento de **definición**, no de implementación. Nada de esto está
> construido. Sirve para decidir el orden y para no descubrir a mitad de camino
> algo que había que resolver al principio.
>
> _Escrito el 2026-09-05, a pedido del usuario._

---

## Qué hay hoy y qué se quiere

**Hoy**: Hunter Leads es de **una sola empresa** (ST Labs). Hay dos tipos de
usuario —administrador y vendedor, más un lector— y todos viven en la misma
base, sin ninguna noción de "a qué empresa pertenece este dato". La decisión
está escrita en **D2**: *single-tenant por instalación*, o sea que cada cliente
nuevo se resolvía con **una copia entera del sistema** —su propio proyecto de
Supabase, su propio despliegue— siguiendo `PUESTA-EN-MARCHA.md`.

**Lo que se quiere**, en la visión final: muchas empresas dentro de **una sola
instalación**, cada una con varios usuarios y roles, créditos de uso y pagos por
Stripe. Y un **panel aparte** para administrar todo eso.

**El primer paso pedido**: múltiples empresas con **un solo usuario cada una**,
que se invita por link o por mail, y el panel nuevo —que además se lleva la
Configuración que hoy está adentro del panel de trabajo.

## Lo que esto cambia de fondo

Esto **revisa D2**, y conviene decirlo con todas las letras porque cambia el
producto, no solo el código:

| | Hoy (single-tenant) | Lo que se busca (multi-tenant) |
|---|---|---|
| Cliente nuevo | Instalación entera: Supabase, despliegue, claves | Una fila en una tabla |
| Aislamiento | **Físico**: bases distintas, no se pueden tocar | **Lógico**: mismo Postgres, separado por reglas |
| Si el aislamiento falla | imposible por construcción | una empresa ve los datos de otra |
| Costo por cliente | alto y manual | casi cero |
| Actualizar el sistema | cliente por cliente | una vez para todos |

El intercambio es claro: se gana escala y se pierde la red de seguridad de que
los datos estén en bases distintas. **A partir de acá, lo único que separa a una
empresa de otra son 47 políticas de seguridad escritas a mano.** Ese es el
riesgo central de todo este plan, y es lo que ordena los sprints.

## Tamaño real del cambio

Medido sobre el repo hoy:

- **13 tablas** con datos, **47 políticas** de seguridad escritas.
- **55 migraciones** acumuladas.
- **14 pantallas** y **18 rutas de API** en el panel.
- **`app_settings` es una tabla clave-valor global** —una sola fila por
  ajuste—: `whatsapp_mode`, `offers`, `agenda_url`, `role_permissions`,
  `superadmin_emails`. Todo eso pasa a ser **por empresa**.
- **Las claves de los servicios** (`private.integration_secrets`) también son
  globales: hoy hay un token de Apify y uno de OpenRouter para todo el sistema.

---

## Sprint 0 · Las decisiones (sin código)

Cinco preguntas que **cambian el diseño**. Contestarlas mal después cuesta
mucho más que contestarlas ahora.

### 1. ¿Quién paga las herramientas? → ✅ **LA PLATAFORMA** (decidido 2026-09-06)

El cliente no crea cuentas en Apify, OpenRouter ni Google: entra y usa. Se
vende con **créditos**. Es el producto más fácil de vender y el más difícil de
operar, así que conviene entrar sabiendo qué cambia:

**Los créditos dejan de ser opcionales y pasan a ser el núcleo.** No se pueden
dejar para el final: sin medir y frenar por empresa, el primer cliente que
busque de más gasta la plata de ST Labs. Por eso los créditos suben del Sprint 5
al Sprint 4, **antes** de abrir el sistema a un cliente que pague.

**El tope de Apify pasa a ser compartido, y eso ya mordió una vez.** Con el plan
gratis, el actor de LinkedIn llegó a su límite de corridas y desde entonces
*arrancaba, no buscaba nada, terminaba como exitoso y cobraba US$ 0* (OPS-2).
Con muchas empresas sobre la misma cuenta, **un cliente puede dejar sin servicio
a todos los demás**. Hacen falta dos frenos, no uno: el de la empresa (sus
créditos) y el de la plataforma (que ninguna se coma la capacidad del resto).

**El riesgo de términos se centraliza en ST Labs.** Si la búsqueda la hace la
cuenta de la plataforma en nombre de un cliente, ante Apify —y ante LinkedIn—
la responsable es ST Labs. Si a un cliente se le ocurre raspar a lo bestia, la
cuenta que se suspende es la de todos. Con claves propias por empresa, ese
riesgo era de cada uno; ahora no.

**Y aparece el riesgo de cobranza**, que no existía: la plataforma paga primero
y cobra después.

**Números reales, para que el precio no salga de la intuición** (están en
`sources/catalog.ts`, son lo que se paga hoy):

| Acción | Costo real |
|---|---|
| Búsqueda en Google Maps | US$ 0,04 por consulta (hasta 20 negocios cada una) |
| Búsqueda en LinkedIn | US$ 0,004 por perfil |
| Búsqueda en Instagram | US$ 0,0026 por perfil |
| Enriquecer con Instagram | US$ 0,0003 por perfil |
| Mensaje con Turbo | centavos, según el modelo elegido |

Una búsqueda típica de 25 leads en LinkedIn cuesta unos **10 centavos**. El
margen se define sobre eso.

**Lo que ya está construido y se reusa** —esto abarata bastante el Sprint 4—:
la estimación de costo antes de gastar, el freno de presupuesto (`budget.ts`),
el tope por corrida (US$ 1) y el registro de cada solicitud con su costo real
(`prospect_request_log`), que es de donde salen los números por empresa.

### 1b. Las tres que abre la decisión anterior

Van juntas porque son la misma conversación:

- **¿Prepago o pospago?** **Recomendación: prepago.** El cliente compra créditos
  y gasta contra ese saldo. Elimina la cobranza —no se puede gastar lo que no se
  pagó— y es lo único que evita que un cliente deba plata ya gastada en Apify.
- **¿Qué es un crédito?** **Recomendación: un crédito = una acción que cuesta**,
  con precio distinto por acción (buscar, enriquecer, escribir un mensaje), y no
  un equivalente en dólares. Es más fácil de explicar —"te quedan 400
  búsquedas"— y permite cambiar de proveedor sin cambiarle el precio al cliente.
- **¿Qué pasa cuando se acaban?** **Recomendación: frena y avisa antes**, con la
  misma lógica que ya existe. Nunca "seguí usando y después te cobro".

### 2. ¿Dónde vive el panel nuevo? → ✅ **SECCIÓN APARTE, EN OTRO SUBDOMINIO** (decidido 2026-09-06)

Algo como `admin.<dominio>` para la administración de la plataforma, y el
dominio de siempre para el panel de trabajo de cada empresa.

**Cómo se hace, y por qué así**: **una sola aplicación Next con dos dominios
apuntando**, y el `proxy.ts` —que ya existe y ya decide qué es público y qué
no— reescribiendo por *hostname*: si el pedido entra por `admin.<dominio>`, va a
`/plataforma/*`; si entra por el dominio normal, al panel de siempre. Next tiene
guía propia para esto y el proxy soporta reescribir según el host.

La alternativa era **dos aplicaciones y dos despliegues**. Se descarta por
ahora: duplica configuración, variables de entorno y builds, y obliga a un
paquete compartido para no repetir tipos y componentes — el mismo problema que
ya se paga con el `Channel` duplicado entre web y mobile. Como todo el código
del panel nuevo vive bajo `/plataforma`, separarlo después es mover una carpeta.

⚠️ **Un subdominio distinto NO es una barrera de seguridad por sí solo.** Lo que
impide que un cliente entre a la administración es el **rol** y el **RLS**, no
la dirección: si alguien escribe la URL del panel de plataforma en el dominio
normal, tiene que rebotar igual. El subdominio suma orden y reduce superficie
—un problema en el panel del cliente no toca las pantallas de administración—,
pero la puerta la sigue cerrando el permiso.

**Lo que hay que decidir cuando se construya**: si entrar al panel de
administración exige **iniciar sesión de nuevo**. Las cookies son por dominio,
así que por defecto sí. Se puede compartir la sesión entre subdominios, pero
para un panel que administra a todos los clientes, **volver a entrar es lo
sano** y es gratis.

### 3. ¿Qué pasa con los datos de hoy?

Hay **163 leads reales** y su historial. La instalación actual se convierte en
**la primera empresa** y todo lo existente queda adentro. No se empieza de cero.

### 4. ¿Un usuario puede estar en dos empresas?

Para el primer paso, **no**: un usuario pertenece a una empresa. Es más simple y
alcanza. Permitirlo después obliga a un "elegir empresa" al entrar y a que todo
consulte "en cuál está parado ahora" — un cambio grande que no se necesita hoy.

### 5. ¿Qué ve ST Labs de sus clientes?

Como administrador de la plataforma se pueden ver **las empresas y sus
usuarios**. La pregunta es si se ven **los leads de cada empresa**.

**Recomendación**: no por defecto. Poder mirar los datos de un cliente es una
promesa incómoda de sostener. Si hace falta para dar soporte, que sea un acceso
explícito y que quede registrado.

---

## Sprint 1 · La empresa existe y aísla de verdad

**Qué entrega**: nada visible. Todo sigue funcionando igual, pero por debajo
cada dato pertenece a una empresa y **las reglas impiden cruzar**.

**Por qué va primero y solo**: es lo único que no se puede hacer a medias. Si el
aislamiento tiene un agujero, se descubre cuando un cliente ve los leads de
otro, y eso no se arregla con un parche. Se hace y se verifica **antes** de
construir pantallas encima.

Qué toca:

- Tabla `companies` y `company_id` en las 13 tablas con datos.
- **Las 47 políticas suman la dimensión empresa.** Es el grueso del trabajo.
- `app_settings` deja de ser clave-valor global: pasa a ser por empresa.
- Los secretos por empresa (según la decisión 1).
- Migración de los datos actuales a la primera empresa.
- Aislar el Storage: los adjuntos y avatares de una empresa no se ven desde otra.

**Cómo se verifica** —y esto no es opcional—: un test que, con dos empresas
cargadas y **datos reales restaurados del backup**, compruebe tabla por tabla
que un usuario de la empresa A no lee, no escribe y no borra nada de la B.
Ejecutando, no leyendo las políticas.

## Sprint 2 · El panel de plataforma y la invitación

**Qué entrega**: ST Labs puede **crear una empresa y su primer usuario** desde
una pantalla, y esa persona entra con un link.

Qué toca:

- Rol nuevo de plataforma, separado del administrador de una empresa.
- Sección `/plataforma`: listar empresas, crear una, ver su usuario, suspenderla.
- **El subdominio** (D76): `admin.<dominio>` apuntando a la misma aplicación, y
  el `proxy.ts` reescribiendo por hostname. Más el rebote si alguien llega a
  esas pantallas por el dominio normal — el subdominio ordena, el rol es el que
  cierra la puerta.
- Alta del usuario único de la empresa, con **invitación por link o mail**
  —reusando lo que ya existe: `invite_member` y la Edge Function `invite-user`.

Con esto ya está **lo que el usuario pidió como primer paso**: muchas empresas,
un usuario cada una, invitado por link o correo.

## Sprint 3 · La configuración se muda

**Qué entrega**: cada empresa configura lo suyo desde el panel nuevo, y lo que
es de la plataforma deja de estar mezclado con lo que es de cada cliente.

Qué toca:

- Separar los ajustes en dos grupos: los de la empresa (ofertas, agenda,
  WhatsApp, permisos) y los de la plataforma.
- Mover la pantalla de Configuración al panel nuevo.
- Las claves de servicios, por empresa (decisión 1).

**Por qué después y no antes**: mudar una pantalla es fácil; lo difícil es que
los ajustes sean por empresa, y eso depende del Sprint 1.

## Sprint 5 · Varios usuarios y roles

**Qué entrega**: una empresa invita a su equipo. Administrador y vendedor,
que es lo que hoy ya existe pero ahora **dentro** de cada empresa.

Qué toca: la matriz de permisos pasa a ser por empresa, y la invitación la hace
el administrador del cliente en vez de ST Labs.

**Buena noticia**: los roles y la matriz **ya están construidos** (`sections.ts`,
`role_permissions`). Acá se les agrega la dimensión empresa, no se inventan.

## Sprint 4 · Créditos de uso  ⬅️ **subió de lugar**

Estaba último y pasó acá por la decisión 1: si la plataforma paga las
herramientas, **no se puede abrir el sistema a un cliente sin medir y frenar**.
El primer cliente que busque de más gasta plata de ST Labs.

**Qué entrega**: cada empresa tiene saldo, cada acción que cuesta lo descuenta,
y cuando se acaba el sistema frena y avisa **antes**.

**Dos frenos, no uno**:
1. **Por empresa**: sus créditos.
2. **De la plataforma**: que ninguna empresa se coma la capacidad de Apify del
   resto. Es la lección de OPS-2 aplicada a muchos clientes.

**Lo que ya existe y se reusa**: la estimación previa, el freno (`budget.ts`),
el tope por corrida y el costo real por solicitud en `prospect_request_log`.
Falta atarlo a una empresa y a un saldo.

## Sprint 6 · Stripe

**Qué entrega**: la empresa paga sola. Suscripción y **recarga de créditos**,
que con la decisión 1 dejó de ser opcional.

Qué toca: productos y precios en Stripe, checkout, y el **webhook** que activa o
suspende la empresa según el pago. Lo delicado no es cobrar: es qué pasa cuando
un pago falla —cuánto se tolera antes de cortar, y qué ve el cliente mientras
tanto.

---

## Riesgos, ordenados por lo que cuesta cada uno

1. **Una empresa ve datos de otra.** Es el peor y por eso el Sprint 1 va primero
   y se verifica ejecutando. Con 47 políticas, alcanza con que una quede sin la
   condición de empresa.
2. **Un ajuste global que quedó global.** `app_settings` es clave-valor: si una
   clave se olvida, una empresa le cambia la configuración a todas. Se busca
   caso por caso, no de memoria.
3. **El costo de mantener dos formas de instalar.** Mientras existan clientes
   con su propia instalación (D2) y clientes en la plataforma, cada cambio hay
   que pensarlo dos veces. Conviene decidir si el modelo viejo se discontinúa.
4. **Las claves compartidas** (ahora seguro, por la decisión 1). El tope de
   Apify es un límite **de todos los clientes juntos**: uno solo puede dejar sin
   servicio al resto, y ya pasó con el plan gratis (OPS-2). Se mitiga con el
   freno de plataforma del Sprint 4 y con un plan de Apify que escale con la
   cantidad de clientes.
5. **La responsabilidad ante los proveedores es de ST Labs.** Las búsquedas las
   hace su cuenta en nombre de terceros: si un cliente abusa, la cuenta que se
   suspende es la que usan todos. Conviene un tope por empresa desde el día uno,
   aunque sobre saldo.
6. **La plataforma paga primero y cobra después.** Se resuelve con créditos
   prepagos: no se puede gastar lo que no se pagó.

## Lo que conviene tener a mano antes de empezar

- **Un backup verificado** (ya existe: `BACKUPS.md`). El Sprint 1 toca las 13
  tablas.
- **La `0053`…`0055` aplicadas**, que ya lo están.
- Decidir si el sistema sigue vendiéndose también como instalación propia.
