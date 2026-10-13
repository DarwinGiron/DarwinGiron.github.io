// =========================================================
// hisopado-historial.js
// Controlador de hisopado/historial.html — tomas de hisopado en dos vistas:
//
//  - Tabla (la que abre por defecto): la tabla de muestreo SIG-TA-102 con el
//    diseño del formato en papel y solo los resultados, verde o rojo según el
//    límite. Muestra los análisis de TODO el equipo en el año elegido (las
//    reglas dejan a cualquier usuario activo leer los hisopados).
//  - Tarjetas: una por toma, para revisar o eliminar un registro puntual.
//    Un gestor ve todas; el inspector solo las suyas (el filtro por
//    inspectorUid no es cosmético, las reglas rechazan la consulta completa
//    si un inspector la omite). Se leen la primera vez que se abre esa vista.
// =========================================================

import { protegerPagina, cerrarSesion, esRolDeGestion, etiquetaRol } from "./auth.js";
import {
  listarHisopados,
  listarHisopadosPagina,
  eliminarHisopado,
  corregirHisopado,
  obtenerTablaHisopado,
} from "./firestore.js";
import { zonasConLimite } from "./hisopado-datos.js";
import { pintarTablaMuestreo } from "./hisopado-tabla.js";
import { mostrarBloqueError } from "./aviso-carga.js";
import { crearModalFormulario } from "./modal-formulario.js";
import { descargarTablaHisopados } from "./hisopado-exportar.js";
import { registrarAreaMaquinaSiNoExiste } from "./areas-maquina.js";
import { registrarSupervisorSiNoExiste } from "./supervisores.js";
import { evaluarResultado } from "./hisopado-datos.js";
import {
  escaparHtml,
  formatearFechaISOCorta,
  iniciales,
  mostrarCarga,
  mostrarToast,
} from "./utils.js";

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");
const filtroBusqueda = document.getElementById("filtro-busqueda");
const lista = document.getElementById("lista-hisopados");

const campoAnio = document.getElementById("campo-anio");
const btnDescargarTabla = document.getElementById("btn-descargar-tabla");
const zonaMensaje = document.getElementById("zona-mensaje");
const zonaTabla = document.getElementById("zona-tabla");
const tablaResultados = document.getElementById("tabla-resultados");

const estado = {
  registros: [],
  puedeEliminar: false,
  usuario: null,
  perfil: null,
  zonas: null,
  anios: new Map(), // año -> resultados ya leídos
  encabezado: {},
  anio: new Date().getFullYear(),
  tarjetasCargadas: false,
  cursor: null, // última tarjeta leída (para pedir la siguiente página)
  hayMas: false,
  cargandoTarjetas: false,
  tablaDesactualizada: false, // se eliminó un registro desde las tarjetas
};

protegerPagina({}, async ({ user, perfil }) => {
  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);
  estado.puedeEliminar = esRolDeGestion(perfil.rol);
  estado.usuario = user;
  estado.perfil = perfil;

  const actual = new Date().getFullYear();
  campoAnio.innerHTML = [actual, actual - 1, actual - 2, actual - 3, actual - 4]
    .map((a) => `<option value="${a}">${a}</option>`)
    .join("");
  campoAnio.value = String(estado.anio);

  await cargarTabla();
});

/* ---------- Vista Tabla ---------- */

async function cargarTabla() {
  zonaMensaje.classList.add("oculto");
  zonaTabla.classList.remove("oculto");
  tablaResultados.classList.remove("tabla-papel");
  tablaResultados.innerHTML = `<tbody><tr><td class="texto-suave texto-sm">Cargando resultados…</td></tr></tbody>`;
  btnDescargarTabla.disabled = true;

  try {
    // La tabla de muestreo (zonas y límites) se lee una sola vez.
    if (!estado.zonas) {
      const tablaCfg = await obtenerTablaHisopado();
      estado.encabezado = { codigo: tablaCfg?.codigo, revision: tablaCfg?.revision };
      estado.zonas = zonasConLimite(tablaCfg);
    }
    if (estado.zonas.length === 0) {
      zonaTabla.classList.add("oculto");
      zonaMensaje.classList.remove("oculto");
      zonaMensaje.innerHTML =
        '<p class="texto-suave texto-sm mb-0">Todavía no hay tabla de muestreo configurada. Un administrador debe cargarla en Configuraciones.</p>';
      return;
    }
    // Solo se consulta el año elegido, y una sola vez por año mientras la
    // pantalla siga abierta: volver a un año ya visto no vuelve a leer nada.
    if (!estado.anios.has(estado.anio)) {
      estado.anios.set(
        estado.anio,
        await listarHisopados({ desde: `${estado.anio}-01-01`, hasta: `${estado.anio}-12-31`, max: 3000 })
      );
    }
    const registros = estado.anios.get(estado.anio);
    pintarTablaMuestreo(tablaResultados, { zonas: estado.zonas, registros, anio: estado.anio, encabezado: estado.encabezado });
    btnDescargarTabla.disabled = false;
  } catch (error) {
    console.error("No se pudo cargar la tabla de hisopados:", error);
    zonaTabla.classList.add("oculto");
    zonaMensaje.classList.remove("oculto");
    mostrarBloqueError(zonaMensaje, { error, alReintentar: cargarTabla });
  }
}

campoAnio.addEventListener("change", () => {
  estado.anio = Number(campoAnio.value);
  // Cada vista se reinicia con el año nuevo; la que no está a la vista se
  // carga solo cuando se abra.
  estado.tarjetasCargadas = false;
  estado.registros = [];
  if (vistaActual() === "tarjetas") cargarTarjetas();
  else cargarTabla();
});

function vistaActual() {
  return document.querySelector("[data-vista].activo")?.dataset.vista || "tabla";
}

/* ---------- Descargar la tabla ---------- */

btnDescargarTabla.addEventListener("click", async () => {
  const registros = estado.anios.get(estado.anio);
  if (!registros || !estado.zonas) return;
  btnDescargarTabla.disabled = true;
  btnDescargarTabla.textContent = "Generando…";
  try {
    // Usa lo que ya está en pantalla (el año elegido); no vuelve a consultar.
    await descargarTablaHisopados({ zonas: estado.zonas, registros, anio: estado.anio, encabezado: estado.encabezado });
  } catch (error) {
    console.error("No se pudo generar el Excel:", error);
    mostrarToast(error.message || "No se pudo generar el Excel.", "error");
  } finally {
    btnDescargarTabla.disabled = false;
    btnDescargarTabla.textContent = "Descargar Excel";
  }
});

/* ---------- Cambio de vista ---------- */

document.querySelectorAll("[data-vista]").forEach((boton) => {
  boton.addEventListener("click", async () => {
    const vista = boton.dataset.vista;
    document.querySelectorAll("[data-vista]").forEach((b) => b.classList.toggle("activo", b === boton));
    document.getElementById("vista-tabla").classList.toggle("oculto", vista !== "tabla");
    document.getElementById("vista-tarjetas").classList.toggle("oculto", vista !== "tarjetas");
    if (vista === "tarjetas" && !estado.tarjetasCargadas) await cargarTarjetas();
    if (vista === "tabla" && estado.tablaDesactualizada) {
      estado.tablaDesactualizada = false;
      estado.anios.clear();
      await cargarTabla();
    }
  });
});

/* ---------- Vista Tarjetas ---------- */
// Se piden de 10 en 10, solo del año elegido (o del día elegido) y con los
// filtros de resultado y turno aplicados en el servidor. "Cargar 10 más" trae la
// siguiente página; no se descarga el historial completo de una vez.

const POR_PAGINA = 10;
const btnMasTarjetas = document.getElementById("btn-mas-tarjetas");
const filtroResultado = document.getElementById("filtro-resultado");
const filtroDia = document.getElementById("filtro-dia");
const filtroTurno = document.getElementById("filtro-turno");
const btnLimpiarFiltros = document.getElementById("btn-limpiar-filtros");
const textoFiltros = document.getElementById("texto-filtros");

/** Filtros que se mandan al servidor (el buscador de texto es aparte, sobre lo cargado). */
function filtrosServidor() {
  return {
    dia: filtroDia.value || null,
    turno: filtroTurno.value || null,
    desviacion: filtroResultado.value === "fuera" ? true : filtroResultado.value === "conforme" ? false : null,
  };
}

function actualizarTextoFiltros() {
  const f = filtrosServidor();
  const partes = [];
  if (f.desviacion !== null) partes.push(f.desviacion ? "fuera del límite" : "conformes");
  if (f.turno) partes.push(`turno ${f.turno}`);
  partes.push(f.dia ? `del día ${formatearFechaISOCorta(f.dia)}` : `de ${estado.anio}`);
  textoFiltros.textContent = `Mostrando: ${partes.join(" · ")}`;
  btnLimpiarFiltros.classList.toggle("oculto", f.desviacion === null && !f.turno && !f.dia);
}

[filtroResultado, filtroDia, filtroTurno].forEach((el) => el.addEventListener("change", () => cargarTarjetas()));
btnLimpiarFiltros.addEventListener("click", () => {
  filtroResultado.value = "";
  filtroDia.value = "";
  filtroTurno.value = "";
  cargarTarjetas();
});
const notaBusqueda = document.getElementById("nota-busqueda");

async function cargarTarjetas() {
  estado.registros = [];
  estado.cursor = null;
  estado.hayMas = false;
  mostrarCarga(lista, "Cargando registros…");
  btnMasTarjetas.classList.add("oculto");
  notaBusqueda.classList.add("oculto");
  actualizarTextoFiltros();
  await cargarPaginaTarjetas();
}

async function cargarPaginaTarjetas() {
  if (estado.cargandoTarjetas) return;
  estado.cargandoTarjetas = true;
  btnMasTarjetas.disabled = true;
  btnMasTarjetas.textContent = "Cargando…";
  const anio = estado.anio;
  try {
    const pagina = await listarHisopadosPagina({
      ...(estado.puedeEliminar ? {} : { inspectorUid: estado.usuario.uid }),
      ...filtrosServidor(),
      desde: `${anio}-01-01`,
      hasta: `${anio}-12-31`,
      limite: POR_PAGINA,
      despues: estado.cursor,
    });
    if (anio !== estado.anio) return; // se cambió de año mientras cargaba
    estado.registros = estado.registros.concat(pagina.registros);
    estado.cursor = pagina.cursor;
    estado.hayMas = pagina.hayMas;
    estado.tarjetasCargadas = true;
    renderizar();
  } catch (error) {
    console.error("No se pudieron cargar los hisopados:", error);
    if (!estado.registros.length) {
      // Si falta un índice (al combinar filtros por primera vez) el bloque lo explica.
      mostrarBloqueError(lista, { error, alReintentar: cargarTarjetas });
    } else {
      mostrarToast("No se pudo cargar el historial. Verifica tu conexión.", "error");
    }
  } finally {
    estado.cargandoTarjetas = false;
    btnMasTarjetas.disabled = false;
    btnMasTarjetas.textContent = `Cargar ${POR_PAGINA} más`;
    btnMasTarjetas.classList.toggle("oculto", !estado.hayMas);
    notaBusqueda.classList.toggle("oculto", !(estado.hayMas && filtroBusqueda.value.trim()));
  }
}

btnMasTarjetas.addEventListener("click", cargarPaginaTarjetas);

btnSalir.addEventListener("click", () => cerrarSesion());
filtroBusqueda.addEventListener("input", () => {
  renderizar();
  notaBusqueda.classList.toggle("oculto", !(estado.hayMas && filtroBusqueda.value.trim()));
});

/** Texto donde busca el filtro: todo lo que el usuario podría teclear de memoria. */
function textoBuscable(registro) {
  return `${registro.zonaNombre || ""} ${registro.tipoNombre || ""} ${
    registro.areaMaquina || ""
  } ${registro.supervisor || ""} ${registro.inspectorNombre || ""} ${registro.resultado}`.toLowerCase();
}

function renderizar() {
  const termino = filtroBusqueda.value.trim().toLowerCase();
  const visibles = termino
    ? estado.registros.filter((r) => textoBuscable(r).includes(termino))
    : estado.registros;

  if (visibles.length === 0) {
    lista.innerHTML = `
      <div class="tarjeta">
        <p class="texto-suave texto-sm mb-0">
          ${termino ? "Ningún análisis cargado coincide con la búsqueda." : "No hay análisis de hisopado con estos filtros."}
        </p>
      </div>
    `;
    return;
  }

  lista.innerHTML = visibles.map(tarjetaDe).join("");
}

/**
 * El límite de un análisis. Los registros viejos lo traían como texto
 * libre dentro de una lista de muestras; los nuevos son un análisis plano
 * con el rango numérico heredado de la tabla, así que se soportan ambos.
 */
function textoLimiteRegistro(r) {
  if (r.limiteMin !== undefined && r.limiteMin !== null) {
    return `${r.limiteMin} a ${r.limiteMax} ${r.unidad || "RLU"}`;
  }
  return "—";
}

/** Los registros importados del Excel solo conocen el mes, no el día exacto. */
function textoFechaRegistro(registro) {
  if (!registro.fechaAproximada) return formatearFechaISOCorta(registro.fecha);
  const [anio, mes] = String(registro.fecha).split("-");
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${meses[Number(mes) - 1] || mes} ${anio} (día no registrado)`;
}

function tarjetaDe(registro) {
  // Los registros anteriores agrupaban varias muestras en un documento; se
  // muestran expandidos para que el historial no pierda nada.
  if (Array.isArray(registro.muestras)) return tarjetaAgrupadaDe(registro);

  const fuera = Boolean(registro.desviacion);
  const notas = [registro.correcciones, registro.observaciones].filter(Boolean).join(" · ");

  return `
    <section class="tarjeta">
      <div class="flex-entre mb-1">
        <div>
          <h2 class="tarjeta__titulo mb-0">${escaparHtml(registro.zonaNombre || "—")}</h2>
          <p class="texto-suave texto-sm mb-0">
            ${textoFechaRegistro(registro)}
            ${registro.turno ? ` · Turno ${escaparHtml(String(registro.turno))}` : ""}${
              registro.correcciones?.length ? ` <span title="Este registro se corrigió después de guardarlo">· corregido</span>` : ""
            }
            · ${escaparHtml(registro.inspectorNombre || "—")}
          </p>
        </div>
        <span class="badge ${fuera ? "badge-error" : "badge-exito"}">
          ${fuera ? "Fuera del límite" : "Conforme"}
        </span>
      </div>

      <div class="fichas" style="grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); margin-top: var(--e3);">
        <div class="ficha ${fuera ? "ficha--critico" : "ficha--exito"}">
          <div class="ficha__etiqueta">Resultado · límite ${escaparHtml(textoLimiteRegistro(registro))}</div>
          <div class="ficha__valor">${escaparHtml(`${registro.resultado ?? "—"} ${registro.unidad || ""}`.trim())}</div>
        </div>
        ${fichaHtml("Tipo", registro.tipoNombre)}
        ${registro.areaMaquina ? fichaHtml("Área/Máquina", registro.areaMaquina) : ""}
        ${fichaHtml("Supervisor", registro.supervisor)}
      </div>

      ${
        notas
          ? `<div class="alerta alerta-info" style="margin-top: var(--e2);">
               <strong>Acciones inmediatas y observaciones:</strong> ${escaparHtml(notas)}
             </div>`
          : ""
      }
      ${botonEliminarDe(registro)}
    </section>
  `;
}

/** Una celda de la cuadrícula de fichas (etiqueta + valor grande), mismo orden que usan transporte.js y SIG-FO-101. */
function fichaHtml(etiqueta, valor) {
  return `
    <div class="ficha">
      <div class="ficha__etiqueta">${escaparHtml(etiqueta)}</div>
      <div class="ficha__valor" style="font-size: var(--txt-md);">${escaparHtml(valor || "—")}</div>
    </div>`;
}

/** Formato anterior: un documento con varias muestras adentro. */
function tarjetaAgrupadaDe(registro) {
  const muestras = registro.muestras || [];
  const desviaciones = muestras.filter((m) => m.desviacion).length;
  const notas = [registro.correcciones, registro.observaciones].filter(Boolean).join(" · ");

  const filas = muestras
    .map(
      (m) => `
        <div class="editor-item" style="margin-bottom: var(--e2);">
          <div class="flex-entre mb-1">
            <strong class="texto-sm">${escaparHtml(m.zonaNombre || m.areaMaquina || "—")}</strong>
            <span class="badge ${m.desviacion ? "badge-error" : "badge-exito"}">
              ${m.desviacion ? "Fuera del límite" : "Conforme"}
            </span>
          </div>
          <div class="fichas" style="grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));">
            ${fichaHtml("Resultado", `${m.resultado ?? "—"} ${m.unidad || ""}`.trim())}
            ${fichaHtml("Límite", textoLimiteRegistro(m))}
            ${fichaHtml("Supervisor", m.supervisor || registro.supervisor)}
          </div>
        </div>
      `
    )
    .join("");

  return `
    <section class="tarjeta">
      <div class="flex-entre mb-1">
        <h2 class="tarjeta__titulo mb-0">${formatearFechaISOCorta(registro.fecha)}</h2>
        <span class="badge ${desviaciones ? "badge-error" : "badge-exito"}">
          ${desviaciones ? `${desviaciones} desviación(es)` : "Sin desviaciones"}
        </span>
      </div>
      <p class="texto-suave texto-sm">
        ${registro.turno ? `Turno ${escaparHtml(String(registro.turno))} · ` : ""}
        ${escaparHtml(registro.inspectorNombre || "—")}
      </p>
      ${filas}
      ${
        notas
          ? `<div class="alerta alerta-info" style="margin-top: var(--e2);">
               <strong>Acciones inmediatas y observaciones:</strong> ${escaparHtml(notas)}
             </div>`
          : ""
      }
      ${botonEliminarDe(registro)}
    </section>
  `;
}

function botonEliminarDe(registro) {
  // Editar el registro lo puede hacer el autor o un gestor (las reglas lo
  // permiten a ambos); eliminar, solo un gestor. Los registros del formato
  // anterior (con varias muestras adentro) no se editan.
  const puedeCorregir = !Array.isArray(registro.muestras);
  const id = escaparHtml(registro.id);
  return `
    <div class="flex-fin" style="margin-top: var(--e2); gap: var(--e2); flex-wrap: wrap;" data-acciones="${id}">
      ${puedeCorregir ? `<button type="button" class="btn btn-secundario btn-sm btn-ancho-auto" data-corregir="${id}">Editar registro</button>` : ""}
      ${estado.puedeEliminar ? `<button type="button" class="btn btn-peligro btn-sm btn-ancho-auto" data-eliminar="${id}">Eliminar</button>` : ""}
    </div>`;
}

lista.addEventListener("click", async (evento) => {
  const corregir = evento.target.closest("[data-corregir]");
  if (corregir) return abrirEdicion(corregir.dataset.corregir);

  const boton = evento.target.closest("[data-eliminar]");
  if (!boton) return;

  const id = boton.dataset.eliminar;
  if (!confirm("¿Eliminar este registro de hisopado? No se puede deshacer.")) return;

  boton.disabled = true;
  try {
    await eliminarHisopado(id);
    estado.registros = estado.registros.filter((r) => r.id !== id);
    estado.tablaDesactualizada = true;
    renderizar();
    mostrarToast("Registro eliminado.", "exito");
  } catch (error) {
    console.error("No se pudo eliminar el hisopado:", error);
    mostrarToast("No se pudo eliminar el registro.", "error");
    boton.disabled = false;
  }
});

/* ---------- Editar un registro ---------- */

const { abrirModal } = crearModalFormulario({
  modalFondo: document.getElementById("modal-fondo"),
  modalTitulo: document.getElementById("modal-titulo"),
  formModal: document.getElementById("form-modal"),
  btnCerrarModal: document.getElementById("btn-cerrar-modal"),
});

/** La tabla de muestreo (superficies y límites); casi siempre ya está cargada. */
async function asegurarZonas() {
  if (!estado.zonas) {
    const tablaCfg = await obtenerTablaHisopado();
    estado.encabezado = { codigo: tablaCfg?.codigo, revision: tablaCfg?.revision };
    estado.zonas = zonasConLimite(tablaCfg);
  }
  return estado.zonas;
}

/** ¿El registro sigue cumpliendo los filtros activos tras editarlo? Si no, sale de la lista. */
function cumpleFiltros(r) {
  const f = filtrosServidor();
  if (f.dia) return r.fecha === f.dia;
  if (!String(r.fecha || "").startsWith(`${estado.anio}-`)) return false;
  if (f.turno && Number(r.turno) !== Number(f.turno)) return false;
  if (f.desviacion !== null && Boolean(r.desviacion) !== f.desviacion) return false;
  return true;
}

async function abrirEdicion(id) {
  const registro = estado.registros.find((r) => r.id === id);
  if (!registro) return;

  let zonas;
  try {
    zonas = await asegurarZonas();
  } catch (error) {
    console.error("No se pudo leer la tabla de muestreo:", error);
    mostrarToast("No se pudo cargar la lista de superficies. Verifica tu conexión.", "error");
    return;
  }

  // Si la superficie del registro ya no está en la tabla, se conserva como opción.
  const opciones = zonas.map((z) => ({ value: z.id, label: `${z.tipoNombre} · ${z.nombre}` }));
  if (!zonas.some((z) => z.id === registro.zonaId)) {
    opciones.unshift({ value: registro.zonaId, label: `${registro.tipoNombre || "—"} · ${registro.zonaNombre || registro.zonaId} (ya no está en la tabla)` });
  }

  abrirModal({
    titulo: "Editar registro",
    campos: [
      { name: "fecha", label: "Fecha", type: "date", required: true,
        ayuda: registro.fechaAproximada ? "Este registro se importó solo con el mes. Si pones el día real, deja de ser aproximado." : undefined },
      { name: "turno", label: "Turno", type: "select", opciones: [1, 2, 3].map((t) => ({ value: String(t), label: `Turno ${t}` })) },
      { name: "zonaId", label: "Superficie", type: "select", opciones },
      { name: "areaMaquina", label: "Área / Máquina", type: "text" },
      { name: "supervisor", label: "Supervisor", type: "text" },
      { name: "resultado", label: "Resultado (RLU)", type: "number", step: "any", required: true },
      { name: "observaciones", label: "Acciones inmediatas y observaciones", type: "textarea",
        ayuda: "Obligatorio si el resultado queda fuera del límite." },
    ],
    valores: {
      fecha: registro.fecha,
      turno: String(registro.turno ?? "1"),
      zonaId: registro.zonaId,
      areaMaquina: registro.areaMaquina || "",
      supervisor: registro.supervisor || "",
      resultado: registro.resultado,
      observaciones: registro.observaciones || "",
    },
    alGuardar: (valores) => guardarEdicion(registro, valores, zonas),
  });
}

async function guardarEdicion(registro, valores, zonas) {
  const falla = (mensaje) => { mostrarToast(mensaje, "alerta"); throw new Error(mensaje); };

  if (!valores.fecha) falla("Indica la fecha.");
  if (!valores.areaMaquina) falla("Indica el área o máquina donde se tomó la muestra.");
  if (!valores.supervisor) falla("Indica el supervisor que acompañó la toma.");
  if (valores.resultado === "" || Number.isNaN(valores.resultado) || valores.resultado < 0) falla("Captura un resultado en RLU válido.");

  // La superficie elegida; si no cambió se conserva el límite con que se evaluó
  // el registro (el límite se congela al guardar), y solo si cambió se toma el
  // de la tabla actual.
  const zonaElegida = zonas.find((z) => z.id === valores.zonaId);
  const cambioZona = valores.zonaId !== registro.zonaId;
  if (cambioZona && !zonaElegida) falla("Elige una superficie de la tabla de muestreo.");
  const zona = cambioZona
    ? zonaElegida
    : {
        id: registro.zonaId,
        nombre: registro.zonaNombre,
        tipoNombre: registro.tipoNombre,
        limiteMin: registro.limiteMin ?? zonaElegida?.limiteMin ?? 0,
        limiteMax: registro.limiteMax ?? zonaElegida?.limiteMax ?? 0,
        unidad: registro.unidad || zonaElegida?.unidad || "RLU",
      };

  const fuera = evaluarResultado(zona, valores.resultado);
  const cambioResultado = Number(registro.resultado) !== valores.resultado;
  // Igual que al registrar, un resultado fuera de límite necesita sus acciones;
  // un registro viejo que ya estaba así y no se toca en eso no se bloquea.
  if (fuera && !valores.observaciones && (cambioResultado || cambioZona || !registro.desviacion)) {
    falla("El resultado queda fuera del límite: anota qué acciones inmediatas se realizaron.");
  }

  try {
    const { cambios, campos } = await corregirHisopado(
      registro,
      {
        fecha: valores.fecha,
        turno: Number(valores.turno),
        zona,
        areaMaquina: valores.areaMaquina,
        supervisor: valores.supervisor,
        resultado: valores.resultado,
        observaciones: valores.observaciones,
        desviacion: Boolean(fuera),
      },
      { uid: estado.usuario.uid, nombre: estado.perfil.nombre || estado.usuario.email }
    );
    if (cambios.length === 0) {
      mostrarToast("No hay cambios que guardar.", "info");
      return;
    }

    // Las áreas y supervisores nuevos se dan de alta como al registrar.
    if (campos.areaMaquina && campos.areaMaquina !== registro.areaMaquina) {
      await registrarAreaMaquinaSiNoExiste(campos.areaMaquina, estado.usuario.uid).catch(() => {});
    }
    if (campos.supervisor && campos.supervisor !== registro.supervisor) {
      await registrarSupervisorSiNoExiste(campos.supervisor, estado.usuario.uid).catch(() => {});
    }

    // Se actualiza en pantalla sin volver a consultar.
    Object.assign(registro, campos, {
      correcciones: [...(registro.correcciones || []), { cambios }],
    });
    if (!cumpleFiltros(registro)) estado.registros = estado.registros.filter((r) => r.id !== registro.id);
    estado.tablaDesactualizada = true; // la tabla guardada en memoria ya no refleja este cambio
    renderizar();
    mostrarToast(`Registro corregido (${cambios.map((c) => c.campo.toLowerCase()).join(", ")}).`, "exito");
  } catch (error) {
    if (error?.codigo === "duplicado") {
      mostrarToast(`"${zona.nombre}" ya tiene un análisis ese día en el turno ${valores.turno}.`, "error");
    } else {
      console.error("No se pudo corregir el registro:", error);
      mostrarToast("No se pudo guardar la corrección. Verifica tu conexión.", "error");
    }
    throw error; // deja el formulario abierto
  }
}
