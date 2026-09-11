// =========================================================
// bpm-admin.js
// Controlador de sig-fo-116/admin.html — editor de las preguntas de la
// Auditoría de Buenas Prácticas de Manufactura (SIG-FO-116).
//
// Las secciones (pestañas del formulario, cada una con su propio % de
// cumplimiento) y sus grupos (subtítulos visuales dentro de cada
// sección) son fijos, ver bpm-checklist.js. Aquí se editan las preguntas
// dentro de cada grupo. Las respuestas no se editan: siempre son
// Sí / No / No aplica.
//
// Cada cambio se guarda al momento. Las auditorías guardadas leen las
// preguntas vigentes por su id estable — corregir un texto no pierde
// respuestas ya dadas; solo borrar la pregunta las deja huérfanas
// (invisibles, no se pierden del documento).
// =========================================================

import { protegerPagina, cerrarSesion, ROLES_GESTION, etiquetaRol } from "./auth.js";
import {
  preguntasBase,
  cargarPreguntasBpm,
  guardarPreguntasBpm,
} from "./bpm-checklist.js";
import { crearModalFormulario } from "./modal-formulario.js";
import { mostrarBloqueError } from "./aviso-carga.js";
import { escaparHtml, generarId, iniciales, mostrarToast } from "./utils.js";

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");
const btnRestaurar = document.getElementById("btn-restaurar");
const zonaError = document.getElementById("zona-error");
const listaPreguntas = document.getElementById("lista-preguntas-admin");

const { abrirModal } = crearModalFormulario({
  modalFondo: document.getElementById("modal-fondo"),
  modalTitulo: document.getElementById("modal-titulo"),
  formModal: document.getElementById("form-modal"),
  btnCerrarModal: document.getElementById("btn-cerrar-modal"),
});

const estado = { usuario: null, secciones: null, configurado: false };

// Qué secciones quedaron desplegadas. Vive aparte del DOM porque cada
// guardado rehace listaPreguntas.innerHTML por completo (para reflejar
// contadores y orden), lo que borraría cualquier estado guardado en el
// propio <details>. Arranca con la primera sección abierta; null significa
// "todavía no se tocó ninguna", así solo se usa ese valor por defecto una
// vez, hasta el primer toggle real.
let seccionesAbiertas = null;

protegerPagina({ rolesPermitidos: ROLES_GESTION }, async ({ user, perfil }) => {
  estado.usuario = user;
  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);

  cargar();
});

btnSalir.addEventListener("click", () => cerrarSesion());

/** Un error de lectura se queda escrito en la página, nunca la deja vacía. */
async function cargar() {
  try {
    const { secciones, configurado } = await cargarPreguntasBpm();
    estado.secciones = secciones;
    estado.configurado = configurado;
    btnRestaurar.classList.remove("oculto");
    render();
  } catch (error) {
    console.error("No se pudieron cargar las preguntas de la auditoría de BPM:", error);
    listaPreguntas.innerHTML = "";
    mostrarBloqueError(zonaError, { error, alReintentar: cargar });
  }
}

/** Guarda todas las secciones. Si falla, recarga lo guardado para no mostrar un cambio que no quedó. */
async function guardar(mensaje) {
  try {
    await guardarPreguntasBpm(estado.secciones, estado.usuario.uid);
    estado.configurado = true;
    mostrarToast(mensaje, "exito");
    render();
  } catch (error) {
    console.error("No se pudieron guardar las preguntas:", error);
    mostrarToast("No se pudo guardar el cambio. Intenta de nuevo.", "error");
    await cargar();
    throw error;
  }
}

/* ---------------------------------------------------------
   Render
   --------------------------------------------------------- */

function render() {
  const avisoOriginales = estado.configurado
    ? ""
    : `<div class="alerta alerta-info mb-2">
         Se muestran las preguntas originales del formato. Quedan guardadas en la base con el primer cambio que hagas.
       </div>`;

  if (seccionesAbiertas === null) {
    seccionesAbiertas = new Set(estado.secciones[0] ? [estado.secciones[0].id] : []);
  }
  listaPreguntas.innerHTML = avisoOriginales + estado.secciones.map(bloqueSeccion).join("");
}

function bloqueSeccion(seccion) {
  const totalPreguntas = seccion.grupos.reduce((n, g) => n + g.preguntas.length, 0);
  const activas = seccion.grupos.reduce(
    (n, g) => n + g.preguntas.filter((p) => p.activa !== false).length,
    0
  );
  const avisoVacia = activas === 0
    ? `<p class="texto-sm mb-2" style="color: var(--estado-critico-ink, #b32626);">
         Sin preguntas activas: esta sección no aparecerá en la auditoría.
       </p>`
    : "";

  return `
    <details class="tarjeta bpm-seccion" ${seccionesAbiertas.has(seccion.id) ? "open" : ""} data-seccion="${seccion.id}">
      <summary>
        <span>
          <strong style="font-size: var(--txt-md); color: var(--tinta);">${escaparHtml(seccion.label)}</strong>
          <span class="texto-suave texto-sm" style="margin-left: var(--e2);">${activas} activa(s) de ${totalPreguntas}</span>
        </span>
      </summary>
      ${avisoVacia}
      ${seccion.grupos.map((g, indiceGrupo) => bloqueGrupo(seccion.id, g, indiceGrupo)).join("")}
    </details>
  `;
}

function bloqueGrupo(seccionId, grupo, indiceGrupo) {
  return `
    ${grupo.nombre ? `<div class="bpm-grupo-titulo">${escaparHtml(grupo.nombre)}</div>` : ""}
    <div class="editor-lista mb-2">
      ${grupo.preguntas.map((p, indice) => filaPregunta(seccionId, indiceGrupo, p, indice, grupo.preguntas.length)).join("")
        || '<p class="texto-suave texto-sm mb-0">Sin preguntas.</p>'}
      <button type="button" class="btn btn-dorado btn-sm btn-ancho-auto" data-accion="agregar" data-seccion="${seccionId}" data-grupo="${indiceGrupo}">
        + Agregar pregunta
      </button>
    </div>
  `;
}

function filaPregunta(seccionId, indiceGrupo, pregunta, indice, total) {
  const inactiva = pregunta.activa === false;
  const datos = `data-seccion="${seccionId}" data-grupo="${indiceGrupo}" data-id="${escaparHtml(pregunta.id)}"`;
  return `
    <div class="editor-item" ${inactiva ? 'style="opacity:.6;"' : ""}>
      <div class="editor-item__cabecera">
        <span class="editor-item__titulo">
          ${escaparHtml(pregunta.label)}
          ${inactiva ? '<span class="badge badge-neutro">Inactiva</span>' : ""}
        </span>
        <div class="editor-item__acciones">
          <button type="button" class="btn btn-secundario btn-sm" data-accion="subir" ${datos} title="Subir" ${indice === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="btn btn-secundario btn-sm" data-accion="bajar" ${datos} title="Bajar" ${indice === total - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="btn btn-secundario btn-sm" data-accion="editar" ${datos}>Editar</button>
          <button type="button" class="btn btn-secundario btn-sm" data-accion="alternar" ${datos}>${inactiva ? "Activar" : "Desactivar"}</button>
          <button type="button" class="btn btn-peligro btn-sm" data-accion="eliminar" ${datos}>Eliminar</button>
        </div>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------
   Acciones
   --------------------------------------------------------- */

const CAMPOS_PREGUNTA = [
  {
    name: "label",
    label: "Texto de la pregunta",
    type: "textarea",
    required: true,
    placeholder: "Ej. ¿Se cuenta con un programa de mantenimiento de equipos?",
    ayuda: "Se responde Sí / No / No aplica.",
  },
];

// Conservar abierta/cerrada cada sección entre renders (igual que hace el
// propio formulario con sus grupos): sin esto, guardar un cambio cierra
// de nuevo la sección en la que se está trabajando. El evento "toggle" no
// burbujea en todos los navegadores, pero la fase de captura sí pasa por
// aquí siempre, así que se escucha con capture:true.
listaPreguntas.addEventListener("toggle", (evento) => {
  const det = evento.target.closest?.("details[data-seccion]") || evento.target;
  const id = det?.dataset?.seccion;
  if (!id) return;
  if (det.open) seccionesAbiertas.add(id);
  else seccionesAbiertas.delete(id);
}, true);

listaPreguntas.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton || boton.disabled) return;

  const seccion = estado.secciones.find((s) => s.id === boton.dataset.seccion);
  if (!seccion) return;
  const grupo = seccion.grupos[Number(boton.dataset.grupo)];
  if (!grupo) return;
  const nombreSeccion = seccion.label + (grupo.nombre ? ` · ${grupo.nombre}` : "");

  if (boton.dataset.accion === "agregar") {
    abrirModal({
      titulo: `Nueva pregunta · ${nombreSeccion}`,
      campos: CAMPOS_PREGUNTA,
      alGuardar: async (datos) => {
        if (!datos.label) {
          mostrarToast("Escribe el texto de la pregunta.", "error");
          throw new Error("Texto vacío");
        }
        grupo.preguntas.push({ id: generarId("q"), label: datos.label, activa: true });
        await guardar("Pregunta agregada.");
      },
    });
    return;
  }

  const indice = grupo.preguntas.findIndex((p) => p.id === boton.dataset.id);
  if (indice === -1) return;
  const pregunta = grupo.preguntas[indice];

  switch (boton.dataset.accion) {
    case "editar":
      abrirModal({
        titulo: `Editar pregunta · ${nombreSeccion}`,
        campos: CAMPOS_PREGUNTA,
        valores: { label: pregunta.label },
        alGuardar: async (datos) => {
          if (!datos.label) {
            mostrarToast("Escribe el texto de la pregunta.", "error");
            throw new Error("Texto vacío");
          }
          pregunta.label = datos.label;
          await guardar("Pregunta actualizada.");
        },
      });
      break;

    case "alternar":
      pregunta.activa = pregunta.activa === false;
      await guardar(pregunta.activa ? "Pregunta activada." : "Pregunta desactivada.").catch(() => {});
      break;

    case "subir":
    case "bajar": {
      const destino = boton.dataset.accion === "subir" ? indice - 1 : indice + 1;
      if (destino < 0 || destino >= grupo.preguntas.length) return;
      [grupo.preguntas[indice], grupo.preguntas[destino]] = [grupo.preguntas[destino], grupo.preguntas[indice]];
      await guardar("Orden actualizado.").catch(() => {});
      break;
    }

    case "eliminar":
      if (!confirm(`¿Eliminar "${pregunta.label}" de ${nombreSeccion}?\n\nLas auditorías ya guardadas conservan la respuesta, pero dejarán de mostrarla. Si solo quieres dejar de preguntarla por un tiempo, usa "Desactivar".`)) return;
      grupo.preguntas.splice(indice, 1);
      await guardar("Pregunta eliminada.").catch(() => {});
      break;
  }
});

btnRestaurar.addEventListener("click", async () => {
  if (!confirm("¿Volver a las preguntas originales del formato en TODAS las secciones?\n\nSe pierden las preguntas agregadas y los textos editados. Las auditorías ya guardadas no cambian.")) return;
  estado.secciones = preguntasBase();
  await guardar("Se restauraron las preguntas originales.").catch(() => {});
});
