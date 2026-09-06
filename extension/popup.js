// La ventanita de configuración: dónde está el CRM y con qué token entrar.
//
// Guarda las dos cosas en `chrome.storage.sync` —viajan con la cuenta de
// Chrome del vendedor— y prueba la conexión al instante, para que "Conectado
// como Juan" aparezca antes de abrir ningún perfil de LinkedIn.

const URL_POR_DEFECTO = 'https://crm-hunter-leads.vercel.app';

const $baseUrl = document.getElementById('baseUrl');
const $token = document.getElementById('token');
const $guardar = document.getElementById('guardar');
const $estado = document.getElementById('estado');

function estado(texto, clase) {
  $estado.textContent = texto;
  $estado.className = clase || '';
}

async function cargar() {
  const { baseUrl, token } = await chrome.storage.sync.get(['baseUrl', 'token']);
  $baseUrl.value = baseUrl || URL_POR_DEFECTO;
  $token.value = token || '';
  if (token) probar(false);
}

/**
 * Si la dirección no es la que ya tiene permiso el manifest, se pide permiso
 * para ese origen: es lo que permite usar la misma extensión con otra
 * instalación de Hunter Leads sin tocar el código.
 */
async function pedirPermisoSiHaceFalta(baseUrl) {
  const origen = new URL(baseUrl).origin + '/*';
  const ya = await chrome.permissions.contains({ origins: [origen] });
  if (ya) return true;
  return chrome.permissions.request({ origins: [origen] });
}

async function probar(avisarGuardado) {
  estado('Probando…');
  const r = await new Promise((resolver) => chrome.runtime.sendMessage({ tipo: 'ping' }, resolver));
  if (!r || !r.ok) {
    estado((r && r.error) || 'No se pudo conectar.', 'error');
    return;
  }
  estado((avisarGuardado ? 'Guardado. ' : '') + 'Conectado como ' + r.data.nombre + '.', 'ok');
}

$guardar.addEventListener('click', async () => {
  const baseUrl = ($baseUrl.value || URL_POR_DEFECTO).trim().replace(/\/+$/, '');
  const token = $token.value.trim();
  if (!token.startsWith('hl_ext_')) {
    estado('Eso no parece un token de Hunter Leads (empiezan con hl_ext_).', 'error');
    return;
  }
  try {
    new URL(baseUrl);
  } catch {
    estado('La dirección del CRM no es válida.', 'error');
    return;
  }
  const permitido = await pedirPermisoSiHaceFalta(baseUrl);
  if (!permitido) {
    estado('Sin permiso para esa dirección, la extensión no puede hablar con el CRM.', 'error');
    return;
  }
  await chrome.storage.sync.set({ baseUrl, token });
  await probar(true);
});

cargar();
