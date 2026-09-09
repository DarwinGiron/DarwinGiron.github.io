// =========================================================
// transporte.js
// Controlador de verificacion-transporte (index.html e historial.html)
//
// El checklist (ZONAS/ZONA_CABINA) vive en transporte-datos.js, replicado
// del formato LOG-FO-101. Cada zona del furgón (paredes, puertas, techo,
// generales) se evalúa en dos vistas — Exterior e Interior — y el
// diagrama interactivo del furgón es solo una forma alterna de navegar a
// esas mismas secciones (no duplica datos: hace scroll + resalta la
// tarjeta correspondiente, igual que "volver al hallazgo" en SIG-FO-115).
// =========================================================

import { protegerPagina, cerrarSesion, esRolDeGestion, etiquetaRol } from "./auth.js";
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  fechaHoyISO,
  formatearFechaISOCorta,
  mostrarToast,
  escaparHtml,
  iniciales,
} from "./utils.js";
import { ZONAS, ZONA_CABINA, idItem } from "./transporte-datos.js";

const COLEC_REGISTROS = "verificaciones_transporte";
const ETIQUETA_VISTA = { externa: "Exterior", interna: "Interior" };

let usuarioActual = null;
let perfilActual = null;
let vistaActual = "externa";
let editandoId = null;
const respuestas = {}; // idItem(zonaId,modo,indice) -> { valor:'si'|'no'|null, observacion:'' }
const otros = {}; // `${zonaId}.${modo}` -> texto libre ("Otros: Describir")
const respuestasCabina = {}; // indice -> { valor, observacion }

/* ---------------------------------------------------------
   Elementos del DOM
   --------------------------------------------------------- */
const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");
const linkAdminSuperior = document.getElementById("link-admin-superior");

const formTransporte = document.getElementById("form-transporte");
const campoFecha = document.getElementById("campo-fecha");
const contenedorZonas = document.getElementById("contenedor-zonas");
const contenedorCabina = document.getElementById("contenedor-cabina");
const diagramaFurgon = document.getElementById("diagrama-furgon");
const btnGuardar = document.getElementById("btn-guardar-transporte");

const listaVerificaciones = document.getElementById("lista-verificaciones-transporte");
const vistaLista = document.getElementById("vista-lista");
const vistaDetalle = document.getElementById("vista-detalle");
const detalleContenido = document.getElementById("detalle-contenido-transporte");
const btnVolver = document.getElementById("btn-volver");

protegerPagina({}, async ({ user, perfil }) => {
  usuarioActual = user;
  perfilActual = perfil;

  const nombreVisible = perfil.nombre || user.email;
  if (textoUsuario) textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  if (avatarUsuario) avatarUsuario.textContent = iniciales(nombreVisible);

  if (!esRolDeGestion(perfil.rol) && linkAdminSuperior) {
    linkAdminSuperior.classList.add("oculto");
  }

  if (formTransporte) {
    campoFecha.value = fechaHoyISO();
    campoFecha.max = fechaHoyISO();
    renderZonas();
    renderCabina();
    actualizarDiagrama();
    actualizarVistaDiagrama();
    inicializarDiagrama();
    inicializarToggleVista();
    inicializarFormulario();

    const idEditar = new URLSearchParams(window.location.search).get("editar");
    if (idEditar) await cargarParaEditar(idEditar);
  }

  if (listaVerificaciones) {
    inicializarHistorial();
  }
});

if (btnSalir) {
  btnSalir.addEventListener("click", () => cerrarSesion());
}

/* ---------------------------------------------------------
   Render de las zonas (Exterior/Interior) y de Cabina
   --------------------------------------------------------- */

function renderZonas() {
  contenedorZonas.innerHTML = "";
  ZONAS.forEach((zona) => {
    const bloque = zona[vistaActual];
    const seccion = document.createElement("section");
    seccion.className = "tarjeta";
    seccion.dataset.zona = zona.id;

    const encabezado = document.createElement("div");
    encabezado.className = "flex-entre mb-2";
    encabezado.innerHTML = `
      <h2 class="tarjeta__titulo mb-0">${escaparHtml(zona.nombre)}</h2>
      <span class="badge badge-marino">${ETIQUETA_VISTA[vistaActual]}</span>
    `;
    seccion.appendChild(encabezado);

    const lista = document.createElement("div");
    lista.className = "editor-lista";
    bloque.items.forEach((texto, indice) => {
      lista.appendChild(renderFilaItem(zona.id, vistaActual, indice, texto));
    });
    seccion.appendChild(lista);

    if (bloque.otros) {
      const claveOtros = `${zona.id}.${vistaActual}`;
      const campo = document.createElement("div");
      campo.className = "campo mb-0 mt-3";
      campo.innerHTML = `
        <label>Otros (describir)</label>
        <textarea placeholder="Cualquier otra observación de esta zona (opcional)">${escaparHtml(otros[claveOtros] || "")}</textarea>
      `;
      campo.querySelector("textarea").addEventListener("input", (e) => {
        otros[claveOtros] = e.target.value;
      });
      seccion.appendChild(campo);
    }

    contenedorZonas.appendChild(seccion);
  });
}

function renderCabina() {
  contenedorCabina.innerHTML = "";
  ZONA_CABINA.items.forEach((texto, indice) => {
    contenedorCabina.appendChild(renderFilaItemCabina(indice, texto));
  });
}

function renderFilaItem(zonaId, modo, indice, texto) {
  const id = idItem(zonaId, modo, indice);
  const r = respuestas[id] || {};
  const fila = document.createElement("article");
  fila.className = "aspecto" + (r.valor === "si" ? " aspecto--respondido" : r.valor === "no" ? " aspecto--incumple" : "");
  fila.dataset.itemId = id;

  fila.innerHTML = `
    <p class="aspecto__texto">${escaparHtml(texto)}</p>
    <div class="calificacion" role="radiogroup" aria-label="${escaparHtml(texto)}">
      <button type="button" class="calificacion__opcion cumple ${r.valor === "si" ? "seleccionado" : ""}" data-valor="si">
        <span class="simbolo" aria-hidden="true">✓</span><span>Sí</span>
      </button>
      <button type="button" class="calificacion__opcion no_cumple ${r.valor === "no" ? "seleccionado" : ""}" data-valor="no">
        <span class="simbolo" aria-hidden="true">✗</span><span>No</span>
      </button>
    </div>
    <div class="aspecto__observacion ${r.valor === "no" ? "" : "oculto"}">
      <textarea placeholder="Describe el hallazgo (opcional)">${escaparHtml(r.observacion || "")}</textarea>
    </div>
  `;

  cablearFilaItem(fila, id, texto, (valor) => {
    respuestas[id] = respuestas[id] || {};
    respuestas[id].valor = valor;
  }, (obs) => {
    respuestas[id] = respuestas[id] || {};
    respuestas[id].observacion = obs;
  }, () => respuestas[id]);

  return fila;
}

function renderFilaItemCabina(indice, texto) {
  const r = respuestasCabina[indice] || {};
  const fila = document.createElement("article");
  fila.className = "aspecto" + (r.valor === "si" ? " aspecto--respondido" : r.valor === "no" ? " aspecto--incumple" : "");
  fila.dataset.itemId = "cabina." + indice;

  fila.innerHTML = `
    <p class="aspecto__texto">${escaparHtml(texto)}</p>
    <div class="calificacion" role="radiogroup" aria-label="${escaparHtml(texto)}">
      <button type="button" class="calificacion__opcion cumple ${r.valor === "si" ? "seleccionado" : ""}" data-valor="si">
        <span class="simbolo" aria-hidden="true">✓</span><span>Sí</span>
      </button>
      <button type="button" class="calificacion__opcion no_cumple ${r.valor === "no" ? "seleccionado" : ""}" data-valor="no">
        <span class="simbolo" aria-hidden="true">✗</span><span>No</span>
      </button>
    </div>
    <div class="aspecto__observacion ${r.valor === "no" ? "" : "oculto"}">
      <textarea placeholder="Describe el hallazgo (opcional)">${escaparHtml(r.observacion || "")}</textarea>
    </div>
  `;

  cablearFilaItem(fila, indice, texto, (valor) => {
    respuestasCabina[indice] = respuestasCabina[indice] || {};
    respuestasCabina[indice].valor = valor;
  }, (obs) => {
    respuestasCabina[indice] = respuestasCabina[indice] || {};
    respuestasCabina[indice].observacion = obs;
  }, () => respuestasCabina[indice]);

  return fila;
}

/** Cablea los botones Sí/No y el textarea de una fila de item, sin importar si es de zona o de cabina. */
function cablearFilaItem(fila, claveProgreso, texto, alElegir, alEscribirObs) {
  const opciones = fila.querySelectorAll(".calificacion__opcion");
  const bloqueObs = fila.querySelector(".aspecto__observacion");
  const textarea = bloqueObs.querySelector("textarea");

  opciones.forEach((opcion) => {
    opcion.addEventListener("click", () => {
      const actual = opcion.classList.contains("seleccionado");
      const valor = actual ? null : opcion.dataset.valor;

      opciones.forEach((o) => o.classList.remove("seleccionado"));
      fila.classList.remove("aspecto--respondido", "aspecto--incumple");
      if (valor) {
        opcion.classList.add("seleccionado");
        fila.classList.add(valor === "si" ? "aspecto--respondido" : "aspecto--incumple");
      }

      alElegir(valor);

      const mostrar = valor === "no";
      bloqueObs.classList.toggle("oculto", !mostrar);
      if (mostrar) textarea.focus({ preventScroll: true });

      actualizarDiagrama();
    });
  });

  textarea.addEventListener("input", (e) => alEscribirObs(e.target.value));
}

/* ---------------------------------------------------------
   Toggle Exterior / Interior — con transición (reutiliza el mismo
   fundido+deslizamiento que usa el recorrido de SIG-FO-115).
   --------------------------------------------------------- */
function inicializarToggleVista() {
  document.querySelectorAll('input[name="vista-transporte"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked || radio.value === vistaActual) return;
      cambiarVista(radio.value);
    });
  });
}

function cambiarVista(nuevaVista) {
  contenedorZonas.classList.add("contenido-recorrido");
  contenedorZonas.style.opacity = "0";
  contenedorZonas.style.transform = "translateX(10px)";
  setTimeout(() => {
    vistaActual = nuevaVista;
    renderZonas();
    actualizarDiagrama();
    actualizarVistaDiagrama();
    contenedorZonas.style.transform = "translateX(-10px)";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      contenedorZonas.style.opacity = "1";
      contenedorZonas.style.transform = "translateX(0)";
    }));
  }, 180);
}

/** Abre/cierra las puertas dibujadas del furgón según la vista activa, y
 * actualiza el texto de ayuda debajo del diagrama. */
function actualizarVistaDiagrama() {
  if (!diagramaFurgon) return;
  diagramaFurgon.dataset.vista = vistaActual;
  const nota = document.getElementById("furgon-nota-vista");
  if (nota) {
    nota.textContent = vistaActual === "interna"
      ? "Puertas abiertas — vista interior."
      : "Puertas cerradas — vista exterior.";
  }
}

/* ---------------------------------------------------------
   Diagrama interactivo del furgón
   --------------------------------------------------------- */
function inicializarDiagrama() {
  if (!diagramaFurgon) return;
  diagramaFurgon.querySelectorAll(".furgon-zona").forEach((grupo) => {
    grupo.addEventListener("click", () => irAZona(grupo.dataset.zona));
    grupo.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        irAZona(grupo.dataset.zona);
      }
    });
  });
}

function irAZona(mapaId) {
  const destino = mapaId === "cabina"
    ? document.getElementById("seccion-cabina")
    : contenedorZonas.querySelector(`[data-zona="${zonaIdDeMapaId(mapaId)}"]`);
  if (!destino) return;

  destino.scrollIntoView({ behavior: "smooth", block: "center" });
  destino.classList.remove("zona-transporte--resaltada");
  // Forzar reflow para poder re-disparar la animación aunque ya se haya usado antes.
  void destino.offsetWidth;
  destino.classList.add("zona-transporte--resaltada");

  // Pulso breve también sobre la zona tocada en el propio diagrama, para
  // que quede claro "esto es lo que tocaste, aquí es a donde te llevó".
  const grupoDiagrama = diagramaFurgon?.querySelector(`[data-zona="${mapaId}"]`);
  if (grupoDiagrama) {
    grupoDiagrama.classList.add("furgon-zona--activa");
    setTimeout(() => grupoDiagrama.classList.remove("furgon-zona--activa"), 1200);
  }
}

function zonaIdDeMapaId(mapaId) {
  const zona = ZONAS.find((z) => z.mapaId === mapaId);
  return zona ? zona.id : null;
}

/** Progreso por zona (para la vista activa) + cabina, pintado en el diagrama. */
function actualizarDiagrama() {
  if (!diagramaFurgon) return;

  ZONAS.forEach((zona) => {
    const bloque = zona[vistaActual];
    let respondidos = 0;
    bloque.items.forEach((_texto, indice) => {
      if (respuestas[idItem(zona.id, vistaActual, indice)]?.valor) respondidos++;
    });
    pintarZonaDiagrama(zona.mapaId, respondidos, bloque.items.length);
  });

  let respondidosCabina = 0;
  ZONA_CABINA.items.forEach((_texto, indice) => {
    if (respuestasCabina[indice]?.valor) respondidosCabina++;
  });
  pintarZonaDiagrama("cabina", respondidosCabina, ZONA_CABINA.items.length);
}

function pintarZonaDiagrama(mapaId, respondidos, total) {
  const grupo = diagramaFurgon.querySelector(`[data-zona="${mapaId}"]`);
  if (!grupo) return;
  const estado = respondidos === 0 ? "vacio" : respondidos === total ? "completo" : "parcial";
  grupo.dataset.estado = estado;
}

/* ---------------------------------------------------------
   Cargar un registro existente para edición (?editar=<id>)
   --------------------------------------------------------- */
async function cargarParaEditar(id) {
  try {
    const snap = await getDoc(doc(db, COLEC_REGISTROS, id));
    if (!snap.exists()) {
      mostrarToast("El registro que intentas editar no existe.", "error");
      return;
    }
    const data = snap.data();
    editandoId = id;

    document.getElementById("campo-transporte").value = data.transporte || "";
    document.getElementById("campo-equipo").value = data.numeroEquipo || "";
    document.getElementById("campo-marchamo").value = data.numeroMarchamo || "";
    document.getElementById("campo-piloto").value = data.nombrePiloto || "";
    document.getElementById("campo-placa").value = data.placaCamion || "";
    document.getElementById("campo-tc").value = data.tc || "";
    document.getElementById("campo-orden").value = data.ordenProduccion || "";
    document.getElementById("campo-cliente").value = data.cliente || "";
    document.getElementById("campo-picking").value = data.numeroPicking || "";
    campoFecha.value = data.fecha || fechaHoyISO();
    document.getElementById("campo-resultado").value = data.resultado || "";
    document.getElementById("campo-inspector-inocuidad").value = data.inspectorInocuidad || "";
    document.getElementById("campo-observaciones-generales").value = data.observacionesGenerales || "";

    Object.entries(data.respuestasPorZona || {}).forEach(([zonaId, z]) => {
      ["externa", "interna"].forEach((modo) => {
        (z[modo] || []).forEach((r, indice) => {
          respuestas[idItem(zonaId, modo, indice)] = { valor: r.valor, observacion: r.observacion || "" };
        });
        if (z[modo + "Otros"]) otros[`${zonaId}.${modo}`] = z[modo + "Otros"];
      });
    });
    (data.respuestasCabina || []).forEach((r, indice) => {
      respuestasCabina[indice] = { valor: r.valor, observacion: r.observacion || "" };
    });

    renderZonas();
    renderCabina();
    actualizarDiagrama();

    const titulo = document.querySelector(".app-header__titulos .titulo");
    if (titulo) titulo.textContent = "Editar Verificación de Transporte";
    btnGuardar.textContent = "Guardar cambios";

    mostrarToast("Editando verificación existente.", "info");
  } catch (err) {
    console.error("Error al cargar verificación para editar:", err);
    mostrarToast("No se pudo cargar el registro para editar.", "error");
  }
}

/* ---------------------------------------------------------
   Envío del formulario
   --------------------------------------------------------- */
function inicializarFormulario() {
  formTransporte.addEventListener("submit", async (e) => {
    e.preventDefault();

    const transporte = document.getElementById("campo-transporte").value.trim();
    const nombrePiloto = document.getElementById("campo-piloto").value.trim();
    const tc = document.getElementById("campo-tc").value.trim();
    const placaCamion = document.getElementById("campo-placa").value.trim();
    const fecha = campoFecha.value;
    const resultado = document.getElementById("campo-resultado").value;
    const observacionesGenerales = document.getElementById("campo-observaciones-generales").value.trim();

    if (!transporte || !nombrePiloto || !tc || !placaCamion || !fecha || !resultado) {
      mostrarToast("Completa los campos obligatorios: empresa, piloto, TC, placa, fecha y resultado.", "error");
      return;
    }

    // La validación de "todo respondido" recorre el ESTADO (respuestas/respuestasCabina),
    // no el DOM: solo una vista (Exterior o Interior) está renderizada a la vez, pero
    // ambas deben quedar completas antes de poder guardar.
    let faltantes = 0;
    const respuestasPorZona = {};
    ZONAS.forEach((zona) => {
      respuestasPorZona[zona.id] = { nombre: zona.nombre, externa: [], interna: [] };
      ["externa", "interna"].forEach((modo) => {
        zona[modo].items.forEach((texto, indice) => {
          const r = respuestas[idItem(zona.id, modo, indice)];
          if (!r || !r.valor) { faltantes++; return; }
          respuestasPorZona[zona.id][modo].push({
            texto,
            valor: r.valor,
            observacion: r.observacion || "",
          });
        });
        if (zona[modo].otros) {
          respuestasPorZona[zona.id][modo + "Otros"] = otros[`${zona.id}.${modo}`] || "";
        }
      });
    });

    const respuestasCabinaFinal = [];
    ZONA_CABINA.items.forEach((texto, indice) => {
      const r = respuestasCabina[indice];
      if (!r || !r.valor) { faltantes++; return; }
      respuestasCabinaFinal.push({ texto, valor: r.valor, observacion: r.observacion || "" });
    });

    if (faltantes > 0) {
      mostrarToast(`Faltan ${faltantes} puntos por responder (revisa Exterior e Interior).`, "error");
      return;
    }

    let si = 0, total = 0;
    Object.values(respuestasPorZona).forEach((z) => {
      ["externa", "interna"].forEach((modo) => {
        z[modo].forEach((r) => { total++; if (r.valor === "si") si++; });
      });
    });
    respuestasCabinaFinal.forEach((r) => { total++; if (r.valor === "si") si++; });
    const porcentajeCumplimiento = total > 0 ? Math.round((si / total) * 100) : 0;

    btnGuardar.disabled = true;
    btnGuardar.textContent = "Guardando...";

    const datos = {
      transporte,
      nombrePiloto,
      tc,
      placaCamion,
      fecha,
      numeroEquipo: document.getElementById("campo-equipo").value.trim(),
      numeroMarchamo: document.getElementById("campo-marchamo").value.trim(),
      ordenProduccion: document.getElementById("campo-orden").value.trim(),
      cliente: document.getElementById("campo-cliente").value.trim(),
      numeroPicking: document.getElementById("campo-picking").value.trim(),
      respuestasPorZona,
      respuestasCabina: respuestasCabinaFinal,
      resultado,
      inspectorInocuidad: document.getElementById("campo-inspector-inocuidad").value.trim(),
      observacionesGenerales,
      cumplimientoPorcentaje: porcentajeCumplimiento,
      cumplidos: si,
      total,
    };

    try {
      if (editandoId) {
        await updateDoc(doc(db, COLEC_REGISTROS, editandoId), {
          ...datos,
          editadoPor: usuarioActual.uid,
          editadoEn: serverTimestamp(),
        });
        mostrarToast("Verificación de transporte actualizada.", "exito");
        setTimeout(() => { window.location.href = `/hub/verificacion-transporte/historial.html?ver=${editandoId}`; }, 1000);
      } else {
        await addDoc(collection(db, COLEC_REGISTROS), {
          ...datos,
          inspectorUid: usuarioActual.uid,
          inspectorNombre: perfilActual.nombre || usuarioActual.email,
          fechaCreacion: serverTimestamp(),
        });
        mostrarToast("Verificación de transporte guardada exitosamente.", "exito");
        setTimeout(() => { window.location.href = "/hub/verificacion-transporte/historial.html"; }, 1000);
      }
    } catch (err) {
      console.error("Error al guardar verificación de transporte:", err);
      mostrarToast("No se pudo guardar la verificación. Intenta de nuevo.", "error");
      btnGuardar.disabled = false;
      btnGuardar.textContent = editandoId ? "Guardar cambios" : "Guardar Verificación";
    }
  });
}

/* ---------------------------------------------------------
   Historial, validación de liberación y exportación
   --------------------------------------------------------- */
const POR_PAGINA_TRANSPORTE = 20;
const filtroFechaDesde = document.getElementById("filtro-fecha-desde");
const filtroFechaHasta = document.getElementById("filtro-fecha-hasta");
const filtroEstadoTransporte = document.getElementById("filtro-estado-transporte");
const filtroBusquedaTransporte = document.getElementById("filtro-busqueda-transporte");
const btnDescargarTransporte = document.getElementById("btn-descargar-transporte");
const btnCargarMasTransporte = document.getElementById("btn-cargar-mas-transporte");
const tituloListaTransporte = document.getElementById("titulo-historial-transporte");
const resumenConteoEstados = document.getElementById("resumen-conteo-estados");
const filtroMesTransporte = document.getElementById("filtro-mes-transporte");

const estadoLista = {
  registrosMes: [],
  visibles: POR_PAGINA_TRANSPORTE,
};

function fechaHoyISOTransporte() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function primerDiaMesISOTransporte() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Valida de forma estricta si un contenedor fue aprobado o no.
 * Cualquier punto rechazado ("no") o porcentaje inferior a 100% determina RECHAZADO (Rojo).
 */
function esContenedorAprobado(data) {
  if (!data) return false;
  const res = String(data.resultado || "").toLowerCase().trim();
  if (res === "rechazado" || res === "no_pasa" || res === "no pasa" || res === "rechazada" || res === "fallido") {
    return false;
  }
  if (typeof data.cumplimientoPorcentaje === "number" && data.cumplimientoPorcentaje < 100) {
    return false;
  }
  if (typeof data.total === "number" && typeof data.cumplidos === "number" && data.total > 0 && data.cumplidos < data.total) {
    return false;
  }
  // Revisión detallada de respuestas de zonas (exterior e interior)
  if (data.respuestasPorZona) {
    for (const z of Object.values(data.respuestasPorZona)) {
      if (Array.isArray(z.externa) && z.externa.some((it) => it.valor === "no")) return false;
      if (Array.isArray(z.interna) && z.interna.some((it) => it.valor === "no")) return false;
    }
  }
  // Revisión de cabina
  if (Array.isArray(data.respuestasCabina) && data.respuestasCabina.some((it) => it.valor === "no")) {
    return false;
  }
  // Revisión de respuestas de partes 3D
  if (data.answers && typeof data.answers === "object") {
    for (const part of Object.values(data.answers)) {
      if (part && typeof part === "object") {
        for (const val of Object.values(part)) {
          if (val === "no") return false;
        }
      }
    }
  }
  return res === "aprobado" || res === "aprobada" || data.cumplimientoPorcentaje === 100;
}

async function inicializarHistorial() {
  const parametrosUrl = new URLSearchParams(window.location.search);
  const idVer = parametrosUrl.get("ver");

  if (btnVolver) {
    btnVolver.addEventListener("click", () => {
      vistaDetalle.classList.add("oculto");
      vistaLista.classList.remove("oculto");
      history.pushState(null, "", "/hub/verificacion-transporte/historial.html");
    });
  }

  // Establecer fechas por defecto
  const hoy = fechaHoyISOTransporte();
  const primerDia = primerDiaMesISOTransporte();

  if (filtroFechaDesde) {
    filtroFechaDesde.value = primerDia;
    filtroFechaDesde.max = hoy;
    filtroFechaDesde.addEventListener("change", () => cargarListaTransporte());
  }
  if (filtroFechaHasta) {
    filtroFechaHasta.value = hoy;
    filtroFechaHasta.addEventListener("change", () => cargarListaTransporte());
  }
  if (filtroEstadoTransporte) {
    filtroEstadoTransporte.addEventListener("change", () => {
      estadoLista.visibles = POR_PAGINA_TRANSPORTE;
      renderListaTransporte();
    });
  }
  if (filtroBusquedaTransporte) {
    filtroBusquedaTransporte.addEventListener("input", () => {
      estadoLista.visibles = POR_PAGINA_TRANSPORTE;
      renderListaTransporte();
    });
  }
  if (btnCargarMasTransporte) {
    btnCargarMasTransporte.addEventListener("click", () => {
      estadoLista.visibles += POR_PAGINA_TRANSPORTE;
      renderListaTransporte();
    });
  }
  if (btnDescargarTransporte) {
    btnDescargarTransporte.addEventListener("click", () => descargarRegistrosCSV());
  }

  await cargarListaTransporte();

  if (idVer) await verDetalle(idVer);
}

async function cargarListaTransporte() {
  estadoLista.visibles = POR_PAGINA_TRANSPORTE;
  listaVerificaciones.innerHTML = '<div class="esqueleto esqueleto-fila"></div><div class="esqueleto esqueleto-fila"></div>';

  try {
    const desde = filtroFechaDesde?.value || primerDiaMesISOTransporte();
    const hasta = filtroFechaHasta?.value || fechaHoyISOTransporte();

    const q = query(
      collection(db, COLEC_REGISTROS),
      where("fecha", ">=", desde),
      where("fecha", "<=", hasta),
      orderBy("fecha", "desc")
    );
    const snap = await getDocs(q);
    estadoLista.registrosMes = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.fechaCreacion?.toMillis?.() || 0) - (a.fechaCreacion?.toMillis?.() || 0));

    renderListaTransporte();
  } catch (err) {
    console.error("Error al cargar historial de liberación de contenedores:", err);
    listaVerificaciones.innerHTML = '<p class="texto-suave texto-sm text-center">Error al cargar registros.</p>';
  }
}

function registrosFiltradosTransporte() {
  const termino = (filtroBusquedaTransporte?.value || "").trim().toLowerCase();
  const filtroEstado = filtroEstadoTransporte?.value || "todos";

  return estadoLista.registrosMes.filter((r) => {
    const aprobado = esContenedorAprobado(r);

    if (filtroEstado === "aprobados" && !aprobado) return false;
    if (filtroEstado === "rechazados" && aprobado) return false;

    if (!termino) return true;
    return (
      String(r.ordenProduccion || "").toLowerCase().includes(termino) ||
      String(r.cliente || "").toLowerCase().includes(termino) ||
      String(r.inspectorNombre || "").toLowerCase().includes(termino) ||
      String(r.placaCamion || "").toLowerCase().includes(termino) ||
      String(r.nombrePiloto || "").toLowerCase().includes(termino) ||
      String(r.transporte || "").toLowerCase().includes(termino)
    );
  });
}

function renderListaTransporte() {
  const filtrados = registrosFiltradosTransporte();

  // Conteo de aprobados y rechazados
  let aprobadosCount = 0;
  let rechazadosCount = 0;
  estadoLista.registrosMes.forEach((r) => {
    if (esContenedorAprobado(r)) aprobadosCount++;
    else rechazadosCount++;
  });

  if (tituloListaTransporte) {
    tituloListaTransporte.textContent = `${filtrados.length} liberación${filtrados.length === 1 ? "" : "es"} encontrada${filtrados.length === 1 ? "" : "s"}`;
  }

  if (resumenConteoEstados) {
    resumenConteoEstados.innerHTML = `
      <span style="color:#16a34a; font-weight:700;">● ${aprobadosCount} Aprobado${aprobadosCount === 1 ? "" : "s"}</span>
      &nbsp;·&nbsp;
      <span style="color:#dc2626; font-weight:700;">● ${rechazadosCount} Rechazado${rechazadosCount === 1 ? "" : "s"}</span>
    `;
  }

  if (filtrados.length === 0) {
    listaVerificaciones.innerHTML = '<p class="texto-suave texto-sm text-center" style="padding: 24px 0;">No se encontraron registros de liberación de contenedores en el rango de fechas seleccionado.</p>';
    if (btnCargarMasTransporte) btnCargarMasTransporte.classList.add("oculto");
    return;
  }

  const visibles = filtrados.slice(0, estadoLista.visibles);
  listaVerificaciones.innerHTML = "";
  visibles.forEach((data) => {
    const item = document.createElement("div");
    const aprobado = esContenedorAprobado(data);
    const pct = data.cumplimientoPorcentaje ?? (aprobado ? 100 : 0);

    item.className = `item-contenedor ${aprobado ? "item-aprobado" : "item-rechazado"}`;

    item.innerHTML = `
      <div class="flex-entre" style="gap: var(--e3); align-items: flex-start; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 240px;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: var(--txt-lg); font-weight: 800; color: var(--tinta);">
              Placa: ${escaparHtml(data.placaCamion || "—")}
            </span>
            <span class="texto-suave texto-sm">· ${escaparHtml(data.transporte || "Transporte")}</span>
          </div>
          <div class="texto-suave texto-xs mt-1">
            Piloto: <strong>${escaparHtml(data.nombrePiloto || "—")}</strong> · TC: ${escaparHtml(data.tc || "—")} · Fecha: <strong>${formatearFechaISOCorta(data.fecha)}</strong>
          </div>
          ${data.ordenProduccion || data.cliente ? `
          <div class="texto-suave texto-xs">
            ${data.ordenProduccion ? `Orden: ${escaparHtml(data.ordenProduccion)}` : ''} ${data.cliente ? `· Cliente: ${escaparHtml(data.cliente)}` : ''}
          </div>` : ''}
          <div class="texto-suave texto-xs">
            Inspector: ${escaparHtml(data.inspectorNombre || "—")}
          </div>
        </div>

        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
          <span class="${aprobado ? "badge-aprobado" : "badge-rechazado"}">
            ${aprobado ? "✓ APROBADO" : "✕ RECHAZADO"} · ${pct}%
          </span>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
            <a href="../inspeccion-furgon-3d/index.html?ver=${encodeURIComponent(data.id)}" class="btn btn-secundario btn-sm" style="text-decoration:none;" title="Ver modelo 3D">
              Visor 3D 🚚
            </a>
            <button type="button" class="btn btn-primario btn-sm btn-ver-detalle" data-id="${data.id}">
              Ver Detalle →
            </button>
          </div>
        </div>
      </div>
    `;

    item.querySelector(".btn-ver-detalle").addEventListener("click", () => verDetalle(data.id));
    listaVerificaciones.appendChild(item);
  });

  if (btnCargarMasTransporte) btnCargarMasTransporte.classList.toggle("oculto", visibles.length >= filtrados.length);
}

async function verDetalle(docId) {
  try {
    const snap = await getDoc(doc(db, COLEC_REGISTROS, docId));
    if (!snap.exists()) {
      mostrarToast("El registro solicitado no existe.", "error");
      return;
    }

    const data = snap.data();
    vistaLista.classList.add("oculto");
    vistaDetalle.classList.remove("oculto");

    const aprobado = esContenedorAprobado(data);
    const pct = data.cumplimientoPorcentaje ?? (aprobado ? 100 : 0);

    const bannerHtml = aprobado
      ? `<div class="banner-aprobado">
          <svg style="width:24px;height:24px;flex:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <div>
            <div style="font-size: 16px;">CONTENEDOR APROBADO PARA CIRCULACIÓN</div>
            <div style="font-size: 13px; font-weight: normal; opacity: 0.9;">Cumple satisfactoriamente con todos los requisitos de inspección (100% cumplimiento).</div>
          </div>
        </div>`
      : `<div class="banner-rechazado">
          <svg style="width:24px;height:24px;flex:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <div>
            <div style="font-size: 16px;">CONTENEDOR RECHAZADO / NO LIBERADO</div>
            <div style="font-size: 13px; font-weight: normal; opacity: 0.9;">No cumple con los criterios de inocuidad o hermeticidad requeridos (${pct}% cumplimiento). Unidad no autorizada.</div>
          </div>
        </div>`;

    const ficha = (etiqueta, valor) => `
      <div class="ficha">
        <div class="ficha__etiqueta">${escaparHtml(etiqueta)}</div>
        <div class="ficha__valor" style="font-size: var(--txt-md);">${escaparHtml(valor || "—")}</div>
      </div>`;

    const filaRespuesta = (r) => `
      <div class="editor-item">
        <div class="flex-entre">
          <div>
            ${escaparHtml(r.texto)}
            ${r.observacion ? `<div class="texto-suave texto-xs mt-1">Obs: ${escaparHtml(r.observacion)}</div>` : ""}
          </div>
          <div>
            ${r.valor === "si"
              ? '<span class="badge-aprobado">✓ Sí</span>'
              : '<span class="badge-rechazado">✗ No</span>'}
          </div>
        </div>
      </div>`;

    const bloqueZona = (zonaId, z) => `
      <section class="tarjeta mb-3">
        <h3 class="tarjeta__titulo" style="font-size: var(--txt-md);">${escaparHtml(z.nombre)}</h3>
        <p class="texto-suave texto-xs" style="font-weight:700; margin: 0 0 var(--e2);">Exterior</p>
        <div class="editor-lista mb-2">${(z.externa || []).map(filaRespuesta).join("")}</div>
        ${z.externaOtros ? `<p class="texto-sm"><strong>Otros:</strong> ${escaparHtml(z.externaOtros)}</p>` : ""}
        <p class="texto-suave texto-xs" style="font-weight:700; margin: var(--e2) 0;">Interior</p>
        <div class="editor-lista">${(z.interna || []).map(filaRespuesta).join("")}</div>
        ${z.internaOtros ? `<p class="texto-sm"><strong>Otros:</strong> ${escaparHtml(z.internaOtros)}</p>` : ""}
      </section>`;

    detalleContenido.innerHTML = `
      ${bannerHtml}

      <section class="tarjeta">
        <div class="flex-entre mb-2">
          <h2 class="tarjeta__titulo mb-0">Liberación de Unidad de Transporte</h2>
          <span class="${aprobado ? "badge-aprobado" : "badge-rechazado"}" style="font-size: var(--txt-md);">
            ${aprobado ? "✓ APROBADO" : "✕ RECHAZADO"} · ${pct}%
          </span>
        </div>

        <div class="fichas mb-3" style="grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));">
          ${ficha("Empresa / Transporte", data.transporte)}
          ${ficha("Nombre de Piloto", data.nombrePiloto)}
          ${ficha("Placa", data.placaCamion)}
          ${ficha("Tarjeta Circulación (TC)", data.tc)}
          ${ficha("Fecha Inspección", formatearFechaISOCorta(data.fecha))}
          ${ficha("Inspector", data.inspectorNombre)}
          ${data.numeroEquipo ? ficha("# Equipo", data.numeroEquipo) : ""}
          ${data.numeroMarchamo ? ficha("# Marchamo", data.numeroMarchamo) : ""}
          ${data.ordenProduccion ? ficha("Orden de Producción", data.ordenProduccion) : ""}
          ${data.cliente ? ficha("Cliente", data.cliente) : ""}
          ${data.numeroPicking ? ficha("No. de Picking", data.numeroPicking) : ""}
          ${data.inspectorInocuidad ? ficha("Inspector de Inocuidad", data.inspectorInocuidad) : ""}
        </div>
      </section>

      <section class="tarjeta mb-4">
        <h2 class="tarjeta__titulo">Cabina, Camión y Piloto</h2>
        <div class="editor-lista">
          ${(data.respuestasCabina || []).map(filaRespuesta).join("")}
        </div>
      </section>

      ${Object.entries(data.respuestasPorZona || {}).map(([zonaId, z]) => bloqueZona(zonaId, z)).join("")}

      ${data.observacionesGenerales ? `
        <section class="tarjeta mb-4">
          <h2 class="tarjeta__titulo">Comentarios Adicionales</h2>
          <p class="mb-0">${escaparHtml(data.observacionesGenerales)}</p>
        </section>
      ` : ""}

      <div class="grupo-botones" id="detalle-acciones-transporte"></div>
    `;

    const puedeGestionar = esRolDeGestion(perfilActual.rol) || data.inspectorUid === usuarioActual.uid;
    const accionesEl = document.getElementById("detalle-acciones-transporte");
    accionesEl.innerHTML = `
      <a href="../inspeccion-furgon-3d/index.html?ver=${encodeURIComponent(docId)}" class="btn btn-dorado btn-ancho-auto" style="text-decoration:none;">
        Ver en Visor 3D 🚚
      </a>
      ${esRolDeGestion(perfilActual.rol) ? `<button type="button" class="btn btn-peligro btn-ancho-auto" id="btn-eliminar-transporte">Eliminar registro</button>` : ""}
    `;

    const btnEliminar = document.getElementById("btn-eliminar-transporte");
    if (btnEliminar) {
      btnEliminar.addEventListener("click", () => eliminarVerificacion(docId, data));
    }
  } catch (err) {
    console.error("Error al obtener detalle de liberación de contenedor:", err);
    mostrarToast("No se pudo cargar el detalle.", "error");
  }
}

async function eliminarVerificacion(docId, data) {
  const confirmado = confirm(
    `¿Eliminar la liberación de la placa "${data.placaCamion || "—"}"? Esta acción no se puede deshacer.`
  );
  if (!confirmado) return;

  try {
    await deleteDoc(doc(db, COLEC_REGISTROS, docId));
    mostrarToast("Registro de liberación eliminado.", "exito");
    vistaDetalle.classList.add("oculto");
    vistaLista.classList.remove("oculto");
    history.pushState(null, "", "/hub/verificacion-transporte/historial.html");
    cargarListaTransporte();
  } catch (err) {
    console.error("Error al eliminar registro:", err);
    mostrarToast("No se pudo eliminar el registro.", "error");
  }
}

/**
 * Descarga los registros filtrados en formato CSV (compatible con Excel con BOM UTF-8)
 */
function descargarRegistrosCSV() {
  const registros = registrosFiltradosTransporte();
  if (!registros.length) {
    mostrarToast("No hay registros en el rango de fechas seleccionado para descargar.", "error");
    return;
  }

  const desde = filtroFechaDesde?.value || primerDiaMesISOTransporte();
  const hasta = filtroFechaHasta?.value || fechaHoyISOTransporte();

  const encabezados = [
    "ID Registro",
    "Fecha Inspección",
    "Placa Camión",
    "Empresa de Transporte",
    "Piloto",
    "Tarjeta Circulación (TC)",
    "No. Equipo",
    "No. Marchamo",
    "Orden de Producción",
    "Cliente",
    "No. Picking",
    "Resultado",
    "Cumplimiento %",
    "Puntos Cumplidos",
    "Total Puntos",
    "Inspector Responsable",
    "Inspector Inocuidad",
    "Observaciones Generales",
    "Origen",
  ];

  const escaparCSV = (valor) => {
    const str = String(valor ?? "").trim();
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes(";")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const filas = registros.map((r) => {
    const aprobado = esContenedorAprobado(r);
    return [
      escaparCSV(r.id),
      escaparCSV(r.fecha || ""),
      escaparCSV(r.placaCamion || ""),
      escaparCSV(r.transporte || ""),
      escaparCSV(r.nombrePiloto || ""),
      escaparCSV(r.tc || ""),
      escaparCSV(r.numeroEquipo || ""),
      escaparCSV(r.numeroMarchamo || ""),
      escaparCSV(r.ordenProduccion || ""),
      escaparCSV(r.cliente || ""),
      escaparCSV(r.numeroPicking || ""),
      escaparCSV(aprobado ? "APROBADO" : "RECHAZADO"),
      escaparCSV(r.cumplimientoPorcentaje ?? (aprobado ? 100 : 0)),
      escaparCSV(r.cumplidos ?? ""),
      escaparCSV(r.total ?? ""),
      escaparCSV(r.inspectorNombre || ""),
      escaparCSV(r.inspectorInocuidad || ""),
      escaparCSV(r.observacionesGenerales || ""),
      escaparCSV(r.origen || "inspeccion_transporte"),
    ].join(",");
  });

  const contenidoCSV = "\uFEFF" + [encabezados.join(","), ...filas].join("\r\n");
  const blob = new Blob([contenidoCSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Liberacion_Contenedores_${desde}_al_${hasta}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  mostrarToast(`Se descargaron ${registros.length} registros de liberación exitosamente.`, "exito");
}

