// =========================================================
// vidrio.js
// Controlador de vidrio-plastico/index.html — SIG-FO-111, registro de
// vidrio y plástico quebradizo.
//
// El formato es una recorrida mensual sobre una lista FIJA de puntos: las
// preguntas (los puntos y su material) son iguales para todos y se
// configuran una sola vez en Configuraciones; lo que cambia de un registro
// a otro son las respuestas — el tipo de riesgo observado en cada punto y,
// cuando lo amerita, la acción requerida.
//
// La lista es larga (más de cien puntos), así que el formulario trae
// búsqueda y un filtro de pendientes en vez de obligar a bajar por todo.
// =========================================================

import { protegerPagina, cerrarSesion, etiquetaRol } from "./auth.js";
import { crearRegistroVidrio, obtenerFormatoVidrio } from "./firestore.js";
import { ENCABEZADO_SEMILLA, PUNTOS_SEMILLA, RIESGOS_SEMILLA } from "./vidrio-datos.js";
import { escaparHtml, fechaHoyISO, iniciales, mostrarToast } from "./utils.js";

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");

const tituloFormato = document.getElementById("titulo-formato");
const badgeCodigo = document.getElementById("badge-codigo");
const textoFrecuencia = document.getElementById("texto-frecuencia");
const listaRiesgos = document.getElementById("lista-riesgos");

const campoFecha = document.getElementById("campo-fecha");
const campoInspeccionado = document.getElementById("campo-inspeccionado");
const campoRevisado = document.getElementById("campo-revisado");
const campoComentarios = document.getElementById("campo-comentarios");

const filtroPuntos = document.getElementById("filtro-puntos");
const chkPendientes = document.getElementById("chk-pendientes");
const listaPuntos = document.getElementById("lista-puntos");
const contadorAvance = document.getElementById("contador-avance");
const plantillaPunto = document.getElementById("plantilla-punto");
const btnGuardar = document.getElementById("btn-guardar");

const estado = {
  usuario: null,
  perfil: null,
  encabezado: ENCABEZADO_SEMILLA,
  riesgos: RIESGOS_SEMILLA,
  puntos: [],
  // puntoId -> { riesgo: number, accion: string }
  respuestas: {},
};

protegerPagina({}, async ({ user, perfil }) => {
  estado.usuario = user;
  estado.perfil = perfil;

  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);

  campoFecha.value = fechaHoyISO();
  campoInspeccionado.value = nombreVisible;

  try {
    const formato = await obtenerFormatoVidrio();
    if (formato) {
      estado.encabezado = { ...ENCABEZADO_SEMILLA, ...(formato.encabezado || {}) };
      estado.riesgos = formato.riesgos?.length ? formato.riesgos : RIESGOS_SEMILLA;
      estado.puntos = formato.puntos || [];
    } else {
      // Sin configurar todavía: se muestra la lista del formato en papel
      // para no dejar la pantalla vacía, y se avisa.
      estado.puntos = PUNTOS_SEMILLA;
      mostrarToast(
        "Mostrando la lista del formato en papel: un administrador aún no la ha configurado.",
        "alerta"
      );
    }
  } catch (error) {
    console.error("No se pudo cargar el formato SIG-FO-111:", error);
    estado.puntos = PUNTOS_SEMILLA;
    mostrarToast("No se pudo cargar el formato configurado.", "error");
  }

  pintarEncabezado();
  renderPuntos();
});

btnSalir.addEventListener("click", () => cerrarSesion());

function pintarEncabezado() {
  tituloFormato.textContent = estado.encabezado.titulo;
  badgeCodigo.textContent = `${estado.encabezado.codigo} · ${estado.encabezado.revision}`;
  textoFrecuencia.textContent = estado.encabezado.frecuencia;

  listaRiesgos.innerHTML = estado.riesgos
    .map(
      (r) => `
      <li>
        <span class="badge riesgo-badge riesgo-${r.valor}">${r.valor}</span>
        <strong>${escaparHtml(r.etiqueta)}</strong> — ${escaparHtml(r.descripcion)}
      </li>
    `
    )
    .join("");
}

/* ---------------------------------------------------------
   Lista de puntos
   --------------------------------------------------------- */

filtroPuntos.addEventListener("input", renderPuntos);
chkPendientes.addEventListener("change", renderPuntos);

function puntosOrdenados() {
  return [...estado.puntos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

function puntosVisibles() {
  const termino = filtroPuntos.value.trim().toLowerCase();
  return puntosOrdenados().filter((p) => {
    if (chkPendientes.checked && estado.respuestas[p.id]) return false;
    if (!termino) return true;
    return `${p.proceso} ${p.localizacion} ${p.material} ${p.tipo}`
      .toLowerCase()
      .includes(termino);
  });
}

function renderPuntos() {
  const visibles = puntosVisibles();
  listaPuntos.innerHTML = "";

  if (visibles.length === 0) {
    listaPuntos.innerHTML = `<p class="texto-suave texto-sm mb-0">${
      chkPendientes.checked && !filtroPuntos.value
        ? "No queda ningún punto pendiente."
        : "Ningún punto coincide con la búsqueda."
    }</p>`;
  } else {
    for (const punto of visibles) listaPuntos.appendChild(crearNodoPunto(punto));
  }

  actualizarAvance();
}

function crearNodoPunto(punto) {
  const nodo = plantillaPunto.content.firstElementChild.cloneNode(true);
  const respuesta = estado.respuestas[punto.id];

  nodo.querySelector(".punto-material").textContent = punto.material;
  nodo.querySelector(".punto-ubicacion").textContent = `${punto.proceso} · ${punto.localizacion}`;
  nodo.querySelector(".punto-tipo").textContent = punto.tipo;

  const opciones = nodo.querySelector(".riesgo-opciones");
  const campoAccion = nodo.querySelector(".punto-accion");
  const entradaAccion = campoAccion.querySelector("input");

  opciones.innerHTML = estado.riesgos
    .map(
      (r) => `
      <button type="button" class="riesgo-opcion riesgo-${r.valor} ${
        respuesta?.riesgo === r.valor ? "activo" : ""
      }" data-riesgo="${r.valor}" title="${escaparHtml(r.descripcion)}">
        ${r.valor} · ${escaparHtml(r.etiqueta)}
      </button>
    `
    )
    .join("");

  entradaAccion.id = `${punto.id}-accion`;
  entradaAccion.previousElementSibling?.setAttribute("for", entradaAccion.id);
  entradaAccion.value = respuesta?.accion || "";
  campoAccion.classList.toggle("oculto", !requiereAccion(respuesta?.riesgo));

  opciones.addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-riesgo]");
    if (!boton) return;

    const valor = Number(boton.dataset.riesgo);
    const actual = estado.respuestas[punto.id];

    // Volver a tocar el mismo nivel lo deselecciona: sirve para corregir
    // un toque accidental sin tener que recargar.
    if (actual?.riesgo === valor) {
      delete estado.respuestas[punto.id];
    } else {
      estado.respuestas[punto.id] = { riesgo: valor, accion: actual?.accion || "" };
    }

    const nuevo = estado.respuestas[punto.id];
    opciones.querySelectorAll("[data-riesgo]").forEach((b) => {
      b.classList.toggle("activo", Number(b.dataset.riesgo) === nuevo?.riesgo);
    });
    campoAccion.classList.toggle("oculto", !requiereAccion(nuevo?.riesgo));
    actualizarAvance();
  });

  entradaAccion.addEventListener("input", () => {
    if (estado.respuestas[punto.id]) {
      estado.respuestas[punto.id].accion = entradaAccion.value;
    }
  });

  return nodo;
}

/** Solo el nivel más alto pide acción escrita; los otros dos son informativos. */
function requiereAccion(valor) {
  if (!valor) return false;
  return Boolean(estado.riesgos.find((r) => r.valor === valor)?.requiereAccion);
}

function actualizarAvance() {
  const respondidos = Object.keys(estado.respuestas).length;
  contadorAvance.textContent = `${respondidos} / ${estado.puntos.length}`;
}

/* ---------------------------------------------------------
   Guardado
   --------------------------------------------------------- */

btnGuardar.addEventListener("click", async () => {
  const fecha = campoFecha.value;
  const inspeccionadoPor = campoInspeccionado.value.trim();

  if (!fecha) {
    mostrarToast("Indica la fecha de la inspección.", "alerta");
    return;
  }
  if (!inspeccionadoPor) {
    mostrarToast("Indica quién realizó la inspección.", "alerta");
    campoInspeccionado.focus();
    return;
  }

  const evaluados = Object.entries(estado.respuestas);
  if (evaluados.length === 0) {
    mostrarToast("Marca el tipo de riesgo de al menos un punto.", "alerta");
    return;
  }

  // El texto del punto se congela en el registro: si mañana se renombra o
  // se elimina de la configuración, la inspección sigue siendo legible.
  const porId = new Map(estado.puntos.map((p) => [p.id, p]));
  const puntos = evaluados.map(([id, respuesta]) => {
    const punto = porId.get(id) || {};
    return {
      puntoId: id,
      proceso: punto.proceso || "",
      localizacion: punto.localizacion || "",
      material: punto.material || "",
      tipo: punto.tipo || "",
      riesgo: respuesta.riesgo,
      accion: (respuesta.accion || "").trim(),
    };
  });

  const urgentes = puntos.filter((p) => requiereAccion(p.riesgo));
  const sinAccion = urgentes.filter((p) => !p.accion);
  if (sinAccion.length > 0) {
    mostrarToast(
      `${sinAccion.length} punto(s) de acción urgente sin acción requerida escrita.`,
      "alerta"
    );
    return;
  }

  btnGuardar.disabled = true;
  btnGuardar.textContent = "Guardando…";

  try {
    await crearRegistroVidrio({
      fecha,
      inspeccionadoPor,
      revisadoPor: campoRevisado.value.trim(),
      comentarios: campoComentarios.value.trim(),
      puntos,
      totalPuntos: estado.puntos.length,
      urgentes: urgentes.length,
      inspectorUid: estado.usuario.uid,
      inspectorNombre: estado.perfil.nombre || estado.usuario.email,
    });
    mostrarToast("Inspección guardada.", "exito");
    window.location.href = "historial.html";
  } catch (error) {
    console.error("No se pudo guardar el registro SIG-FO-111:", error);
    mostrarToast("No se pudo guardar la inspección. Verifica tu conexión.", "error");
    btnGuardar.disabled = false;
    btnGuardar.textContent = "Guardar inspección";
  }
});
