---
name: handoff
description: Prepara el proyecto para trabajo autónomo con agentes, o deja el estado listo para que otro agente lo retome. Usar al cerrar una sesión, al pausar el trabajo, o la primera vez que se abre un proyecto sin archivos de coordinación. Se activa con /handoff o cuando el usuario diga "handoff", "dejá el estado", "cerrá la sesión", "retomá" o "en qué quedamos".
---

# Handoff

Una sola skill con dos modos. **Primero determiná en cuál estás**, porque el
trabajo es distinto.

## Cómo decidir el modo

Buscá en el proyecto los archivos de coordinación. Los nombres varían: el rol
importa más que el nombre exacto.

| Rol | Nombres habituales |
|---|---|
| Reglas | `CLAUDE.md`, `AGENTS.md` |
| Qué construir | `docs/BACKLOG.md`, `SPEC.md`, `BACKLOG.md`, `TASKS.md` |
| Bitácora | `docs/STATE.md`, `PROGRESS.md`, `STATE.md` |

- **Falta el de reglas o el de bitácora** → modo **onboarding**
- **Están los dos** → modo **handoff**

Si hay dudas, preguntá antes de crear archivos: duplicar un tablero que ya existe
con otro nombre es peor que no hacer nada, porque deja dos fuentes de verdad que
se contradicen a la semana.

---

## Modo onboarding — el proyecto todavía no tiene frame

El objetivo es que al terminar exista un andamiaje **con contenido real**, no una
plantilla con mayúsculas para completar.

1. **Explorá el proyecto de verdad.** `package.json` (dependencias y scripts
   reales), configuración, estructura de carpetas, y una muestra del código para
   entender los patrones que ya se usan. Si es un repo git, mirá también el
   historial reciente: dice en qué se estuvo trabajando.

2. **Escribí el archivo de reglas** con lo que encontraste: stack real, comandos
   reales sacados de los scripts (no inventados), estructura real, y las
   convenciones que se deducen del código existente. Si algo no lo podés
   determinar, dejalo marcado como pendiente en vez de rellenarlo con una
   suposición.

3. **Escribí el archivo de tareas poblado**, no vacío:
   - *Hecho*: lo que ya funciona
   - *Pendiente*: los `TODO`/`FIXME` del código, funcionalidad a medias, lo que
     el README promete y no está
   - Cada tarea con su criterio de "listo"

4. **Escribí la bitácora** con una primera entrada que describa el estado actual.

5. **Reportá** qué archivos creaste y cuál sería la primera tarea a encarar.

No inventes tareas que nadie pidió. Si el proyecto está sano y no hay pendientes
claros, decilo: un archivo de tareas honesto y corto es mejor que uno inflado.

---

## Modo handoff — dejar el estado listo para el que sigue

El propósito es que otro agente, con el contexto en cero, pueda continuar sin
volver a descubrir lo que vos ya descubriste.

1. **Leé el estado actual** antes de escribir: la bitácora y las tareas.

2. **Reuní evidencia real** en vez de escribir de memoria:
   - `git status` — qué quedó sin commitear
   - `git log --oneline -15` — qué se hizo
   - `git diff --stat` — alcance de lo que está en curso

3. **Actualizá la bitácora** con una entrada nueva:
   - **Qué se hizo**, en concreto
   - **Archivos tocados**
   - **Qué se intentó y no funcionó** — esto es lo más valioso del registro.
     Sin eso, el próximo repite los mismos callejones sin salida.
   - **Qué se verificó**: qué comando corriste y qué dio. Si no verificaste,
     decilo; no lo des por hecho.
   - **Estado**: ✅ completo · ⚠️ bloqueado (con el motivo) · 🔄 en progreso
     (con el punto exacto donde quedó)

4. **Actualizá las tareas**: marcá lo terminado. Si algo quedó a medias, no lo
   marques — anotá en la bitácora dónde quedó.

5. **Dejá escrito el próximo paso**, concreto y accionable. "Seguir con el
   módulo" no sirve; "correr la migración 0031 y verificar que el trigger no
   dispare en INSERT" sí.

6. **Si hubo una decisión de arquitectura**, registrala con su motivo en el
   archivo de decisiones, si el proyecto tiene uno.

### Antes de cerrar, revisá

- ¿Queda algo a medias sin documentar? Documentalo o terminalo.
- ¿Hay cambios sin commitear? Decilo explícitamente.
- ¿Prometiste algo que no hiciste? Corregilo ahora, no lo dejes escrito como hecho.

---

## Regla que vale para los dos modos

**No marques nada como terminado sin haber corrido las verificaciones del
proyecto.** Si no las pudiste correr, escribí que no se verificó. Un registro
optimista es peor que no tener registro: manda al que sigue a construir sobre
algo que nadie comprobó.
