// =========================================================
// historial.js
// Controlador de historial.html: listado paginado, filtros
// y edición/eliminación por rol.
// =========================================================

import { db, FieldValue } from "./firebase-config.js";
import { protegerPagina, cerrarSesion, esAdministrador } from "./auth.js";
import { obtenerConfig } from "./datos.js";
import { mostrarToast, escaparHtml, formatearFechaCorta, iniciales } from "./utils.js";

const POR_PAGINA = 20;

const textoUsuario = document.getElementById("texto-usuario");
const btnSalir = document.getElementById("btn-salir");
const linkAdmin = document.getElementById("link-admin");

const filtroMes = document.getElementById("filtro-mes");
const filtroMaquina = document.getElementById("filtro-maquina");
const filtroTurno = document.getElementById("filtro-turno");
const filtroBusqueda = document.getElementById("filtro-busqueda");
const btnFiltrar = document.getElementById("btn-filtrar");
const btnLimpiarFiltros = document.getElementById("btn-limpiar-filtros");

const tituloLista = document.getElementById("titulo-lista");
const listaTarjetas = document.getElementById("lista-tarjetas");
const cuerpoTabla = document.getElementById("cuerpo-tabla");
const btnCargarMas = document.getElementById("btn-cargar-mas");

const vistaLista = document.getElementById("vista-lista");
const vistaDetalle = document.getElementById("vista-detalle");
const btnVolverDetalle = document.getElementById("btn-volver-detalle");
const detalleContenido = document.getElementById("detalle-contenido");
const detalleAcciones = document.getElementById("detalle-acciones");

const modalEditar = document.getElementById("modal-editar");
const btnCerrarModal = document.getElementById("btn-cerrar-modal");
const editMaquina = document.getElementById("edit-maquina");
const editOrden = document.getElementById("edit-orden");
const editCliente = document.getElementById("edit-cliente");
const editPreguntasContenedor = document.getElementById("edit-preguntas-contenedor");
const editObservaciones = document.getElementById("edit-observaciones");
const btnGuardarEdicion = document.getElementById("btn-guardar-edicion");

function mesActualISO() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

const estado = {
  usuario: null,
  perfil: null,
  esAdmin: false,
  maquinas: [],
  registrosMes: [], // todos los registros del mes seleccionado (ya filtrados por máquina/turno)
  visibles: POR_PAGINA, // cuántos de registrosMes se están mostrando (paginación en cliente)
  cargando: false,
  editandoId: null,
  editandoRespuestas: [], // [{ preguntaId, texto, valor }] del registro que se está editando
  detalleId: null,
};

/* ---------------------------------------------------------
   Arranque
   --------------------------------------------------------- */

protegerPagina(async ({ user, perfil }) => {
  estado.usuario = user;
  estado.perfil = perfil;
  estado.esAdmin = esAdministrador(perfil.rol);
  textoUsuario.textContent = `${perfil.nombre || user.email} (${iniciales(perfil.nombre || user.email)})`;
  if (estado.esAdmin) linkAdmin.classList.remove("oculto");

  try {
    const config = await obtenerConfig();
    estado.maquinas = config.maquinas;
    poblarFiltroMaquina();
    poblarSelectMaquinaEdicion();
  } catch (error) {
    console.error("No se pudo cargar la configuración de SIG-FO-101:", error);
  }

  filtroMes.value = mesActualISO();
  await cargarMes();

  const idVer = new URLSearchParams(window.location.search).get("ver");
  if (idVer && estado.registrosMes.some((r) => r.id === idVer)) abrirDetalle(idVer);
});

btnSalir.addEventListener("click", () => cerrarSesion());

function poblarFiltroMaquina() {
  estado.maquinas.forEach((maquina) => {
    const opcion = document.createElement("option");
    opcion.value = maquina;
    opcion.textContent = maquina;
    filtroMaquina.appendChild(opcion);
  });
}

/* ---------------------------------------------------------
   Consulta por mes + filtro/búsqueda y paginación en cliente
   --------------------------------------------------------- */

function rangoDelMes(mesISO) {
  const [anio, mes] = mesISO.split("-").map(Number);
  const inicio = `${mesISO}-01`;
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const fin = `${mesISO}-${String(ultimoDia).padStart(2, "0")}`;
  return { inicio, fin };
}

btnFiltrar.addEventListener("click", () => cargarMes());

btnLimpiarFiltros.addEventListener("click", () => {
  filtroMes.value = mesActualISO();
  filtroMaquina.value = "";
  filtroTurno.value = "";
  filtroBusqueda.value = "";
  btnLimpiarFiltros.classList.add("oculto");
  cargarMes();
});

filtroBusqueda.addEventListener("input", () => {
  estado.visibles = POR_PAGINA;
  render();
});

async function cargarMes() {
  const huboFiltroExtra = Boolean(filtroMaquina.value || filtroTurno.value || filtroBusqueda.value.trim());
  btnLimpiarFiltros.classList.toggle("oculto", !huboFiltroExtra && filtroMes.value === mesActualISO());

  estado.visibles = POR_PAGINA;
  estado.cargando = true;
  tituloLista.textContent = "Cargando…";
  listaTarjetas.innerHTML = '<p class="estado-vacio">Cargando liberaciones…</p>';
  cuerpoTabla.innerHTML = `<tr><td colspan="8" class="texto-suave texto-centro">Cargando liberaciones…</td></tr>`;

  try {
    const mesISO = filtroMes.value || mesActualISO();
    const { inicio, fin } = rangoDelMes(mesISO);

    let consulta = db.collection("liberaciones")
      .where("fecha", ">=", inicio)
      .where("fecha", "<=", fin);
    if (filtroMaquina.value) consulta = consulta.where("maquina", "==", filtroMaquina.value);
    if (filtroTurno.value) consulta = consulta.where("turno", "==", Number(filtroTurno.value));
    consulta = consulta.orderBy("fecha", "desc");

    const snap = await consulta.get();
    estado.registrosMes = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));

    render();
  } catch (error) {
    console.error("Error al cargar el historial:", error);
    mostrarToast(`No se pudieron cargar las liberaciones. ${error.message || ""}`, "error");
    estado.registrosMes = [];
    render();
  } finally {
    estado.cargando = false;
  }
}

function registrosFiltrados() {
  const termino = filtroBusqueda.value.trim().toLowerCase();
  if (!termino) return estado.registrosMes;
  return estado.registrosMes.filter((r) =>
    String(r.ordenNo || "").toLowerCase().includes(termino) ||
    String(r.cliente || "").toLowerCase().includes(termino) ||
    String(r.inspectorNombre || "").toLowerCase().includes(termino)
  );
}

btnCargarMas.addEventListener("click", () => {
  estado.visibles += POR_PAGINA;
  render();
});

/* ---------------------------------------------------------
   Render: tarjetas (móvil) + tabla (escritorio) — solo lectura,
   sin editar/eliminar. Esas acciones viven en la vista de detalle.
   --------------------------------------------------------- */

function render() {
  const filtrados = registrosFiltrados();
  tituloLista.textContent = `${filtrados.length} liberación${filtrados.length === 1 ? "" : "es"} este mes`;

  if (filtrados.length === 0) {
    listaTarjetas.innerHTML = `<p class="estado-vacio">No hay liberaciones que coincidan con los filtros.</p>`;
    cuerpoTabla.innerHTML = "";
    btnCargarMas.classList.add("oculto");
    return;
  }

  const visibles = filtrados.slice(0, estado.visibles);
  listaTarjetas.innerHTML = visibles.map((r) => tarjetaHtml(r)).join("");
  cuerpoTabla.innerHTML = visibles.map((r) => filaTablaHtml(r)).join("");
  btnCargarMas.classList.toggle("oculto", visibles.length >= filtrados.length);

  vincularAcciones();
}

function badgeLimpieza(registro) {
  return registro.limpiezaSanitizacion
    ? '<span class="badge badge-si">SÍ</span>'
    : '<span class="badge badge-no">NO</span>';
}

function badgeCorregido(registro) {
  return registro.editadoEn ? '<span class="badge badge-corregido">Corregido</span>' : "";
}

function tarjetaHtml(r) {
  return `
    <div class="registro-tarjeta" data-id="${r.id}" data-accion="ver" role="button" tabindex="0">
      <div class="registro-tarjeta__cabecera">
        <div>
          <div class="registro-tarjeta__maquina">${escaparHtml(r.maquina)} ${badgeCorregido(r)}</div>
          <div class="registro-tarjeta__meta">
            ${escaparHtml(formatearFechaCorta(r.fecha))} · Turno ${escaparHtml(String(r.turno))} · Orden ${escaparHtml(r.ordenNo)}
          </div>
          <div class="registro-tarjeta__meta">Cliente: ${escaparHtml(r.cliente)}</div>
          <div class="registro-tarjeta__meta">Inspector: ${escaparHtml(r.inspectorNombre || "—")}</div>
        </div>
        ${badgeLimpieza(r)}
      </div>
      ${r.observaciones ? `<p class="texto-sm mb-0">${escaparHtml(r.observaciones)}</p>` : ""}
      <div class="registro-tarjeta__acciones">
        <button type="button" class="btn btn-secundario btn-sm btn-ancho-auto" data-accion="ver" data-id="${r.id}">Ver detalle →</button>
      </div>
    </div>`;
}

function filaTablaHtml(r) {
  return `
    <tr data-id="${r.id}">
      <td>${escaparHtml(formatearFechaCorta(r.fecha))}</td>
      <td>${escaparHtml(String(r.turno))}</td>
      <td>${escaparHtml(r.maquina)} ${badgeCorregido(r)}</td>
      <td>${escaparHtml(r.ordenNo)}</td>
      <td>${escaparHtml(r.cliente)}</td>
      <td>${badgeLimpieza(r)}</td>
      <td>${escaparHtml(r.inspectorNombre || "—")}</td>
      <td>
        <button type="button" class="btn btn-secundario btn-sm btn-ancho-auto" data-accion="ver" data-id="${r.id}">Ver →</button>
      </td>
    </tr>`;
}

function vincularAcciones() {
  document.querySelectorAll('[data-accion="ver"]').forEach((el) => {
    el.addEventListener("click", (evento) => {
      // Evita doble navegación cuando el botón interior también dispara el click de la tarjeta.
      evento.stopPropagation();
      abrirDetalle(el.dataset.id);
    });
    el.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" || evento.key === " ") {
        evento.preventDefault();
        abrirDetalle(el.dataset.id);
      }
    });
  });
}

/* ---------------------------------------------------------
   Vista de detalle: aquí viven Editar y Eliminar
   --------------------------------------------------------- */

function puedeEditar(registro) {
  return estado.esAdmin || registro.inspectorUid === estado.usuario.uid;
}

function fichaHtml(etiqueta, valor) {
  return `
    <div class="ficha">
      <div class="ficha__etiqueta">${escaparHtml(etiqueta)}</div>
      <div class="ficha__valor">${escaparHtml(valor || "—")}</div>
    </div>`;
}

function abrirDetalle(id) {
  const registro = estado.registrosMes.find((r) => r.id === id);
  if (!registro) return;
  estado.detalleId = id;

  vistaLista.classList.add("oculto");
  vistaDetalle.classList.remove("oculto");

  detalleContenido.innerHTML = `
    <div class="flex-entre mb-2">
      <h2 class="tarjeta__titulo mb-0">${escaparHtml(registro.maquina)} ${badgeCorregido(registro)}</h2>
      ${badgeLimpieza(registro)}
    </div>
    <div class="fichas mb-3">
      ${fichaHtml("Fecha", formatearFechaCorta(registro.fecha))}
      ${fichaHtml("Turno", String(registro.turno))}
      ${fichaHtml("Orden", registro.ordenNo)}
      ${fichaHtml("Cliente", registro.cliente)}
      ${fichaHtml("Inspector", registro.inspectorNombre)}
    </div>
    ${(registro.respuestas || []).length ? `
      <h3 class="tarjeta__titulo" style="font-size: var(--txt-md);">Limpieza y Sanitización</h3>
      <div class="editor-lista mb-3">
        ${registro.respuestas.map((r) => `
          <div class="editor-item">
            <div class="flex-entre">
              <div>${escaparHtml(r.texto)}</div>
              <span class="badge ${r.valor ? "badge-si" : "badge-no"}">${r.valor ? "SÍ" : "NO"}</span>
            </div>
          </div>`).join("")}
      </div>` : ""}
    ${registro.observaciones ? `
      <h3 class="tarjeta__titulo" style="font-size: var(--txt-md);">Observaciones</h3>
      <p class="mb-0">${escaparHtml(registro.observaciones)}</p>` : ""}
  `;

  const permitido = puedeEditar(registro);
  detalleAcciones.innerHTML = `
    ${permitido ? `<button type="button" class="btn btn-secundario btn-ancho-auto" id="btn-editar-detalle">Editar registro</button>` : ""}
    ${estado.esAdmin ? `<button type="button" class="btn btn-peligro btn-ancho-auto" id="btn-eliminar-detalle">Eliminar registro</button>` : ""}
  `;
  const btnEditarDetalle = document.getElementById("btn-editar-detalle");
  if (btnEditarDetalle) btnEditarDetalle.addEventListener("click", () => abrirModalEditar(id));
  const btnEliminarDetalle = document.getElementById("btn-eliminar-detalle");
  if (btnEliminarDetalle) btnEliminarDetalle.addEventListener("click", () => eliminarRegistro(id));

  history.pushState(null, "", `?ver=${id}`);
}

function cerrarDetalle() {
  estado.detalleId = null;
  vistaDetalle.classList.add("oculto");
  vistaLista.classList.remove("oculto");
  history.pushState(null, "", "historial.html");
}

btnVolverDetalle.addEventListener("click", cerrarDetalle);

/* ---------------------------------------------------------
   Editar (autor propio, o cualquiera si es administrador)
   --------------------------------------------------------- */

function poblarSelectMaquinaEdicion() {
  editMaquina.innerHTML = estado.maquinas.map((m) => `<option value="${m}">${m}</option>`).join("");
}

/**
 * Reconstruye la lista de toggles SI/NO a partir de las respuestas
 * GUARDADAS en el registro (no de la configuración vigente): si el admin
 * agregó o quitó preguntas después, un registro viejo se sigue editando
 * con las preguntas que de verdad tenía al momento de liberarse.
 */
function renderPreguntasEdicion() {
  if (estado.editandoRespuestas.length === 0) {
    editPreguntasContenedor.innerHTML =
      '<p class="texto-suave texto-sm mb-0">Este registro no tiene preguntas individuales guardadas.</p>';
    return;
  }

  editPreguntasContenedor.innerHTML = estado.editandoRespuestas
    .map(
      (r, indice) => `
      <div class="pregunta-fila" data-indice="${indice}">
        <span class="pregunta-fila__texto">${escaparHtml(r.texto)}</span>
        <div class="toggle-si-no toggle-si-no--sm" role="group" aria-label="${escaparHtml(r.texto)}">
          <button type="button" class="toggle-si-no__opcion ${r.valor ? "activo" : ""}" data-valor="si">SÍ</button>
          <button type="button" class="toggle-si-no__opcion ${!r.valor ? "activo" : ""}" data-valor="no">NO</button>
        </div>
      </div>`
    )
    .join("");

  editPreguntasContenedor.querySelectorAll(".pregunta-fila").forEach((fila) => {
    const indice = Number(fila.dataset.indice);
    fila.querySelectorAll(".toggle-si-no__opcion").forEach((boton) => {
      boton.addEventListener("click", () => {
        estado.editandoRespuestas[indice].valor = boton.dataset.valor === "si";
        fila.querySelectorAll(".toggle-si-no__opcion").forEach((o) => o.classList.toggle("activo", o === boton));
      });
    });
  });
}

function editandoTodoEnSi() {
  return estado.editandoRespuestas.every((r) => r.valor);
}

function abrirModalEditar(id) {
  const registro = estado.registrosMes.find((r) => r.id === id);
  if (!registro) return;
  if (!puedeEditar(registro)) {
    mostrarToast("Solo puedes corregir tus propios registros.", "error");
    return;
  }

  estado.editandoId = id;
  editMaquina.value = registro.maquina;
  editOrden.value = registro.ordenNo;
  editCliente.value = registro.cliente;
  estado.editandoRespuestas = (registro.respuestas || []).map((r) => ({ ...r }));
  renderPreguntasEdicion();
  editObservaciones.value = registro.observaciones || "";

  modalEditar.classList.remove("oculto");
}

function cerrarModalEditar() {
  modalEditar.classList.add("oculto");
  estado.editandoId = null;
}

btnCerrarModal.addEventListener("click", cerrarModalEditar);
modalEditar.addEventListener("click", (evento) => {
  if (evento.target === modalEditar) cerrarModalEditar();
});

btnGuardarEdicion.addEventListener("click", async () => {
  if (!estado.editandoId) return;

  if (!editOrden.value.trim() || !editCliente.value.trim()) {
    mostrarToast("Orden y cliente son obligatorios.", "error");
    return;
  }
  if (!editandoTodoEnSi() && !editObservaciones.value.trim()) {
    mostrarToast("Describe el hallazgo en Observaciones.", "error");
    return;
  }

  const cambios = {
    maquina: editMaquina.value,
    ordenNo: editOrden.value.trim(),
    cliente: editCliente.value.trim(),
    respuestas: estado.editandoRespuestas,
    limpiezaSanitizacion: editandoTodoEnSi(),
    observaciones: editObservaciones.value.trim(),
    editadoPor: estado.usuario.uid,
    editadoEn: FieldValue.serverTimestamp(),
  };

  btnGuardarEdicion.disabled = true;
  btnGuardarEdicion.textContent = "Guardando…";

  try {
    await db.collection("liberaciones").doc(estado.editandoId).update(cambios);

    // Refleja el cambio en memoria sin recargar toda la lista, para no
    // perder la posición de paginación en la que estaba el inspector.
    const registro = estado.registrosMes.find((r) => r.id === estado.editandoId);
    if (registro) {
      Object.assign(registro, cambios, { editadoEn: { toDate: () => new Date() } });
    }
    render();
    if (estado.detalleId === estado.editandoId) abrirDetalle(estado.editandoId);

    mostrarToast("Liberación corregida.", "exito");
    cerrarModalEditar();
  } catch (error) {
    console.error("Error al guardar la corrección:", error);
    mostrarToast(`No se pudo guardar. ${error.message || ""}`, "error");
  } finally {
    btnGuardarEdicion.disabled = false;
    btnGuardarEdicion.textContent = "Guardar corrección";
  }
});

/* ---------------------------------------------------------
   Eliminar (solo administrador)
   --------------------------------------------------------- */

async function eliminarRegistro(id) {
  if (!estado.esAdmin) return;
  const registro = estado.registrosMes.find((r) => r.id === id);
  if (!registro) return;

  const confirmado = confirm(
    `¿Eliminar la liberación de "${registro.maquina}" (Orden ${registro.ordenNo})? Esta acción no se puede deshacer.`
  );
  if (!confirmado) return;

  try {
    await db.collection("liberaciones").doc(id).delete();
    estado.registrosMes = estado.registrosMes.filter((r) => r.id !== id);
    if (estado.detalleId === id) cerrarDetalle();
    render();
    mostrarToast("Registro eliminado.", "exito");
  } catch (error) {
    console.error("Error al eliminar:", error);
    mostrarToast(`No se pudo eliminar. ${error.message || ""}`, "error");
  }
}
