// =========================================================
// autocompletado.js
// Buscador con autocompletado en tiempo real para un campo de texto que
// referencia un catálogo que se va alimentando solo (proveedor de
// transporte, supervisor de hisopado...): mientras se escribe, muestra
// las coincidencias ya registradas en un desplegable; si lo que se
// escribió no existe, lo dice ("Se registrará como nuevo") en vez de
// dejar la duda de si quedó bien escrito o duplicado.
//
// Se extrajo de proveedores-transporte.js (antes "configurarAutocompletado
// Proveedor") para no repetir esta misma lógica de nuevo en supervisores.js
// — cada catálogo pasa sus propias funciones de lectura/normalización y
// esta función pone el desplegable, el badge "Registrado" / "Nuevo", la
// navegación con teclado y el resaltado del texto buscado.
// =========================================================

/**
 * @param {Object} opciones
 * @param {HTMLInputElement} opciones.inputEl
 * @param {HTMLElement} opciones.dropdownEl - contenedor del desplegable de sugerencias.
 * @param {HTMLElement} [opciones.badgeEl] - opcional, muestra "Registrado: X" / "Nuevo …".
 * @param {(valorCanonico: string) => void} [opciones.onSeleccion]
 * @param {(forzar?: boolean) => Promise<{mapa: Map, lista: string[]}>} opciones.obtenerCatalogo
 * @param {(texto: string) => string} opciones.normalizarClave
 * @param {(nombre: string, catalogo: {mapa: Map}) => string} opciones.normalizarNombre
 * @param {string} [opciones.nombreEntidad="registro"] - para el mensaje "Se registrará como nuevo <nombreEntidad>".
 * @param {(nombreCanonico: string) => string} [opciones.etiquetaRegistrado] - texto del badge cuando ya existe.
 * @param {string} [opciones.etiquetaNuevo] - texto del badge cuando es nuevo.
 * @param {(valorEscrito: string) => string} [opciones.fraseSeRegistrara] - mensaje del desplegable
 *   cuando lo escrito no coincide con nada ("Se registrará como nuevo/nueva..."). Se separa de
 *   nombreEntidad porque el género gramatical no es automático ("nuevo proveedor" vs "nueva área").
 * @param {string} [opciones.fraseSinRegistros] - mensaje cuando el catálogo está vacío y el campo también.
 * @param {{mapa: Map, lista: string[]}} [opciones.catalogoInicial] - catálogo a usar mientras carga el real (por defecto, vacío).
 * @param {string} [opciones.claseBadgeBase] - clase base del badge cuando está vacío/oculto.
 * @param {string} [opciones.claseBadgeRegistrado] - clase(s) CSS del badge cuando ya existe (cada página trae su propio estilo de badge).
 * @param {string} [opciones.claseBadgeNuevo] - clase(s) CSS del badge cuando es nuevo.
 */
export function configurarAutocompletado({
  inputEl,
  dropdownEl,
  badgeEl,
  onSeleccion,
  obtenerCatalogo,
  normalizarClave,
  normalizarNombre,
  nombreEntidad = "registro",
  etiquetaRegistrado = (nombre) => `Registrado: ${nombre}`,
  etiquetaNuevo = "Nuevo registro",
  fraseSeRegistrara = (valor) => `Se registrará como nuevo ${nombreEntidad}`,
  fraseSinRegistros = `Todavía no hay ${nombreEntidad}s registrados.`,
  catalogoInicial = { mapa: new Map(), lista: [] },
  claseBadgeBase = "badge",
  claseBadgeRegistrado = "badge badge-exito",
  claseBadgeNuevo = "badge badge-alerta",
}) {
  if (!inputEl || !dropdownEl) return;

  let catalogo = catalogoInicial;
  let itemActivoIndex = -1;

  obtenerCatalogo().then((cat) => {
    catalogo = cat;
    if (inputEl.value) {
      inputEl.value = normalizarNombre(inputEl.value, catalogo);
      actualizarBadge();
    }
  });

  function actualizarBadge() {
    if (!badgeEl) return;
    const val = inputEl.value.trim();
    if (!val) {
      badgeEl.className = `${claseBadgeBase} oculto`;
      badgeEl.textContent = "";
      return;
    }

    const clave = normalizarClave(val);
    if (catalogo.mapa.has(clave)) {
      const canonico = catalogo.mapa.get(clave);
      badgeEl.className = claseBadgeRegistrado;
      badgeEl.innerHTML = `<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:12px;height:12px;"><path d="M20 6 9 17l-5-5"/></svg> ${etiquetaRegistrado(canonico)}`;
    } else {
      badgeEl.className = claseBadgeNuevo;
      badgeEl.innerHTML = `<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:12px;height:12px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> ${etiquetaNuevo}`;
    }
  }

  function renderSugerencias(filtro = "") {
    const terminoClave = normalizarClave(filtro);
    const coincidencias = catalogo.lista.filter((p) =>
      terminoClave ? normalizarClave(p).includes(terminoClave) : true
    );

    dropdownEl.innerHTML = "";
    itemActivoIndex = -1;

    if (coincidencias.length === 0) {
      const aviso = document.createElement("div");
      aviso.className = "sugerencia-item sugerencia-item--aviso";
      aviso.innerHTML = filtro
        ? `No existe aún <strong>"${filtro.toUpperCase()}"</strong> · ${fraseSeRegistrara(filtro)}`
        : fraseSinRegistros;
      dropdownEl.appendChild(aviso);
      dropdownEl.classList.remove("oculto");
      return;
    }

    const header = document.createElement("div");
    header.className = "sugerencias-header";
    header.textContent = `Coincidencias (${coincidencias.length})`;
    dropdownEl.appendChild(header);

    coincidencias.forEach((valor, idx) => {
      const fila = document.createElement("div");
      fila.className = "sugerencia-item";
      fila.setAttribute("role", "option");
      fila.dataset.index = idx;
      fila.dataset.valor = valor;

      if (terminoClave) {
        const regex = new RegExp(`(${terminoClave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
        fila.innerHTML = `<span class="sugerencia-nombre">${valor.replace(regex, "<mark class='mark-resaltado'>$1</mark>")}</span><span class="sugerencia-icono">↵</span>`;
      } else {
        fila.innerHTML = `<span class="sugerencia-nombre">${valor}</span>`;
      }

      fila.addEventListener("mousedown", (evento) => {
        evento.preventDefault();
        seleccionar(valor);
      });

      dropdownEl.appendChild(fila);
    });

    dropdownEl.classList.remove("oculto");
  }

  function seleccionar(nombre) {
    const canonico = normalizarNombre(nombre, catalogo);
    inputEl.value = canonico;
    cerrarDropdown();
    actualizarBadge();
    onSeleccion?.(canonico);
  }

  function cerrarDropdown() {
    dropdownEl.classList.add("oculto");
    dropdownEl.innerHTML = "";
    itemActivoIndex = -1;
  }

  function resaltarItem(items) {
    items.forEach((it, idx) => {
      it.classList.toggle("sugerencia-item--seleccionado", idx === itemActivoIndex);
      if (idx === itemActivoIndex) it.scrollIntoView({ block: "nearest" });
    });
  }

  inputEl.addEventListener("input", (e) => {
    actualizarBadge();
    renderSugerencias(e.target.value);
  });

  inputEl.addEventListener("focus", () => renderSugerencias(inputEl.value));

  inputEl.addEventListener("blur", () => {
    // Retraso corto: si el blur lo disparó un clic sobre una sugerencia,
    // el mousedown de esa fila (con preventDefault) ya corrió antes de
    // este timeout y seleccionar() ya dejó el valor correcto.
    setTimeout(() => {
      cerrarDropdown();
      if (inputEl.value.trim()) {
        inputEl.value = normalizarNombre(inputEl.value, catalogo);
      }
      actualizarBadge();
      if (inputEl.value.trim()) onSeleccion?.(inputEl.value);
    }, 150);
  });

  inputEl.addEventListener("keydown", (e) => {
    const items = dropdownEl.querySelectorAll(".sugerencia-item:not(.sugerencia-item--aviso)");
    if (!items.length || dropdownEl.classList.contains("oculto")) {
      if (e.key === "Enter") {
        e.preventDefault();
        inputEl.blur();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      itemActivoIndex = (itemActivoIndex + 1) % items.length;
      resaltarItem(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      itemActivoIndex = (itemActivoIndex - 1 + items.length) % items.length;
      resaltarItem(items);
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (itemActivoIndex >= 0 && items[itemActivoIndex]) {
        e.preventDefault();
        seleccionar(items[itemActivoIndex].dataset.valor);
      } else if (items.length > 0) {
        e.preventDefault();
        seleccionar(items[0].dataset.valor);
      }
    } else if (e.key === "Escape") {
      cerrarDropdown();
    }
  });
}
