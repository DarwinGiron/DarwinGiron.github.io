// =========================================================
// vidrio-admin.js
// Controlador de vidrio-plastico/admin.html — editor del SIG-FO-111.
//
// Tres pestañas sobre el mismo documento de configuración:
//   · "Puntos": la lista fija de puntos a inspeccionar. Son las preguntas
//     del formato, iguales para todos; lo que varía por registro son las
//     respuestas de cada inspector.
//   · "Tipos de riesgo": los textos de la escala 1/2/3 y cuál obliga a
//     escribir la acción requerida.
//   · "Encabezado": código, revisión y frecuencia del formato.
//
// Son más de cien puntos, así que la lista se filtra y se pagina: dibujar
// las 115 filas con sus botones en cada cambio vuelve la página lenta en
// tablet.
// =========================================================

import { protegerPagina, cerrarSesion, ROLES_GESTION, etiquetaRol } from "./auth.js";
import { obtenerFormatoVidrio, guardarFormatoVidrio } from "./firestore.js";
import { crearModalFormulario } from "./modal-formulario.js";
import { ENCABEZADO_SEMILLA, PUNTOS_SEMILLA, RIESGOS_SEMILLA } from "./vidrio-datos.js";
import { mostrarBloqueError } from "./aviso-carga.js";
import { escaparHtml, generarId, iniciales, mostrarToast } from "./utils.js";

const PUNTOS_POR_PAGINA = 40;

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");

const zonaSemilla = document.getElementById("zona-semilla");
const zonaEditor = document.getElementById("zona-editor");
const listaPuntos = document.getElementById("lista-puntos-admin");
const listaRiesgos = document.getElementById("lista-riesgos-admin");
const listaEncabezado = document.getElementById("lista-encabezado");
const conteoPuntos = document.getElementById("conteo-puntos");
const filtroAdmin = document.getElementById("filtro-admin");
const btnNuevoPunto = document.getElementById("btn-nuevo-punto");

const { abrirModal } = crearModalFormulario({
  modalFondo: document.getElementById("modal-fondo"),
  modalTitulo: document.getElementById("modal-titulo"),
  formModal: document.getElementById("form-modal"),
  btnCerrarModal: document.getElementById("btn-cerrar-modal"),
});

const estado = { usuario: null, formato: null, visibles: PUNTOS_POR_PAGINA };

protegerPagina({ rolesPermitidos: ROLES_GESTION }, async ({ user, perfil }) => {
  estado.usuario = user;
  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);

  cargarFormato();
});

/** Mismo criterio que en la tabla de hisopados: un error se queda escrito
 *  en la página, nunca deja la pantalla vacía. */
async function cargarFormato() {
  try {
    estado.formato = await obtenerFormatoVidrio();
    if (!estado.formato) {
      mostrarBannerSemilla();
      return;
    }
    mostrarEditor();
  } catch (error) {
    console.error("No se pudo cargar el formato SIG-FO-111:", error);
    mostrarBloqueError(zonaSemilla, { error, alReintentar: cargarFormato });
  }
}

btnSalir.addEventListener("click", () => cerrarSesion());

function mostrarEditor() {
  zonaSemilla.classList.add("oculto");
  zonaEditor.classList.remove("oculto");
  renderPuntos();
  renderRiesgos();
  renderEncabezado();
}

function mostrarBannerSemilla() {
  zonaSemilla.classList.remove("oculto");
  zonaSemilla.innerHTML = `
    <div class="alerta alerta-info">
      Todavía no está configurado el SIG-FO-111.
      <button type="button" id="btn-cargar-semilla" class="btn btn-dorado btn-sm btn-ancho-auto" style="margin-top:10px; display:block;">
        Cargar los ${PUNTOS_SEMILLA.length} puntos del formato Rev. 01
      </button>
    </div>
  `;
  document.getElementById("btn-cargar-semilla").addEventListener("click", async (evento) => {
    const boton = evento.target;
    boton.disabled = true;
    boton.textContent = "Cargando…";
    try {
      const semilla = {
        encabezado: ENCABEZADO_SEMILLA,
        riesgos: RIESGOS_SEMILLA,
        puntos: PUNTOS_SEMILLA,
      };
      await guardarFormatoVidrio(semilla, estado.usuario.uid);
      estado.formato = JSON.parse(JSON.stringify(semilla));
      mostrarEditor();
      mostrarToast("Formato cargado.", "exito");
    } catch (error) {
      console.error("No se pudo cargar el formato inicial:", error);
      mostrarToast("No se pudo cargar el formato inicial.", "error");
      boton.disabled = false;
      boton.textContent = `Cargar los ${PUNTOS_SEMILLA.length} puntos del formato Rev. 01`;
    }
  });
}

document.querySelectorAll(".tabs__item").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tabs__item").forEach((t) => t.classList.remove("activo"));
    document.querySelectorAll(".pestana").forEach((p) => p.classList.remove("activa"));
    tab.classList.add("activo");
    document.querySelector(`[data-pestana="${tab.dataset.tab}"]`).classList.add("activa");
  });
});

async function guardar(cambios) {
  try {
    await guardarFormatoVidrio(cambios, estado.usuario.uid);
  } catch (error) {
    console.error("No se pudo guardar el formato:", error);
    mostrarToast("No se pudo guardar el cambio. Intenta de nuevo.", "error");
    throw error;
  }
}

/* ---------------------------------------------------------
   Puntos
   --------------------------------------------------------- */

function puntosOrdenados() {
  return [...(estado.formato.puntos || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

function puntosFiltrados() {
  const termino = filtroAdmin.value.trim().toLowerCase();
  if (!termino) return puntosOrdenados();
  return puntosOrdenados().filter((p) =>
    `${p.proceso} ${p.localizacion} ${p.material} ${p.tipo}`.toLowerCase().includes(termino)
  );
}

filtroAdmin.addEventListener("input", () => {
  estado.visibles = PUNTOS_POR_PAGINA;
  renderPuntos();
});

function renderPuntos() {
  const filtrados = puntosFiltrados();
  const mostrados = filtrados.slice(0, estado.visibles);

  conteoPuntos.textContent = `${filtrados.length} punto(s)${
    filtrados.length > mostrados.length ? ` · mostrando ${mostrados.length}` : ""
  }`;

  listaPuntos.innerHTML =
    mostrados
      .map(
        (punto) => `
      <div class="editor-item">
        <div class="editor-item__cabecera">
          <span class="editor-item__titulo">
            ${escaparHtml(punto.material)}
            <span class="badge badge-neutro">${escaparHtml(punto.tipo)}</span>
          </span>
          <div class="editor-item__acciones">
            <button class="btn btn-secundario btn-sm" data-accion="editar" data-id="${punto.id}">Editar</button>
            <button class="btn btn-peligro btn-sm" data-accion="eliminar" data-id="${punto.id}">Eliminar</button>
          </div>
        </div>
        <div class="texto-suave texto-sm">${escaparHtml(punto.proceso)} · ${escaparHtml(
          punto.localizacion
        )}</div>
      </div>
    `
      )
      .join("") || '<p class="texto-suave texto-sm mb-0">Ningún punto coincide.</p>';

  if (filtrados.length > mostrados.length) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "btn btn-secundario btn-sm btn-ancho-auto";
    boton.textContent = "Ver más";
    boton.addEventListener("click", () => {
      estado.visibles += PUNTOS_POR_PAGINA;
      renderPuntos();
    });
    listaPuntos.appendChild(boton);
  }
}

function camposPunto() {
  return [
    { name: "proceso", label: "Proceso (ej. MAN, SIG, MIN)", required: true },
    { name: "localizacion", label: "Localización", required: true },
    { name: "material", label: "Material", required: true },
    {
      name: "tipo",
      label: "Tipo",
      type: "select",
      opciones: [
        { value: "Vidrio", label: "Vidrio" },
        { value: "Plástico quebradizo", label: "Plástico quebradizo" },
      ],
    },
  ];
}

btnNuevoPunto.addEventListener("click", () => {
  abrirModal({
    titulo: "Nuevo punto",
    campos: camposPunto(),
    valores: { tipo: "Vidrio" },
    alGuardar: async (datos) => {
      const puntos = estado.formato.puntos || [];
      puntos.push({
        id: generarId("punto"),
        orden: puntos.length + 1,
        proceso: datos.proceso.toUpperCase(),
        localizacion: datos.localizacion,
        material: datos.material,
        tipo: datos.tipo,
      });
      estado.formato.puntos = puntos;
      await guardar({ puntos });
      renderPuntos();
    },
  });
});

listaPuntos.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;

  const puntos = estado.formato.puntos || [];
  const punto = puntos.find((p) => p.id === boton.dataset.id);
  if (!punto) return;

  if (boton.dataset.accion === "editar") {
    abrirModal({
      titulo: "Editar punto",
      campos: camposPunto(),
      valores: {
        proceso: punto.proceso,
        localizacion: punto.localizacion,
        material: punto.material,
        tipo: punto.tipo,
      },
      alGuardar: async (datos) => {
        punto.proceso = datos.proceso.toUpperCase();
        punto.localizacion = datos.localizacion;
        punto.material = datos.material;
        punto.tipo = datos.tipo;
        await guardar({ puntos });
        renderPuntos();
      },
    });
  }

  if (boton.dataset.accion === "eliminar") {
    if (
      !confirm(
        `¿Eliminar "${punto.material}" en ${punto.localizacion}? Las inspecciones ya guardadas lo conservan.`
      )
    )
      return;
    estado.formato.puntos = puntos.filter((p) => p.id !== punto.id);
    await guardar({ puntos: estado.formato.puntos });
    renderPuntos();
  }
});

/* ---------------------------------------------------------
   Tipos de riesgo
   --------------------------------------------------------- */

function renderRiesgos() {
  const riesgos = estado.formato.riesgos || [];
  listaRiesgos.innerHTML = riesgos
    .map(
      (r) => `
      <div class="editor-item">
        <div class="editor-item__cabecera">
          <span class="editor-item__titulo">
            <span class="badge riesgo-badge riesgo-${r.valor}">${r.valor}</span>
            ${escaparHtml(r.etiqueta)}
            ${r.requiereAccion ? '<span class="badge badge-dorado">Exige acción</span>' : ""}
          </span>
          <div class="editor-item__acciones">
            <button class="btn btn-secundario btn-sm" data-riesgo="${r.valor}">Editar</button>
          </div>
        </div>
        <div class="texto-suave texto-sm">${escaparHtml(r.descripcion)}</div>
      </div>
    `
    )
    .join("");
}

listaRiesgos.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-riesgo]");
  if (!boton) return;

  const riesgo = (estado.formato.riesgos || []).find(
    (r) => r.valor === Number(boton.dataset.riesgo)
  );
  if (!riesgo) return;

  abrirModal({
    titulo: `Riesgo ${riesgo.valor}`,
    campos: [
      { name: "etiqueta", label: "Nombre corto", required: true },
      { name: "descripcion", label: "Qué significa", type: "textarea", required: true },
      {
        name: "requiereAccion",
        label: "Obliga a escribir la acción requerida",
        type: "checkbox",
      },
    ],
    valores: {
      etiqueta: riesgo.etiqueta,
      descripcion: riesgo.descripcion,
      requiereAccion: riesgo.requiereAccion,
    },
    alGuardar: async ({ etiqueta, descripcion, requiereAccion }) => {
      riesgo.etiqueta = etiqueta;
      riesgo.descripcion = descripcion;
      riesgo.requiereAccion = Boolean(requiereAccion);
      await guardar({ riesgos: estado.formato.riesgos });
      renderRiesgos();
    },
  });
});

/* ---------------------------------------------------------
   Encabezado
   --------------------------------------------------------- */

const CAMPOS_ENCABEZADO = [
  { clave: "titulo", etiqueta: "Título del formato" },
  { clave: "codigo", etiqueta: "Código" },
  { clave: "revision", etiqueta: "Revisión" },
  { clave: "frecuencia", etiqueta: "Frecuencia" },
];

function renderEncabezado() {
  const encabezado = estado.formato.encabezado || {};
  listaEncabezado.innerHTML = CAMPOS_ENCABEZADO.map(
    ({ clave, etiqueta }) => `
      <div class="editor-item">
        <div class="editor-item__cabecera">
          <span class="editor-item__titulo">${escaparHtml(etiqueta)}</span>
          <div class="editor-item__acciones">
            <button class="btn btn-secundario btn-sm" data-campo="${clave}">Editar</button>
          </div>
        </div>
        <div class="texto-suave texto-sm">${escaparHtml(encabezado[clave] || "—")}</div>
      </div>
    `
  ).join("");
}

listaEncabezado.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-campo]");
  if (!boton) return;

  const clave = boton.dataset.campo;
  const definicion = CAMPOS_ENCABEZADO.find((c) => c.clave === clave);
  estado.formato.encabezado = estado.formato.encabezado || {};

  abrirModal({
    titulo: definicion.etiqueta,
    campos: [{ name: "valor", label: definicion.etiqueta, required: true }],
    valores: { valor: estado.formato.encabezado[clave] || "" },
    alGuardar: async ({ valor }) => {
      estado.formato.encabezado[clave] = valor;
      await guardar({ encabezado: estado.formato.encabezado });
      renderEncabezado();
    },
  });
});
