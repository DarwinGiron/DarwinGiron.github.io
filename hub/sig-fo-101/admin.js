// =========================================================
// admin.js
// Controlador de admin.html: editor de máquinas y preguntas SI/NO de
// SIG-FO-101. Cada acción (agregar/editar/eliminar) guarda de inmediato
// en Firestore — no hay un botón "Guardar cambios" aparte que pueda
// dejar ediciones a medio camino si se cierra la pestaña.
// =========================================================

import { protegerPagina, cerrarSesion } from "./auth.js";
import { obtenerConfig, guardarConfig } from "./datos.js";
import { mostrarToast, escaparHtml, iniciales } from "./utils.js";

const textoUsuario = document.getElementById("texto-usuario");
const btnSalir = document.getElementById("btn-salir");

const listaMaquinas = document.getElementById("lista-maquinas");
const btnAgregarMaquina = document.getElementById("btn-agregar-maquina");
const listaPreguntas = document.getElementById("lista-preguntas");
const btnAgregarPregunta = document.getElementById("btn-agregar-pregunta");

const modalTexto = document.getElementById("modal-texto");
const modalTextoTitulo = document.getElementById("modal-texto-titulo");
const modalTextoEtiqueta = document.getElementById("modal-texto-etiqueta");
const modalTextoInput = document.getElementById("modal-texto-input");
const btnCerrarModalTexto = document.getElementById("btn-cerrar-modal-texto");
const btnGuardarTexto = document.getElementById("btn-guardar-texto");

const estado = {
  usuario: null,
  maquinas: [],
  preguntas: [],
  // Contexto de qué está editando el modal genérico ahora mismo.
  modal: { tipo: null, indice: null }, // tipo: "maquina" | "pregunta"
};

protegerPagina({ soloAdmin: true }, async ({ user, perfil }) => {
  estado.usuario = user;
  textoUsuario.textContent = `${perfil.nombre || user.email} (${iniciales(perfil.nombre || user.email)})`;

  try {
    const config = await obtenerConfig();
    estado.maquinas = config.maquinas;
    estado.preguntas = config.preguntas;
    render();
  } catch (error) {
    console.error("No se pudo cargar la configuración:", error);
    mostrarToast(`No se pudo cargar la configuración. ${error.message || ""}`, "error");
  }
});

btnSalir.addEventListener("click", () => cerrarSesion());

function render() {
  renderMaquinas();
  renderPreguntas();
}

/* ---------------------------------------------------------
   Máquinas (lista simple de texto)
   --------------------------------------------------------- */

function renderMaquinas() {
  if (estado.maquinas.length === 0) {
    listaMaquinas.innerHTML = `<p class="estado-vacio">Sin máquinas todavía.</p>`;
    return;
  }
  listaMaquinas.innerHTML = `<div class="lista-editable">${estado.maquinas
    .map(
      (maquina, indice) => `
      <div class="lista-editable__item">
        <span class="lista-editable__texto">${escaparHtml(maquina)}</span>
        <div class="lista-editable__acciones">
          <button type="button" class="btn btn-secundario btn-sm btn-ancho-auto" data-accion="editar-maquina" data-indice="${indice}">Editar</button>
          <button type="button" class="btn btn-peligro btn-sm btn-ancho-auto" data-accion="eliminar-maquina" data-indice="${indice}">Eliminar</button>
        </div>
      </div>`
    )
    .join("")}</div>`;

  listaMaquinas.querySelectorAll('[data-accion="editar-maquina"]').forEach((boton) => {
    boton.addEventListener("click", () => abrirModalTexto("maquina", Number(boton.dataset.indice)));
  });
  listaMaquinas.querySelectorAll('[data-accion="eliminar-maquina"]').forEach((boton) => {
    boton.addEventListener("click", () => eliminarMaquina(Number(boton.dataset.indice)));
  });
}

btnAgregarMaquina.addEventListener("click", () => abrirModalTexto("maquina", null));

async function eliminarMaquina(indice) {
  const maquina = estado.maquinas[indice];
  if (!confirm(`¿Eliminar "${maquina}" del catálogo de máquinas?`)) return;

  const anterior = [...estado.maquinas];
  estado.maquinas.splice(indice, 1);
  renderMaquinas();

  try {
    await guardarConfig({ maquinas: estado.maquinas, preguntas: estado.preguntas }, estado.usuario.uid);
    mostrarToast("Máquina eliminada.", "exito");
  } catch (error) {
    estado.maquinas = anterior;
    renderMaquinas();
    console.error("No se pudo eliminar la máquina:", error);
    mostrarToast(`No se pudo guardar. ${error.message || ""}`, "error");
  }
}

/* ---------------------------------------------------------
   Preguntas SI/NO (texto + orden; id se genera solo al crear)
   --------------------------------------------------------- */

function renderPreguntas() {
  if (estado.preguntas.length === 0) {
    listaPreguntas.innerHTML = `<p class="estado-vacio">Sin preguntas todavía.</p>`;
    return;
  }
  const ordenadas = [...estado.preguntas].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  listaPreguntas.innerHTML = `<div class="lista-editable">${ordenadas
    .map((pregunta) => {
      const indice = estado.preguntas.indexOf(pregunta);
      return `
      <div class="lista-editable__item">
        <span class="lista-editable__texto">${escaparHtml(pregunta.texto)}</span>
        <div class="lista-editable__acciones">
          <button type="button" class="btn btn-secundario btn-sm btn-ancho-auto" data-accion="editar-pregunta" data-indice="${indice}">Editar</button>
          <button type="button" class="btn btn-peligro btn-sm btn-ancho-auto" data-accion="eliminar-pregunta" data-indice="${indice}">Eliminar</button>
        </div>
      </div>`;
    })
    .join("")}</div>`;

  listaPreguntas.querySelectorAll('[data-accion="editar-pregunta"]').forEach((boton) => {
    boton.addEventListener("click", () => abrirModalTexto("pregunta", Number(boton.dataset.indice)));
  });
  listaPreguntas.querySelectorAll('[data-accion="eliminar-pregunta"]').forEach((boton) => {
    boton.addEventListener("click", () => eliminarPregunta(Number(boton.dataset.indice)));
  });
}

btnAgregarPregunta.addEventListener("click", () => abrirModalTexto("pregunta", null));

async function eliminarPregunta(indice) {
  const pregunta = estado.preguntas[indice];
  if (
    !confirm(
      `¿Eliminar la pregunta "${pregunta.texto}"? Las liberaciones ya guardadas conservan su respuesta histórica; solo deja de pedirse en las nuevas.`
    )
  ) {
    return;
  }

  const anterior = [...estado.preguntas];
  estado.preguntas.splice(indice, 1);
  renderPreguntas();

  try {
    await guardarConfig({ maquinas: estado.maquinas, preguntas: estado.preguntas }, estado.usuario.uid);
    mostrarToast("Pregunta eliminada.", "exito");
  } catch (error) {
    estado.preguntas = anterior;
    renderPreguntas();
    console.error("No se pudo eliminar la pregunta:", error);
    mostrarToast(`No se pudo guardar. ${error.message || ""}`, "error");
  }
}

/* ---------------------------------------------------------
   Modal genérico: agregar o editar un texto (máquina o pregunta)
   --------------------------------------------------------- */

function abrirModalTexto(tipo, indice) {
  estado.modal = { tipo, indice };
  const esEdicion = indice !== null;
  const esMaquina = tipo === "maquina";

  modalTextoTitulo.textContent = `${esEdicion ? "Editar" : "Agregar"} ${esMaquina ? "máquina" : "pregunta"}`;
  modalTextoEtiqueta.textContent = esMaquina ? "Nombre de la máquina" : "Texto de la pregunta";
  modalTextoInput.value = esEdicion
    ? esMaquina
      ? estado.maquinas[indice]
      : estado.preguntas[indice].texto
    : "";

  modalTexto.classList.remove("oculto");
  modalTextoInput.focus();
}

function cerrarModalTexto() {
  modalTexto.classList.add("oculto");
}

btnCerrarModalTexto.addEventListener("click", cerrarModalTexto);
modalTexto.addEventListener("click", (evento) => {
  if (evento.target === modalTexto) cerrarModalTexto();
});

btnGuardarTexto.addEventListener("click", async () => {
  const texto = modalTextoInput.value.trim();
  if (!texto) {
    mostrarToast("El texto no puede quedar vacío.", "error");
    return;
  }

  const { tipo, indice } = estado.modal;
  const esMaquina = tipo === "maquina";
  const anteriorMaquinas = [...estado.maquinas];
  const anteriorPreguntas = [...estado.preguntas];

  if (esMaquina) {
    if (indice === null) estado.maquinas.push(texto);
    else estado.maquinas[indice] = texto;
  } else if (indice === null) {
    estado.preguntas.push({
      id: `preg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      texto,
      orden: estado.preguntas.length + 1,
    });
  } else {
    estado.preguntas[indice] = { ...estado.preguntas[indice], texto };
  }

  render();
  cerrarModalTexto();

  btnGuardarTexto.disabled = true;
  try {
    await guardarConfig({ maquinas: estado.maquinas, preguntas: estado.preguntas }, estado.usuario.uid);
    mostrarToast("Guardado.", "exito");
  } catch (error) {
    estado.maquinas = anteriorMaquinas;
    estado.preguntas = anteriorPreguntas;
    render();
    console.error("No se pudo guardar:", error);
    mostrarToast(`No se pudo guardar. ${error.message || ""}`, "error");
  } finally {
    btnGuardarTexto.disabled = false;
  }
});
