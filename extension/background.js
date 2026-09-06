// El único que habla con el CRM.
//
// El content script corre adentro de linkedin.com y no puede hacer pedidos a
// otro dominio. Este service worker sí: tiene permiso sobre el host del CRM y
// guarda el token. Así el token nunca vive en la página de LinkedIn.
//
// Recibe mensajes del content script y del popup, y responde con lo que dijo
// el CRM. Nada más: no toca la página, no manda nada.

const URL_POR_DEFECTO = 'https://crm-hunter-leads.vercel.app';

async function configuracion() {
  const { baseUrl, token } = await chrome.storage.sync.get(['baseUrl', 'token']);
  return {
    baseUrl: (baseUrl || URL_POR_DEFECTO).replace(/\/+$/, ''),
    token: token || null,
  };
}

async function pedirAlCrm(ruta, opciones = {}) {
  const { baseUrl, token } = await configuracion();
  if (!token) {
    return { ok: false, status: 0, error: 'Falta el token. Pegalo en la extensión (ícono de la barra).' };
  }
  let respuesta;
  try {
    respuesta = await fetch(baseUrl + ruta, {
      ...opciones,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(opciones.headers || {}),
      },
    });
  } catch (e) {
    return { ok: false, status: 0, error: 'No se pudo llegar al CRM: ' + (e && e.message ? e.message : e) };
  }
  let cuerpo = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    cuerpo = null;
  }
  if (!respuesta.ok) {
    return {
      ok: false,
      status: respuesta.status,
      error: (cuerpo && cuerpo.error) || 'El CRM respondió ' + respuesta.status,
    };
  }
  return { ok: true, status: respuesta.status, data: cuerpo };
}

chrome.runtime.onMessage.addListener((mensaje, _remitente, responder) => {
  (async () => {
    switch (mensaje && mensaje.tipo) {
      case 'ping':
        responder(await pedirAlCrm('/api/extension/ping'));
        return;
      case 'pendientes':
        responder(await pedirAlCrm('/api/extension/pendientes?channel=linkedin'));
        return;
      case 'enviado':
        responder(
          await pedirAlCrm('/api/extension/enviado', {
            method: 'POST',
            body: JSON.stringify({ draftId: mensaje.draftId }),
          }),
        );
        return;
      default:
        responder({ ok: false, status: 0, error: 'Mensaje desconocido: ' + (mensaje && mensaje.tipo) });
    }
  })();
  // true = la respuesta llega de forma asíncrona.
  return true;
});
