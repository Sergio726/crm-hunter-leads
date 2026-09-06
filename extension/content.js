// Corre adentro de cada perfil de LinkedIn (`/in/...`).
//
// Qué hace: mira qué perfil está abierto, le pregunta al CRM si hay un mensaje
// listo para ese lead, y si lo hay lo muestra en un panel con tres acciones:
// copiarlo, pegarlo en el chat, y avisar que se mandó.
//
// Qué NO hace, y es lo que define a esta extensión: **nunca aprieta "Enviar"**.
// Ni ahora ni con un flag. El envío lo hace la persona, mirando el mensaje.
// Es lo que mantiene el riesgo con LinkedIn en el mínimo posible y lo que
// garantiza que alguien lea lo que Turbo escribió antes de que salga.

(() => {
  const ID_PANEL = 'hunter-leads-panel';
  let slugActual = null;

  // ---------------------------------------------------------------- slug ----
  // Copia de `web/src/lib/extension/linkedin-slug.ts`: misma regla, mismo test.
  function slugDeLinkedin(valor) {
    if (typeof valor !== 'string') return null;
    const limpio = valor.trim();
    if (!limpio) return null;
    const match = /(?:^|\/)in\/([^/?#\s]+)/i.exec(limpio);
    if (!match) return null;
    try {
      const slug = decodeURIComponent(match[1]).toLowerCase();
      return slug || null;
    } catch {
      return match[1].toLowerCase();
    }
  }

  // ----------------------------------------------------------- mensajes ----
  function alBackground(mensaje) {
    return new Promise((resolver) => {
      try {
        chrome.runtime.sendMessage(mensaje, (respuesta) => {
          if (chrome.runtime.lastError) {
            resolver({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolver(respuesta || { ok: false, error: 'Sin respuesta.' });
        });
      } catch (e) {
        resolver({ ok: false, error: String(e) });
      }
    });
  }

  // ------------------------------------------------------- el chat de LI ----
  /**
   * El campo donde se escribe el mensaje, si está abierto.
   *
   * LinkedIn lo abre al tocar "Enviar mensaje" en el perfil. Es un
   * `contenteditable`; el selector puede cambiar cuando LinkedIn rediseña, y por
   * eso hay un respaldo (copiar) que no depende de nada de esto.
   */
  function campoDelChat() {
    const candidatos = [
      '.msg-form__contenteditable[contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"][aria-label*="mensaje" i]',
      'div[role="textbox"][contenteditable="true"][aria-label*="message" i]',
    ];
    for (const selector of candidatos) {
      for (const campo of document.querySelectorAll(selector)) {
        // Solo un campo que se VE. LinkedIn deja restos de chats cerrados en
        // el DOM; escribir en uno oculto es "pegué y no pasó nada".
        if (campo.offsetParent !== null) return campo;
      }
    }
    return null;
  }

  function escribirEnElChat(texto) {
    const campo = campoDelChat();
    if (!campo) return false;
    campo.focus();
    // Un párrafo por línea: es como LinkedIn representa el texto pegado.
    campo.innerHTML = '';
    for (const linea of texto.split('\n')) {
      const p = document.createElement('p');
      p.textContent = linea;
      campo.appendChild(p);
    }
    // Sin estos eventos LinkedIn no se entera de que hay texto y deja el botón
    // de enviar apagado. Es lo único que se "simula": que se escribió.
    campo.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: texto }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // -------------------------------------------------------------- panel ----
  function quitarPanel() {
    const viejo = document.getElementById(ID_PANEL);
    if (viejo) viejo.remove();
  }

  function el(tag, clase, texto) {
    const nodo = document.createElement(tag);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
  }

  /* La marca de Turbo, servida desde la extensión (`web_accessible_resources`).
     Es lo único que inyectamos que sale de la red: si la CSP de la página lo
     bloqueara, se quita sola — mejor sin marca que con un ícono roto. */
  function marcaDeTurbo() {
    const marca = el('img', 'hl-turbo-mark');
    marca.alt = '';
    marca.addEventListener('error', () => marca.remove());
    marca.src = chrome.runtime.getURL('assets/turbo-mark.svg');
    return marca;
  }

  function mostrarPanel(borrador, otros) {
    quitarPanel();
    const panel = el('div');
    panel.id = ID_PANEL;

    const cabecera = el('div', 'hl-cabecera');
    const identidad = el('div', 'hl-identidad');
    identidad.appendChild(marcaDeTurbo());
    const rotulo = el('div', 'hl-rotulo');
    rotulo.appendChild(el('span', 'hl-marca', 'HUNTER LEADS'));
    rotulo.appendChild(el('span', 'hl-kicker', 'Turbo preparó este mensaje'));
    identidad.appendChild(rotulo);
    cabecera.appendChild(identidad);
    const cerrar = el('button', 'hl-cerrar', '×');
    cerrar.title = 'Ocultar';
    cerrar.addEventListener('click', quitarPanel);
    cabecera.appendChild(cerrar);
    panel.appendChild(cabecera);

    panel.appendChild(el('p', 'hl-para', 'Mensaje para ' + (borrador.nombre || 'este perfil')));
    if (borrador.empresa) panel.appendChild(el('p', 'hl-empresa', borrador.empresa));

    const cuerpo = el('pre', 'hl-mensaje', borrador.body);
    panel.appendChild(cuerpo);

    const acciones = el('div', 'hl-acciones');

    const btnCopiar = el('button', 'hl-btn', 'Copiar');
    btnCopiar.addEventListener('click', async () => {
      await navigator.clipboard.writeText(borrador.body);
      aviso(panel, 'Copiado. Pegalo en el chat.');
    });

    const btnPegar = el('button', 'hl-btn hl-btn-primario', 'Pegar en el chat');
    btnPegar.addEventListener('click', () => {
      if (escribirEnElChat(borrador.body)) {
        aviso(panel, 'Listo. Revisalo y apretá Enviar en LinkedIn.');
      } else {
        aviso(panel, 'Abrí el chat con "Enviar mensaje" y volvé a tocar. O usá Copiar.', true);
      }
    });

    const btnEnviado = el('button', 'hl-btn hl-btn-ok', 'Ya lo mandé');
    btnEnviado.addEventListener('click', async () => {
      btnEnviado.disabled = true;
      btnEnviado.textContent = 'Registrando…';
      const r = await alBackground({ tipo: 'enviado', draftId: borrador.id });
      if (!r.ok) {
        btnEnviado.disabled = false;
        btnEnviado.textContent = 'Ya lo mandé';
        aviso(panel, r.error || 'No se pudo registrar.', true);
        return;
      }
      const estado = r.data && r.data.estado === 'contacted' ? ' El lead pasó a Contactado.' : '';
      cuerpo.textContent = 'Registrado en el CRM.' + estado;
      acciones.remove();
      // El "revisalo y apretá Enviar" ya no aplica: se mandó.
      const avisoViejo = panel.querySelector('.hl-aviso');
      if (avisoViejo) avisoViejo.remove();
    });

    acciones.appendChild(btnCopiar);
    acciones.appendChild(btnPegar);
    acciones.appendChild(btnEnviado);
    panel.appendChild(acciones);

    if (otros > 0) {
      panel.appendChild(el('p', 'hl-pie', otros + (otros === 1 ? ' mensaje más' : ' mensajes más') + ' esperando en otros perfiles.'));
    }

    panel.appendChild(el('p', 'hl-nota', 'La extensión no envía nada: eso lo hacés vos.'));
    document.body.appendChild(panel);
  }

  function mostrarAviso(texto, esError) {
    quitarPanel();
    const panel = el('div', esError ? 'hl-error' : 'hl-silencio');
    panel.id = ID_PANEL;
    const identidad = el('div', 'hl-identidad');
    identidad.appendChild(marcaDeTurbo());
    identidad.appendChild(el('span', 'hl-marca', 'HUNTER LEADS'));
    panel.appendChild(identidad);
    panel.appendChild(el('p', '', texto));
    document.body.appendChild(panel);
  }

  function aviso(panel, texto, esError) {
    let nodo = panel.querySelector('.hl-aviso');
    if (!nodo) {
      nodo = el('p', 'hl-aviso');
      panel.appendChild(nodo);
    }
    nodo.textContent = texto;
    nodo.classList.toggle('hl-aviso-error', Boolean(esError));
  }

  // ---------------------------------------------------------------- flujo ----
  async function revisarPerfil() {
    const slug = slugDeLinkedin(location.pathname);
    if (!slug || slug === slugActual) return;
    slugActual = slug;

    const r = await alBackground({ tipo: 'pendientes' });
    if (!r.ok) {
      // Sin token o sin CRM: se dice una vez, chiquito, y no se insiste.
      mostrarAviso(r.error || 'No se pudo consultar el CRM.', true);
      return;
    }
    const pendientes = (r.data && r.data.pendientes) || [];
    const mio = pendientes.find((p) => p.slug === slug);
    if (!mio) {
      // No hay mensaje para este perfil: no se molesta. Solo se deja ver que
      // la extensión está viva si hay otros esperando.
      if (pendientes.length > 0) {
        mostrarAviso(
          'Este perfil no tiene mensaje pendiente. Hay ' +
            pendientes.length +
            (pendientes.length === 1 ? ' esperando en otro perfil.' : ' esperando en otros perfiles.'),
          false,
        );
      } else {
        quitarPanel();
      }
      return;
    }
    mostrarPanel(mio, pendientes.length - 1);
  }

  // LinkedIn navega sin recargar: la URL cambia y este script sigue vivo. Se
  // vigila la dirección en vez de escuchar eventos que LinkedIn no dispara.
  revisarPerfil();
  setInterval(() => {
    const slug = slugDeLinkedin(location.pathname);
    if (slug !== slugActual) {
      slugActual = null;
      revisarPerfil();
    }
  }, 1000);
})();
