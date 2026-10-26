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
