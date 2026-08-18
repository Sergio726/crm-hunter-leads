# Identidad visual y gráfica

La identidad visual de Hunter Leads no vive dentro de este repositorio de producto.
Para diseñar o modificar cualquier pantalla web, móvil, componente, ilustración,
logo o interacción visual, la fuente de referencia es el repositorio hermano:

- **Repositorio**: <https://github.com/Sergio726/crm-hunter-leads-brand>
- **Copia local** (máquina de Sergio): `C:\Project\Project\crm-hunter-leads-brand`

Cloná el repositorio si trabajás desde otra máquina — la ruta local de arriba no
existe fuera de ese equipo:

```
git clone https://github.com/Sergio726/crm-hunter-leads-brand.git
```

Manual principal:

- `identity-manual.html` — abrir directamente en el navegador.
- `assets/st-labs-logo-dark.png` — logotipo ST Labs sobre fondo oscuro.
- `assets/st-labs-logo-light.png` — logotipo ST Labs sobre fondo claro.
- `assets/st-labs-isotype-dark.png` — isotipo geométrico para espacios compactos.
- `assets/st-labs-mark.svg` — marca conceptual auxiliar.
- `assets/turbo-avatar.png` — avatar principal de Turbo.
- `assets/turbo-mark.svg` — marca compacta de Turbo.

## Dirección resumida

- ST Labs: negro `#070908`, blanco verdoso `#F2FFF9` y verde eléctrico
  `#02FFC4`.
- Consolas: títulos, labels, estados, cifras y señales técnicas.
- Geist/system: párrafos, formularios y textos de lectura prolongada.
- Lenguaje: terminal, grilla fina, `/`, `.`, brackets y puntos como señales,
  no como decoración constante.
- Turbo: copiloto claro, útil, curioso y optimista. Habla simple, propone,
  explica el porqué y deja el control en manos del vendedor.

## Nomenclatura (D23) — leer antes de escribir cualquier texto

| Nombre | Qué es | Dónde aparece |
|---|---|---|
| **Hunter Leads** | El producto. Es lo que ve y nombra el usuario. | Título del navegador, logo, login, emails, nombre de la app en el celular |
| **Turbo** | El agente de IA que lo potencia. | Prospección: chat, sidebar, textos del asistente |
| **ST Labs** | La casa que lo hace. | Al pie, como firma. Nunca compitiendo con el producto |

Frase corta de referencia: **«Hunter Leads, potenciado por Turbo»**.

⚠️ **"CRM Lite" es el nombre viejo: no usarlo en texto nuevo.** Si aparece en el
código es porque es un **identificador técnico**, no una marca, y esos **no se
tocan**:

- `x-crm-lite-webhook-secret` y los tags `crm-lite:` — contrato con n8n y GHL.
- `slug` y `scheme` de Expo (`crm-lite`, `crmlite://`) — identifican el proyecto
  en EAS y el deep link ya registrado en Google OAuth.
- `crm-lite:clientes-view` en localStorage — renombrarla le resetea a cada
  usuario su preferencia de tabla o tablero.
- El nombre de la credencial "CRM Lite Webhook Secret" en n8n.

## Cómo está implementada en el producto (BRAND-2, 2026-08-14)

La identidad ya está aplicada en web y mobile. Antes de tocar colores o
tipografía, editá **los tokens**, no los componentes:

| Dónde | Qué controla |
|---|---|
| `web/src/app/globals.css` | Paleta completa (claro y oscuro), radios, `--font-mono`, y las utilidades `.eyebrow`, `.metric`, `.brand-grid`, `.turbo-glow`. Cambiar un token acá se propaga a todo el panel. |
| `mobile/src/ui.ts` | Misma paleta para la app, más `onPrimary`, `overlay` y la fuente `mono` por plataforma. |
| `web/src/components/brand/Logo.tsx` | Lockup ST Labs, con variante automática por tema. |
| `web/src/components/brand/TurboAvatar.tsx` | Identidad de Turbo: `TurboMark`, `TurboGlyph`, `TurboPortrait`, `TurboFace`. |
| `web/src/app/icon.svg` | Favicon: isotipo ST Labs reconstruido en vectores. |

Tres reglas que no son obvias leyendo solo el manual:

1. **El verde no se usa como color de texto sobre fondo claro** — no contrasta.
   Para eso está `--primary-deep` (`#08785F`). En oscuro ese token es un mint
   apagado (`oklch(0.82 0.13 168)`), no el eléctrico: leer en flúor cansa.
   Ver D20 y D24.
2. **El verde de marca es acción; los colores de estado son otra familia.** El
   verde de "Ganado" está corrido de hue a propósito para no competir con él
   (D21).
3. **Consolas es para señal técnica** — títulos, cifras, rótulos, encabezados de
   tabla. Nunca para párrafos: eso es Geist. `h4` quedó en sans porque es el
   nombre del cliente, texto de lectura.
4. **Presupuesto de mint en oscuro (BRAND-3).** El 90% de la pantalla es tinta,
   obsidiana y gris. El eléctrico queda para botón primario, barra de progreso,
   anillo de foco y Turbo. Bordes, sidebar activo, avatares y toggles van
   neutros. El mint-soft al 18% en cada divisor se retiró: teñía toda la UI.
5. **Badge = excepción o decisión.** Vencido, sin asignar, duplicado, nunca
   ingresó: sí. Estado, origen, rol, tags: texto o punto de color. Máximo una
   pastilla de color por fila. El menú solo muestra vencidos, no pendientes
   (pendiente es el estado normal de un CRM).
6. **Turbo es copiloto, no un contacto de WhatsApp.** Retrato 3D en el
   encabezado y en el primer mensaje del grupo. El SVG compacto queda para el
   sidebar. Turbo habla sin burbuja; el vendedor, en superficie neutra. Las
   sugerencias viven bajo el mensaje de Turbo. Enter envía; Shift+Enter baja
   de línea. Ver D36.

Los **dominios** `*.moremigracion.com` que quedan en la documentación y en las
plantillas de email son infraestructura (el servidor donde está desplegada la
web), no marca. No se tocan hasta que se migre el dominio.

El manual corporativo original que orientó esta identidad está en:

`G:\Mi unidad\S&TLABS\DISEÑO GRAFICO\ST LABS\ST LABS (1)\ST LABS\Manual de Marca ST LABS.pdf`

El PDF original no se copia al repositorio del producto ni deben copiarse aquí
los assets del repositorio de identidad. Este archivo es la única referencia
visual que debe quedar en `crm-hunter-leads`.
