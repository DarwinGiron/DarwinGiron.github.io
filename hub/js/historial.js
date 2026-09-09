// =========================================================
// historial.js
// Controlador de inspecciones.html: filtros, listado, resumen
// de cumplimiento y detalle de cada recorrido.
// El inspector solo ve sus propios recorridos (reforzado por
// firestore.rules); el admin ve todos y además filtra por inspector.
//
// Un recorrido es UN SOLO documento que cubre todas las áreas de un
// turno (ver idRecorrido() en firestore.js) — no hay un documento por
// área, así que cada fila de la lista y cada vista de detalle
// representan el reporte completo, no un proceso aislado.
// =========================================================

import { protegerPagina, cerrarSesion, esRolDeGestion, etiquetaRol } from "./auth.js";
import {
  listarRecorridos,
  eliminarInspeccion,
  obtenerInspeccion,
  obtenerChecklist,
  obtenerVersionChecklist,
  listarUsuarios,
} from "./firestore.js";
import { CHECKLIST_ID } from "./firebase-config.js";
import {
  formatearFechaHora,
  formatearFecha,
  formatearFechaISOCorta,
  clasificarCumplimiento,
  medidorCumplimiento,
  iniciales,
  ICONOS,
  mostrarErrorEn,
  mostrarVacio,
  mostrarCarga,
  mostrarEsqueleto,
  mostrarToast,
  escaparHtml,
} from "./utils.js";

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");

const vistaLista = document.getElementById("vista-lista");
const vistaDetalle = document.getElementById("vista-detalle");
const detalleContenido = document.getElementById("detalle-contenido");
const btnVolver = document.getElementById("btn-volver");
const btnEliminarDetalle = document.getElementById("btn-eliminar-detalle");

const filtroMes = document.getElementById("filtro-mes");
const filtroArea = document.getElementById("filtro-area");
const campoFiltroInspector = document.getElementById("campo-filtro-inspector");
const filtroInspector = document.getElementById("filtro-inspector");
const filtroBusqueda = document.getElementById("filtro-busqueda");
const btnFiltrar = document.getElementById("btn-filtrar");
const btnLimpiarFiltros = document.getElementById("btn-limpiar-filtros");
const btnCargarMas = document.getElementById("btn-cargar-mas");
const tituloHistorial = document.getElementById("titulo-historial");

const zonaResumen = document.getElementById("zona-resumen");
const resumenTotal = document.getElementById("resumen-total");
const resumenPromedio = document.getElementById("resumen-promedio");
const resumenBajos = document.getElementById("resumen-bajos");
const resumenUltima = document.getElementById("resumen-ultima");

const listaInspecciones = document.getElementById("lista-inspecciones");

/* Cada respuesta se muestra con icono + etiqueta, nunca solo con color. */
const PRESENTACION_RESPUESTA = {
  cumple: { clase: "badge-exito", icono: ICONOS.check, etiqueta: "Cumple" },
  no_cumple: { clase: "badge-error", icono: ICONOS.cruz, etiqueta: "No cumple" },
  na: { clase: "badge-neutro", icono: ICONOS.menos, etiqueta: "No aplica" },
};

/** Cuántos registros se muestran por página (paginación en cliente). */
const POR_PAGINA = 20;
/** Tope de documentos a traer de Firestore para el mes seleccionado. */
const MAXIMO_MES = 500;

function mesActualISO() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

const estado = {
  usuario: null,
  perfil: null,
  esGestor: false, // admin o coordinador: ve todos los recorridos
  recorridosMes: [], // todos los recorridos del mes seleccionado (ya filtrados por área/inspector)
  visibles: POR_PAGINA, // cuántos de recorridosMes se están mostrando
};

/* ---------------------------------------------------------
   Arranque
   --------------------------------------------------------- */

protegerPagina({}, async ({ user, perfil }) => {
  estado.usuario = user;
  estado.perfil = perfil;
  estado.esGestor = esRolDeGestion(perfil.rol);

  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);

  if (!estado.esGestor) {
    // Se ocultan todos los enlaces al panel (barra inferior y cabecera).
    document
      .querySelectorAll('a[href="admin.html"]')
      .forEach((enlace) => enlace.classList.add("oculto"));
    campoFiltroInspector.classList.add("oculto");
  } else {
    campoFiltroInspector.classList.remove("oculto");
  }

  await Promise.all([
    poblarAreas(),
    estado.esGestor ? poblarInspectores() : Promise.resolve(),
  ]);

  filtroMes.value = mesActualISO();

  const idVerPorUrl = new URLSearchParams(window.location.search).get("ver");
  if (idVerPorUrl) {
    await mostrarDetalle(idVerPorUrl);
  } else {
    await cargarLista();
  }
});

btnSalir.addEventListener("click", () => cerrarSesion());

btnFiltrar.addEventListener("click", () => cargarLista());

btnLimpiarFiltros.addEventListener("click", () => {
  filtroMes.value = mesActualISO();
  filtroArea.value = "";
  filtroInspector.value = "";
  filtroBusqueda.value = "";
  cargarLista();
});

filtroBusqueda.addEventListener("input", () => {
  estado.visibles = POR_PAGINA;
  renderLista(recorridosFiltradosPorBusqueda());
});

btnCargarMas.addEventListener("click", () => {
  estado.visibles += POR_PAGINA;
  renderLista(recorridosFiltradosPorBusqueda());
});

btnVolver.addEventListener("click", () => {
  history.replaceState(null, "", "inspecciones.html");
  vistaDetalle.classList.add("oculto");
  vistaLista.classList.remove("oculto");
});

/* ---------------------------------------------------------
   Filtros
   --------------------------------------------------------- */

async function poblarAreas() {
  try {
    const checklist = await obtenerChecklist(CHECKLIST_ID);
    const areas = (checklist?.areas || []).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    for (const area of areas) {
      const opcion = document.createElement("option");
      opcion.value = area.id;
      opcion.textContent = area.nombre;
      filtroArea.appendChild(opcion);
    }
  } catch (error) {
    console.error("No se pudieron cargar las áreas:", error);
  }
}

/**
 * Llena el filtro por inspector. Incluye a TODOS los usuarios, no solo a los
 * de rol "inspector": los gestores (admin y coordinador) también ejecutan
 * inspecciones, así que filtrarlos fuera ocultaría sus registros.
 */
async function poblarInspectores() {
  try {
    const usuarios = await listarUsuarios();
    const ordenados = [...usuarios].sort((a, b) =>
      (a.nombre || "").localeCompare(b.nombre || "")
    );
    for (const usuario of ordenados) {
      const opcion = document.createElement("option");
      opcion.value = usuario.uid;
      const nombre = usuario.nombre || usuario.email || usuario.uid;
      opcion.textContent = esRolDeGestion(usuario.rol)
        ? `${nombre} (${etiquetaRol(usuario.rol)})`
        : nombre;
      filtroInspector.appendChild(opcion);
    }
  } catch (error) {
    console.error("No se pudieron cargar los inspectores:", error);
  }
}

function leerFiltros() {
  const filtros = {};

  // Un inspector siempre queda restringido a sus propios recorridos,
  // sin importar lo que intente enviar el cliente (reforzado además por las reglas de Firestore).
  if (!estado.esGestor) {
    filtros.inspectorUid = estado.usuario.uid;
  } else if (filtroInspector.value) {
    filtros.inspectorUid = filtroInspector.value;
  }

  const mesISO = filtroMes.value || mesActualISO();
  const [anio, mes] = mesISO.split("-").map(Number);
  const ultimoDia = new Date(anio, mes, 0).getDate();
  filtros.desde = new Date(`${mesISO}-01T00:00:00`);
  filtros.hasta = new Date(`${mesISO}-${String(ultimoDia).padStart(2, "0")}T23:59:59`);
  filtros.max = MAXIMO_MES;

  return filtros;
}

/** Filtra en memoria por el término de búsqueda (inspector, turno o área). */
function recorridosFiltradosPorBusqueda() {
  const termino = filtroBusqueda.value.trim().toLowerCase();
  if (!termino) return estado.recorridosMes;
  return estado.recorridosMes.filter((insp) => {
    const areas = Object.keys(insp.areas || {}).join(" ").toLowerCase();
    return (
      String(insp.inspectorNombre || "").toLowerCase().includes(termino) ||
      String(insp.turno ?? "").toLowerCase().includes(termino) ||
      areas.includes(termino)
    );
  });
}

/* ---------------------------------------------------------
   Listado + resumen
   Cada fila es UN recorrido completo (todas sus áreas), sea borrador o
   ya enviado: se distinguen con una insignia verde en vez de ir en una
   sección aparte. El filtro por área se aplica del lado del cliente,
   porque las áreas ahora viven anidadas dentro de cada documento.
   --------------------------------------------------------- */

async function cargarLista() {
  mostrarEsqueleto(listaInspecciones, 3);
  zonaResumen.classList.add("oculto");
  estado.visibles = POR_PAGINA;

  const huboFiltroExtra = Boolean(filtroArea.value || filtroInspector.value || filtroBusqueda.value.trim());
  btnLimpiarFiltros.classList.toggle("oculto", !huboFiltroExtra && filtroMes.value === mesActualISO());

  const filtros = leerFiltros();

  try {
    const recorridos = await listarRecorridos(filtros);
    estado.recorridosMes = filtroArea.value
      ? recorridos.filter((insp) => insp.areas && filtroArea.value in insp.areas)
      : recorridos;

    renderResumen(estado.recorridosMes.filter((i) => i.estado === "enviada"));
    renderLista(recorridosFiltradosPorBusqueda());
  } catch (error) {
    console.error("Error al listar recorridos:", error);
    mostrarErrorEn(
      listaInspecciones,
      `No se pudieron cargar las inspecciones. ${error.message || "Intenta de nuevo."}`
    );
  }
}

function renderResumen(enviadas) {
  if (enviadas.length === 0) {
    zonaResumen.classList.add("oculto");
    return;
  }

  const total = enviadas.length;
  const sumaPorcentaje = enviadas.reduce(
    (acc, i) => acc + (i.resultado?.porcentajeCumplimiento || 0),
    0
  );
  const promedio = Math.round((sumaPorcentaje / total) * 10) / 10;
  const bajos = enviadas.filter(
    (i) => (i.resultado?.porcentajeCumplimiento || 0) < 75
  ).length;
  const ultima = enviadas[0]?.enviadaEn;

  resumenTotal.textContent = String(total);
  resumenPromedio.textContent = `${promedio}%`;
  resumenBajos.textContent = String(bajos);
  resumenUltima.textContent = ultima ? formatearFecha(ultima) : "—";

  zonaResumen.classList.remove("oculto");
}

function renderLista(recorridosFiltrados) {
  tituloHistorial.textContent = `${recorridosFiltrados.length} inspección${recorridosFiltrados.length === 1 ? "" : "es"} este mes`;

  if (recorridosFiltrados.length === 0) {
    mostrarVacio(listaInspecciones, "No hay inspecciones que coincidan con los filtros.");
    btnCargarMas.classList.add("oculto");
    return;
  }

  const recorridos = recorridosFiltrados.slice(0, estado.visibles);
  btnCargarMas.classList.toggle("oculto", recorridos.length >= recorridosFiltrados.length);

  listaInspecciones.innerHTML = "";
  for (const insp of recorridos) {
    const esBorrador = insp.estado === "borrador";
    const porcentaje = insp.resultado?.porcentajeCumplimiento ?? 0;
    const { etiqueta } = clasificarCumplimiento(porcentaje);
    const nombreInspector = insp.inspectorNombre || "";
    const areasCubiertas = Object.keys(insp.areas || {}).sort();
    // Un gestor puede borrar cualquier registro (borrador o ya enviado);
    // un inspector solo puede descartar sus propios borradores.
    const puedeBorrar = estado.esGestor
      ? true
      : esBorrador && insp.inspectorUid === estado.usuario.uid;

    const item = document.createElement("a");
    item.className = "item-inspeccion";
    item.href = esBorrador
      // Ruta absoluta: el recorrido de SIG-FO-115 vive en sig-fo-115/index.html.
      // Antes decía "nueva-inspeccion.html" (heredado de cuando la app estaba
      // en la raíz del sitio); desde esta página, que ya está DENTRO de
      // sig-fo-115/, esa ruta relativa apuntaba a sig-fo-115/nueva-inspeccion.html,
      // que no existe -> 404 al pulsar "Continuar" en un borrador.
      ? `/hub/sig-fo-115/index.html?${new URLSearchParams({
          fecha: insp.fechaInspeccion || "",
          turno: String(insp.turno ?? ""),
        }).toString()}`
      : `inspecciones.html?ver=${insp.id}`;

    // Respaldo por si el servidor local reescribe la URL (quita ".html")
    // y en esa redirección se pierde el query string: se guarda lo mismo
    // en localStorage justo antes de navegar, y nueva-inspeccion.html lo
    // usa si llega sin parámetros en la URL. En un servidor que sí
    // conserva el query string esto no hace nada (los parámetros llegan
    // igual y tienen prioridad).
    if (esBorrador) {
      item.addEventListener("click", () => {
        try {
          localStorage.setItem(
            "sigfo115_continuar_recorrido",
            JSON.stringify({ fecha: insp.fechaInspeccion || "", turno: String(insp.turno ?? "") })
          );
        } catch {
          /* localStorage no disponible: sin respaldo, pero la URL normal debería bastar */
        }
      });
    }
    item.innerHTML = `
      <span class="avatar" aria-hidden="true">${escaparHtml(iniciales(nombreInspector))}</span>
      <div class="item-inspeccion__info">
        <div class="item-inspeccion__area">
          Turno ${escaparHtml(String(insp.turno ?? "—"))} ·
          ${escaparHtml(formatearFechaISOCorta(insp.fechaInspeccion))}
        </div>
        <div class="item-inspeccion__meta">
          ${areasCubiertas.length} proceso(s): ${escaparHtml(areasCubiertas.join(", ") || "—")}
        </div>
        <div class="item-inspeccion__meta">${escaparHtml(nombreInspector)}</div>
      </div>
      ${
        esBorrador
          ? '<span class="badge badge-exito">Pendiente de terminar</span>'
          : medidorCumplimiento(porcentaje, { tam: 50, grosor: 5, clase: "medidor--sm" })
      }
    `;

    // El estado también viaja como texto para lectores de pantalla.
    item.setAttribute(
      "aria-label",
      esBorrador
        ? `Recorrido turno ${insp.turno}, pendiente de terminar`
        : `Recorrido turno ${insp.turno}, ${formatearFechaISOCorta(
            insp.fechaInspeccion
          )}, cumplimiento ${porcentaje} por ciento, ${etiqueta}`
    );

    if (!esBorrador) {
      item.addEventListener("click", (evento) => {
        evento.preventDefault();
        history.pushState(null, "", `inspecciones.html?ver=${insp.id}`);
        mostrarDetalle(insp.id);
      });
    }

    if (puedeBorrar) {
      const fila = document.createElement("div");
      fila.className = "item-inspeccion-fila";
      fila.appendChild(item);

      const btnBorrar = document.createElement("button");
      btnBorrar.type = "button";
      btnBorrar.className = "btn btn-peligro btn-sm btn-ancho-auto";
      btnBorrar.textContent = "Eliminar";
      btnBorrar.addEventListener("click", () => borrarInspeccion(insp));
      fila.appendChild(btnBorrar);

      listaInspecciones.appendChild(fila);
    } else {
      listaInspecciones.appendChild(item);
    }
  }
}

/** @returns {Promise<boolean>} true si se eliminó, false si se canceló o falló. */
async function borrarInspeccion(insp) {
  const esBorrador = insp.estado === "borrador";
  const etiquetaRecorrido = `turno ${insp.turno} del ${formatearFechaISOCorta(insp.fechaInspeccion)}`;
  const advertencia = esBorrador
    ? `¿Eliminar el borrador del recorrido de ${etiquetaRecorrido}? Se perderá todo el avance guardado.`
    : `¿Eliminar el recorrido ya enviado de ${etiquetaRecorrido}? Esto borra el registro definitivo y no se puede deshacer.`;
  if (!confirm(advertencia)) return false;

  try {
    await eliminarInspeccion(insp.id);
    mostrarToast(esBorrador ? "Borrador eliminado." : "Recorrido eliminado.", "exito");
    cargarLista();
    return true;
  } catch (error) {
    console.error("No se pudo eliminar el recorrido:", error);
    mostrarToast("No se pudo eliminar.", "error");
    return false;
  }
}

/* ---------------------------------------------------------
   Detalle de un recorrido (todas sus áreas)
   --------------------------------------------------------- */

async function mostrarDetalle(id) {
  vistaLista.classList.add("oculto");
  vistaDetalle.classList.remove("oculto");
  btnEliminarDetalle.classList.add("oculto");
  mostrarCarga(detalleContenido, "Cargando inspección…");

  try {
    const recorrido = await obtenerInspeccion(id);
    if (!recorrido) {
      mostrarErrorEn(detalleContenido, "La inspección no existe o fue eliminada.");
      return;
    }

    const version = await obtenerVersionChecklist(
      recorrido.checklistId || CHECKLIST_ID,
      recorrido.version
    );

    renderDetalle(recorrido, version);

    // Solo un gestor puede eliminar desde el detalle (cualquier recorrido);
    // el propio inspector borra sus borradores desde la lista, no aquí.
    if (estado.esGestor) {
      btnEliminarDetalle.classList.remove("oculto");
      btnEliminarDetalle.onclick = async () => {
        const eliminado = await borrarInspeccion(recorrido);
        if (eliminado) btnVolver.click();
      };
    }
  } catch (error) {
    console.error("Error al cargar el detalle del recorrido:", error);
    mostrarErrorEn(detalleContenido, "No se pudo cargar el detalle de la inspección.");
  }
}

function renderDetalle(insp, version) {
  const r = insp.resultado || {};
  const porcentaje = r.porcentajeCumplimiento ?? 0;
  const { etiqueta, icono, estado: nivel } = clasificarCumplimiento(porcentaje);
  const colorInk = `var(--estado-${nivel}-ink)`;
  const esBorrador = insp.estado === "borrador";

  // Cifra protagonista: el cumplimiento GLOBAL del recorrido completo,
  // no de un solo proceso.
  let html = `
    <section class="tarjeta">
      <div class="texto-centro" style="padding: var(--e3) 0 var(--e4);">
        <div class="cifra-hero" style="color:${colorInk};">${porcentaje}%</div>
        <span class="badge badge-${
          esBorrador ? "exito" : nivel === "bien" ? "exito" : nivel === "alerta" ? "alerta" : "error"
        }" style="margin-top: var(--e2);">
          ${esBorrador ? "" : icono}${escaparHtml(esBorrador ? "Pendiente de terminar" : etiqueta)}
        </span>
        <p class="texto-suave texto-xs" style="margin-top: var(--e2);">
          Cumplimiento ponderado del recorrido completo
        </p>
      </div>

      <hr class="separador" />

      <p class="texto-suave texto-sm mb-0">
        Turno ${escaparHtml(String(insp.turno ?? "—"))} ·
        ${escaparHtml(formatearFechaISOCorta(insp.fechaInspeccion))}
        ${insp.enviadaEn ? ` · Enviado ${escaparHtml(formatearFechaHora(insp.enviadaEn))}` : ""}
      </p>
      <p class="texto-suave texto-sm mb-0">
        Inspector: ${escaparHtml(insp.inspectorNombre || "—")} ·
        Versión del checklist ${escaparHtml(String(insp.version ?? "—"))}
      </p>
    </section>

    <div class="fichas">
      <div class="ficha">
        <div class="ficha__valor">${r.cumple ?? 0}</div>
        <div class="ficha__etiqueta">Cumple</div>
      </div>
      <div class="ficha">
        <div class="ficha__valor">${r.noCumple ?? 0}</div>
        <div class="ficha__etiqueta">No cumple</div>
      </div>
      <div class="ficha">
        <div class="ficha__valor">${r.na ?? 0}</div>
        <div class="ficha__etiqueta">No aplica</div>
      </div>
      <div class="ficha">
        <div class="ficha__valor">${r.totalEvaluados ?? 0}</div>
        <div class="ficha__etiqueta">Evaluados</div>
      </div>
    </div>
  `;

  const secciones = version?.secciones || [];
  const areasOrdenadas = Object.entries(insp.areas || {}).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [areaId, datosArea] of areasOrdenadas) {
    const rArea = datosArea.resultado || {};
    const denomArea = (rArea.cumple ?? 0) + (rArea.noCumple ?? 0);
    const pctArea = denomArea > 0 ? rArea.porcentajeCumplimiento : null;

    html += `
      <section class="tarjeta">
        <div class="flex-entre mb-1">
          <h2 style="font-size: var(--txt-lg); margin:0;">
            ${escaparHtml(areaId)} · ${escaparHtml(datosArea.areaNombre || areaId)}
          </h2>
          <span class="texto-sm" style="font-weight:800;">${pctArea === null ? "—" : pctArea + "%"}</span>
        </div>
    `;

    if (datosArea.comentarios) {
      html += `<p class="texto-suave texto-sm">${escaparHtml(datosArea.comentarios)}</p>`;
    }

    if (datosArea.hisopado?.registros?.length) {
      html += `<h3 class="seccion-titulo"><span>Prueba de hisopado</span></h3>`;
      html += datosArea.hisopado.registros
        .map(
          (reg) => `
          <div class="separador"></div>
          <p class="texto-sm mb-0"><strong>Área/Máquina:</strong> ${escaparHtml(reg.areaMaquina)}</p>
          <p class="texto-sm mb-0"><strong>Superficie:</strong> ${escaparHtml(reg.superficie)}</p>
          <p class="texto-sm mb-0"><strong>Supervisor:</strong> ${escaparHtml(reg.supervisor)}</p>
          <p class="texto-sm mb-0"><strong>Límite:</strong> ${escaparHtml(reg.limite)}</p>
          <p class="texto-sm"><strong>Resultado:</strong> ${escaparHtml(reg.resultado)}</p>
        `
        )
        .join("");
    }

    for (const seccion of secciones) {
      const aspectosConRespuesta = seccion.aspectos.filter((a) => datosArea.respuestas?.[a.id]);
      if (aspectosConRespuesta.length === 0) continue;

      html += `<h3 class="seccion-titulo"><span>${escaparHtml(seccion.titulo)}</span></h3>`;

      for (const aspecto of aspectosConRespuesta) {
        const respuesta = datosArea.respuestas[aspecto.id];
        const vista =
          PRESENTACION_RESPUESTA[respuesta.valor] || {
            clase: "badge-neutro",
            icono: "",
            etiqueta: respuesta.valor,
          };
        const modificador =
          respuesta.valor === "no_cumple"
            ? "aspecto--incumple"
            : respuesta.valor === "na"
            ? "aspecto--na"
            : "aspecto--respondido";

        html += `
          <div class="aspecto ${modificador}">
            <p class="aspecto__texto" style="margin-bottom: var(--e2);">
              ${escaparHtml(aspecto.texto)}
            </p>
            <span class="badge ${vista.clase}">${vista.icono}${escaparHtml(vista.etiqueta)}</span>
            ${
              respuesta.observacion
                ? `<p class="texto-suave texto-sm" style="margin: var(--e2) 0 0;">${escaparHtml(
                    respuesta.observacion
                  )}</p>`
                : ""
            }
          </div>
        `;
      }
    }

    html += `</section>`;
  }

  detalleContenido.innerHTML = html;
}
