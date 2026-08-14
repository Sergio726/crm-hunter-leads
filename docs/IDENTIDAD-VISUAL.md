# Identidad visual y gráfica

La identidad visual de CRM Lite no vive dentro de este repositorio de producto.
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

## Cómo está implementada en el producto (BRAND-2, 2026-08-14)

La identidad ya está aplicada en web y mobile. Antes de tocar colores o
tipografía, editá **los tokens**, no los componentes:

| Dónde | Qué controla |
|---|---|
| `web/src/app/globals.css` | Paleta completa (claro y oscuro), radios, `--font-mono`, y las utilidades `.eyebrow`, `.metric`, `.brand-grid`, `.turbo-glow`. Cambiar un token acá se propaga a todo el panel. |
| `mobile/src/ui.ts` | Misma paleta para la app, más `onPrimary`, `overlay` y la fuente `mono` por plataforma. |
| `web/src/components/brand/Logo.tsx` | Lockup ST Labs, con variante automática por tema. |
| `web/src/components/brand/TurboAvatar.tsx` | Identidad de Turbo: `TurboMark`, `TurboGlyph`, `TurboPortrait`. |
| `web/src/app/icon.svg` | Favicon: isotipo ST Labs reconstruido en vectores. |

Tres reglas que no son obvias leyendo solo el manual:

1. **El verde no se usa como color de texto sobre fondo claro** — no contrasta.
   Para eso está `--primary-deep` (`#08785F`), que en modo oscuro vuelve a ser
   el mint pleno. Ver D20 en `DECISIONS.md`.
2. **El verde de marca es acción; los colores de estado son otra familia.** El
   verde de "Ganado" está corrido de hue a propósito para no competir con él
   (D21).
3. **Consolas es para señal técnica** — títulos, cifras, rótulos, encabezados de
   tabla. Nunca para párrafos: eso es Geist. `h4` quedó en sans porque es el
   nombre del cliente, texto de lectura.

Los **dominios** `*.moremigracion.com` que quedan en la documentación y en las
plantillas de email son infraestructura (el servidor donde está desplegada la
web), no marca. No se tocan hasta que se migre el dominio.

El manual corporativo original que orientó esta identidad está en:

`G:\Mi unidad\S&TLABS\DISEÑO GRAFICO\ST LABS\ST LABS (1)\ST LABS\Manual de Marca ST LABS.pdf`

El PDF original no se copia al repositorio del producto ni deben copiarse aquí
los assets del repositorio de identidad. Este archivo es la única referencia
visual que debe quedar en `crm-hunter-leads`.
