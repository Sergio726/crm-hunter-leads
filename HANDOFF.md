# HANDOFF — crm-hunter-leads

> Cómo retomar el trabajo acá. Si es tu primera sesión en este proyecto —seas
> persona o agente— empezá por este archivo.

## Los archivos que definen el estado

| Archivo | Para qué |
|---|---|
| `CLAUDE.md` | Reglas, stack y modo de trabajo |
| `docs/BACKLOG.md` | Qué construir — fuente de verdad |
| `docs/STATE.md` | Bitácora de lo que se fue haciendo |
| `docs/DECISIONS.md` | Decisiones tomadas y su porqué |
| `HANDOFF.md` | Este archivo — protocolo de continuidad |

## Al empezar una sesión

Leé en este orden, antes de escribir una línea de código:

1. **`CLAUDE.md`** — reglas, stack, convenciones y modo de trabajo
2. **`docs/STATE.md`** — qué se hizo, qué problemas hubo, dónde quedó
3. **`docs/BACKLOG.md`** — la primera tarea pendiente es tu objetivo

Después, antes de arrancar, decí en voz alta: qué tarea vas a encarar, qué
archivos pensás tocar, y si hay algo ambiguo que necesites aclarar.

No rehagas lo que ya está marcado como hecho. No cambies la arquitectura sin
consultar.

## Al cerrar una sesión

En Claude Code alcanza con `/handoff`: reúne los cambios, actualiza la bitácora y
deja escrito el próximo paso.

A mano, el mínimo es actualizar `docs/STATE.md` con qué se hizo, qué se
intentó sin éxito, y en qué estado quedó cada cosa.

**Nunca cierres con una tarea a medias y sin registro.** O se termina, o se
documenta exactamente dónde quedó y qué falta.

## Prompts útiles

**Bug urgente, sin perder el hilo del plan:**

```
Antes de seguir con docs/BACKLOG.md, hay algo urgente:
BUG: [una línea]
Dónde: [archivo o pantalla]
Cómo se reproduce: [pasos]
Al terminar, documentalo en docs/STATE.md y volvé al orden normal.
```

**Agregar una tarea sin desviar la actual:**

```
Agregá esta tarea a docs/BACKLOG.md en la prioridad que corresponda,
sin tocar las existentes:
- [ ] [descripción]
      Listo cuando: [criterio]
No la encares todavía.
```

## Entre herramientas

Claude Code, Cursor y Codex leen los mismos archivos. Claude Code conviene para
tareas multi-archivo y decisiones de arquitectura; Cursor para cambios acotados.
Las reglas de `.cursor/rules/` mantienen a Cursor con el mismo criterio.
