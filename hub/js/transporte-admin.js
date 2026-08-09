// =========================================================
// transporte-admin.js
// Editor administrativo de la lista de verificación de transporte
// =========================================================

import { protegerPagina, cerrarSesion, ROLES_GESTION, etiquetaRol } from "./auth.js";
import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { cargarPreguntasConfiguradas } from "./transporte.js";
import { mostrarToast, generarId, escaparHtml, iniciales } from "./utils.js";

const DOC_CONFIG_PREGUNTAS = "checklists/sig-fo-transporte";

let preguntasListado = [];

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");
const btnNuevaPregunta = document.getElementById("btn-nueva-pregunta");
const listaPreguntas = document.getElementById("lista-preguntas-admin");

const modalFondo = document.getElementById("modal-fondo");
const modalTitulo = document.getElementById("modal-titulo");
const formModal = document.getElementById("form-modal");
const btnCerrarModal = document.getElementById("btn-cerrar-modal");

protegerPagina({ rolesPermitidos: ROLES_GESTION }, async ({ user, perfil }) => {
  const nombreVisible = perfil.nombre || user.email;
  if (textoUsuario) textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  if (avatarUsuario) avatarUsuario.textContent = iniciales(nombreVisible);

  preguntasListado = await cargarPreguntasAdmin();
  renderizarPreguntasAdmin();
});

if (btnSalir) {
  btnSalir.addEventListener("click", () => cerrarSesion());
}

if (btnCerrarModal) {
  btnCerrarModal.addEventListener("click", cerrarModal);
}

if (modalFondo) {
  modalFondo.addEventListener("click", (e) => {
    if (e.target === modalFondo) cerrarModal();
  });
}

if (btnNuevaPregunta) {
  btnNuevaPregunta.addEventListener("click", () => {
    abrirModalPregunta({
      titulo: "Nueva Pregunta de Verificación",
      pregunta: { id: "", texto: "", activa: true },
      alGuardar: async (datos) => {
        preguntasListado.push({
          id: generarId("p-trp"),
          texto: datos.texto.trim(),
          activa: true,
        });
        await guardarPreguntasAdmin();
      },
    });
  });
}

async function cargarPreguntasAdmin() {
  try {
    const snap = await getDoc(doc(db, DOC_CONFIG_PREGUNTAS));
    if (snap.exists() && Array.isArray(snap.data().preguntas)) {
      return snap.data().preguntas;
    }
  } catch (e) {
    console.error("Error al cargar preguntas de administración:", e);
  }
  return await cargarPreguntasConfiguradas();
}

async function guardarPreguntasAdmin() {
  try {
    await setDoc(doc(db, DOC_CONFIG_PREGUNTAS), {
      preguntas: preguntasListado,
      actualizadoEn: new Date().toISOString(),
    }, { merge: true });

    mostrarToast("Preguntas de transporte actualizadas.", "exito");
    renderizarPreguntasAdmin();
  } catch (e) {
    console.error("Error al guardar preguntas:", e);
    mostrarToast("No se pudieron guardar las preguntas.", "error");
  }
}

function renderizarPreguntasAdmin() {
  if (!listaPreguntas) return;
  listaPreguntas.innerHTML = "";

  if (preguntasListado.length === 0) {
    listaPreguntas.innerHTML = '<p class="texto-suave texto-sm text-center">No hay preguntas registradas.</p>';
    return;
  }

  preguntasListado.forEach((p, idx) => {
    const item = document.createElement("div");
    item.className = "editor-item";

    item.innerHTML = `
      <div class="editor-item__cabecera">
        <div style="flex:1;">
          <div class="editor-item__titulo">
            <strong>${idx + 1}.</strong> ${escaparHtml(p.texto)}
            ${p.activa === false ? '<span class="badge badge-neutro">Inactiva</span>' : '<span class="badge badge-exito">Activa</span>'}
          </div>
        </div>
        <div class="editor-item__acciones">
          <button type="button" class="btn btn-secundario btn-sm btn-editar" title="Editar">Editar</button>
          <button type="button" class="btn btn-secundario btn-sm btn-toggle" title="Desactivar/Activar">
            ${p.activa === false ? 'Activar' : 'Desactivar'}
          </button>
          <button type="button" class="btn btn-peligro btn-sm btn-eliminar" title="Eliminar">Eliminar</button>
        </div>
      </div>
    `;

    item.querySelector(".btn-editar").addEventListener("click", () => {
      abrirModalPregunta({
        titulo: "Editar Pregunta de Verificación",
        pregunta: p,
        alGuardar: async (datos) => {
          p.texto = datos.texto.trim();
          await guardarPreguntasAdmin();
        },
      });
    });

    item.querySelector(".btn-toggle").addEventListener("click", async () => {
      p.activa = (p.activa === false);
      await guardarPreguntasAdmin();
    });

    item.querySelector(".btn-eliminar").addEventListener("click", async () => {
      if (confirm(`¿Eliminar la pregunta "${p.texto}"?`)) {
        preguntasListado = preguntasListado.filter((itemP) => itemP.id !== p.id);
        await guardarPreguntasAdmin();
      }
    });

    listaPreguntas.appendChild(item);
  });
}

function abrirModalPregunta({ titulo, pregunta, alGuardar }) {
  modalTitulo.textContent = titulo;
  formModal.innerHTML = `
    <div class="campo mb-4">
      <label for="campo-texto-pregunta">Texto de la pregunta *</label>
      <textarea id="campo-texto-pregunta" required placeholder="Ej. ¿El camión cuenta con sellos de seguridad intactos?">${escaparHtml(pregunta.texto || "")}</textarea>
    </div>
    <div class="flex-fin gap-2">
      <button type="button" id="btn-cancelar-modal" class="btn btn-secundario">Cancelar</button>
      <button type="submit" class="btn btn-dorado">Guardar</button>
    </div>
  `;

  formModal.querySelector("#btn-cancelar-modal").addEventListener("click", cerrarModal);

  formModal.onsubmit = async (e) => {
    e.preventDefault();
    const texto = formModal.querySelector("#campo-texto-pregunta").value;
    if (!texto.trim()) {
      mostrarToast("Ingresa el texto de la pregunta.", "error");
      return;
    }
    await alGuardar({ texto });
    cerrarModal();
  };

  modalFondo.classList.remove("oculto");
}

function cerrarModal() {
  modalFondo.classList.add("oculto");
  formModal.onsubmit = null;
}
