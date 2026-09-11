// =========================================================
// hisopado-admin.js
// Controlador de hisopado/admin.html — editor de la tabla de muestreo
// de hisopados (SIG-TA-102).
//
// Dos vistas del mismo documento:
//   · "Límites y zonas": el rango se edita en el TIPO de muestra y lo
//     heredan sus zonas, igual que en el formato en papel. Editar el
//     límite de un tipo cambia el de todas sus zonas de una vez.
//   · "Tabla anual": la cuadrícula zona × mes del formato.
// =========================================================

import { protegerPagina, cerrarSesion, ROLES_GESTION, etiquetaRol } from "./auth.js";
import { obtenerTablaHisopado, guardarTablaHisopado } from "./firestore.js";
import { crearModalFormulario } from "./modal-formulario.js";
import { MESES, TABLA_SEMILLA } from "./hisopado-datos.js";
import { escaparHtml, generarId, iniciales, mostrarToast } from "./utils.js";

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");

const zonaSemilla = document.getElementById("zona-semilla");
const zonaEditor = document.getElementById("zona-editor");
const listaTipos = document.getElementById("lista-tipos");
const tablaMuestreo = document.getElementById("tabla-muestreo");
const btnNuevoTipo = document.getElementById("btn-nuevo-tipo");
const btnDescargarTabla = document.getElementById("btn-descargar-tabla");

const { abrirModal } = crearModalFormulario({
  modalFondo: document.getElementById("modal-fondo"),
  modalTitulo: document.getElementById("modal-titulo"),
  formModal: document.getElementById("form-modal"),
  btnCerrarModal: document.getElementById("btn-cerrar-modal"),
});

const estado = { usuario: null, tabla: null };

protegerPagina({ rolesPermitidos: ROLES_GESTION }, async ({ user, perfil }) => {
  estado.usuario = user;
  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);

  try {
    estado.tabla = await obtenerTablaHisopado();
    if (!estado.tabla) {
      mostrarBannerSemilla();
      return;
    }
    mostrarEditor();
  } catch (error) {
    console.error("No se pudo cargar la tabla de muestreo:", error);
    mostrarToast("No se pudo cargar la tabla de muestreo.", "error");
  }
});

btnSalir.addEventListener("click", () => cerrarSesion());

function mostrarEditor() {
  zonaSemilla.classList.add("oculto");
  zonaEditor.classList.remove("oculto");
  renderTipos();
  renderTablaAnual();
}

function mostrarBannerSemilla() {
  zonaSemilla.classList.remove("oculto");
  zonaSemilla.innerHTML = `
    <div class="alerta alerta-info">
      Todavía no existe la tabla de muestreo.
      <button type="button" id="btn-cargar-semilla" class="btn btn-dorado btn-sm btn-ancho-auto" style="margin-top:10px; display:block;">
        Cargar la tabla del formato SIG-TA-102
      </button>
    </div>
  `;
  document.getElementById("btn-cargar-semilla").addEventListener("click", async (evento) => {
    const boton = evento.target;
    boton.disabled = true;
    boton.textContent = "Cargando…";
    try {
      await guardarTablaHisopado(TABLA_SEMILLA, estado.usuario.uid);
      estado.tabla = JSON.parse(JSON.stringify(TABLA_SEMILLA));
      mostrarEditor();
      mostrarToast("Tabla de muestreo cargada.", "exito");
    } catch (error) {
      console.error("No se pudo cargar la tabla inicial:", error);
      mostrarToast("No se pudo cargar la tabla inicial.", "error");
      boton.disabled = false;
      boton.textContent = "Cargar la tabla del formato SIG-TA-102";
    }
  });
}

/* ---------------------------------------------------------
   Pestañas
   --------------------------------------------------------- */

document.querySelectorAll(".tabs__item").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tabs__item").forEach((t) => t.classList.remove("activo"));
    document.querySelectorAll(".pestana").forEach((p) => p.classList.remove("activa"));
    tab.classList.add("activo");
    document.querySelector(`[data-pestana="${tab.dataset.tab}"]`).classList.add("activa");
  });
});

/* ---------------------------------------------------------
   Guardado
   --------------------------------------------------------- */

async function guardar() {
  try {
    await guardarTablaHisopado(estado.tabla, estado.usuario.uid);
    renderTipos();
    renderTablaAnual();
  } catch (error) {
    console.error("No se pudo guardar la tabla:", error);
    mostrarToast("No se pudo guardar el cambio. Intenta de nuevo.", "error");
    throw error;
  }
}

function tiposOrdenados() {
  return [...(estado.tabla.tipos || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

/* ---------------------------------------------------------
   Límites y zonas
   --------------------------------------------------------- */

function renderTipos() {
  const unidad = estado.tabla.unidad || "URL";
  listaTipos.innerHTML = tiposOrdenados()
    .map(
      (tipo) => `
      <div class="editor-item">
        <div class="editor-item__cabecera">
          <span class="editor-item__titulo">
            ${escaparHtml(tipo.nombre)}
            <span class="badge badge-dorado">${tipo.limiteMin} a ${tipo.limiteMax} ${escaparHtml(unidad)}</span>
          </span>
          <div class="editor-item__acciones">
            <button class="btn btn-secundario btn-sm" data-accion="editar-tipo" data-tipo="${tipo.id}">Editar límite</button>
            <button class="btn btn-secundario btn-sm" data-accion="nueva-zona" data-tipo="${tipo.id}">+ Zona</button>
            <button class="btn btn-peligro btn-sm" data-accion="eliminar-tipo" data-tipo="${tipo.id}">Eliminar</button>
          </div>
        </div>
        ${(tipo.zonas || []).map((zona) => filaZona(tipo, zona)).join("") ||
          '<p class="texto-suave texto-sm mb-0">Sin zonas todavía.</p>'}
      </div>
    `
    )
    .join("");
}

function filaZona(tipo, zona) {
  return `
    <div class="flex-entre" style="padding: var(--e2) 0; border-top: 1px solid var(--borde);">
      <div style="min-width:0;">
        <div class="texto-sm" style="font-weight:650;">${escaparHtml(zona.nombre)}</div>
        <div class="texto-suave texto-sm">
          ${zona.cantidad} muestra(s) · ${escaparHtml(zona.analisis || "—")}
        </div>
      </div>
      <div class="editor-item__acciones">
        <button class="btn btn-secundario btn-sm" data-accion="editar-zona" data-tipo="${tipo.id}" data-zona="${zona.id}">Editar</button>
        <button class="btn btn-peligro btn-sm" data-accion="eliminar-zona" data-tipo="${tipo.id}" data-zona="${zona.id}">Eliminar</button>
      </div>
    </div>
  `;
}

btnNuevoTipo.addEventListener("click", () => {
  abrirModal({
    titulo: "Nuevo tipo de muestra",
    campos: [
      { name: "nombre", label: "Nombre del tipo (ej. Superficies)", required: true },
      { name: "limiteMin", label: "Límite mínimo", type: "number", required: true },
      { name: "limiteMax", label: "Límite máximo", type: "number", required: true },
    ],
    valores: { limiteMin: 0, limiteMax: 500 },
    alGuardar: async ({ nombre, limiteMin, limiteMax }) => {
      const tipos = estado.tabla.tipos || [];
      tipos.push({
        id: generarId("tipo"),
        nombre,
        limiteMin: Number(limiteMin),
        limiteMax: Number(limiteMax),
        orden: tipos.length + 1,
        zonas: [],
      });
      estado.tabla.tipos = tipos;
      await guardar();
    },
  });
});

listaTipos.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;

  const tipo = (estado.tabla.tipos || []).find((t) => t.id === boton.dataset.tipo);
  if (!tipo) return;
  const zona = (tipo.zonas || []).find((z) => z.id === boton.dataset.zona);

  if (boton.dataset.accion === "editar-tipo") {
    abrirModal({
      titulo: `Límite de ${tipo.nombre}`,
      campos: [
        { name: "nombre", label: "Nombre del tipo", required: true },
        {
          name: "limiteMin",
          label: "Límite mínimo",
          type: "number",
          required: true,
          ayuda: "El rango aplica a todas las zonas de este tipo.",
        },
        { name: "limiteMax", label: "Límite máximo", type: "number", required: true },
      ],
      valores: { nombre: tipo.nombre, limiteMin: tipo.limiteMin, limiteMax: tipo.limiteMax },
      alGuardar: async ({ nombre, limiteMin, limiteMax }) => {
        if (Number(limiteMin) > Number(limiteMax)) {
          mostrarToast("El límite mínimo no puede ser mayor que el máximo.", "error");
          throw new Error("Rango inválido");
        }
        tipo.nombre = nombre;
        tipo.limiteMin = Number(limiteMin);
        tipo.limiteMax = Number(limiteMax);
        await guardar();
      },
    });
  }

  if (boton.dataset.accion === "eliminar-tipo") {
    if (
      !confirm(
        `¿Eliminar "${tipo.nombre}" y sus ${(tipo.zonas || []).length} zona(s)? Los registros ya guardados conservan su límite histórico.`
      )
    )
      return;
    estado.tabla.tipos = estado.tabla.tipos.filter((t) => t.id !== tipo.id);
    await guardar();
  }

  if (boton.dataset.accion === "nueva-zona") {
    abrirModal({
      titulo: `Nueva zona de ${tipo.nombre}`,
      campos: camposZona(),
      valores: { cantidad: 2, analisis: "ATP/HISOPADO" },
      alGuardar: async ({ nombre, cantidad, analisis }) => {
        tipo.zonas = tipo.zonas || [];
        tipo.zonas.push({
          id: generarId("zona"),
          nombre,
          cantidad: Number(cantidad),
          analisis,
          meses: [],
        });
        await guardar();
      },
    });
  }

  if (boton.dataset.accion === "editar-zona" && zona) {
    abrirModal({
      titulo: "Editar zona",
      campos: camposZona(),
      valores: { nombre: zona.nombre, cantidad: zona.cantidad, analisis: zona.analisis },
      alGuardar: async ({ nombre, cantidad, analisis }) => {
        zona.nombre = nombre;
        zona.cantidad = Number(cantidad);
        zona.analisis = analisis;
        await guardar();
      },
    });
  }

  if (boton.dataset.accion === "eliminar-zona" && zona) {
    if (!confirm(`¿Eliminar la zona "${zona.nombre}"?`)) return;
    tipo.zonas = tipo.zonas.filter((z) => z.id !== zona.id);
    await guardar();
  }
});

function camposZona() {
  return [
    { name: "nombre", label: "Zona a muestrear (ej. Bandas Transportadoras)", required: true },
    { name: "cantidad", label: "Cantidad de muestras", type: "number", required: true },
    { name: "analisis", label: "Descripción del análisis", required: true },
  ];
}

/* ---------------------------------------------------------
   Tabla anual (zona × mes)
   --------------------------------------------------------- */

function renderTablaAnual() {
  const filas = tiposOrdenados()
    .map((tipo) =>
      (tipo.zonas || [])
        .map(
          (zona) => `
          <tr>
            <td>${escaparHtml(tipo.nombre)}</td>
            <td>${escaparHtml(zona.nombre)}</td>
            <td style="text-align:center;">${zona.cantidad}</td>
            ${MESES.map(
              (_, i) => `
              <td style="text-align:center;">
                <input
                  type="checkbox"
                  data-tipo="${tipo.id}"
                  data-zona="${zona.id}"
                  data-mes="${i}"
                  ${(zona.meses || []).includes(i) ? "checked" : ""}
                />
              </td>
            `
            ).join("")}
          </tr>
        `
        )
        .join("")
    )
    .join("");

  tablaMuestreo.innerHTML = `
    <thead>
      <tr>
        <th>Tipo</th>
        <th>Zona</th>
        <th>Cant.</th>
        ${MESES.map((m) => `<th title="${escaparHtml(m)}">${escaparHtml(m.slice(0, 3))}</th>`).join("")}
      </tr>
    </thead>
    <tbody>${filas || `<tr><td colspan="${MESES.length + 3}">Sin zonas configuradas.</td></tr>`}</tbody>
  `;
}

tablaMuestreo.addEventListener("change", async (evento) => {
  const caja = evento.target.closest("input[type=checkbox]");
  if (!caja) return;

  const tipo = (estado.tabla.tipos || []).find((t) => t.id === caja.dataset.tipo);
  const zona = tipo?.zonas?.find((z) => z.id === caja.dataset.zona);
  if (!zona) return;

  const mes = Number(caja.dataset.mes);
  const meses = new Set(zona.meses || []);
  if (caja.checked) meses.add(mes);
  else meses.delete(mes);
  zona.meses = [...meses].sort((a, b) => a - b);

  try {
    await guardarTablaHisopado(estado.tabla, estado.usuario.uid);
  } catch (error) {
    console.error("No se pudo guardar la programación:", error);
    mostrarToast("No se pudo guardar el cambio.", "error");
    caja.checked = !caja.checked;
  }
});

/* ---------------------------------------------------------
   Descarga de la tabla en el formato del SIG-TA-102
   Reproduce la hoja del Excel original: una fila por zona, la cantidad
   a la izquierda, el tipo de muestra con su rango en una celda combinada
   que abarca todas sus zonas, y los doce meses con una "X" donde está
   programado el muestreo.
   --------------------------------------------------------- */

btnDescargarTabla?.addEventListener("click", () => {
  if (typeof XLSX === "undefined") {
    mostrarToast("No se pudo cargar el generador de Excel. Revisa tu conexión.", "error");
    return;
  }

  const unidad = estado.tabla.unidad || "RLU";
  const filas = [
    [estado.tabla.codigo || "SIG-TA-102"],
    [estado.tabla.revision || "Rev. 00"],
    ["TABLA DE MUESTREO DE HISOPADOS"],
    ["Cantidad", "Tipo de muestra", "Descripción del análisis", "Meses"],
    ["", "", "", ...MESES],
  ];

  // Las celdas combinadas se acumulan mientras se arman las filas: cada
  // tipo ocupa una sola celda vertical sobre todas sus zonas, igual que
  // en el formato en papel.
  const combinadas = [
    { s: { r: 3, c: 3 }, e: { r: 3, c: 14 } }, // "Meses" sobre los 12 meses
  ];

  for (const tipo of tiposOrdenados()) {
    const zonas = tipo.zonas || [];
    if (zonas.length === 0) continue;

    const primeraFila = filas.length;
    zonas.forEach((zona, indice) => {
      filas.push([
        zona.cantidad,
        indice === 0 ? `${tipo.nombre.toUpperCase()}\nRANGOS = ${tipo.limiteMin} a ${tipo.limiteMax} ${unidad}` : "",
        zona.nombre,
        ...MESES.map((_, mes) => ((zona.meses || []).includes(mes) ? "X" : "")),
      ]);
    });

    if (zonas.length > 1) {
      combinadas.push({
        s: { r: primeraFila, c: 1 },
        e: { r: primeraFila + zonas.length - 1, c: 1 },
      });
    }
  }

  const hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja["!merges"] = combinadas;
  hoja["!cols"] = [
    { wch: 9 },  // Cantidad
    { wch: 30 }, // Tipo de muestra
    { wch: 28 }, // Descripción
    ...MESES.map(() => ({ wch: 5 })),
  ];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "hisopado");
  XLSX.writeFile(libro, `${estado.tabla.codigo || "SIG-TA-102"}_Tabla_de_Muestreo.xlsx`);
});
