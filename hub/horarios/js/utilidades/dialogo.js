// Reemplazo de confirm()/prompt() nativos: un overlay simple, propio del diseño,
// que además funciona en vistas embebidas donde los diálogos nativos vienen apagados.

function crearOverlay(contenidoHtml) {
  const overlay = document.createElement('div');
  overlay.className = 'dialogo-overlay';
  overlay.innerHTML = `<div class="dialogo-caja">${contenidoHtml}</div>`;
  document.body.appendChild(overlay);
  return overlay;
}

export function confirmar(mensaje, { textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar' } = {}) {
  return new Promise((resolve) => {
    const overlay = crearOverlay(`
      <div class="dialogo-texto">${mensaje}</div>
      <div class="dialogo-acciones">
        <button class="boton-secundario dialogo-cancelar">${textoCancelar}</button>
        <button class="boton-principal dialogo-confirmar">${textoConfirmar}</button>
      </div>
    `);
    const cerrar = (valor) => { overlay.remove(); resolve(valor); };
    overlay.querySelector('.dialogo-cancelar').addEventListener('click', () => cerrar(false));
    overlay.querySelector('.dialogo-confirmar').addEventListener('click', () => cerrar(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(false); });
  });
}

/**
 * Lista de opciones en una hoja inferior. `opciones` = [{ valor, texto, detalle?, peligro? }].
 * Devuelve el `valor` elegido, o null si se cierra sin elegir.
 */
export function elegirOpcion(titulo, opciones, { subtitulo = '' } = {}) {
  return new Promise((resolve) => {
    const overlay = crearOverlay(`
      <div class="dialogo-texto">${titulo}</div>
      ${subtitulo ? `<div class="dialogo-subtitulo">${subtitulo}</div>` : ''}
      <div class="dialogo-opciones">
        ${opciones.map((o, i) => `
          <button type="button" class="dialogo-opcion ${o.peligro ? 'dialogo-opcion-peligro' : ''}" data-i="${i}">
            <span class="dialogo-opcion-texto">${o.texto}</span>
            ${o.detalle ? `<span class="dialogo-opcion-detalle">${o.detalle}</span>` : ''}
          </button>`).join('')}
      </div>
      <div class="dialogo-acciones"><button class="boton-secundario dialogo-cancelar">Cancelar</button></div>
    `);
    const cerrar = (valor) => { overlay.remove(); resolve(valor); };
    overlay.querySelectorAll('.dialogo-opcion').forEach((b) => b.addEventListener('click', () => cerrar(opciones[Number(b.dataset.i)].valor)));
    overlay.querySelector('.dialogo-cancelar').addEventListener('click', () => cerrar(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(null); });
  });
}

export function pedirTexto(mensaje, { placeholder = '', valorInicial = '' } = {}) {
  return new Promise((resolve) => {
    const overlay = crearOverlay(`
      <div class="dialogo-texto">${mensaje}</div>
      <input class="dialogo-input" type="text" placeholder="${placeholder}" value="${valorInicial}">
      <div class="dialogo-acciones">
        <button class="boton-secundario dialogo-cancelar">Cancelar</button>
        <button class="boton-principal dialogo-confirmar">Guardar</button>
      </div>
    `);
    const input = overlay.querySelector('.dialogo-input');
    input.focus();
    const cerrar = (valor) => { overlay.remove(); resolve(valor); };
    overlay.querySelector('.dialogo-cancelar').addEventListener('click', () => cerrar(null));
    overlay.querySelector('.dialogo-confirmar').addEventListener('click', () => cerrar(input.value.trim() || null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(null); });
  });
}
