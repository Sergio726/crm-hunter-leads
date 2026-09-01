# 💾 BACKUPS — Bajar una copia y probar que sirve

> Un backup que nadie restauró no es un backup. Este documento es el
> procedimiento para tener las dos mitades: la copia, y la prueba de que se
> puede volver desde ella.

_Última actualización: **2026-08-31** (TRV-3)._

---

## 📌 En una línea

Hay dos scripts: uno baja la copia (`hacer-backup.ps1`) y otro la restaura en un
Postgres descartable y comprueba que volvió entera (`verificar-restauracion.ps1`).
**El 2026-08-31 se corrió el circuito completo contra la base de producción y
pasó**: se bajó una copia de 0,47 MB con los 163 clientes y los 188 prospectos
reales, se restauró en limpio y las 12 tablas volvieron con el número exacto de
filas, las políticas de seguridad incluidas.

## ⚠️ Lo que hay que entender antes

**Supabase hace backups automáticos, pero eso no es lo mismo que estar cubierto.**
Tres cosas que conviene saber:

1. **Cuántos días guarda depende del plan.** En el plan gratuito los backups
   diarios pueden no existir o retenerse muy poco. Hay que mirarlo en el panel
   del proyecto → *Database* → *Backups*. **Este dato no se pudo verificar desde
   acá** (ver más abajo, "Lo que falta").
2. **Un backup en el panel no se puede inspeccionar.** Se restaura sobre el
   proyecto o no se hace nada. No hay forma de abrirlo y mirar si está completo
   sin arriesgar la base viva.
3. **Nadie probó restaurar uno.** Ése era el estado antes de esta tarea, y es el
   agujero que estos scripts tapan: una copia propia, en un archivo, que se
   puede restaurar cuantas veces haga falta sin tocar producción.

---

## 🔁 El procedimiento

### 1. Pegar la contraseña, una sola vez

La línea ya está esperando en **`web/.env.local`**, vacía:

```
HUNTER_LEADS_DB_URL=
```

Lo que va después del `=` se copia del panel de Supabase →
**Project Settings → Database → Connection string → URI**. Es una línea larga
que empieza con `postgresql://` y **trae la contraseña adentro**.

Ese archivo no se commitea nunca (está en `.gitignore`), así que la contraseña
queda solo en esta máquina. Es el mismo lugar donde ya viven las otras claves
del proyecto.

> **Por qué la tenés que pegar vos**: la contraseña de la base no está guardada
> en ningún lado al que llegue un agente. No es una restricción de permisos, es
> que el dato no existe en el repo ni en la máquina.

### 2. Bajar la copia

```powershell
.\scripts\backup\hacer-backup.ps1
```

No hace falta pasarle nada: busca la cadena en `web/.env.local` solo. Si falta
o quedó el texto de ejemplo, lo dice y no hace nada.

Deja dos archivos en `..\backups-hunter-leads\` — **fuera del repo**, porque son
datos de clientes reales y no tienen que poder terminar en un commit:

| Archivo | Qué es |
|---|---|
| `hunter-leads-<fecha>.dump` | La copia (formato custom de `pg_dump`) |
| `hunter-leads-<fecha>.conteos` | Cuántas filas tenía cada tabla en ese momento |

El archivo de conteos es la mitad que suele faltar. Sin él, lo único que se
puede decir después de restaurar es "no dio error". Con él se puede comparar
tabla por tabla contra lo que había.

### 3. Probar que se puede volver

```powershell
.\scripts\backup\verificar-restauracion.ps1 -Dump "..\backups-hunter-leads\hunter-leads-20260831-0512.dump"
```

Levanta un Postgres en Docker, restaura ahí, comprueba y borra el contenedor.
**No toca producción en ningún momento.** Lo que comprueba:

- que `pg_restore` termine sin un solo error (`--exit-on-error`);
- que vuelvan las tablas, las funciones, los triggers y **las políticas RLS**;
- que el aislamiento **funcione**, no que exista: se le pide la lista de
  clientes con un usuario que no es de nadie y tiene que ver **cero**;
- que no falte ninguna fila, comparando contra el `.conteos`.

### 4. Sin la contraseña de la base

```powershell
.\scripts\backup\verificar-restauracion.ps1 -DesdeMigraciones
```

Contesta otra pregunta: *¿el esquema versionado alcanza para levantar la base de
cero?* Aplica las 52 migraciones sobre un Postgres pelado y carga datos
sintéticos. No prueba los datos reales —no los toca— pero sí que el repo, por sí
solo, reconstruye la estructura.

---

## ✅ Qué se probó, y qué dio (2026-08-31)

**Contra la base de producción**, no con un ejemplo:

| Prueba | Resultado |
|---|---|
| `pg_dump` de `hunter-leads` | **0,47 MB**, sin errores |
| `pg_restore` en una base limpia | **sin un solo error** (`--exit-on-error`) |
| Conteos restaurados vs. el momento del backup | **12/12 tablas con el número exacto** |
| Los datos que importan | 163 clientes · 188 prospectos · 126 cambios auditados · 41 notificaciones · 16 interacciones · 4 perfiles |
| Estructura | 12 tablas · 37 políticas RLS · 40 funciones · 17 triggers |
| Aislamiento RLS en la copia restaurada | un uid ajeno ve **0** clientes |

Y **el esquema del repo**, por separado:

| Prueba | Resultado |
|---|---|
| Las 52 migraciones sobre un Postgres pelado | **52/52 sin errores** |
| Estructura reconstruida | 11 tablas · 37 políticas RLS · 40 funciones · 12 triggers |
| Acentos, eñes, comillas y guiones largos | intactos (`Gimnasio "El Ñu" — Sucursal Córdoba`) |
| Arrays de texto y `jsonb` | intactos |
| Aislamiento con datos sintéticos | un uid ajeno ve **0**; la vendedora ve **2** |

Esa segunda tanda usa datos inventados (`scripts/backup/datos-de-prueba.sql`) a
propósito: prueba la cañería sin sacar datos de personas para meterlos en un
banco de pruebas.

### Lo que hubo que resolver para que funcionara

Ninguna de estas cuatro cosas se ve venir, y cada una hace fallar el backup de
una forma que parece otra cosa. Están resueltas dentro de los scripts:

1. **La conexión directa de Supabase es solo IPv6.** `db.<ref>.supabase.co` no
   resuelve a IPv4, y el contenedor de Docker no tiene IPv6: `pg_dump` muere con
   *"Network is unreachable"*, que suena a base caída. La salida es el **pooler**
   (`aws-0-<region>.pooler.supabase.com`, puerto **5432**, usuario
   `postgres.<ref>`). El script prueba las dos puertas y usa la que conteste.
2. **`pg_restore` no puede leer un dump de una versión mayor.** Restaurar con
   Postgres 16 un archivo hecho por `pg_dump` 17 da *"unsupported version (1.16)
   in file header"* — que suena a archivo corrupto y solo quiere decir que el
   que restaura es más viejo. Los dos scripts usan 17.
3. **El dump trae extensiones que solo existen en Supabase** (`pg_net`,
   `supabase_vault`). Se saltean, junto con **todo lo de sus esquemas**: si se
   saltea la extensión pero no su esquema, el restore se corta en el `COPY` de
   una tabla que nadie creó, y queda una copia con los datos cargados **pero sin
   las políticas RLS ni los triggers**, que van al final del archivo. Una copia
   así parece haber funcionado y no tiene seguridad.
4. **El dump reparte permisos a roles internos de Supabase** (`dashboard_user`,
   `pgbouncer`, `supabase_functions_admin`, `supabase_realtime_admin`). El script
   los lee del propio dump y los crea vacíos, en vez de mantener una lista a mano
   que iba a quedar desactualizada.

---

## 🚫 Lo que este backup NO cubre

Hay que tenerlo escrito, porque es lo que va a doler el día que haga falta:

- **Lo que no está en la base.** Las variables de entorno de Vercel
  (`RESEND_API_KEY`, `OPENROUTER_API_KEY`, `APIFY_API_TOKEN`, las de Google) no
  viven en Postgres. Un backup de la base no las trae. Ver
  [`PUESTA-EN-MARCHA.md`](PUESTA-EN-MARCHA.md).
- **Los archivos de Storage.** El `pg_dump` trae la *metadata* de los avatares y
  los adjuntos del seguimiento (`storage.objects`), pero **no los archivos**. Si
  se pierde el proyecto, las filas apuntan a archivos que ya no están.
- **La configuración del proyecto Supabase**: proveedores de login, plantillas
  de email, webhooks de base de datos. Se reconfiguran a mano.
- **Los flujos de n8n** — que además son de otro proyecto; ver **OPS-6** en el
  tablero.

Dos hallazgos del camino que también conviene saber:

- **Las migraciones no reproducen los `grant` de tabla que Supabase da por
  defecto.** Reconstruir con `-DesdeMigraciones` deja las tablas sin `select`
  para `authenticated`; restaurar desde un `pg_dump` de producción sí los trae,
  porque están en la base real. O sea: **el repo no alcanza para levantar un
  clon funcional, el dump sí**.
- **Un backup en JSON no es fiel.** El primer intento exportaba por la API REST
  a JSON y falló con `app_settings`: ahí hay un valor `jsonb` que es el `null`
  de JSON, y JSON no distingue eso de una columna vacía. Al restaurar entraba
  como `NULL` de SQL y violaba el `not null`. `pg_dump` sí distingue. Por eso el
  procedimiento es `pg_dump` y no un export por API.

---

## 📅 Cada cuánto

Mientras la base tenga datos de clientes reales y el uso sea el de hoy —bajo,
pero real— alcanza con:

- **Un backup por semana**, y siempre **antes de aplicar una migración** que
  toque datos.
- **Una verificación por mes**, o después de cualquier migración grande. Correr
  `verificar-restauracion.ps1` cuesta dos minutos y es lo único que distingue un
  backup de un archivo que se supone que es un backup.

---

## ⏳ Lo que falta (necesita al usuario)

1. ~~Correr el circuito contra la base real~~ — **hecho el 2026-08-31**, y pasó.
   La copia quedó en `C:\Project\Project\backups-hunter-leads\`.
2. **Mirar en el panel qué retención de backups da el plan actual** (Database →
   Backups) y anotarlo acá. Desde esta sesión no se pudo: el MCP de Supabase
   quedó autenticado contra otra organización y no ve el proyecto
   `hunter-leads`.
3. **Decidir dónde vive la copia.** Hoy queda en `..\backups-hunter-leads\`, en
   la misma máquina. Un backup que está solo en la máquina que puede fallar es
   medio backup: conviene copiarlo a un disco externo o a la nube.

---

## 🔗 Los archivos

| Archivo | Para qué |
|---|---|
| `scripts/backup/hacer-backup.ps1` | Baja la copia y anota los conteos |
| `scripts/backup/verificar-restauracion.ps1` | Restaura en Docker y comprueba |
| `scripts/backup/roles-supabase.sql` | Los roles que Supabase crea y un Postgres pelado no tiene |
| `scripts/backup/andamio-supabase.sql` | `auth`, `storage` y `pg_net` simulados, para el modo `-DesdeMigraciones` |
| `scripts/backup/restaurar-dump.sh` | Restaura el dump salteando extensiones de Supabase y creando los roles que el dump menciona |
| `scripts/backup/conteos.sql` | Cuenta las filas de cada tabla (el manifiesto del backup) |
| `scripts/backup/aplicar-migraciones.sh` | Aplica las migraciones en orden dentro del contenedor |
| `scripts/backup/datos-de-prueba.sql` | Datos sintéticos para probar el ciclo sin datos reales |
