// =========================================================
// checklist.js
// Controlador de nueva-inspeccion.html: RECORRIDO por todos los
// procesos activos en una sola sesión.
//
// Cambiar de pestaña (proceso) es pura navegación local: NO escribe
// nada en Firestore. Todo lo respondido se acumula en memoria por
// proceso (estado.respuestasPorArea) mientras el inspector se mueve
// libremente entre pestañas. Todo el recorrido (todas las áreas) es
// UN SOLO documento en Firestore, con id determinístico (fecha +
// turno + inspector, ver idRecorrido() en firestore.js): "Guardar"
// escribe ese documento completo como "borrador"; "Terminar" lo
// escribe como "enviada" — nunca hay un documento por área.
//
// Al entrar a la pantalla se busca ese documento UNA sola vez por su
// id (sin consultas, sin preguntas al inspector) y, si existe, se
// restaura todo el avance en memoria antes de mostrar nada.
//
// Nota de modelo de datos: un mismo aspectoId (p. ej. "asp-010") se
// reutiliza entre procesos que comparten sección (Comportamiento del
// Personal se evalúa igual en Conversión, Corrugación, etc.). Por eso
// las respuestas NUNCA se guardan en un mapa global por aspectoId —
// se guardan por (áreaId → aspectoId), o la respuesta de un proceso
// se filtraría a todos los demás que comparten esos mismos aspectos.
// =========================================================

import { protegerPagina, cerrarSesion, esRolDeGestion, etiquetaRol } from "./auth.js";
import {
  obtenerVersionVigente,
  idRecorrido,
  obtenerRecorrido,
  guardarRecorrido,
  finalizarRecorrido,
} from "./firestore.js";
import { CHECKLIST_ID } from "./firebase-config.js";
import {
  fechaHoyISO,
  generarId,
  calcularResultado,
  filtrarEstructuraPorArea,
  iniciales,
  mostrarCarga,
  mostrarToast,
  escaparHtml,
  formatearFechaISOCorta,
} from "./utils.js";

/* ---------------------------------------------------------
   Referencias al DOM
   --------------------------------------------------------- */

const tituloRecorrido = document.getElementById("titulo-recorrido");
const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");

const perfilMenu = document.getElementById("perfil-menu");
const perfilMenuPanel = document.getElementById("perfil-menu-panel");
const perfilMenuNombre = document.getElementById("perfil-menu-nombre");

const recorridoContador = document.getElementById("recorrido-contador");
const recorridoVersion = document.getElementById("recorrido-version");
const recorridoFechaBtn = document.getElementById("recorrido-fecha-btn");
const recorridoFechaValor = document.getElementById("recorrido-fecha-valor");
const recorridoTurnoValor = document.getElementById("recorrido-turno-valor");
const recorridoAvance = document.getElementById("recorrido-avance");

const zonaCargando = document.getElementById("zona-cargando");

const modalTurno = document.getElementById("modal-turno");
const btnCerrarModalTurno = document.getElementById("btn-cerrar-modal-turno");

const modalCalendario = document.getElementById("modal-calendario");
const btnCerrarModalCalendario = document.getElementById("btn-cerrar-modal-calendario");
const calMesPrev = document.getElementById("cal-mes-prev");
const calMesNext = document.getElementById("cal-mes-next");
const btnCalHoy = document.getElementById("btn-cal-hoy");

const zonaRecorrido = document.getElementById("zona-recorrido");
const tabsFila = document.getElementById("tabs-recorrido-fila");
const tabsProgresoValor = document.getElementById("tabs-progreso-valor");

const contenidoRecorrido = document.getElementById("contenido-recorrido");
const procesoEtiqueta = document.getElementById("proceso-etiqueta");
const procesoNombre = document.getElementById("proceso-nombre");
const btnTerminar = document.getElementById("btn-terminar");

const seccionesContenedor = document.getElementById("secciones-contenedor");

const chkHisopado = document.getElementById("chk-hisopado");
const hisopadoContenedor = document.getElementById("hisopado-contenedor");
const btnAgregarHisopado = document.getElementById("btn-agregar-hisopado");
const plantillaHisopado = document.getElementById("plantilla-hisopado");

const campoComentarios = document.getElementById("campo-comentarios");
const statHallazgos = document.getElementById("stat-hallazgos");
const statCumplimiento = document.getElementById("stat-cumplimiento");
const btnGuardar = document.getElementById("btn-guardar");

const zonaResumen = document.getElementById("zona-resumen");
const resumenCumplimiento = document.getElementById("resumen-cumplimiento");
const resumenHallazgos = document.getElementById("resumen-hallazgos");
const resumenPorProceso = document.getElementById("resumen-por-proceso");
const seccionResumenHallazgos = document.getElementById("resumen-seccion-hallazgos");
const resumenHallazgosDetalle = document.getElementById("resumen-hallazgos-detalle");
const btnNuevoRecorrido = document.getElementById("btn-nuevo-recorrido");

/* ---------------------------------------------------------
   Estado del recorrido
   --------------------------------------------------------- */

const estado = {
  usuario: null,
  perfil: null,
  version: null, // { numero, areas, secciones, criterios }
  fecha: "",
  turno: "",

  recorridoId: null, // id determinístico (fecha_turno_uid) del documento único del recorrido
  existeRecorrido: false, // ¿ya había un documento guardado al cargar? (evita resetear iniciadaEn)

  areas: [], // [{ id, nombre, estructura, total }] — solo áreas con algo que evaluar
  indiceActual: -1,

  respuestasPorArea: {}, // areaId -> { aspectoId -> { valor, observacion } }
  datosPorArea: {}, // areaId -> { comentarios, hisopadoActivo, registros }

  sinGuardar: false, // hay algo respondido en cualquier área que aún no se escribió
  guardando: false,
  transicionando: false, // hay una animación de cambio de pestaña en curso
};

/* ---------------------------------------------------------
   Arranque
   --------------------------------------------------------- */

// Dos caminos de entrada, DISTINTOS a propósito:
// 1) Con "?fecha=&turno=" en la URL (clic en una tarjeta "Pendiente de
//    terminar" del historial): ese recorrido específico se carga directo,
//    sin selector. Es la acción explícita "seguir esto".
// 2) Sin parámetros (botón "+ Nueva inspección"): SIEMPRE muestra el
//    selector de fecha/turno, sin buscar nada pendiente. Es la acción
//    explícita "empezar algo nuevo" — no debe adivinar ni retomar nada.
const parametrosUrlIniciales = new URLSearchParams(window.location.search);
let datosContinuar = null;

if (parametrosUrlIniciales.get("fecha") && parametrosUrlIniciales.get("turno")) {
  datosContinuar = {
    fecha: parametrosUrlIniciales.get("fecha"),
    turno: parametrosUrlIniciales.get("turno"),
    area: parametrosUrlIniciales.get("area"),
  };
} else {
  // Respaldo: algunos servidores locales reescriben la URL (quitan
  // ".html") y en esa redirección se pierde el query string — el clic en
  // "Pendiente de terminar" (historial.js) guarda lo mismo en
  // localStorage justo antes de navegar, como último recurso. Se lee UNA
  // sola vez (por eso se borra de inmediato): si el usuario luego entra
  // de verdad sin parámetros, no debe reusar datos viejos.
  try {
    const guardado = localStorage.getItem("sigfo115_continuar_recorrido");
    if (guardado) {
      localStorage.removeItem("sigfo115_continuar_recorrido");
      const datos = JSON.parse(guardado);
      if (datos?.fecha && datos?.turno) {
        datosContinuar = { fecha: datos.fecha, turno: datos.turno, area: null };
      }
    }
  } catch {
    /* localStorage no disponible o dato corrupto: se cae al selector normal */
  }
}

/* ---------------------------------------------------------
   Puente con el sistema de Reportes (inspector.html)

   Un criterio marcado "No cumple" puede levantar un reporte formal con
   fotos. Ese formulario vive en el OTRO sistema (mismo sitio, carpeta
   raíz), así que salir de aquí descarta todo el recorrido en memoria: por
   eso se guarda antes de navegar y se deja el contexto en localStorage.

   Se usa localStorage y no solo el query string porque algunos servidores
   locales reescriben la URL y se comen los parámetros; ambas páginas están
   en el mismo origen, así que localStorage siempre llega.
   --------------------------------------------------------- */

const CLAVE_REPORTE_PENDIENTE = "sigfo115_reporte_pendiente";
const CLAVE_REPORTE_CREADO = "sigfo115_reporte_creado";
const URL_NUEVO_REPORTE = "/inspector.html";

/** Lee (y consume) el resumen del reporte que se acaba de crear, si lo hay. */
function leerReporteRecienCreado() {
  try {
    const crudo = localStorage.getItem(CLAVE_REPORTE_CREADO);
    if (!crudo) return null;
    localStorage.removeItem(CLAVE_REPORTE_CREADO); // se consume una sola vez
    const dato = JSON.parse(crudo);
    return dato?.areaId && dato?.aspectoId ? dato : null;
  } catch {
    return null;
  }
}

let reporteRecienCreado = leerReporteRecienCreado();

// Volver de crear un reporte es, para todos los efectos, "retomar este
// recorrido": se entra directo a la fecha/turno/proceso de donde se salió,
// sin volver a preguntar el turno.
if (reporteRecienCreado && !datosContinuar) {
  datosContinuar = {
    fecha: reporteRecienCreado.fecha,
    turno: reporteRecienCreado.turno,
    area: reporteRecienCreado.areaId,
  };
}

const continuaPendiente = Boolean(datosContinuar);

zonaCargando.classList.remove("oculto");
mostrarCarga(zonaCargando, "Cargando tu recorrido…");

protegerPagina({}, async ({ user, perfil }) => {
  estado.usuario = user;
  estado.perfil = perfil;

  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);
  perfilMenuNombre.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;

  if (!esRolDeGestion(perfil.rol)) {
    document
      .querySelectorAll('a[href="admin.html"]')
      .forEach((enlace) => enlace.classList.add("oculto"));
  }

  estado.fecha = fechaHoyISO();

  try {
    estado.version = await obtenerVersionVigente(CHECKLIST_ID);
    if (continuaPendiente) {
      await continuarRecorrido(datosContinuar);
    } else {
      estado.turno = "";
      await iniciarRecorrido();
    }
  } catch (error) {
    console.error("No se pudo cargar el checklist vigente:", error);
    zonaCargando.classList.add("oculto");
    mostrarToast(error.message || "No se pudo cargar el checklist.", "error");
  }
});

/* ---------------------------------------------------------
   Cambiar de turno ya con el recorrido en curso (por si el inspector se
   equivocó al elegirlo). El turno de la cabecera es un botón que abre un
   modal; elegir otro turno recarga el recorrido para esa fecha, mismo
   comportamiento silencioso que al reingresar (retoma su avance si ya
   existe, o arranca vacío si es la primera vez).
   --------------------------------------------------------- */

recorridoVersion.addEventListener("click", () => {
  modalTurno.classList.remove("oculto");
});

function cerrarModalTurno() {
  if (!estado.turno) {
    mostrarToast("Debes seleccionar un turno para comenzar.", "alerta");
    return;
  }
  modalTurno.classList.add("oculto");
}

btnCerrarModalTurno.addEventListener("click", cerrarModalTurno);
modalTurno.addEventListener("click", (evento) => {
  if (evento.target === modalTurno) cerrarModalTurno();
});

modalTurno.querySelectorAll("[data-turno-modal]").forEach((boton) => {
  boton.addEventListener("click", async () => {
    const nuevoTurno = boton.dataset.turnoModal;
    if (nuevoTurno === estado.turno) {
      cerrarModalTurno();
      return;
    }

    if (
      estado.sinGuardar &&
      !confirm("Tienes cambios sin guardar en este turno. Si cambias de turno se perderán. ¿Continuar?")
    ) {
      return;
    }

    estado.turno = nuevoTurno;
    cerrarModalTurno();
    await iniciarRecorrido();
  });
});

/* ---------------------------------------------------------
   Cambiar la fecha ya con el recorrido en curso (por si el inspector se
   equivocó al capturarla). El campo despliega el calendario nativo;
   elegir otra fecha recarga el recorrido para esa fecha+turno, mismo
   comportamiento que cambiar de turno (retoma su avance si ya existe, o
   arranca vacío si es la primera vez).
   --------------------------------------------------------- */

/* ---------------------------------------------------------
   Calendario Modal Personalizado
   --------------------------------------------------------- */

let fechaCalendarioActual = new Date();
let callbackSeleccionFecha = null;

function abrirModalCalendario(fechaInicial, alSeleccionar) {
  const partes = (fechaInicial || fechaHoyISO()).split("-");
  fechaCalendarioActual = new Date(Number(partes[0]), Number(partes[1]) - 1, 1);
  callbackSeleccionFecha = alSeleccionar;
  renderizarCalendarioModal(alSeleccionar);
  modalCalendario.classList.remove("oculto");
}

function cerrarModalCalendario() {
  modalCalendario.classList.add("oculto");
  callbackSeleccionFecha = null;
}

btnCerrarModalCalendario.addEventListener("click", cerrarModalCalendario);
modalCalendario.addEventListener("click", (evento) => {
  if (evento.target === modalCalendario) cerrarModalCalendario();
});

calMesPrev.addEventListener("click", () => {
  fechaCalendarioActual.setMonth(fechaCalendarioActual.getMonth() - 1);
  renderizarCalendarioModal(callbackSeleccionFecha);
});

calMesNext.addEventListener("click", () => {
  fechaCalendarioActual.setMonth(fechaCalendarioActual.getMonth() + 1);
  renderizarCalendarioModal(callbackSeleccionFecha);
});

btnCalHoy.addEventListener("click", () => {
  const hoy = new Date();
  fechaCalendarioActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const hoyISO = fechaHoyISO();
  if (callbackSeleccionFecha) {
    callbackSeleccionFecha(hoyISO);
    cerrarModalCalendario();
  }
});

function renderizarCalendarioModal(alSeleccionar) {
  const contenedorDias = document.getElementById("calendario-dias");
  const tituloMesAnio = document.getElementById("cal-mes-anio");
  
  contenedorDias.innerHTML = "";
  
  const anio = fechaCalendarioActual.getFullYear();
  const mes = fechaCalendarioActual.getMonth();
  
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  tituloMesAnio.textContent = `${meses[mes]} ${anio}`;
  
  const primerDia = new Date(anio, mes, 1);
  const diaSemanaPrimerDia = primerDia.getDay(); // 0 = Sunday
  
  const totalDiasMes = new Date(anio, mes + 1, 0).getDate();
  const totalDiasMesPrev = new Date(anio, mes, 0).getDate();
  
  const hoyISO = fechaHoyISO();
  const [hoyAnio, hoyMes, hoyDia] = hoyISO.split("-").map(Number);
  
  // Padding del mes anterior
  for (let i = diaSemanaPrimerDia - 1; i >= 0; i--) {
    const diaPrev = totalDiasMesPrev - i;
    const botonDia = document.createElement("button");
    botonDia.type = "button";
    botonDia.className = "cal-dia fuera-mes";
    botonDia.disabled = true;
    botonDia.textContent = diaPrev;
    contenedorDias.appendChild(botonDia);
  }
  
  // Días del mes
  for (let dia = 1; dia <= totalDiasMes; dia++) {
    const botonDia = document.createElement("button");
    botonDia.type = "button";
    botonDia.className = "cal-dia";
    
    const mesFormateado = String(mes + 1).padStart(2, "0");
    const diaFormateado = String(dia).padStart(2, "0");
    const fechaISO = `${anio}-${mesFormateado}-${diaFormateado}`;
    
    if (fechaISO === estado.fecha) {
      botonDia.classList.add("seleccionado");
    }
    
    if (anio === hoyAnio && mes === (hoyMes - 1) && dia === hoyDia) {
      botonDia.classList.add("hoy");
    }
    
    if (fechaISO > hoyISO) {
      botonDia.disabled = true;
    } else {
      botonDia.addEventListener("click", () => {
        alSeleccionar(fechaISO);
        cerrarModalCalendario();
      });
    }
    
    botonDia.textContent = dia;
    contenedorDias.appendChild(botonDia);
  }
  
  // Padding del mes siguiente
  const celdasTotales = contenedorDias.children.length;
  const celdasRestantes = (7 - (celdasTotales % 7)) % 7;
  for (let i = 1; i <= celdasRestantes; i++) {
    const botonDia = document.createElement("button");
    botonDia.type = "button";
    botonDia.className = "cal-dia fuera-mes";
    botonDia.disabled = true;
    botonDia.textContent = i;
    contenedorDias.appendChild(botonDia);
  }
}

/* ---------------------------------------------------------
   Eventos de los Botones de Apertura de Calendario
   --------------------------------------------------------- */

recorridoFechaBtn.addEventListener("click", () => {
  abrirModalCalendario(estado.fecha, async (nuevaFecha) => {
    if (!nuevaFecha || nuevaFecha === estado.fecha) return;

    if (
      estado.sinGuardar &&
      !confirm("Tienes cambios sin guardar en esta fecha. Si la cambias se perderán. ¿Continuar?")
    ) {
      return;
    }

    estado.fecha = nuevaFecha;
    recorridoFechaValor.textContent = formatearFechaISOCorta(nuevaFecha);
    await iniciarRecorrido();
  });
});

/**
 * Se llegó desde la tarjeta "Pendiente de terminar" del historial, con
 * fecha/turno ya conocidos (por URL, o por el respaldo en localStorage si
 * el servidor se los comió en una redirección — ver más arriba): se
 * rellenan esos campos y se arranca el recorrido directo en esa pestaña —
 * el turno no se vuelve a preguntar, y todo el avance guardado se carga
 * solo (ver iniciarRecorrido), sin ningún diálogo de confirmación.
 */
async function continuarRecorrido({ fecha, turno, area }) {
  estado.fecha = fecha;
  estado.turno = turno;
  await iniciarRecorrido(area);
}

btnSalir.addEventListener("click", () => cerrarSesion());

/* ---------------------------------------------------------
   Menú de perfil: el avatar es el disparador; "Salir" vive adentro.
   --------------------------------------------------------- */

avatarUsuario.addEventListener("click", (evento) => {
  evento.stopPropagation();
  const abierto = !perfilMenuPanel.classList.toggle("oculto");
  avatarUsuario.setAttribute("aria-expanded", String(abierto));
});

document.addEventListener("click", (evento) => {
  if (!perfilMenu.contains(evento.target)) {
    perfilMenuPanel.classList.add("oculto");
    avatarUsuario.setAttribute("aria-expanded", "false");
  }
});

// Aviso del propio navegador si se cierra la pestaña con progreso sin guardar.
window.addEventListener("beforeunload", (evento) => {
  if (!estado.sinGuardar) return;
  evento.preventDefault();
  evento.returnValue = "";
});



/**
 * Arma la lista de procesos del recorrido: todas las áreas activas que
 * tengan al menos un aspecto aplicable (una sección sin aspectos
 * asignados no genera una pestaña vacía). Luego busca el documento del
 * recorrido por su id determinístico (fecha+turno+inspector) UNA sola
 * vez: si ya existe, restaura todo el avance guardado en memoria antes
 * de mostrar nada — sin preguntas ni diálogos de confirmación.
 *
 * @param {string|null} areaIdDestino - si se llegó a retomar un recorrido
 *   específico (ver continuarRecorrido), arranca directo en esa
 *   pestaña en vez de la primera.
 */
async function iniciarRecorrido(areaIdDestino = null) {
  if (!estado.fecha || !estado.turno || !estado.version) {
    zonaCargando.classList.add("oculto");
    if (!estado.turno && estado.version && estado.fecha) {
      modalTurno.classList.remove("oculto");
    }
    return;
  }

  const activas = (estado.version.areas || [])
    .filter((a) => a.activa !== false)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  const evaluables = activas.map((a) => {
    const estructura = filtrarEstructuraPorArea(estado.version.secciones, a.id);
    const total = estructura.reduce((n, s) => n + s.aspectos.length, 0);
    return { id: a.id, nombre: a.nombre, estructura, total };
  });

  estado.areas = evaluables.filter((a) => a.total > 0);

  // Un proceso configurado al que todavía no se le asignó ninguna sección
  // no genera una pestaña vacía, pero sí se avisa: si no, parecería que la
  // configuración no se guardó.
  const sinAspectos = evaluables.filter((a) => a.total === 0);
  if (sinAspectos.length && estado.areas.length) {
    mostrarToast(
      `Sin aspectos asignados todavía: ${sinAspectos.map((a) => a.nombre).join(", ")}.`,
      "alerta"
    );
  }

  if (estado.areas.length === 0) {
    zonaCargando.classList.add("oculto");
    mostrarToast("El checklist no tiene aspectos aplicables a ninguna área activa.",
      "error"
    );
    return;
  }

  estado.recorridoId = idRecorrido(estado.fecha, estado.turno, estado.usuario.uid);
  estado.respuestasPorArea = {};
  estado.datosPorArea = {};
  estado.existeRecorrido = false;
  estado.sinGuardar = false;

  let recorrido = null;
  try {
    recorrido = await obtenerRecorrido(estado.recorridoId);
  } catch (error) {
    console.error("No se pudo revisar si había un recorrido guardado:", error);
    mostrarToast("No se pudo revisar el avance guardado. Verifica tu conexión.", "error");
  }

  if (recorrido) {
    if (recorrido.estado === "enviada") {
      // Ya se envió como reporte final: no se puede volver a editar, se
      // manda a verlo (solo lectura) al detalle del historial.
      window.location.href = `inspecciones.html?ver=${estado.recorridoId}`;
      return;
    }

    estado.existeRecorrido = true;
    for (const area of estado.areas) {
      const datosArea = recorrido.areas?.[area.id];
      if (!datosArea) continue;
      estado.respuestasPorArea[area.id] = { ...(datosArea.respuestas || {}) };
      estado.datosPorArea[area.id] = {
        comentarios: datosArea.comentarios || "",
        hisopadoActivo: Boolean(datosArea.hisopado?.registros?.length),
        registros: datosArea.hisopado?.registros ? [...datosArea.hisopado.registros] : [],
      };
    }
    mostrarToast("Continuando tu recorrido donde lo dejaste.", "info");
  }

  // Se adjunta ANTES de renderizar para que el aspecto ya aparezca con su
  // historial de reportes en el primer pintado (nada parpadea ni se
  // reordena después).
  const seAdjuntoReporte = reporteRecienCreado
    ? adjuntarReporteAlAspecto(reporteRecienCreado)
    : false;

  const indiceInicial = areaIdDestino
    ? Math.max(0, estado.areas.findIndex((a) => a.id === areaIdDestino))
    : 0;
  estado.indiceActual = indiceInicial;

  tituloRecorrido.textContent = "Recorrido de inspección";
  recorridoFechaValor.textContent = formatearFechaISOCorta(estado.fecha);
  recorridoTurnoValor.textContent = estado.turno;
  recorridoContador.classList.remove("oculto");
  renderPestanas();
  zonaCargando.classList.add("oculto");
  zonaResumen.classList.add("oculto");
  zonaRecorrido.classList.remove("oculto");

  await cargarArea(indiceInicial);

  if (seAdjuntoReporte) {
    const aspectoId = reporteRecienCreado.aspectoId;
    reporteRecienCreado = null;
    // Se persiste de una vez: el resumen es la constancia de que el
    // hallazgo ya se reportó, no debe depender de que el inspector se
    // acuerde de pulsar "Guardar".
    try {
      await guardarTodoElAvance();
      mostrarToast("Reporte agregado al hallazgo.", "exito");
    } catch (error) {
      console.error("No se pudo guardar el resumen del reporte:", error);
      mostrarToast("El reporte se creó, pero no se pudo guardar aquí. Pulsa Guardar.", "alerta");
    }
    desplazarAAspecto(aspectoId);
  } else {
    reporteRecienCreado = null;
  }
}

/**
 * Engancha el resumen de un reporte recién creado al aspecto que lo
 * originó. Devuelve false (sin tocar nada) si el resumen no corresponde a
 * este recorrido — p. ej. si el inspector cambió de fecha o turno mientras
 * llenaba el reporte en la otra pestaña.
 */
function adjuntarReporteAlAspecto(dato) {
  if (dato.fecha !== estado.fecha || String(dato.turno) !== String(estado.turno)) return false;
  if (!estado.areas.some((a) => a.id === dato.areaId)) return false;

  const respuestas = respuestasDe(dato.areaId);
  // Si el aspecto aún no tenía respuesta (raro, pero posible si el
  // recorrido no se alcanzó a guardar), se asume "no cumple": es la única
  // calificación desde la que se puede levantar un reporte.
  const respuesta = respuestas[dato.aspectoId] || { valor: "no_cumple", observacion: "" };
  const reportes = respuesta.reportes || [];

  // Idempotente: volver atrás en el navegador no debe duplicar el resumen.
  if (reportes.some((r) => r.reporteId === dato.reporteId)) return false;

  reportes.push({
    reporteId: dato.reporteId,
    descripcion: dato.resumen?.descripcion || "",
    categoria: dato.resumen?.categoria || "",
    zona: dato.resumen?.zona || "",
    fechaHora: dato.resumen?.fechaHora || "",
  });
  respuesta.reportes = reportes;
  respuestas[dato.aspectoId] = respuesta;
  estado.sinGuardar = true;
  return true;
}

/** Lleva la vista al aspecto indicado y lo resalta un momento. */
function desplazarAAspecto(aspectoId) {
  const fila = seccionesContenedor.querySelector(`.aspecto[data-aspecto-id="${aspectoId}"]`);
  if (!fila) return;
  fila.scrollIntoView({ behavior: "smooth", block: "center" });
  fila.style.transition = "box-shadow 300ms ease";
  fila.style.boxShadow = "0 0 0 3px var(--estado-critico-mark)";
  setTimeout(() => { fila.style.boxShadow = ""; }, 2400);
}

/* ---------------------------------------------------------
   Datos por proceso (en memoria, independientes entre pestañas)
   --------------------------------------------------------- */

/** Mapa de respuestas del área indicada, creándolo vacío la primera vez. */
function respuestasDe(areaId) {
  if (!estado.respuestasPorArea[areaId]) estado.respuestasPorArea[areaId] = {};
  return estado.respuestasPorArea[areaId];
}

/** Comentarios/hisopado del área indicada, creándolos vacíos la primera vez. */
function datosDe(areaId) {
  if (!estado.datosPorArea[areaId]) {
    estado.datosPorArea[areaId] = { comentarios: "", hisopadoActivo: false, registros: [] };
  }
  return estado.datosPorArea[areaId];
}

function tieneAlgunaRespuesta(area) {
  return Object.values(respuestasDe(area.id)).some((r) => r?.valor);
}

function esProcesoCompleto(area) {
  const respuestas = respuestasDe(area.id);
  return area.estructura.every((s) => s.aspectos.every((a) => respuestas[a.id]?.valor));
}

/* ---------------------------------------------------------
   Pestañas de proceso
   --------------------------------------------------------- */

function renderPestanas() {
  tabsFila.innerHTML = "";
  estado.areas.forEach((area, indice) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "tabs-recorrido__item";
    boton.textContent = area.id;
    boton.setAttribute("role", "tab");
    boton.title = area.nombre;
    boton.addEventListener("click", () => cambiarAProceso(indice));
    tabsFila.appendChild(boton);
  });
  actualizarPestanas();
}

function actualizarPestanas() {
  [...tabsFila.children].forEach((boton, indice) => {
    const area = estado.areas[indice];
    const activa = indice === estado.indiceActual;
    boton.classList.toggle("activa", activa);
    boton.classList.toggle("completa", esProcesoCompleto(area));
    boton.setAttribute("aria-selected", String(activa));
  });
}

/**
 * Cambia de pestaña. Es solo navegación: lo respondido en cada proceso
 * queda en memoria (estado.respuestasPorArea) sin escribir nada en
 * Firestore, así que no hace falta confirmar ni se pierde nada.
 */
async function cambiarAProceso(indice) {
  if (indice === estado.indiceActual || indice < 0 || indice >= estado.areas.length) return;
  if (estado.transicionando) return; // evita solapar animaciones con clics rápidos

  const direccion = indice > estado.indiceActual ? 1 : -1;
  estado.transicionando = true;
  try {
    await cargarArea(indice, direccion);
  } finally {
    estado.transicionando = false;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------------------------------------------------------
   Carga del proceso activo
   --------------------------------------------------------- */

/**
 * @param {number} indice
 * @param {number} [direccion=0] - 1 si se avanza (la pestaña nueva está a
 *   la derecha de la anterior), -1 si se retrocede, 0 para no animar (la
 *   primera carga del recorrido, o al llegar por un enlace de "Continuar").
 */
async function cargarArea(indice, direccion = 0) {
  if (direccion !== 0) {
    await animarSalida(direccion);
  }

  estado.indiceActual = indice;
  const area = estado.areas[indice];

  procesoEtiqueta.textContent = `PROCESO ${area.id}`;
  procesoNombre.textContent = area.nombre;

  respuestasDe(area.id);
  datosDe(area.id);

  renderSecciones(area);
  sincronizarRespuestasEnDOM(area);
  restaurarDatosArea(area);

  actualizarProgreso();

  if (direccion !== 0) {
    animarEntrada(direccion);
  }
}

/** Distancia del deslizamiento, en px. Sutil a propósito: es un acompañamiento, no el protagonista. */
const DISTANCIA_TRANSICION = 18;

/** Funde y desliza hacia afuera el contenido del proceso actual, antes de reemplazarlo. */
function animarSalida(direccion) {
  return new Promise((resolve) => {
    contenidoRecorrido.style.transitionDuration = ""; // toma la de styles.css (180ms)
    contenidoRecorrido.style.opacity = "0";
    contenidoRecorrido.style.transform =
      `translateX(${direccion > 0 ? -DISTANCIA_TRANSICION : DISTANCIA_TRANSICION}px)`;

    let resuelto = false;
    const terminar = () => {
      if (resuelto) return;
      resuelto = true;
      contenidoRecorrido.removeEventListener("transitionend", terminar);
      resolve();
    };
    contenidoRecorrido.addEventListener("transitionend", terminar);
    // Salvaguarda: si "transitionend" no llega a disparar por algún motivo,
    // el flujo no debe quedarse esperando para siempre.
    setTimeout(terminar, 260);
  });
}

/** Trae de vuelta el contenido ya reconstruido, entrando desde el lado opuesto al que salió. */
function animarEntrada(direccion) {
  // Se "teletransporta" al lado opuesto SIN transición (duración 0)...
  contenidoRecorrido.style.transitionDuration = "0ms";
  contenidoRecorrido.style.transform =
    `translateX(${direccion > 0 ? DISTANCIA_TRANSICION : -DISTANCIA_TRANSICION}px)`;
  contenidoRecorrido.style.opacity = "0";

  // ...y dos frames después (uno para que el navegador registre la
  // posición de partida, otro para el cambio de duración) se anima de
  // regreso a su lugar con la transición normal.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      contenidoRecorrido.style.transitionDuration = "";
      contenidoRecorrido.style.transform = "translateX(0)";
      contenidoRecorrido.style.opacity = "1";
    });
  });
}

/** Refleja en los botones ya construidos las respuestas guardadas en memoria. */
function sincronizarRespuestasEnDOM(area) {
  const respuestas = respuestasDe(area.id);
  seccionesContenedor.querySelectorAll(".aspecto").forEach((fila) => {
    const respuesta = respuestas[fila.dataset.aspectoId];
    renderizarReportesDeAspecto(fila, respuesta);
    if (!respuesta?.valor) return;

    fila.querySelectorAll(".calificacion__opcion").forEach((opcion) => {
      const activa = opcion.dataset.valor === respuesta.valor;
      opcion.classList.toggle("seleccionado", activa);
      opcion.setAttribute("aria-checked", String(activa));
    });

    fila.classList.remove("aspecto--respondido", "aspecto--incumple", "aspecto--na");
    fila.classList.add(
      respuesta.valor === "no_cumple"
        ? "aspecto--incumple"
        : respuesta.valor === "na"
        ? "aspecto--na"
        : "aspecto--respondido"
    );

    if (respuesta.valor === "no_cumple") {
      fila.querySelector(".aspecto__observacion").classList.remove("oculto");
      fila.querySelector("textarea").value = respuesta.observacion || "";
    }
  });
}

/** Restaura comentarios e hisopado del proceso activo en los campos del formulario. */
function restaurarDatosArea(area) {
  const datos = datosDe(area.id);

  campoComentarios.value = datos.comentarios || "";
  chkHisopado.checked = datos.hisopadoActivo;
  hisopadoContenedor.innerHTML = "";
  hisopadoContenedor.classList.toggle("oculto", !datos.hisopadoActivo);
  btnAgregarHisopado.classList.toggle("oculto", !datos.hisopadoActivo);

  for (const registro of datos.registros) {
    hisopadoContenedor.appendChild(crearNodoHisopado(registro, area.id));
  }
}

/* ---------------------------------------------------------
   Render del checklist del proceso activo
   --------------------------------------------------------- */

function renderSecciones(area) {
  seccionesContenedor.innerHTML = "";
  const criterios = estado.version.criterios || [];
  const secciones = [...area.estructura].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  for (const seccion of secciones) {
    const aspectosVisibles = [...seccion.aspectos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

    // Cada sección vive en su propio bloque: así su encabezado se queda
    // fijo arriba mientras dure la sección y el de la siguiente lo empuja
    // fuera al llegar (position: sticky se ancla al contenedor padre).
    const bloque = document.createElement("section");
    bloque.className = "bloque-seccion";
    bloque.dataset.seccionId = seccion.id;

    const tituloSeccion = document.createElement("h2");
    tituloSeccion.className = "seccion-titulo";
    tituloSeccion.innerHTML = `
      <span>${escaparHtml(seccion.titulo)}</span>
      <span class="seccion-conteo" data-conteo-de="${seccion.id}">0/${aspectosVisibles.length}</span>
    `;
    bloque.appendChild(tituloSeccion);

    for (const aspecto of aspectosVisibles) {
      bloque.appendChild(crearFilaAspecto(aspecto, criterios, seccion, area));
    }

    seccionesContenedor.appendChild(bloque);
  }

  ajustarTopePegajoso();
}

/**
 * Calcula dónde deben quedarse fijos los encabezados de sección, a partir
 * de la altura real de la cabecera y de la fila de pestañas. Se hace por
 * medición y no con valores fijos, porque ambas cambian de alto entre
 * móvil y escritorio.
 */
function ajustarTopePegajoso() {
  const cabecera = document.querySelector(".app-header");
  const tabs = document.querySelector(".tabs-recorrido");
  const altoCabecera = cabecera ? Math.round(cabecera.offsetHeight) : 0;
  const altoTabs = tabs && !tabs.closest(".oculto") ? Math.round(tabs.offsetHeight) : 0;

  const raiz = document.documentElement.style;
  raiz.setProperty("--alto-cabecera", `${altoCabecera}px`);
  raiz.setProperty("--tope-seccion", `${altoCabecera + altoTabs + 8}px`);
}

if (typeof ResizeObserver !== "undefined") {
  const observador = new ResizeObserver(() => ajustarTopePegajoso());
  const cabecera = document.querySelector(".app-header");
  const tabs = document.querySelector(".tabs-recorrido");
  if (cabecera) observador.observe(cabecera);
  if (tabs) observador.observe(tabs);
}

window.addEventListener("resize", ajustarTopePegajoso);

/**
 * Crea la tarjeta de un aspecto. `areaId` queda cerrado en los manejadores
 * de clic: cada proceso construye su propio DOM al cargarse, así que la
 * respuesta siempre se escribe en el mapa del proceso correcto, aunque el
 * mismo aspectoId exista también en otros procesos.
 */
function crearFilaAspecto(aspecto, criterios, seccion, area) {
  const seccionId = seccion.id;
  const areaId = area.id;
  const fila = document.createElement("article");
  fila.className = "aspecto";
  fila.dataset.aspectoId = aspecto.id;
  fila.dataset.seccionId = seccionId;

  const tienePeso = typeof aspecto.peso === "number" && aspecto.peso !== 1;
  const grupo = `cal-${aspecto.id}`;

  fila.innerHTML = `
    <p class="aspecto__texto" id="txt-${aspecto.id}">
      ${escaparHtml(aspecto.texto)}
      ${tienePeso ? `<span class="aspecto__peso">Peso ${aspecto.peso}</span>` : ""}
    </p>
    <div class="calificacion" role="radiogroup" aria-labelledby="txt-${aspecto.id}">
      ${criterios
        .map(
          (c) => `
        <button type="button" class="calificacion__opcion ${c.valor}"
                data-valor="${c.valor}" role="radio" aria-checked="false" name="${grupo}">
          <span class="simbolo" aria-hidden="true">${escaparHtml(c.simbolo)}</span>
          <span>${escaparHtml(c.etiqueta)}</span>
        </button>`
        )
        .join("")}
    </div>
    <div class="aspecto__observacion oculto">
      <label class="solo-lectores" for="obs-${aspecto.id}">Observaciones del hallazgo</label>
      <textarea id="obs-${aspecto.id}"
                placeholder="Describe el hallazgo (opcional)"></textarea>
      <div data-reportes></div>
      <button type="button" class="btn btn-secundario btn-sm" data-agregar-reporte
              style="margin-top: var(--e2);">+ Agregar reporte</button>
    </div>
  `;

  const opciones = fila.querySelectorAll(".calificacion__opcion");
  const bloqueObs = fila.querySelector(".aspecto__observacion");
  const textarea = fila.querySelector("textarea");

  fila
    .querySelector("[data-agregar-reporte]")
    .addEventListener("click", () => abrirNuevoReporte(area, seccion, aspecto));

  opciones.forEach((opcion) => {
    opcion.addEventListener("click", () => {
      const valor = opcion.dataset.valor;
      const respuestas = respuestasDe(areaId);

      opciones.forEach((o) => {
        const activa = o === opcion;
        o.classList.toggle("seleccionado", activa);
        o.setAttribute("aria-checked", String(activa));
      });

      // Los reportes ya levantados NO se pierden al recalificar: son la
      // constancia de algo que ya quedó registrado en el otro sistema (con
      // fotos y todo), no un borrador de esta pantalla.
      const reportesPrevios = respuestas[aspecto.id]?.reportes;
      respuestas[aspecto.id] = {
        valor,
        observacion: (respuestas[aspecto.id]?.observacion || "").trim(),
      };
      if (reportesPrevios?.length) respuestas[aspecto.id].reportes = reportesPrevios;
      estado.sinGuardar = true;

      // El borde lateral refleja el estado del aspecto.
      fila.classList.remove("aspecto--respondido", "aspecto--incumple", "aspecto--na");
      fila.classList.add(
        valor === "no_cumple"
          ? "aspecto--incumple"
          : valor === "na"
          ? "aspecto--na"
          : "aspecto--respondido"
      );

      // El campo de observaciones solo se despliega al marcar "No Cumple",
      // y aun así es opcional.
      const mostrar = valor === "no_cumple";
      bloqueObs.classList.toggle("oculto", !mostrar);
      renderizarReportesDeAspecto(fila, respuestas[aspecto.id]);
      if (mostrar) {
        textarea.focus({ preventScroll: true });
      } else if (textarea.value) {
        textarea.value = "";
        respuestas[aspecto.id].observacion = "";
      }

      actualizarProgreso();
    });
  });

  textarea.addEventListener("input", () => {
    const respuestas = respuestasDe(areaId);
    if (!respuestas[aspecto.id]) {
      respuestas[aspecto.id] = { valor: "", observacion: "" };
    }
    respuestas[aspecto.id].observacion = textarea.value;
    estado.sinGuardar = true;
  });

  return fila;
}

/**
 * Pinta bajo el aspecto el historial de reportes ya levantados por ese
 * hallazgo: solo texto (qué se encontró, categoría, zona y cuándo), nunca
 * las fotos — esas viven en el reporte del otro sistema y aquí basta la
 * constancia de que el hallazgo se reportó.
 */
function renderizarReportesDeAspecto(fila, respuesta) {
  const contenedor = fila.querySelector("[data-reportes]");
  if (!contenedor) return;

  const reportes = respuesta?.reportes || [];
  if (reportes.length === 0) {
    contenedor.innerHTML = "";
    return;
  }

  contenedor.innerHTML = `
    <p class="texto-xs texto-suave" style="font-weight:700; margin:var(--e3) 0 var(--e1);">
      Reportes levantados (${reportes.length})
    </p>
    ${reportes
      .map(
        (r) => `
      <div style="border-left:3px solid var(--estado-critico-mark); padding:var(--e1) var(--e2); margin-bottom:var(--e1);">
        <p class="texto-sm mb-0" style="font-weight:600;">${escaparHtml(r.descripcion || "Sin descripción")}</p>
        <p class="texto-xs texto-suave mb-0">${escaparHtml(detalleReporte(r))}</p>
      </div>`
      )
      .join("")}
  `;
}

/** Línea secundaria del resumen: categoría · zona · fecha y hora. */
function detalleReporte(reporte) {
  const partes = [];
  if (reporte.categoria) partes.push(reporte.categoria);
  if (reporte.zona) partes.push(reporte.zona);
  if (reporte.fechaHora && reporte.fechaHora.includes("T")) {
    const [fecha, hora] = reporte.fechaHora.split("T");
    partes.push(`${formatearFechaISOCorta(fecha)} ${hora}`);
  }
  return partes.join(" · ") || "Reporte registrado";
}

/**
 * Levanta un reporte formal (con fotos) por este hallazgo, en el sistema de
 * Reportes. Antes de salir guarda TODO el recorrido: esta pantalla vive en
 * memoria y navegar fuera la descartaría por completo.
 */
async function abrirNuevoReporte(area, seccion, aspecto) {
  const respuestas = respuestasDe(area.id);
  if (respuestas[aspecto.id]?.valor !== "no_cumple") {
    mostrarToast('Marca el aspecto como "No Cumple" antes de levantar un reporte.', "alerta");
    return;
  }

  try {
    await guardarTodoElAvance();
  } catch (error) {
    console.error("No se pudo guardar el recorrido antes de crear el reporte:", error);
    mostrarToast("No se pudo guardar tu avance. Revisa tu conexión antes de continuar.", "error");
    return;
  }

  const observacion = (respuestas[aspecto.id].observacion || "").trim();
  const descripcion = observacion ? `${aspecto.texto} — ${observacion}` : aspecto.texto;

  const contexto = {
    fecha: estado.fecha,
    turno: estado.turno,
    areaId: area.id,
    areaNombre: area.nombre,
    aspectoId: aspecto.id,
    proceso: area.nombre,
    categoria: seccion.titulo,
    descripcion,
    volver: `/hub/sig-fo-115/index.html?fecha=${estado.fecha}&turno=${estado.turno}&area=${encodeURIComponent(area.id)}`,
    creadoEn: Date.now(),
  };

  try {
    localStorage.setItem(CLAVE_REPORTE_PENDIENTE, JSON.stringify(contexto));
  } catch {
    /* Sin localStorage queda el query string, que basta para la precarga. */
  }

  const params = new URLSearchParams({
    turno: estado.turno,
    fecha: estado.fecha,
    proceso: area.nombre,
    categoria: seccion.titulo,
    descripcion,
  });
  window.location.href = `${URL_NUEVO_REPORTE}?${params.toString()}`;
}

/**
 * Actualiza el avance visible: conteo por sección del proceso activo,
 * hallazgos/cumplimiento acumulados de TODO el recorrido en el pie,
 * el contador de la cabecera y el estado de las pestañas.
 */
function actualizarProgreso() {
  const area = estado.areas[estado.indiceActual];
  const respuestas = respuestasDe(area.id);

  const porSeccion = {};
  seccionesContenedor.querySelectorAll(".aspecto").forEach((fila) => {
    const id = fila.dataset.seccionId;
    porSeccion[id] = porSeccion[id] || { total: 0, hechos: 0 };
    porSeccion[id].total += 1;
    if (respuestas[fila.dataset.aspectoId]?.valor) porSeccion[id].hechos += 1;
  });
  for (const [id, conteo] of Object.entries(porSeccion)) {
    const nodo = seccionesContenedor.querySelector(`[data-conteo-de="${id}"]`);
    if (nodo) nodo.textContent = `${conteo.hechos}/${conteo.total}`;
  }

  actualizarPieYContadorGlobal();
  actualizarPestanas();
}

/**
 * Hallazgos y % de cumplimiento de TODO el recorrido acumulado hasta
 * ahora (no solo del proceso visible), calculados proceso por proceso
 * (cada uno con su propio mapa de respuestas) y sumados — así un mismo
 * aspectoId compartido entre procesos nunca se cuenta cruzado.
 */
function calcularResultadoGlobal() {
  let cumple = 0;
  let noCumple = 0;
  for (const area of estado.areas) {
    const r = calcularResultado(respuestasDe(area.id), area.estructura, estado.version.criterios);
    cumple += r.cumple;
    noCumple += r.noCumple;
  }
  const denominador = cumple + noCumple;
  const porcentaje = denominador > 0 ? Math.round((cumple / denominador) * 1000) / 10 : 0;
  return { cumple, noCumple, denominador, porcentajeCumplimiento: porcentaje };
}

function actualizarPieYContadorGlobal() {
  const g = calcularResultadoGlobal();
  statHallazgos.textContent = String(g.noCumple);
  statCumplimiento.textContent = g.denominador === 0 ? "—" : `${g.porcentajeCumplimiento}%`;

  const totalGlobal = estado.areas.reduce((n, a) => n + a.total, 0);
  const respondidosGlobal = estado.areas.reduce(
    (n, a) => n + Object.values(respuestasDe(a.id)).filter((r) => r?.valor).length,
    0
  );
  recorridoAvance.textContent = `${respondidosGlobal}/${totalGlobal}`;

  const completos = estado.areas.filter(esProcesoCompleto).length;
  const porcentajeProcesos = estado.areas.length
    ? Math.round((completos / estado.areas.length) * 100)
    : 0;
  tabsProgresoValor.style.width = `${porcentajeProcesos}%`;
}

/* ---------------------------------------------------------
   Hisopado (sección eventual, por proceso)
   --------------------------------------------------------- */

chkHisopado.addEventListener("change", () => {
  const area = estado.areas[estado.indiceActual];
  const datos = datosDe(area.id);
  const activo = chkHisopado.checked;

  datos.hisopadoActivo = activo;
  hisopadoContenedor.classList.toggle("oculto", !activo);
  btnAgregarHisopado.classList.toggle("oculto", !activo);
  estado.sinGuardar = true;

  if (activo && datos.registros.length === 0) {
    agregarRegistroHisopado();
  }
  if (!activo) {
    datos.registros = [];
    hisopadoContenedor.innerHTML = "";
  }
});

btnAgregarHisopado.addEventListener("click", () => agregarRegistroHisopado());

/** Agrega un registro de hisopado nuevo y vacío al proceso activo. */
function agregarRegistroHisopado() {
  const area = estado.areas[estado.indiceActual];
  const datos = datosDe(area.id);
  const registro = {
    id: generarId("hiso"),
    areaMaquina: "",
    superficie: "",
    supervisor: "",
    limite: "",
    resultado: "",
  };
  datos.registros.push(registro);
  hisopadoContenedor.appendChild(crearNodoHisopado(registro, area.id));
  estado.sinGuardar = true;
}

/** Construye el DOM de un registro de hisopado ya existente (nuevo o restaurado). */
function crearNodoHisopado(registro, areaId) {
  const nodo = plantillaHisopado.content.firstElementChild.cloneNode(true);
  nodo.dataset.registroId = registro.id;

  nodo.querySelectorAll("[data-campo]").forEach((input) => {
    input.id = `${registro.id}-${input.dataset.campo}`;
    input.previousElementSibling?.setAttribute("for", input.id);
    input.value = registro[input.dataset.campo] || "";

    input.addEventListener("input", () => {
      const reg = datosDe(areaId).registros.find((r) => r.id === registro.id);
      if (reg) reg[input.dataset.campo] = input.value;
      estado.sinGuardar = true;
    });
  });

  nodo.querySelector(".btn-eliminar-hisopado").addEventListener("click", () => {
    const datos = datosDe(areaId);
    datos.registros = datos.registros.filter((r) => r.id !== registro.id);
    estado.sinGuardar = true;
    nodo.remove();
  });

  return nodo;
}

campoComentarios.addEventListener("input", () => {
  const area = estado.areas[estado.indiceActual];
  datosDe(area.id).comentarios = campoComentarios.value;
  estado.sinGuardar = true;
});

/* ---------------------------------------------------------
   Guardar (única escritura a Firestore) y resumen
   --------------------------------------------------------- */

/**
 * Arma el documento completo del recorrido: un mapa con TODAS las áreas
 * (cada una con sus respuestas, comentarios, hisopado y resultado propio)
 * más un resultado global agregado. Es el único documento que se escribe
 * a Firestore, tanto al "Guardar" (borrador) como al "Terminar" (enviada).
 */
function construirDatosRecorrido() {
  const areas = {};
  let cumpleGlobal = 0;
  let noCumpleGlobal = 0;
  let naGlobal = 0;

  for (const area of estado.areas) {
    const datos = datosDe(area.id);
    const respuestas = respuestasDe(area.id);
    const resultado = calcularResultado(respuestas, area.estructura, estado.version.criterios);

    areas[area.id] = {
      areaNombre: area.nombre,
      respuestas,
      resultado,
      hisopado: datos.hisopadoActivo ? { registros: datos.registros } : null,
      comentarios: (datos.comentarios || "").trim(),
    };

    cumpleGlobal += resultado.cumple;
    noCumpleGlobal += resultado.noCumple;
    naGlobal += resultado.na;
  }

  const denomGlobal = cumpleGlobal + noCumpleGlobal;
  const resultadoGlobal = {
    cumple: cumpleGlobal,
    noCumple: noCumpleGlobal,
    na: naGlobal,
    totalEvaluados: denomGlobal,
    porcentajeCumplimiento: denomGlobal > 0 ? Math.round((cumpleGlobal / denomGlobal) * 1000) / 10 : 0,
  };

  return {
    checklistId: CHECKLIST_ID,
    version: estado.version.numero,
    turno: Number(estado.turno),
    fechaInspeccion: estado.fecha,
    inspectorUid: estado.usuario.uid,
    inspectorNombre: estado.perfil.nombre || estado.usuario.email,
    areas,
    resultado: resultadoGlobal,
  };
}

/** Persiste el recorrido completo (todas las áreas) como "borrador". */
async function guardarTodoElAvance() {
  const datos = construirDatosRecorrido();
  await guardarRecorrido(estado.recorridoId, datos, !estado.existeRecorrido);
  estado.existeRecorrido = true;
  estado.sinGuardar = false;
  actualizarPestanas();
}

/** "Guardar": persiste el avance de todo el recorrido sin salir de la pantalla. */
btnGuardar.addEventListener("click", async () => {
  if (estado.guardando) return;

  const hayAlgoQueGuardar = estado.areas.some(tieneAlgunaRespuesta);
  if (!hayAlgoQueGuardar) {
    mostrarToast("No hay avance por guardar todavía.", "info");
    return;
  }

  estado.guardando = true;
  btnGuardar.disabled = true;
  btnTerminar.disabled = true;
  const etiquetaOriginal = btnGuardar.textContent;
  btnGuardar.textContent = "Guardando…";

  try {
    await guardarTodoElAvance();
    mostrarToast("Avance guardado.", "exito");
  } catch (error) {
    console.error("Error al guardar el avance:", error);
    mostrarToast("No se pudo guardar. Verifica tu conexión e intenta de nuevo.",
      "error"
    );
  } finally {
    estado.guardando = false;
    btnGuardar.disabled = false;
    btnTerminar.disabled = false;
    btnGuardar.textContent = etiquetaOriginal;
  }
});

/**
 * "Terminar": envía el recorrido COMPLETO como un solo reporte final.
 * Se bloquea si algún proceso quedó sin evaluar ningún aspecto — el
 * reporte se puede dejar incompleto en detalle, pero no con procesos
 * enteros en blanco.
 */
btnTerminar.addEventListener("click", async () => {
  if (estado.guardando) return;

  const areasSinEvaluar = estado.areas.filter((a) => !tieneAlgunaRespuesta(a));
  if (areasSinEvaluar.length > 0) {
    mostrarToast(
      `Faltan procesos por evaluar antes de terminar: ${areasSinEvaluar
        .map((a) => a.nombre)
        .join(", ")}.`,
      "error"
    );
    return;
  }

  if (!confirm("¿Terminar el recorrido y enviar el reporte completo? Ya no podrás editarlo después.")) {
    return;
  }

  estado.guardando = true;
  btnGuardar.disabled = true;
  btnTerminar.disabled = true;
  const etiquetaOriginal = btnGuardar.textContent;
  btnGuardar.textContent = "Guardando…";

  try {
    const datos = construirDatosRecorrido();
    await finalizarRecorrido(estado.recorridoId, datos, !estado.existeRecorrido);
    estado.existeRecorrido = true;
    estado.sinGuardar = false;
    mostrarResumen(datos);
  } catch (error) {
    console.error("Error al finalizar el recorrido:", error);
    mostrarToast("No se pudo guardar. Verifica tu conexión e intenta de nuevo.",
      "error"
    );
  } finally {
    estado.guardando = false;
    btnGuardar.disabled = false;
    btnTerminar.disabled = false;
    btnGuardar.textContent = etiquetaOriginal;
  }
});

/**
 * Pantalla de resumen del reporte ya enviado: cumplimiento global, por
 * proceso y detalle de hallazgos. Recibe el mismo objeto que se acaba de
 * escribir en Firestore (construirDatosRecorrido()) para no recalcular
 * nada dos veces.
 */
function mostrarResumen(datos) {
  zonaRecorrido.classList.add("oculto");
  zonaResumen.classList.remove("oculto");

  const g = datos.resultado;
  const pctGlobal = g.totalEvaluados > 0 ? Math.round(g.porcentajeCumplimiento) : null;

  resumenCumplimiento.textContent = pctGlobal === null ? "—" : `${pctGlobal}%`;
  resumenHallazgos.textContent = String(g.noCumple);

  const hallazgos = [];

  resumenPorProceso.innerHTML = estado.areas
    .map((area) => {
      const datosArea = datos.areas[area.id];
      const resultado = datosArea.resultado;
      const denomArea = resultado.cumple + resultado.noCumple;
      const pctArea = denomArea > 0 ? resultado.porcentajeCumplimiento : null;
      const color =
        pctArea === null
          ? "var(--tinta-3)"
          : pctArea >= 90
          ? "var(--estado-bien-ink)"
          : pctArea >= 75
          ? "var(--estado-alerta-ink)"
          : "var(--estado-critico-ink)";
      const colorBarra =
        pctArea === null
          ? "var(--borde-fuerte)"
          : pctArea >= 90
          ? "var(--estado-bien-mark)"
          : pctArea >= 75
          ? "var(--estado-alerta-mark)"
          : "var(--estado-critico-mark)";

      for (const seccion of area.estructura) {
        for (const aspecto of seccion.aspectos) {
          const respuesta = datosArea.respuestas[aspecto.id];
          if (respuesta?.valor === "no_cumple") {
            hallazgos.push({
              areaId: area.id,
              areaNombre: area.nombre,
              texto: aspecto.texto,
              observacion: respuesta.observacion,
            });
          }
        }
      }

      return `
        <div class="editor-item">
          <div class="flex-entre mb-1">
            <span class="texto-sm" style="font-weight:700;">${escaparHtml(area.id)} · ${escaparHtml(
        area.nombre
      )}</span>
            <span class="badge badge-exito">Enviado</span>
          </div>
          <div class="flex-entre mb-1">
            <span class="texto-xs texto-suave">${denomArea} evaluados</span>
            <span class="texto-sm" style="font-weight:800; color:${color};">${
        pctArea === null ? "—" : pctArea + "%"
      }</span>
          </div>
          <div class="barra-progreso">
            <div class="barra-progreso__valor" style="width:${pctArea ?? 0}%; background:${colorBarra};"></div>
          </div>
        </div>`;
    })
    .join("");

  if (hallazgos.length > 0) {
    seccionResumenHallazgos.classList.remove("oculto");
    resumenHallazgosDetalle.innerHTML = hallazgos
      .map(
        (h) => `
        <div class="aspecto aspecto--incumple">
          <p class="texto-xs texto-suave mb-0" style="font-weight:700;">${escaparHtml(
            h.areaId
          )} · ${escaparHtml(h.areaNombre)}</p>
          <p class="aspecto__texto" style="margin: var(--e1) 0;">${escaparHtml(h.texto)}</p>
          ${
            h.observacion
              ? `<p class="texto-sm texto-suave mb-0">"${escaparHtml(h.observacion)}"</p>`
              : ""
          }
        </div>`
      )
      .join("");
  } else {
    seccionResumenHallazgos.classList.add("oculto");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

btnNuevoRecorrido.addEventListener("click", async () => {
  estado.areas = [];
  estado.indiceActual = -1;
  estado.recorridoId = null;
  estado.existeRecorrido = false;
  estado.respuestasPorArea = {};
  estado.datosPorArea = {};
  estado.fecha = fechaHoyISO();
  estado.turno = "";
  estado.sinGuardar = false;

  zonaResumen.classList.add("oculto");
  recorridoContador.classList.add("oculto");

  zonaCargando.classList.remove("oculto");
  mostrarCarga(zonaCargando, "Iniciando nuevo recorrido…");

  await iniciarRecorrido();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
