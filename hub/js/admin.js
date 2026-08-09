// =========================================================
// admin.js
// Controlador de admin.html: editor de estructura del checklist
// (secciones, aspectos, áreas, criterios), gestión de usuarios
// y publicación de versiones.
// Toda edición se guarda de inmediato en el borrador de Firestore.
// =========================================================

import {
  protegerPagina,
  cerrarSesion,
  ROLES,
  ROLES_GESTION,
  etiquetaRol,
} from "./auth.js";
import {
  obtenerChecklist,
  guardarBorradorChecklist,
  publicarVersionChecklist,
  listarUsuarios,
  guardarUsuario,
} from "./firestore.js";
import { invitarUsuario, generarContrasenaTemporal } from "./usuarios.js";
import { sembrarChecklistInicial, aplicarAplicabilidadSugerida } from "./seed.js";
import { CHECKLIST_ID } from "./firebase-config.js";
import {
  generarId,
  iniciales,
  mostrarToast,
  escaparHtml,
  traducirErrorAuth,
} from "./utils.js";

/* ---------------------------------------------------------
   Referencias al DOM
   --------------------------------------------------------- */

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");
const zonaSemilla = document.getElementById("zona-semilla");

const tabs = document.querySelectorAll(".tabs__item");
const pestanas = document.querySelectorAll(".pestana");

const listaSecciones = document.getElementById("lista-secciones");
const btnNuevaSeccion = document.getElementById("btn-nueva-seccion");
const btnAplicabilidadExcel = document.getElementById("btn-aplicabilidad-excel");

const listaAreas = document.getElementById("lista-areas");
const btnNuevaArea = document.getElementById("btn-nueva-area");

const listaCriterios = document.getElementById("lista-criterios");
const btnNuevoCriterio = document.getElementById("btn-nuevo-criterio");

const btnInvitarUsuario = document.getElementById("btn-invitar-usuario");
const chkMostrarInactivos = document.getElementById("chk-mostrar-inactivos");
const listaUsuarios = document.getElementById("lista-usuarios");

const versionVigenteEl = document.getElementById("version-vigente");
const estadoBorradorEl = document.getElementById("estado-borrador");
const btnPublicar = document.getElementById("btn-publicar");

const modalFondo = document.getElementById("modal-fondo");
const modalTitulo = document.getElementById("modal-titulo");
const formModal = document.getElementById("form-modal");
const btnCerrarModal = document.getElementById("btn-cerrar-modal");

/* ---------------------------------------------------------
   Estado
   --------------------------------------------------------- */

const estado = {
  usuario: null,
  checklist: null, // { id, codigo, nombre, areas, secciones, criterios, versionVigente, borradorModificado }
  usuarios: [], // perfiles de /usuarios
};

/* ---------------------------------------------------------
   Arranque
   --------------------------------------------------------- */

protegerPagina({ rolesPermitidos: ROLES_GESTION }, async ({ user, perfil }) => {
  estado.usuario = user;
  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);

  await cargarChecklist();
  await cargarUsuarios();
});

btnSalir.addEventListener("click", () => cerrarSesion());

async function cargarChecklist() {
  try {
    estado.checklist = await obtenerChecklist(CHECKLIST_ID);

    if (!estado.checklist) {
      mostrarBannerSemilla();
      return;
    }

    zonaSemilla.classList.add("oculto");
    renderSecciones();
    renderAreas();
    renderCriterios();
    renderPublicar();
  } catch (error) {
    console.error("Error al cargar el checklist:", error);
    mostrarToast("No se pudo cargar el checklist.", "error");
  }
}

function mostrarBannerSemilla() {
  zonaSemilla.classList.remove("oculto");
  zonaSemilla.innerHTML = `
    <div class="alerta alerta-info">
      Todavía no existe el checklist "${CHECKLIST_ID}" en Firestore.
      <button type="button" id="btn-cargar-semilla" class="btn btn-dorado btn-sm btn-ancho-auto" style="margin-top:10px; display:block;">
        Cargar estructura inicial desde el Excel (SIG-FO-115)
      </button>
    </div>
  `;
  document.getElementById("btn-cargar-semilla").addEventListener("click", async (evento) => {
    const boton = evento.target;
    boton.disabled = true;
    boton.textContent = "Cargando…";
    try {
      await sembrarChecklistInicial(estado.usuario.uid);
      await cargarChecklist();
      mostrarToast("Estructura inicial cargada y publicada como versión 1.", "exito");
    } catch (error) {
      console.error("Error al cargar la semilla:", error);
      mostrarToast("No se pudo cargar la estructura inicial.", "error");
      boton.disabled = false;
      boton.textContent = "Cargar estructura inicial desde el Excel (SIG-FO-115)";
    }
  });
}

/* ---------------------------------------------------------
   Pestañas
   --------------------------------------------------------- */

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("activo"));
    pestanas.forEach((p) => p.classList.remove("activa"));
    tab.classList.add("activo");
    document.querySelector(`[data-pestana="${tab.dataset.tab}"]`).classList.add("activa");
  });
});

/* ---------------------------------------------------------
   Guardado del borrador
   --------------------------------------------------------- */

async function guardarCampos(campos) {
  try {
    await guardarBorradorChecklist(CHECKLIST_ID, campos, estado.usuario.uid);
    estado.checklist.borradorModificado = true;
    renderPublicar();
  } catch (error) {
    console.error("Error al guardar cambios:", error);
    mostrarToast("No se pudo guardar el cambio. Intenta de nuevo.", "error");
    throw error;
  }
}

function ordenarPorOrden(lista) {
  return [...lista].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

function reindexarOrden(lista) {
  ordenarPorOrden(lista).forEach((item, i) => {
    item.orden = i + 1;
  });
}

/* ---------------------------------------------------------
   Modal genérico
   --------------------------------------------------------- */

function abrirModal({ titulo, campos, valores = {}, alGuardar }) {
  modalTitulo.textContent = titulo;
  formModal.innerHTML = "";

  for (const campo of campos) {
    const contenedor = document.createElement("div");
    contenedor.className = "campo";

    if (campo.type === "checkbox") {
      contenedor.innerHTML = `
        <label class="check-linea">
          <input type="checkbox" name="${campo.name}" ${
        valores[campo.name] ? "checked" : ""
      } />
          ${escaparHtml(campo.label)}
        </label>
      `;
    } else if (campo.type === "textarea") {
      contenedor.innerHTML = `
        <label>${escaparHtml(campo.label)}</label>
        <textarea name="${campo.name}" ${campo.required ? "required" : ""} placeholder="${escaparHtml(
        campo.placeholder || ""
      )}">${escaparHtml(valores[campo.name] || "")}</textarea>
      `;
    } else if (campo.type === "select") {
      contenedor.innerHTML = `
        <label>${escaparHtml(campo.label)}</label>
        <select name="${campo.name}">
          ${campo.opciones
            .map(
              (op) =>
                `<option value="${op.value}" ${
                  valores[campo.name] === op.value ? "selected" : ""
                }>${escaparHtml(op.label)}</option>`
            )
            .join("")}
        </select>
      `;
    } else {
      contenedor.innerHTML = `
        <label>${escaparHtml(campo.label)}</label>
        <input
          type="${campo.type || "text"}"
          name="${campo.name}"
          ${campo.required ? "required" : ""}
          ${campo.disabled ? "disabled" : ""}
          ${campo.step ? `step="${campo.step}"` : ""}
          value="${escaparHtml(valores[campo.name] ?? "")}"
          placeholder="${escaparHtml(campo.placeholder || "")}"
        />
      `;
    }

    if (campo.ayuda) {
      const ayuda = document.createElement("p");
      ayuda.className = "campo-ayuda";
      ayuda.textContent = campo.ayuda;
      contenedor.appendChild(ayuda);
    }

    formModal.appendChild(contenedor);
  }

  const acciones = document.createElement("div");
  acciones.className = "grupo-botones";
  acciones.innerHTML = `
    <button type="submit" class="btn btn-primario btn-ancho-auto">Guardar</button>
    <button type="button" class="btn btn-secundario btn-ancho-auto" data-cerrar>Cancelar</button>
  `;
  formModal.appendChild(acciones);

  formModal.querySelector("[data-cerrar]").addEventListener("click", cerrarModal);

  formModal.onsubmit = async (evento) => {
    evento.preventDefault();
    const datos = new FormData(formModal);
    const resultado = {};
    for (const campo of campos) {
      if (campo.type === "checkbox") {
        resultado[campo.name] = formModal.querySelector(`[name="${campo.name}"]`).checked;
      } else if (campo.type === "number") {
        resultado[campo.name] = Number(datos.get(campo.name));
      } else {
        resultado[campo.name] = (datos.get(campo.name) || "").toString().trim();
      }
    }
    try {
      await alGuardar(resultado);
      cerrarModal();
    } catch (error) {
      // El error ya fue mostrado por la función guardarCampos/alGuardar.
    }
  };

  modalFondo.classList.remove("oculto");
}

function cerrarModal() {
  modalFondo.classList.add("oculto");
  formModal.onsubmit = null;
}

btnCerrarModal.addEventListener("click", cerrarModal);
modalFondo.addEventListener("click", (evento) => {
  if (evento.target === modalFondo) cerrarModal();
});

/* ---------------------------------------------------------
   ESTRUCTURA — Secciones y aspectos
   --------------------------------------------------------- */

/**
 * Resume en qué áreas aplica una sección o aspecto.
 * Sin lista definida = aplica a todas.
 */
function resumenAreas(elemento) {
  const areas = elemento?.areas;
  const total = (estado.checklist.areas || []).length;

  if (!Array.isArray(areas) || areas.length === 0) {
    return `<span class="badge badge-neutro">Todas las áreas</span>`;
  }
  if (areas.length === total) {
    return `<span class="badge badge-neutro">Todas las áreas</span>`;
  }
  return `<span class="badge badge-marino">${areas.length} de ${total} áreas</span>`;
}

function renderSecciones() {
  listaSecciones.innerHTML = "";
  const secciones = ordenarPorOrden(estado.checklist.secciones || []);

  secciones.forEach((seccion, indice) => {
    const item = document.createElement("div");
    item.className = "editor-item";
    item.innerHTML = `
      <div class="editor-item__cabecera">
        <span class="editor-item__titulo">
          ${indice + 1}. ${escaparHtml(seccion.titulo)}
          ${resumenAreas(seccion)}
        </span>
        <div class="editor-item__acciones">
          <button class="btn btn-secundario btn-sm" data-accion="subir-seccion" data-id="${seccion.id}" ${
      indice === 0 ? "disabled" : ""
    }>↑</button>
          <button class="btn btn-secundario btn-sm" data-accion="bajar-seccion" data-id="${seccion.id}" ${
      indice === secciones.length - 1 ? "disabled" : ""
    }>↓</button>
          <button class="btn btn-secundario btn-sm" data-accion="areas-seccion" data-id="${seccion.id}">Áreas</button>
          <button class="btn btn-secundario btn-sm" data-accion="editar-seccion" data-id="${seccion.id}">Editar</button>
          <button class="btn btn-peligro btn-sm" data-accion="eliminar-seccion" data-id="${seccion.id}">Eliminar</button>
        </div>
      </div>
      <div class="editor-sub-lista" data-aspectos-de="${seccion.id}"></div>
      <button type="button" class="btn btn-secundario btn-sm btn-ancho-auto" style="margin-top:10px;" data-accion="nuevo-aspecto" data-id="${
        seccion.id
      }">
        + Aspecto
      </button>
    `;
    listaSecciones.appendChild(item);
    renderAspectos(seccion, item.querySelector("[data-aspectos-de]"));
  });
}

/**
 * Modal de casillas para elegir en qué áreas aplica una sección o un aspecto.
 * Marcar todas equivale a "sin restricción".
 */
function abrirModalAreas({ titulo, elemento, ayuda, alGuardar }) {
  const areas = ordenarPorOrden(estado.checklist.areas || []);
  const seleccion = new Set(
    Array.isArray(elemento.areas) && elemento.areas.length > 0
      ? elemento.areas
      : areas.map((a) => a.id)
  );

  modalTitulo.textContent = titulo;
  formModal.innerHTML = `
    <p class="campo-ayuda" style="margin-bottom: var(--e3);">${escaparHtml(ayuda)}</p>
    <div class="grupo-botones" style="margin-bottom: var(--e3);">
      <button type="button" class="btn btn-secundario btn-sm btn-ancho-auto" data-todas>Marcar todas</button>
      <button type="button" class="btn btn-secundario btn-sm btn-ancho-auto" data-ninguna>Desmarcar todas</button>
    </div>
    <div class="editor-lista" style="margin-bottom: var(--e4);">
      ${areas
        .map(
          (area) => `
        <label class="check-linea" style="padding: var(--e2) var(--e3); border:1px solid var(--borde); border-radius: var(--r-sm);">
          <input type="checkbox" value="${escaparHtml(area.id)}" ${
            seleccion.has(area.id) ? "checked" : ""
          } />
          <span>${escaparHtml(area.nombre)}
            <span class="badge badge-dorado">${escaparHtml(area.id)}</span>
          </span>
        </label>`
        )
        .join("")}
    </div>
    <p class="campo-ayuda" data-conteo></p>
    <div class="grupo-botones">
      <button type="submit" class="btn btn-primario btn-ancho-auto">Guardar</button>
      <button type="button" class="btn btn-secundario btn-ancho-auto" data-cerrar>Cancelar</button>
    </div>
  `;

  const casillas = [...formModal.querySelectorAll('input[type="checkbox"]')];
  const conteo = formModal.querySelector("[data-conteo]");

  const actualizarConteo = () => {
    const n = casillas.filter((c) => c.checked).length;
    conteo.textContent =
      n === casillas.length
        ? "Aplica a todas las áreas."
        : `Aplica a ${n} de ${casillas.length} áreas.`;
  };
  actualizarConteo();

  casillas.forEach((c) => c.addEventListener("change", actualizarConteo));
  formModal.querySelector("[data-todas]").addEventListener("click", () => {
    casillas.forEach((c) => (c.checked = true));
    actualizarConteo();
  });
  formModal.querySelector("[data-ninguna]").addEventListener("click", () => {
    casillas.forEach((c) => (c.checked = false));
    actualizarConteo();
  });
  formModal.querySelector("[data-cerrar]").addEventListener("click", cerrarModal);

  formModal.onsubmit = async (evento) => {
    evento.preventDefault();
    const elegidas = casillas.filter((c) => c.checked).map((c) => c.value);

    if (elegidas.length === 0) {
      mostrarToast("Selecciona al menos un área.", "error");
      return;
    }

    try {
      // Si están todas, se guarda vacío: "sin restricción".
      await alGuardar(elegidas.length === casillas.length ? [] : elegidas);
      cerrarModal();
    } catch (error) {
      // El error ya se informó en alGuardar.
    }
  };

  modalFondo.classList.remove("oculto");
}

function renderAspectos(seccion, contenedor) {
  const aspectos = ordenarPorOrden(seccion.aspectos || []);
  contenedor.innerHTML = "";

  aspectos.forEach((aspecto, indice) => {
    const fila = document.createElement("div");
    fila.className = "editor-item";
    fila.innerHTML = `
      <div class="editor-item__cabecera">
        <span class="editor-item__titulo" style="font-weight:500;">
          ${escaparHtml(aspecto.texto)}
          ${aspecto.peso && aspecto.peso !== 1 ? `<span class="aspecto__peso">Peso ${aspecto.peso}</span>` : ""}
          ${
            Array.isArray(aspecto.areas) && aspecto.areas.length > 0
              ? `<span class="badge badge-marino">Solo ${aspecto.areas.length} área${
                  aspecto.areas.length === 1 ? "" : "s"
                }</span>`
              : ""
          }
        </span>
        <div class="editor-item__acciones">
          <button class="btn btn-secundario btn-sm" data-accion="subir-aspecto" data-seccion="${
            seccion.id
          }" data-id="${aspecto.id}" ${indice === 0 ? "disabled" : ""}>↑</button>
          <button class="btn btn-secundario btn-sm" data-accion="bajar-aspecto" data-seccion="${
            seccion.id
          }" data-id="${aspecto.id}" ${indice === aspectos.length - 1 ? "disabled" : ""}>↓</button>
          <button class="btn btn-secundario btn-sm" data-accion="areas-aspecto" data-seccion="${
            seccion.id
          }" data-id="${aspecto.id}">Áreas</button>
          <button class="btn btn-secundario btn-sm" data-accion="editar-aspecto" data-seccion="${
            seccion.id
          }" data-id="${aspecto.id}">Editar</button>
          <button class="btn btn-peligro btn-sm" data-accion="eliminar-aspecto" data-seccion="${
            seccion.id
          }" data-id="${aspecto.id}">Eliminar</button>
        </div>
      </div>
    `;
    contenedor.appendChild(fila);
  });
}

btnNuevaSeccion.addEventListener("click", () => {
  abrirModal({
    titulo: "Nueva sección",
    campos: [{ name: "titulo", label: "Título de la sección", required: true }],
    alGuardar: async ({ titulo }) => {
      const secciones = estado.checklist.secciones || [];
      secciones.push({
        id: generarId("sec"),
        titulo,
        orden: secciones.length + 1,
        aspectos: [],
      });
      estado.checklist.secciones = secciones;
      await guardarCampos({ secciones });
      renderSecciones();
    },
  });
});

/**
 * Reaplica la aplicabilidad por proceso derivada del Excel a las secciones
 * existentes. Útil para checklists cargados antes de que existiera el campo.
 */
btnAplicabilidadExcel.addEventListener("click", async () => {
  if (
    !confirm(
      "Se ajustará, en cada sección, en qué áreas se evalúa, según la hoja Rev. 00 del Excel.\n\n" +
        "No se tocan los textos, pesos, orden ni aspectos que hayas editado.\n\n" +
        "¿Continuar?"
    )
  )
    return;

  btnAplicabilidadExcel.disabled = true;
  btnAplicabilidadExcel.textContent = "Aplicando…";

  try {
    const { actualizadas, sinCoincidencia } = await aplicarAplicabilidadSugerida(
      estado.usuario.uid
    );
    await cargarChecklist();
    mostrarToast(`Aplicabilidad ajustada en ${actualizadas} secciones.` +
        (sinCoincidencia.length
          ? ` No se tocaron las secciones creadas a mano: ${sinCoincidencia.join(", ")}.`
          : "") +
        " Recuerda publicar una nueva versión para que los inspectores la usen.",
      "exito"
    );
  } catch (error) {
    console.error("Error al aplicar la aplicabilidad:", error);
    mostrarToast("No se pudo aplicar la aplicabilidad sugerida.", "error");
  } finally {
    btnAplicabilidadExcel.disabled = false;
    btnAplicabilidadExcel.textContent = "Aplicabilidad del Excel";
  }
});

listaSecciones.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;

  const accion = boton.dataset.accion;
  const secciones = estado.checklist.secciones;
  const seccion = secciones.find((s) => s.id === boton.dataset.id);

  if (accion === "editar-seccion") {
    abrirModal({
      titulo: "Editar sección",
      campos: [{ name: "titulo", label: "Título de la sección", required: true }],
      valores: { titulo: seccion.titulo },
      alGuardar: async ({ titulo }) => {
        seccion.titulo = titulo;
        await guardarCampos({ secciones });
        renderSecciones();
      },
    });
  }

  if (accion === "eliminar-seccion") {
    if (!confirm(`¿Eliminar la sección "${seccion.titulo}" y todos sus aspectos?`)) return;
    estado.checklist.secciones = secciones.filter((s) => s.id !== seccion.id);
    reindexarOrden(estado.checklist.secciones);
    guardarCampos({ secciones: estado.checklist.secciones }).then(renderSecciones);
  }

  if (accion === "subir-seccion" || accion === "bajar-seccion") {
    moverOrden(secciones, seccion, accion === "subir-seccion" ? -1 : 1);
    guardarCampos({ secciones }).then(renderSecciones);
  }

  if (accion === "areas-seccion") {
    abrirModalAreas({
      titulo: `Áreas de "${seccion.titulo}"`,
      elemento: seccion,
      ayuda:
        "Elige en qué procesos se evalúa esta sección. Los inspectores de las áreas no marcadas no verán ninguno de sus aspectos.",
      alGuardar: async (elegidas) => {
        seccion.areas = elegidas;
        await guardarCampos({ secciones });
        renderSecciones();
      },
    });
  }

  if (accion === "nuevo-aspecto") {
    abrirModal({
      titulo: `Nuevo aspecto en "${seccion.titulo}"`,
      campos: [
        { name: "texto", label: "Texto del aspecto a evaluar", type: "textarea", required: true },
        { name: "peso", label: "Ponderación (peso)", type: "number", step: "0.1" },
      ],
      valores: { peso: 1 },
      alGuardar: async ({ texto, peso }) => {
        seccion.aspectos = seccion.aspectos || [];
        seccion.aspectos.push({
          id: generarId("asp"),
          texto,
          peso: peso || 1,
          orden: seccion.aspectos.length + 1,
        });
        await guardarCampos({ secciones });
        renderSecciones();
      },
    });
  }

  if (
    accion === "editar-aspecto" ||
    accion === "eliminar-aspecto" ||
    accion === "subir-aspecto" ||
    accion === "bajar-aspecto" ||
    accion === "areas-aspecto"
  ) {
    const seccionAspecto = secciones.find((s) => s.id === boton.dataset.seccion);
    const aspecto = seccionAspecto.aspectos.find((a) => a.id === boton.dataset.id);

    if (accion === "areas-aspecto") {
      abrirModalAreas({
        titulo: "Áreas de este aspecto",
        elemento: aspecto,
        ayuda:
          `Por omisión el aspecto se evalúa en las mismas áreas que su sección ("${seccionAspecto.titulo}"). ` +
          "Úsalo solo para acotarlo aún más; marcar todas equivale a seguir a la sección.",
        alGuardar: async (elegidas) => {
          aspecto.areas = elegidas;
          await guardarCampos({ secciones });
          renderSecciones();
        },
      });
    }

    if (accion === "editar-aspecto") {
      abrirModal({
        titulo: "Editar aspecto",
        campos: [
          { name: "texto", label: "Texto del aspecto a evaluar", type: "textarea", required: true },
          { name: "peso", label: "Ponderación (peso)", type: "number", step: "0.1" },
        ],
        valores: { texto: aspecto.texto, peso: aspecto.peso ?? 1 },
        alGuardar: async ({ texto, peso }) => {
          aspecto.texto = texto;
          aspecto.peso = peso || 1;
          await guardarCampos({ secciones });
          renderSecciones();
        },
      });
    }

    if (accion === "eliminar-aspecto") {
      if (!confirm("¿Eliminar este aspecto del checklist?")) return;
      seccionAspecto.aspectos = seccionAspecto.aspectos.filter((a) => a.id !== aspecto.id);
      reindexarOrden(seccionAspecto.aspectos);
      guardarCampos({ secciones }).then(renderSecciones);
    }

    if (accion === "subir-aspecto" || accion === "bajar-aspecto") {
      moverOrden(seccionAspecto.aspectos, aspecto, accion === "subir-aspecto" ? -1 : 1);
      guardarCampos({ secciones }).then(renderSecciones);
    }
  }
});

/** Intercambia el campo "orden" de un elemento con su vecino inmediato. */
function moverOrden(lista, elemento, direccion) {
  const ordenados = ordenarPorOrden(lista);
  const indice = ordenados.findIndex((e) => e.id === elemento.id);
  const vecino = ordenados[indice + direccion];
  if (!vecino) return;
  const ordenTemp = elemento.orden;
  elemento.orden = vecino.orden;
  vecino.orden = ordenTemp;
}

/* ---------------------------------------------------------
   ÁREAS
   --------------------------------------------------------- */

function renderAreas() {
  listaAreas.innerHTML = "";
  const areas = ordenarPorOrden(estado.checklist.areas || []);

  areas.forEach((area, indice) => {
    const item = document.createElement("div");
    item.className = "editor-item";
    item.innerHTML = `
      <div class="editor-item__cabecera">
        <span class="editor-item__titulo">
          ${escaparHtml(area.nombre)}
          <span class="badge badge-dorado">${escaparHtml(area.id)}</span>
          ${area.activa === false ? '<span class="badge badge-neutro">Inactiva</span>' : ""}
        </span>
        <div class="editor-item__acciones">
          <button class="btn btn-secundario btn-sm" data-accion="subir-area" data-id="${area.id}" ${
      indice === 0 ? "disabled" : ""
    }>↑</button>
          <button class="btn btn-secundario btn-sm" data-accion="bajar-area" data-id="${area.id}" ${
      indice === areas.length - 1 ? "disabled" : ""
    }>↓</button>
          <button class="btn btn-secundario btn-sm" data-accion="editar-area" data-id="${area.id}">Editar</button>
          <button class="btn btn-peligro btn-sm" data-accion="eliminar-area" data-id="${area.id}">Eliminar</button>
        </div>
      </div>
    `;
    listaAreas.appendChild(item);
  });
}

btnNuevaArea.addEventListener("click", () => {
  abrirModal({
    titulo: "Nueva área",
    campos: [
      { name: "id", label: "Código corto (único, ej. COR)", required: true },
      { name: "nombre", label: "Nombre del área / proceso", required: true },
      { name: "activa", label: "Área activa", type: "checkbox" },
    ],
    valores: { activa: true },
    alGuardar: async ({ id, nombre, activa }) => {
      const areas = estado.checklist.areas || [];
      const codigo = id.toUpperCase();
      if (areas.some((a) => a.id === codigo)) {
        mostrarToast(`Ya existe un área con el código "${codigo}".`, "error");
        throw new Error("Código duplicado");
      }
      areas.push({ id: codigo, nombre, activa, orden: areas.length + 1 });
      estado.checklist.areas = areas;
      await guardarCampos({ areas });
      renderAreas();
    },
  });
});

listaAreas.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;

  const accion = boton.dataset.accion;
  const areas = estado.checklist.areas;
  const area = areas.find((a) => a.id === boton.dataset.id);

  if (accion === "editar-area") {
    abrirModal({
      titulo: "Editar área",
      campos: [
        {
          name: "id",
          label: "Código corto",
          required: true,
          ayuda:
            "Si lo cambias, las inspecciones ya registradas conservarán el código anterior y no aparecerán al filtrar por esta área.",
        },
        { name: "nombre", label: "Nombre del área / proceso", required: true },
        { name: "activa", label: "Área activa", type: "checkbox" },
      ],
      valores: { id: area.id, nombre: area.nombre, activa: area.activa !== false },
      alGuardar: async ({ id, nombre, activa }) => {
        const codigo = id.toUpperCase();

        if (codigo !== area.id) {
          if (areas.some((a) => a.id === codigo)) {
            mostrarToast(`Ya existe un área con el código "${codigo}".`, "error");
            throw new Error("Código duplicado");
          }
          if (
            !confirm(
              `Vas a cambiar el código "${area.id}" por "${codigo}". Las inspecciones ya registradas seguirán guardadas con el código anterior. ¿Continuar?`
            )
          ) {
            throw new Error("Cancelado por el usuario");
          }
          area.id = codigo;
        }

        area.nombre = nombre;
        area.activa = activa;
        await guardarCampos({ areas });
        renderAreas();
      },
    });
  }

  if (accion === "eliminar-area") {
    if (
      !confirm(
        `¿Eliminar el área "${area.nombre}"? Las inspecciones ya registradas conservarán su nombre histórico, pero dejará de estar disponible para nuevas inspecciones. Considera "Editar" y desmarcar "Área activa" en su lugar.`
      )
    )
      return;
    estado.checklist.areas = areas.filter((a) => a.id !== area.id);
    reindexarOrden(estado.checklist.areas);
    guardarCampos({ areas: estado.checklist.areas }).then(renderAreas);
  }

  if (accion === "subir-area" || accion === "bajar-area") {
    moverOrden(areas, area, accion === "subir-area" ? -1 : 1);
    guardarCampos({ areas }).then(renderAreas);
  }
});

/* ---------------------------------------------------------
   CRITERIOS
   --------------------------------------------------------- */

function renderCriterios() {
  listaCriterios.innerHTML = "";
  const criterios = estado.checklist.criterios || [];

  criterios.forEach((criterio) => {
    const item = document.createElement("div");
    item.className = "editor-item";
    item.innerHTML = `
      <div class="editor-item__cabecera">
        <span class="editor-item__titulo">
          ${escaparHtml(criterio.simbolo)} ${escaparHtml(criterio.etiqueta)}
          <span class="badge ${criterio.puntua ? "badge-exito" : "badge-neutro"}">
            ${criterio.puntua ? "Puntúa" : "No puntúa"}
          </span>
        </span>
        <div class="editor-item__acciones">
          <button class="btn btn-secundario btn-sm" data-accion="editar-criterio" data-valor="${
            criterio.valor
          }">Editar</button>
          <button class="btn btn-peligro btn-sm" data-accion="eliminar-criterio" data-valor="${
            criterio.valor
          }">Eliminar</button>
        </div>
      </div>
    `;
    listaCriterios.appendChild(item);
  });
}

btnNuevoCriterio.addEventListener("click", () => {
  abrirModal({
    titulo: "Nuevo criterio de calificación",
    campos: [
      { name: "valor", label: "Valor interno (único, sin espacios, ej. observacion)", required: true },
      { name: "etiqueta", label: "Etiqueta visible (ej. Observación)", required: true },
      { name: "simbolo", label: "Símbolo (ej. ⚠)", required: true },
      { name: "puntua", label: "Cuenta para el % de cumplimiento", type: "checkbox" },
    ],
    alGuardar: async ({ valor, etiqueta, simbolo, puntua }) => {
      const criterios = estado.checklist.criterios || [];
      const clave = valor.toLowerCase().replace(/\s+/g, "_");
      if (criterios.some((c) => c.valor === clave)) {
        mostrarToast(`Ya existe un criterio con el valor "${clave}".`, "error");
        throw new Error("Valor duplicado");
      }
      criterios.push({ valor: clave, etiqueta, simbolo, puntua });
      estado.checklist.criterios = criterios;
      await guardarCampos({ criterios });
      renderCriterios();
    },
  });
});

listaCriterios.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;

  const accion = boton.dataset.accion;
  const criterios = estado.checklist.criterios;
  const criterio = criterios.find((c) => c.valor === boton.dataset.valor);

  if (accion === "editar-criterio") {
    abrirModal({
      titulo: "Editar criterio",
      campos: [
        { name: "etiqueta", label: "Etiqueta visible", required: true },
        { name: "simbolo", label: "Símbolo", required: true },
        { name: "puntua", label: "Cuenta para el % de cumplimiento", type: "checkbox" },
      ],
      valores: { etiqueta: criterio.etiqueta, simbolo: criterio.simbolo, puntua: criterio.puntua },
      alGuardar: async ({ etiqueta, simbolo, puntua }) => {
        criterio.etiqueta = etiqueta;
        criterio.simbolo = simbolo;
        criterio.puntua = puntua;
        await guardarCampos({ criterios });
        renderCriterios();
      },
    });
  }

  if (accion === "eliminar-criterio") {
    if (criterios.length <= 2) {
      mostrarToast("Debe existir al menos dos criterios de calificación.", "error");
      return;
    }
    if (!confirm(`¿Eliminar el criterio "${criterio.etiqueta}"?`)) return;
    estado.checklist.criterios = criterios.filter((c) => c.valor !== criterio.valor);
    guardarCampos({ criterios: estado.checklist.criterios }).then(renderCriterios);
  }
});

/* ---------------------------------------------------------
   USUARIOS
   --------------------------------------------------------- */

/** Opciones de rol para los formularios (derivadas de la definición única en auth.js). */
const OPCIONES_ROL = Object.entries(ROLES).map(([value, def]) => ({
  value,
  label: def.etiqueta,
}));

async function cargarUsuarios() {
  try {
    estado.usuarios = await listarUsuarios();
    renderUsuarios();
  } catch (error) {
    console.error("Error al cargar usuarios:", error);
    listaUsuarios.innerHTML =
      '<p class="texto-suave texto-sm">No se pudieron cargar los usuarios.</p>';
  }
}

function renderUsuarios() {
  const mostrarInactivos = chkMostrarInactivos.checked;
  const visibles = estado.usuarios
    .filter((u) => mostrarInactivos || u.activo !== false)
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

  listaUsuarios.innerHTML = "";

  if (visibles.length === 0) {
    listaUsuarios.innerHTML = `<p class="texto-suave texto-sm">${
      mostrarInactivos
        ? "Todavía no hay usuarios registrados."
        : "No hay usuarios activos. Marca la casilla de arriba para ver los inactivos."
    }</p>`;
    return;
  }

  for (const u of visibles) {
    const esYoMismo = u.uid === estado.usuario.uid;

    const item = document.createElement("div");
    item.className = "editor-item";
    item.innerHTML = `
      <div class="editor-item__cabecera">
        <span class="avatar" aria-hidden="true" style="margin-top:2px;">${escaparHtml(
          iniciales(u.nombre || u.email)
        )}</span>
        <span class="editor-item__titulo" style="flex-direction:column; align-items:flex-start; gap:var(--e1);">
          <span style="display:flex; align-items:center; flex-wrap:wrap; gap:var(--e2);">
            ${escaparHtml(u.nombre || u.email || u.uid)}
            <span class="badge ${
              ROLES[u.rol]?.gestion ? "badge-dorado" : "badge-marino"
            }">${escaparHtml(etiquetaRol(u.rol))}</span>
            ${u.activo === false ? '<span class="badge badge-neutro">Inactivo</span>' : ""}
            ${esYoMismo ? '<span class="badge badge-exito">Tú</span>' : ""}
          </span>
          <span class="texto-suave texto-xs" style="font-weight:400;">
            ${escaparHtml(u.email || "")}
          </span>
        </span>
        <div class="editor-item__acciones">
          <button class="btn btn-secundario btn-sm" data-accion="editar-usuario">Editar</button>
        </div>
      </div>
    `;

    item
      .querySelector("[data-accion='editar-usuario']")
      .addEventListener("click", () => abrirModalEditarUsuario(u));

    listaUsuarios.appendChild(item);
  }
}

chkMostrarInactivos.addEventListener("change", renderUsuarios);

/* ---- Invitar (alta de cuenta + perfil, sin pedir el UID) ---- */

btnInvitarUsuario.addEventListener("click", () => {
  abrirModal({
    titulo: "Invitar usuario",
    campos: [
      { name: "nombre", label: "Nombre completo", required: true, placeholder: "Ej: María López" },
      {
        name: "email",
        label: "Correo electrónico",
        type: "email",
        required: true,
        placeholder: "nombre@empresasgalindo.com",
        ayuda: "Será su usuario para iniciar sesión.",
      },
      {
        name: "rol",
        label: "Rol",
        type: "select",
        opciones: OPCIONES_ROL,
        ayuda:
          "Administrador y Coordinador de SGIA tienen el mismo acceso: gestionan el checklist, los usuarios y ven todas las inspecciones.",
      },
      {
        name: "contrasenaTemporal",
        label: "Contraseña temporal",
        required: true,
        ayuda: "Compártela con la persona; podrá cambiarla después.",
      },
      {
        name: "enviarCorreo",
        label: "Enviar correo para que defina su propia contraseña",
        type: "checkbox",
      },
    ],
    valores: {
      rol: "inspector",
      contrasenaTemporal: generarContrasenaTemporal(),
      enviarCorreo: true,
    },
    alGuardar: async ({ nombre, email, rol, contrasenaTemporal, enviarCorreo }) => {
      if (contrasenaTemporal.length < 6) {
        mostrarToast("La contraseña temporal debe tener al menos 6 caracteres.", "error");
        throw new Error("Contraseña demasiado corta");
      }

      try {
        const { correoEnviado } = await invitarUsuario({
          nombre,
          email,
          rol,
          contrasenaTemporal,
          enviarCorreo,
        });

        mostrarToast(`Usuario "${nombre}" creado como ${etiquetaRol(rol)}. Contraseña temporal: ${contrasenaTemporal}.` +
            (correoEnviado
              ? " Se le envió además un correo para definir su propia contraseña."
              : enviarCorreo
              ? " (No se pudo enviar el correo; comparte la contraseña temporal.)"
              : ""),
          "exito"
        );
        await cargarUsuarios();
      } catch (error) {
        console.error("Error al invitar usuario:", error);
        mostrarToast(traducirErrorAuth(error), "error");
        throw error;
      }
    },
  });
});

/* ---- Editar perfil existente ---- */

function abrirModalEditarUsuario(u) {
  const esYoMismo = u.uid === estado.usuario.uid;

  abrirModal({
    titulo: "Editar usuario",
    campos: [
      { name: "nombre", label: "Nombre completo", required: true },
      {
        name: "email",
        label: "Correo electrónico",
        type: "email",
        disabled: true,
        ayuda:
          "El correo de acceso solo puede cambiarse desde Firebase Authentication en la consola.",
      },
      {
        name: "rol",
        label: "Rol",
        type: "select",
        opciones: OPCIONES_ROL,
      },
      {
        name: "activo",
        label: "Cuenta activa",
        type: "checkbox",
        ayuda: esYoMismo
          ? "Es tu propia cuenta: si la desactivas o la pasas a Inspector, perderás el acceso a este panel."
          : "Una cuenta inactiva no puede iniciar sesión ni registrar inspecciones.",
      },
    ],
    valores: {
      nombre: u.nombre || "",
      email: u.email || "",
      rol: u.rol || "inspector",
      activo: u.activo !== false,
    },
    alGuardar: async ({ nombre, rol, activo }) => {
      // Evita que un gestor se quede sin acceso sin darse cuenta.
      if (esYoMismo && (!ROLES[rol]?.gestion || !activo)) {
        const aviso = !ROLES[rol]?.gestion
          ? "Estás quitándote a ti mismo los permisos de gestión."
          : "Estás desactivando tu propia cuenta.";
        if (!confirm(`${aviso} Perderás el acceso a este panel. ¿Continuar?`)) {
          throw new Error("Cancelado por el usuario");
        }
      }

      try {
        await guardarUsuario(u.uid, { nombre, rol, activo });
        mostrarToast("Usuario actualizado correctamente.", "exito");
        await cargarUsuarios();
      } catch (error) {
        console.error("Error al guardar usuario:", error);
        mostrarToast("No se pudo guardar el usuario.", "error");
        throw error;
      }
    },
  });
}

/* ---------------------------------------------------------
   PUBLICAR
   --------------------------------------------------------- */

function renderPublicar() {
  versionVigenteEl.textContent = estado.checklist.versionVigente || "Sin publicar";
  const hayCambios = estado.checklist.borradorModificado !== false;
  estadoBorradorEl.textContent = hayCambios ? "Cambios sin publicar" : "Publicado";
  estadoBorradorEl.className = `badge ${hayCambios ? "badge-dorado" : "badge-exito"}`;
}

btnPublicar.addEventListener("click", async () => {
  if (
    !confirm(
      "¿Publicar una nueva versión del checklist? Los inspectores usarán esta versión desde ahora."
    )
  )
    return;

  btnPublicar.disabled = true;
  btnPublicar.textContent = "Publicando…";

  try {
    const nuevaVersion = await publicarVersionChecklist(CHECKLIST_ID, estado.usuario.uid);
    estado.checklist.versionVigente = nuevaVersion;
    estado.checklist.borradorModificado = false;
    renderPublicar();
    mostrarToast(`Versión ${nuevaVersion} publicada correctamente.`, "exito");
  } catch (error) {
    console.error("Error al publicar la versión:", error);
    mostrarToast("No se pudo publicar la nueva versión.", "error");
  } finally {
    btnPublicar.disabled = false;
    btnPublicar.textContent = "Publicar nueva versión";
  }
});
