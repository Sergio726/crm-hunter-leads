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

### 1. ¿Quién paga las herramientas: la empresa o la plataforma?

Es **la decisión más importante**, porque define si los créditos existen.

- **Cada empresa pone sus claves** (Apify, OpenRouter, Google): cada una paga lo
  suyo, la plataforma no adelanta plata, y **los créditos no hacen falta**.
  Stripe cobraría solo la suscripción al software.
- **La plataforma pone las claves** y revende el uso: ahí sí hacen falta
  créditos, medición por empresa y freno cuando se acaban. Es más trabajo y hay
  riesgo de que un cliente gaste y no pague, pero es un producto más fácil de
  vender: el cliente no crea cuentas en cuatro servicios.

**Recomendación**: empezar por *cada empresa pone sus claves* y dejar los
créditos para cuando haya clientes reales pidiendo lo otro. Ojo que esto **no**
posterga Stripe: la suscripción se puede cobrar igual.

### 2. ¿El panel nuevo es otra aplicación o una sección de la actual?

- **Sección del panel actual** (`/plataforma`, visible solo para ST Labs):
  reusa login, componentes y despliegue. Más rápido y más barato.
- **Aplicación aparte** (`admin/` en el mismo repo, otro despliegue): separación
  total, hasta de dominio.

**Recomendación**: sección del panel actual con un rol nuevo. La separación que
importa —que un cliente no vea la administración de la plataforma— la da el rol,
no un despliegue distinto. Si más adelante conviene separarla, ya va a estar
aislada por sección.

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

## Sprint 4 · Varios usuarios y roles

**Qué entrega**: una empresa invita a su equipo. Administrador y vendedor,
que es lo que hoy ya existe pero ahora **dentro** de cada empresa.

Qué toca: la matriz de permisos pasa a ser por empresa, y la invitación la hace
el administrador del cliente en vez de ST Labs.

**Buena noticia**: los roles y la matriz **ya están construidos** (`sections.ts`,
`role_permissions`). Acá se les agrega la dimensión empresa, no se inventan.

## Sprint 5 · Créditos de uso

Solo si la decisión 1 fue *la plataforma pone las claves*.

**Qué entrega**: cada empresa tiene un saldo, cada búsqueda o mensaje lo
descuenta, y cuando se acaba el sistema frena y avisa.

**Lo que ya existe y se reusa**: el freno de presupuesto (`budget.ts`), la
estimación de costo antes de gastar y el registro de cada solicitud con su costo
(`prospect_request_log`) — que es justamente de dónde salen los números.

## Sprint 6 · Stripe

**Qué entrega**: la empresa paga sola. Suscripción y, si hay créditos, recarga.

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
4. **Las claves compartidas.** Si la plataforma pone las suyas, el tope de
   corridas de Apify pasa a ser un límite **de todos los clientes juntos**: uno
   solo puede dejar sin servicio al resto. Ya pasó con el plan gratis (OPS-2).

## Lo que conviene tener a mano antes de empezar

- **Un backup verificado** (ya existe: `BACKUPS.md`). El Sprint 1 toca las 13
  tablas.
- **La `0053`…`0055` aplicadas**, que ya lo están.
- Decidir si el sistema sigue vendiéndose también como instalación propia.
