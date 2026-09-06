# Hunter Leads — asistente de LinkedIn

Extensión de Chrome que, parado en el perfil de LinkedIn de un lead, te muestra
el mensaje que Turbo escribió para él en el CRM, te lo pega en el chat, y al
avisar que lo mandaste **lo registra en el CRM** (queda en el historial, el lead
pasa a Contactado y se programa el seguimiento).

**Lo que no hace, y es lo importante: nunca aprieta "Enviar".** Eso lo hacés
vos, mirando el mensaje. Es lo que mantiene el riesgo con LinkedIn en el mínimo
posible y lo que garantiza que una persona lea lo que escribió Turbo antes de
que salga.

## Instalar (modo desarrollador)

No hace falta la tienda de Chrome. Cinco pasos, una vez por computadora:

1. Bajá esta carpeta (`extension/`) a tu máquina. Si tenés el repo, ya está.
2. Abrí Chrome y entrá a `chrome://extensions`.
3. Activá **Modo de desarrollador** (arriba a la derecha).
4. Tocá **Cargar descomprimida** y elegí la carpeta `extension/`.
5. Aparece "Hunter Leads — asistente de LinkedIn". Fijala en la barra si querés
   (ícono de la pieza de rompecabezas → pin).

Chrome puede mostrar un aviso al arrancar sobre extensiones en modo
desarrollador. Es normal y no afecta nada.

## Conectarla con el CRM

1. En el CRM, andá a **Mi perfil → Extensión de Chrome** y tocá **Generar
   token**. Ponele un nombre ("Chrome de la notebook") para reconocerlo.
2. Copialo. **Se muestra una sola vez**: si lo perdés, generás otro.
3. Hacé clic en el ícono de la extensión, pegá el token y tocá **Guardar y
   probar**. Tiene que decir *"Conectado como &lt;tu nombre&gt;"*.

Si el CRM no está en `crm-hunter-leads.vercel.app`, cambiá la dirección en esa
misma ventanita antes de guardar. Chrome te va a pedir permiso para ese sitio
una vez.

## Usar

1. En el CRM, abrí la ficha de un lead que tenga LinkedIn y generá el mensaje
   con **Escribir el mensaje con Turbo**, canal LinkedIn. Con eso queda listo
   como *pendiente*.
2. Tocá el botón de **LinkedIn** de la ficha: te abre el perfil.
3. Abajo a la derecha aparece el panel con el mensaje. Tocá **Enviar mensaje**
   en LinkedIn para abrir el chat, y en el panel **Pegar en el chat**.
4. Leelo. Si está bien, apretá **Enviar** en LinkedIn.
5. En el panel, **Ya lo mandé**. Con eso queda registrado en el CRM.

Si el perfil abierto no tiene mensaje pendiente, el panel no molesta: a lo sumo
te dice cuántos hay esperando en otros perfiles.

## Si algo no anda

| Pasa | Qué es |
|---|---|
| *"Falta el token"* | No lo pegaste todavía, o Chrome no sincronizó. Ícono de la extensión → pegar → Guardar. |
| *"Token inválido o revocado"* | Lo revocaste desde Mi perfil, o pegaste otro. Generá uno nuevo. |
| *"El servidor no tiene SUPABASE_SERVICE_ROLE_KEY"* | Es configuración del servidor, no tuya: falta esa variable en Vercel. |
| **Pegar en el chat** no escribe nada | LinkedIn cambió su página. Usá **Copiar** y pegalo a mano: funciona igual, solo con un paso más. |
| El panel no aparece | ¿Estás en `linkedin.com/in/…`? Solo corre en perfiles de personas. Recargá la página. |

## Actualizar

En modo desarrollador las actualizaciones son a mano: reemplazá la carpeta y en
`chrome://extensions` tocá el ícono de **recargar** de la extensión.

## Lo que conviene saber antes de usarla mucho

- **LinkedIn no permite extensiones que automaticen su sitio.** Esta no
  automatiza —el envío lo hacés vos—, pero una extensión deja huella en tu
  sesión. Que sea asistida baja mucho el riesgo de restricción; no lo lleva a
  cero.
- **Arrancá de a pocos por día** y con cadencia irregular. Lo que dispara la
  detección es el patrón, no solo el volumen.
- **No la uses con tu cuenta principal de LinkedIn hasta que la hayas probado.**

Más contexto en `docs/PLAN-ENVIO-LINKEDIN.md`.
