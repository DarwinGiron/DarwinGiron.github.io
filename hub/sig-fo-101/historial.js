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

const filtroFecha = document.getElementById("filtro-fecha");
const filtroMaquina = document.getElementById("filtro-maquina");
const filtroTurno = document.getElementById("filtro-turno");
const btnFiltrar = document.getElementById("btn-filtrar");
const btnLimpiarFiltros = document.getElementById("btn-limpiar-filtros");

const tituloLista = document.getElementById("titulo-lista");
const listaTarjetas = document.getElementById("lista-tarjetas");
const cuerpoTabla = document.getElementById("cuerpo-tabla");
const btnCargarMas = document.getElementById("btn-cargar-mas");

const modalEditar = document.getElementById("modal-editar");
const btnCerrarModal = document.getElementById("btn-cerrar-modal");
const editMaquina = document.getElementById("edit-maquina");
const editOrden = document.getElementById("edit-orden");
const editCliente = document.getElementById("edit-cliente");
const editPreguntasContenedor = document.getElementById("edit-preguntas-contenedor");
const editObservaciones = document.getElementById("edit-observaciones");
const btnGuardarEdicion = document.getElementById("btn-guardar-edicion");

const estado = {
  usuario: null,
  perfil: null,
  esAdmin: false,
  maquinas: [],
  registros: [], // registros ya cargados en pantalla, en orden
  cursor: null, // último doc snapshot, para "Cargar más"
  hayMas: false,
  cargando: false,
  filtrado: false,
  editandoId: null,
  editandoRespuestas: [], // [{ preguntaId, texto, valor }] del registro que se está editando
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

  cargarPrimeraPagina();
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
   Consulta y paginación
   --------------------------------------------------------- */

function leerFiltros() {
  return {
    fecha: filtroFecha.value || null,
    maquina: filtroMaquina.value || null,
    turno: filtroTurno.value || null,
  };
}

function construirConsultaBase(filtros) {
  let consulta = db.collection("liberaciones");
  if (filtros.fecha) consulta = consulta.where("fecha", "==", filtros.fecha);
  if (filtros.maquina) consulta = consulta.where("maquina", "==", filtros.maquina);
  if (filtros.turno) consulta = consulta.where("turno", "==", Number(filtros.turno));
  return consulta.orderBy("timestamp", "desc");
}

btnFiltrar.addEventListener("click", () => {
  estado.filtrado = Boolean(filtroFecha.value || filtroMaquina.value || filtroTurno.value);
  btnLimpiarFiltros.classList.toggle("oculto", !estado.filtrado);
  cargarPrimeraPagina();
});

btnLimpiarFiltros.addEventListener("click", () => {
  filtroFecha.value = "";
  filtroMaquina.value = "";
  filtroTurno.value = "";
  estado.filtrado = false;
  btnLimpiarFiltros.classList.add("oculto");
  cargarPrimeraPagina();
});

async function cargarPrimeraPagina() {
  estado.registros = [];
  estado.cursor = null;
  estado.hayMas = false;
  tituloLista.textContent = estado.filtrado ? "Resultados filtrados" : `Últimas ${POR_PAGINA} liberaciones`;
  const cargando = '<p class="estado-vacio">Cargando liberaciones…</p>';
  listaTarjetas.innerHTML = cargando;
  cuerpoTabla.innerHTML = `<tr><td colspan="8" class="texto-suave texto-centro">Cargando liberaciones…</td></tr>`;
  await cargarPagina();
}

async function cargarPagina() {
  if (estado.cargando) return;
  estado.cargando = true;
  btnCargarMas.disabled = true;
  btnCargarMas.textContent = "Cargando…";

  try {
    let consulta = construirConsultaBase(leerFiltros()).limit(POR_PAGINA);
    const esPrimeraPagina = !estado.cursor;
    if (estado.cursor) consulta = consulta.startAfter(estado.cursor);

    // Pintado instantáneo: la primera página se muestra de inmediato desde
    // la caché offline de Firestore (visitas repetidas), y abajo se
    // reemplaza con la respuesta fresca del servidor en cuanto llega. Si la
    // caché está vacía (primera visita), este paso simplemente no pinta nada.
    if (esPrimeraPagina) {
      try {
        const snapCache = await consulta.get({ source: "cache" });
        if (!snapCache.empty) {
          estado.registros = snapCache.docs.map((d) => ({ id: d.id, ...d.data() }));
          render();
        }
      } catch {
        /* sin datos en caché: se espera al servidor como siempre */
      }
    }

    const snap = await consulta.get();
    const nuevos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (esPrimeraPagina) {
      estado.registros = nuevos; // reemplaza lo pintado desde caché
    } else {
      estado.registros.push(...nuevos);
    }
    estado.cursor = snap.docs[snap.docs.length - 1] || estado.cursor;
    estado.hayMas = nuevos.length === POR_PAGINA;

    render();
  } catch (error) {
    console.error("Error al cargar el historial:", error);
    mostrarToast(`No se pudieron cargar las liberaciones. ${error.message || ""}`, "error");
  } finally {
    estado.cargando = false;
    btnCargarMas.disabled = false;
    btnCargarMas.textContent = "Cargar más";
    btnCargarMas.classList.toggle("oculto", !estado.hayMas);
  }
}

btnCargarMas.addEventListener("click", () => cargarPagina());

/* ---------------------------------------------------------
   Render: tarjetas (móvil) + tabla (escritorio)
   --------------------------------------------------------- */

function puedeEditar(registro) {
  return estado.esAdmin || registro.inspectorUid === estado.usuario.uid;
}

function render() {
  if (estado.registros.length === 0) {
    listaTarjetas.innerHTML = `<p class="estado-vacio">No hay liberaciones que coincidan con los filtros.</p>`;
    cuerpoTabla.innerHTML = "";
    return;
  }

  listaTarjetas.innerHTML = estado.registros.map((r) => tarjetaHtml(r)).join("");
  cuerpoTabla.innerHTML = estado.registros.map((r) => filaTablaHtml(r)).join("");

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
  const permitido = puedeEditar(r);
  return `
    <div class="registro-tarjeta" data-id="${r.id}">
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
        ${permitido ? `<button type="button" class="btn btn-secundario btn-sm btn-ancho-auto" data-accion="editar" data-id="${r.id}">Editar</button>` : ""}
        ${estado.esAdmin ? `<button type="button" class="btn btn-peligro btn-sm btn-ancho-auto" data-accion="eliminar" data-id="${r.id}">Eliminar</button>` : ""}
      </div>
    </div>`;
}

function filaTablaHtml(r) {
  const permitido = puedeEditar(r);
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
        <div class="grupo-botones" style="flex-wrap: nowrap;">
          ${permitido ? `<button type="button" class="btn btn-secundario btn-sm btn-ancho-auto" data-accion="editar" data-id="${r.id}">Editar</button>` : ""}
          ${estado.esAdmin ? `<button type="button" class="btn btn-peligro btn-sm btn-ancho-auto" data-accion="eliminar" data-id="${r.id}">Eliminar</button>` : ""}
        </div>
      </td>
    </tr>`;
}

function vincularAcciones() {
  document.querySelectorAll('[data-accion="editar"]').forEach((boton) => {
    boton.addEventListener("click", () => abrirModalEditar(boton.dataset.id));
  });
  document.querySelectorAll('[data-accion="eliminar"]').forEach((boton) => {
    boton.addEventListener("click", () => eliminarRegistro(boton.dataset.id));
  });
}

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
  const registro = estado.registros.find((r) => r.id === id);
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
    const registro = estado.registros.find((r) => r.id === estado.editandoId);
    if (registro) {
      Object.assign(registro, cambios, { editadoEn: { toDate: () => new Date() } });
    }
    render();

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
  const registro = estado.registros.find((r) => r.id === id);
  if (!registro) return;

  const confirmado = confirm(
    `¿Eliminar la liberación de "${registro.maquina}" (Orden ${registro.ordenNo})? Esta acción no se puede deshacer.`
  );
  if (!confirmado) return;

  try {
    await db.collection("liberaciones").doc(id).delete();
    estado.registros = estado.registros.filter((r) => r.id !== id);
    render();
    mostrarToast("Registro eliminado.", "exito");
  } catch (error) {
    console.error("Error al eliminar:", error);
    mostrarToast(`No se pudo eliminar. ${error.message || ""}`, "error");
  }
}
