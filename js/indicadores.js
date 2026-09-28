// ============================================================================
// INDICADORES.JS - Indicadores de cumplimiento de todos los módulos (Dashboard)
// ============================================================================
// Lee, para el rango de fechas elegido en el Dashboard, los registros que
// guarda cada formato del hub y los resume en indicadores:
//
//   SIG-FO-115  inspecciones              Cumplimiento de PPRs por proceso
//   Contenedores verificaciones_transporte % de contenedores liberados
//   SIG-FO-101  liberaciones              % de liberaciones de imprentas conformes
//   SIG-FO-116  auditoriasBpm              % de cumplimiento de la auditoría BPM
//   SIG-FO-111  registrosVidrio            Puntos de vidrio/plástico por nivel de riesgo
//   Hisopado    hisopados                  % de análisis dentro del límite
//   Reportes    reportes                   Cantidad de reportes por mes
//
// Todas las fechas de los formatos del hub se guardan como texto ISO
// ("aaaa-mm-dd"), así que cada consulta es un solo rango sobre un solo campo
// (índice automático de Firestore, sin índices compuestos nuevos). Todo lo
// demás (estado, máquina, turno...) se filtra aquí en el navegador.
//
// Cada módulo se carga por separado y atrapa su propio error: si al usuario
// le falta permiso para una colección (p. ej. un inspector con permiso de
// Dashboard no puede listar "inspecciones"), solo esa pestaña muestra el
// aviso y las demás siguen funcionando.
// ============================================================================

// Meta de cumplimiento de cada indicador en %, pendientes de definir.
// Mientras una meta sea null, su indicador se muestra sin comparación: sin
// color de cumple/no cumple, sin línea de meta en la gráfica y sin la
// etiqueta "Cumple / Bajo meta". Para activarla basta poner el número,
// p. ej. ppr: 95 (el "Límite" del consolidado SIG-FO-115 en Excel).
const METAS_INDICADORES = {
  ppr: null,
  contenedores: null,
  imprentas: null,
  bpm: null,
  hisopado: null,
};

const COLOR_CUMPLE = "#008A05";
const COLOR_NO_CUMPLE = "#C13515";
const COLOR_SERIE = "#222222";
const COLOR_ACENTO = "#FF385C";
const COLOR_MEDIO = "#E07912";
const COLOR_META = "#222222";

const NOMBRES_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Etiquetas de las secciones del SIG-FO-116 (hub/js/bpm-checklist.js), por si
// la configuración todavía no se ha guardado en Firestore.
const SECCIONES_BPM_BASE = {
  calidad: "Control de Calidad",
  proceso: "Control de Proceso",
  bpm: "Buenas Prácticas de Manufactura",
  haccp: "HACCP",
  almacenamiento: "Almacenamiento y Transporte",
  mejora: "Mejora Contínua",
};

// ---------------------------------------------------------------------------
// UTILIDADES
// ---------------------------------------------------------------------------
function escHtml(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Fecha local (no UTC) como "aaaa-mm-dd". */
function fechaISOLocal(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

function etiquetaMes(claveMes) {
  const [anio, mes] = claveMes.split("-");
  return `${NOMBRES_MES[Number(mes) - 1]} ${anio}`;
}

/** Todas las claves "aaaa-mm" entre dos fechas ISO, inclusive. */
function mesesEnRango(desdeISO, hastaISO) {
  const meses = [];
  let [anio, mes] = desdeISO.slice(0, 7).split("-").map(Number);
  const fin = hastaISO.slice(0, 7);
  for (let i = 0; i < 120; i++) {
    const clave = `${anio}-${String(mes).padStart(2, "0")}`;
    if (clave > fin) break;
    meses.push(clave);
    mes++;
    if (mes > 12) { mes = 1; anio++; }
  }
  return meses;
}

function porcentaje(parte, total) {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : null;
}

function promedio(valores) {
  const validos = valores.filter((v) => typeof v === "number");
  return validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : null;
}

function textoPct(valor) {
  return valor === null || valor === undefined ? "–" : `${(Math.round(valor * 10) / 10).toFixed(1)}%`;
}

function hayMeta(meta) {
  return typeof meta === "number";
}

/** "Meta 95%" o nada, si la meta todavía no se definió. */
function textoMeta(meta) {
  return hayMeta(meta) ? textoMeta(meta) : "";
}

/** Etiqueta de estado contra la meta: nunca solo color, siempre con texto. */
function etiquetaEstado(valor, meta) {
  if (!hayMeta(meta)) return "";
  if (valor === null || valor === undefined) return `<span class="ind-estado sin">Sin datos</span>`;
  return valor >= meta
    ? `<span class="ind-estado ok">✔ Cumple</span>`
    : `<span class="ind-estado bajo">✘ Bajo meta</span>`;
}

function claseValor(valor, meta) {
  if (!hayMeta(meta) || valor === null || valor === undefined) return "";
  return valor >= meta ? "ind-ok" : "ind-bajo";
}

function mensajeError(err) {
  if (err && (err.code === "permission-denied" || /permission/i.test(err.message || ""))) {
    return "Tu usuario no tiene permiso para consultar estos registros. Pide al administrador que revise tu rol.";
  }
  return "No se pudieron cargar los datos. Revisa tu conexión e intenta de nuevo.";
}

/** Consulta de un rango de fechas ISO sobre un campo de texto. */
async function consultarRangoISO(coleccion, campo, desdeISO, hastaISO) {
  const snap = await db.collection(coleccion)
    .where(campo, ">=", desdeISO)
    .where(campo, "<=", hastaISO)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Cuenta (y ordena de mayor a menor) las ocurrencias de cada clave. */
function topConteo(claves, max = 10) {
  const conteo = new Map();
  claves.forEach((c) => conteo.set(c, (conteo.get(c) || 0) + 1));
  return [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
}

// ---------------------------------------------------------------------------
// SIG-FO-115 — CUMPLIMIENTO DE PPRs
// Mismo cálculo que el consolidado mensual en Excel (hojas "Tabla de Datos"
// y "Resultado"):
//   % aspecto  = ✔ / (✔ + ✘) de ese aspecto en ese proceso, sumando todos
//                los turnos y días del período ("No aplica" y lo que quedó
//                sin responder no cuentan, igual que las celdas vacías).
//   % cuestión = promedio de los % de sus aspectos.
//   % proceso  = promedio de los % de sus cuestiones.
//   % final    = promedio de los % de los procesos.
// ---------------------------------------------------------------------------
async function cargarDatosPPR(desdeISO, hastaISO) {
  const recorridos = await consultarRangoISO("inspecciones", "fechaInspeccion", desdeISO, hastaISO);

  // Estructura del checklist (proceso/cuestión/aspecto): el borrador vigente
  // y, por si un aspecto se eliminó después, las versiones que se usaron.
  const snapChecklist = await db.collection("checklists").doc("sig-fo-115").get();
  const checklist = snapChecklist.exists ? snapChecklist.data() : {};
  const versiones = [...new Set(recorridos.map((r) => r.version).filter((v) => v !== undefined && v !== null))];
  const snapsVersiones = await Promise.all(versiones.map((n) =>
    db.collection("checklists").doc("sig-fo-115").collection("versiones").doc(String(n)).get().catch(() => null)
  ));

  const aspectos = new Map(); // aspectoId -> { texto, seccionId }
  const secciones = new Map(); // seccionId -> { titulo, orden }
  const registrarSecciones = (lista) => (lista || []).forEach((sec, i) => {
    secciones.set(sec.id, { titulo: sec.titulo || sec.id, orden: sec.orden ?? i });
    (sec.aspectos || []).forEach((a) => aspectos.set(a.id, { texto: a.texto, seccionId: sec.id }));
  });
  snapsVersiones.forEach((s) => { if (s && s.exists) registrarSecciones(s.data().secciones); });
  registrarSecciones(checklist.secciones); // el borrador manda sobre los textos

  const ordenAreas = new Map((checklist.areas || []).map((a, i) => [a.id, { nombre: a.nombre, orden: a.orden ?? i }]));

  return { recorridos, aspectos, secciones, ordenAreas };
}

function calcularCumplimientoPPR({ recorridos, aspectos, secciones, ordenAreas }) {
  // conteo[areaId][seccionId][aspectoId] = { si, total }
  const conteo = {};
  const nombresArea = {};
  const porTurno = {};
  const fallas = [];
  let totalSi = 0, totalEvaluados = 0;

  recorridos.forEach((rec) => {
    const turno = rec.turno || "?";
    Object.entries(rec.areas || {}).forEach(([areaId, area]) => {
      nombresArea[areaId] = nombresArea[areaId] || area.areaNombre || ordenAreas.get(areaId)?.nombre || areaId;
      Object.entries(area.respuestas || {}).forEach(([aspectoId, resp]) => {
        const valor = resp && resp.valor;
        if (valor !== "cumple" && valor !== "no_cumple") return;
        const seccionId = aspectos.get(aspectoId)?.seccionId || "_otros";
        conteo[areaId] = conteo[areaId] || {};
        conteo[areaId][seccionId] = conteo[areaId][seccionId] || {};
        const c = conteo[areaId][seccionId][aspectoId] = conteo[areaId][seccionId][aspectoId] || { si: 0, total: 0 };
        c.total++;
        totalEvaluados++;
        porTurno[turno] = porTurno[turno] || { si: 0, total: 0 };
        porTurno[turno].total++;
        if (valor === "cumple") {
          c.si++;
          totalSi++;
          porTurno[turno].si++;
        } else {
          fallas.push({ area: nombresArea[areaId], aspecto: aspectos.get(aspectoId)?.texto || aspectoId });
        }
      });
    });
  });

  const procesos = Object.keys(conteo)
    .sort((a, b) => (ordenAreas.get(a)?.orden ?? 999) - (ordenAreas.get(b)?.orden ?? 999) || nombresArea[a].localeCompare(nombresArea[b]))
    .map((areaId) => {
      const cuestiones = Object.keys(conteo[areaId])
        .sort((a, b) => (secciones.get(a)?.orden ?? 999) - (secciones.get(b)?.orden ?? 999))
        .map((seccionId) => {
          const porAspecto = Object.values(conteo[areaId][seccionId]).map((c) => (c.si / c.total) * 100);
          return {
            titulo: secciones.get(seccionId)?.titulo || "Otros",
            porcentaje: promedio(porAspecto),
            aspectos: porAspecto.length,
          };
        });
      return { areaId, nombre: nombresArea[areaId], cuestiones, porcentaje: promedio(cuestiones.map((c) => c.porcentaje)) };
    });

  return {
    procesos,
    final: promedio(procesos.map((p) => p.porcentaje)),
    totalSi,
    totalEvaluados,
    porTurno,
    topFallas: topConteo(fallas.map((f) => `${f.area} — ${f.aspecto}`)),
  };
}

// ---------------------------------------------------------------------------
// CONTENEDORES — Verificación de transporte (verificaciones_transporte)
// Mismo criterio de aprobado que el historial (esContenedorAprobado en
// hub/js/transporte.js): lo guardado explícitamente manda.
// ---------------------------------------------------------------------------
function contenedorAprobado(d) {
  if (typeof d.aprobado === "boolean") return d.aprobado;
  const res = String(d.resultado || "").toLowerCase().trim();
  if (res === "aprobado" || res === "aprobada") return true;
  if (["rechazado", "rechazada", "no_pasa", "no pasa", "fallido"].includes(res)) return false;
  const est = String(d.estado || "").toLowerCase().trim();
  if (est === "aprobado" || est === "aprobada") return true;
  if (est === "rechazado" || est === "rechazada") return false;
  if (typeof d.calificacion === "number") return d.calificacion === 100;
  if (typeof d.cumplimientoPorcentaje === "number") return d.cumplimientoPorcentaje === 100;
  return false;
}

function calcularContenedores(registros) {
  const aprobados = registros.filter(contenedorAprobado).length;
  const porEmpresa = {};
  const fallas = [];
  registros.forEach((r) => {
    const empresa = r.transporte || "Sin empresa";
    porEmpresa[empresa] = porEmpresa[empresa] || { total: 0, aprobados: 0 };
    porEmpresa[empresa].total++;
    if (contenedorAprobado(r)) porEmpresa[empresa].aprobados++;
    Object.values(r.respuestasPorZona || {}).forEach((zona) => {
      ["externa", "interna"].forEach((modo) => (zona[modo] || []).forEach((item) => {
        if (item.valor === "no") fallas.push(`${zona.nombre || "Zona"} — ${item.texto}`);
      }));
    });
    (r.respuestasCabina || []).forEach((item) => { if (item.valor === "no") fallas.push(`Cabina — ${item.texto}`); });
  });
  return {
    total: registros.length,
    aprobados,
    rechazados: registros.length - aprobados,
    porcentaje: porcentaje(aprobados, registros.length),
    promedioChecklist: promedio(registros.map((r) => r.cumplimientoPorcentaje)),
    porEmpresa: Object.entries(porEmpresa).sort((a, b) => b[1].total - a[1].total),
    topFallas: topConteo(fallas),
  };
}

// ---------------------------------------------------------------------------
// IMPRENTAS — Liberación de convertidoras/imprentas (SIG-FO-101, liberaciones)
// Una liberación es conforme cuando todas sus preguntas quedaron en SI
// (campo limpiezaSanitizacion, que el formulario calcula al guardar).
// ---------------------------------------------------------------------------
function liberacionConforme(l) {
  if (typeof l.limpiezaSanitizacion === "boolean") return l.limpiezaSanitizacion;
  return (l.respuestas || []).every((r) => r.valor === true);
}

function calcularImprentas(registros) {
  const conformes = registros.filter(liberacionConforme).length;
  const porMaquina = {};
  const porTurno = {};
  const fallas = [];
  registros.forEach((l) => {
    const ok = liberacionConforme(l);
    const maquina = l.maquina || "Sin máquina";
    porMaquina[maquina] = porMaquina[maquina] || { total: 0, conformes: 0 };
    porMaquina[maquina].total++;
    if (ok) porMaquina[maquina].conformes++;
    const turno = l.turno || "?";
    porTurno[turno] = porTurno[turno] || { total: 0, conformes: 0 };
    porTurno[turno].total++;
    if (ok) porTurno[turno].conformes++;
    (l.respuestas || []).forEach((r) => { if (r.valor === false) fallas.push(`${maquina} — ${r.texto}`); });
  });
  return {
    total: registros.length,
    conformes,
    noConformes: registros.length - conformes,
    porcentaje: porcentaje(conformes, registros.length),
    porMaquina: Object.entries(porMaquina).sort((a, b) => a[0].localeCompare(b[0])),
    porTurno: Object.entries(porTurno).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    topFallas: topConteo(fallas),
  };
}

// ---------------------------------------------------------------------------
// BPM — Auditoría de Buenas Prácticas de Manufactura (SIG-FO-116)
// Un documento por mes (id "aaaa-mm"). Mismo puntaje que el formulario:
// SI / (SI + NO), "No aplica" no cuenta.
// ---------------------------------------------------------------------------
async function cargarDatosBpm(desdeISO, hastaISO) {
  const desdeMes = desdeISO.slice(0, 7), hastaMes = hastaISO.slice(0, 7);
  const [snap, snapConfig] = await Promise.all([
    db.collection("auditoriasBpm").get(),
    db.collection("checklists").doc("auditoria-bpm").get().catch(() => null),
  ]);
  const auditorias = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => a.id >= desdeMes && a.id <= hastaMes)
    .sort((a, b) => a.id.localeCompare(b.id));

  // preguntaId -> { seccionId, texto, activa }
  const preguntas = new Map();
  const etiquetas = { ...SECCIONES_BPM_BASE };
  const config = snapConfig && snapConfig.exists ? snapConfig.data().secciones : null;
  (config || []).forEach((sec) => {
    etiquetas[sec.id] = sec.label || etiquetas[sec.id] || sec.id;
    (sec.grupos || []).forEach((g) => (g.preguntas || []).forEach((p) => {
      preguntas.set(p.id, { seccionId: sec.id, texto: p.label, activa: p.activa !== false });
    }));
  });
  return { auditorias, preguntas, etiquetas };
}

function calcularBpm({ auditorias, preguntas, etiquetas }) {
  const seccionesVistas = new Set();
  const noCumple = [];
  const porMes = auditorias.map((aud) => {
    const porSeccion = {};
    let si = 0, no = 0;
    Object.entries(aud.responses || {}).forEach(([qid, r]) => {
      const info = preguntas.get(qid);
      if (info && !info.activa) return;
      const valor = r && r.value;
      if (valor !== "SI" && valor !== "NO") return;
      const seccionId = info?.seccionId || qid.replace(/-\d+$/, "");
      seccionesVistas.add(seccionId);
      porSeccion[seccionId] = porSeccion[seccionId] || { si: 0, no: 0 };
      if (valor === "SI") { porSeccion[seccionId].si++; si++; }
      else {
        porSeccion[seccionId].no++; no++;
        noCumple.push({ mes: aud.id, seccion: etiquetas[seccionId] || seccionId, texto: info?.texto || qid, obs: r.obs || "" });
      }
    });
    const pctSecciones = {};
    Object.entries(porSeccion).forEach(([id, c]) => { pctSecciones[id] = porcentaje(c.si, c.si + c.no); });
    return { mes: aud.id, auditor: aud.meta?.auditor || "", porcentaje: porcentaje(si, si + no), secciones: pctSecciones, si, no };
  });
  const ordenSecciones = Object.keys(etiquetas).filter((id) => seccionesVistas.has(id))
    .concat([...seccionesVistas].filter((id) => !(id in etiquetas)));
  const totalSi = porMes.reduce((s, m) => s + m.si, 0), totalNo = porMes.reduce((s, m) => s + m.no, 0);
  return { porMes, secciones: ordenSecciones.map((id) => ({ id, etiqueta: etiquetas[id] || id })), porcentaje: porcentaje(totalSi, totalSi + totalNo), noCumple };
}

function calificacionBpm(pct) {
  if (pct === null) return "Sin datos";
  if (pct <= 70) return "No cumple";
  if (pct <= 80) return "Regular";
  if (pct <= 92) return "Satisfactorio";
  return "Excelente";
}

// ---------------------------------------------------------------------------
// VIDRIO Y PLÁSTICO QUEBRADIZO (SIG-FO-111, registrosVidrio)
// Riesgo 1 = ligero, 2 = medio, 3 = acción urgente.
// ---------------------------------------------------------------------------
function calcularVidrio(registros) {
  const porProceso = {};
  const urgentes = [];
  let puntos = 0;
  const niveles = { 1: 0, 2: 0, 3: 0 };
  registros.forEach((r) => (r.puntos || []).forEach((p) => {
    puntos++;
    const riesgo = Number(p.riesgo);
    if (niveles[riesgo] !== undefined) niveles[riesgo]++;
    const proceso = p.proceso || "Sin proceso";
    porProceso[proceso] = porProceso[proceso] || { total: 0, 1: 0, 2: 0, 3: 0 };
    porProceso[proceso].total++;
    if (porProceso[proceso][riesgo] !== undefined) porProceso[proceso][riesgo]++;
    if (riesgo === 3) urgentes.push({ fecha: r.fecha, ...p });
  }));
  return {
    inspecciones: registros.length,
    puntos,
    niveles,
    porcentajeSinUrgentes: porcentaje(puntos - niveles[3], puntos),
    porProceso: Object.entries(porProceso).sort((a, b) => b[1][3] - a[1][3] || a[0].localeCompare(b[0])),
    urgentes: urgentes.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))),
  };
}

// ---------------------------------------------------------------------------
// HISOPADO (hisopados) — análisis dentro/fuera del límite
// ---------------------------------------------------------------------------
function calcularHisopado(registros) {
  const desviaciones = registros.filter((h) => h.desviacion === true);
  const porTipo = {};
  registros.forEach((h) => {
    const tipo = h.tipoNombre || "Sin tipo";
    porTipo[tipo] = porTipo[tipo] || { total: 0, dentro: 0 };
    porTipo[tipo].total++;
    if (h.desviacion !== true) porTipo[tipo].dentro++;
  });
  return {
    total: registros.length,
    dentro: registros.length - desviaciones.length,
    desviaciones: desviaciones.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))),
    porcentaje: porcentaje(registros.length - desviaciones.length, registros.length),
    porTipo: Object.entries(porTipo).sort((a, b) => a[0].localeCompare(b[0])),
  };
}

// ---------------------------------------------------------------------------
// AGRUPACIÓN POR MES (tendencia)
// ---------------------------------------------------------------------------
function agruparPorMes(registros, obtenerFechaISO) {
  const grupos = {};
  registros.forEach((r) => {
    const fecha = obtenerFechaISO(r);
    if (!fecha) return;
    const mes = fecha.slice(0, 7);
    (grupos[mes] = grupos[mes] || []).push(r);
  });
  return grupos;
}

function fechaReporteISO(r) {
  return r.fechaHora?.toDate ? fechaISOLocal(r.fechaHora.toDate()) : null;
}

// ---------------------------------------------------------------------------
// GRÁFICAS (Chart.js, mismo registro de instancias que dashboard.js)
// ---------------------------------------------------------------------------
function graficaPorcentajeConMeta(idCanvas, etiquetas, valores, meta, etiquetaSerie) {
  if (chartsActivos[idCanvas]) chartsActivos[idCanvas].destroy();
  const canvas = document.getElementById(idCanvas);
  if (!canvas) return;
  const conMeta = hayMeta(meta);
  const datasets = [{
    type: "bar", label: etiquetaSerie, data: valores,
    backgroundColor: valores.map((v) => (v === null ? "transparent" : !conMeta ? COLOR_SERIE : v >= meta ? COLOR_CUMPLE : COLOR_NO_CUMPLE)),
    borderRadius: 6, maxBarThickness: 40,
  }];
  if (conMeta) {
    datasets.push({
      type: "line", label: textoMeta(meta), data: etiquetas.map(() => meta),
      borderColor: COLOR_META, borderWidth: 1.5, borderDash: [5, 5], pointRadius: 0, fill: false,
    });
  }
  chartsActivos[idCanvas] = new Chart(canvas.getContext("2d"), {
    data: { labels: etiquetas, datasets },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: conMeta, position: "bottom" },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${textoPct(ctx.parsed.y)}` } },
      },
      scales: { y: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } } },
    },
  });
}

function graficaApilada(idCanvas, etiquetas, series) {
  if (chartsActivos[idCanvas]) chartsActivos[idCanvas].destroy();
  const canvas = document.getElementById(idCanvas);
  if (!canvas) return;
  chartsActivos[idCanvas] = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: etiquetas,
      datasets: series.map((s) => ({ label: s.etiqueta, data: s.datos, backgroundColor: s.color, borderRadius: 6, maxBarThickness: 40, borderSkipped: "bottom" })),
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: series.length > 1, position: "bottom" } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------
function kpiHtml(valor, etiqueta, detalle = "", clase = "", medidor = null) {
  return `<div class="kpi"><div class="etiqueta">${etiqueta}</div><div class="valor ${clase}">${valor}</div>${
    medidor ? medidorHtml(medidor.pct, medidor.meta) : ""}${detalle ? `<div class="ayuda">${detalle}</div>` : ""}</div>`;
}

/** Barra de avance de 0 a 100%; con meta definida, la marca vertical es la meta. */
function medidorHtml(pct, meta) {
  if (pct === null || pct === undefined) return "";
  const ancho = Math.max(0, Math.min(100, pct));
  if (!hayMeta(meta)) {
    return `<div class="ind-medidor" role="img" aria-label="${textoPct(pct)}"><span style="width:${ancho}%"></span></div>`;
  }
  return `<div class="ind-medidor ${pct >= meta ? "ok" : "bajo"}" role="img" aria-label="${textoPct(pct)} de meta ${meta}%">
    <span style="width:${ancho}%"></span><i style="left:${meta}%"></i></div>`;
}

function tablaHtml(encabezados, filas, vacio = "Sin datos en el período seleccionado.") {
  return `<div class="tabla-responsive"><table class="tabla"><thead><tr>${encabezados.map((e) => `<th>${e}</th>`).join("")}</tr></thead><tbody>${
    filas.length ? filas.join("") : `<tr><td colspan="${encabezados.length}">${vacio}</td></tr>`
  }</tbody></table></div>`;
}

function tablaTopFallas(top, titulo = "Punto") {
  return tablaHtml([titulo, "Veces"], top.map(([texto, veces]) => `<tr><td>${escHtml(texto)}</td><td>${veces}</td></tr>`), "Sin incumplimientos en el período. 🎉");
}

function pintarError(idPanel, err) {
  console.error(`Indicadores (${idPanel}):`, err);
  const panel = document.getElementById(idPanel);
  if (panel) panel.innerHTML = `<div class="tarjeta"><p class="ind-aviso">${mensajeError(err)}</p></div>`;
}

function renderPPR(datos, meses) {
  const r = calcularCumplimientoPPR(datos);
  const meta = METAS_INDICADORES.ppr;
  const turnos = Object.keys(r.porTurno).sort();

  const filas = [];
  r.procesos.forEach((p) => {
    p.cuestiones.forEach((c, i) => {
      filas.push(`<tr>
        ${i === 0 ? `<td rowspan="${p.cuestiones.length}"><strong>${escHtml(p.nombre)}</strong></td>` : ""}
        <td>${escHtml(c.titulo)}</td>
        <td class="${claseValor(c.porcentaje, meta)}">${textoPct(c.porcentaje)}</td>
        ${i === 0 ? `<td rowspan="${p.cuestiones.length}" class="${claseValor(p.porcentaje, meta)}"><strong>${textoPct(p.porcentaje)}</strong><br>${etiquetaEstado(p.porcentaje, meta)}</td>` : ""}
      </tr>`);
    });
  });
  if (r.procesos.length) {
    filas.push(`<tr class="ind-fila-total"><td colspan="3"><strong>% DE CUMPLIMIENTO DEL PERÍODO</strong></td>
      <td class="${claseValor(r.final, meta)}"><strong>${textoPct(r.final)}</strong><br>${etiquetaEstado(r.final, meta)}</td></tr>`);
  }

  const porMes = agruparPorMes(datos.recorridos, (x) => x.fechaInspeccion);
  const tendencia = meses.map((m) => (porMes[m] ? calcularCumplimientoPPR({ ...datos, recorridos: porMes[m] }).final : null));

  document.getElementById("panel-ppr").innerHTML = `
    <div class="kpis">
      ${kpiHtml(textoPct(r.final), "Cumplimiento final PPRs", textoMeta(meta), claseValor(r.final, meta), { pct: r.final, meta })}
      ${kpiHtml(datos.recorridos.length, "Recorridos considerados", datos.excluidos ? `${datos.excluidos} borrador(es) excluido(s)` : "")}
      ${kpiHtml(r.totalEvaluados, "Aspectos evaluados", `${r.totalSi} ✔ · ${r.totalEvaluados - r.totalSi} ✘`)}
      ${turnos.map((t) => kpiHtml(textoPct(porcentaje(r.porTurno[t].si, r.porTurno[t].total)), `Turno #${escHtml(t)}`, "✔ / evaluados")).join("")}
    </div>
    <div class="tarjeta">
      <h3>Resultado por proceso (SIG-FO-115)</h3>
      <p class="ayuda">Igual que la hoja "Resultado" del consolidado: % por aspecto = ✔ / evaluados en el período;
      cada cuestión promedia sus aspectos, cada proceso promedia sus cuestiones y el cumplimiento final promedia los procesos.${hayMeta(meta) ? ` Límite ${meta}%.` : ""}</p>
      ${tablaHtml(["Proceso", "Cuestión", "Resultado individual", "Total del proceso"], filas, "Sin recorridos en el período seleccionado.")}
    </div>
    <div class="tarjeta">
      <h3>Cumplimiento por proceso</h3>
      <canvas id="grafica-ppr-procesos"></canvas>
    </div>
    <div class="grid-2">
      <div class="tarjeta">
        <h3>Tendencia mensual</h3>
        <canvas id="grafica-ppr-mes"></canvas>
      </div>
      <div class="tarjeta">
        <h3>Top 10 aspectos que no cumplen</h3>
        ${tablaTopFallas(r.topFallas, "Proceso — aspecto")}
      </div>
    </div>`;

  graficaPorcentajeConMeta("grafica-ppr-procesos", r.procesos.map((p) => p.nombre), r.procesos.map((p) => p.porcentaje), meta, "Cumplimiento");
  graficaPorcentajeConMeta("grafica-ppr-mes", meses.map(etiquetaMes), tendencia, meta, "Cumplimiento");
  return { final: r.final, porMes: Object.fromEntries(meses.map((m, i) => [m, tendencia[i]])) };
}

function renderContenedores(registros, meses) {
  const r = calcularContenedores(registros);
  const meta = METAS_INDICADORES.contenedores;
  const porMes = agruparPorMes(registros, (x) => x.fecha);
  const aprobMes = meses.map((m) => (porMes[m] || []).filter(contenedorAprobado).length);
  const rechMes = meses.map((m, i) => (porMes[m] || []).length - aprobMes[i]);

  document.getElementById("panel-contenedores").innerHTML = `
    <div class="kpis">
      ${kpiHtml(textoPct(r.porcentaje), "Contenedores liberados", textoMeta(meta), claseValor(r.porcentaje, meta), { pct: r.porcentaje, meta })}
      ${kpiHtml(r.total, "Verificaciones")}
      ${kpiHtml(r.aprobados, "Aprobados")}
      ${kpiHtml(r.rechazados, "Rechazados")}
      ${kpiHtml(textoPct(r.promedioChecklist), "Cumplimiento prom. del checklist")}
    </div>
    <div class="tarjeta">
      <h3>Contenedores aprobados y rechazados por mes</h3>
      <canvas id="grafica-contenedores-mes"></canvas>
    </div>
    <div class="grid-2">
      <div class="tarjeta">
        <h3>Por empresa de transporte</h3>
        ${tablaHtml(["Empresa", "Verificaciones", "Aprobados", "% liberación"], r.porEmpresa.map(([emp, c]) => {
          const pct = porcentaje(c.aprobados, c.total);
          return `<tr><td>${escHtml(emp)}</td><td>${c.total}</td><td>${c.aprobados}</td><td class="${claseValor(pct, meta)}">${textoPct(pct)}</td></tr>`;
        }))}
      </div>
      <div class="tarjeta">
        <h3>Top 10 puntos que no cumplen</h3>
        ${tablaTopFallas(r.topFallas, "Zona — punto")}
      </div>
    </div>`;

  graficaApilada("grafica-contenedores-mes", meses.map(etiquetaMes), [
    { etiqueta: "Aprobados", datos: aprobMes, color: COLOR_CUMPLE },
    { etiqueta: "Rechazados", datos: rechMes, color: COLOR_NO_CUMPLE },
  ]);
  return {
    final: r.porcentaje, total: r.total,
    porMes: Object.fromEntries(meses.map((m, i) => [m, porcentaje(aprobMes[i], aprobMes[i] + rechMes[i])])),
  };
}

function renderImprentas(registros, meses) {
  const r = calcularImprentas(registros);
  const meta = METAS_INDICADORES.imprentas;
  const porMes = agruparPorMes(registros, (x) => x.fecha);
  const confMes = meses.map((m) => (porMes[m] || []).filter(liberacionConforme).length);
  const noConfMes = meses.map((m, i) => (porMes[m] || []).length - confMes[i]);

  document.getElementById("panel-imprentas").innerHTML = `
    <div class="kpis">
      ${kpiHtml(textoPct(r.porcentaje), "Liberaciones conformes", textoMeta(meta), claseValor(r.porcentaje, meta), { pct: r.porcentaje, meta })}
      ${kpiHtml(r.total, "Liberaciones registradas")}
      ${kpiHtml(r.conformes, "Conformes (todo en SI)")}
      ${kpiHtml(r.noConformes, "Con algún NO")}
    </div>
    <div class="tarjeta">
      <h3>Liberaciones por mes</h3>
      <canvas id="grafica-imprentas-mes"></canvas>
    </div>
    <div class="grid-2">
      <div class="tarjeta">
        <h3>Por máquina</h3>
        ${tablaHtml(["Máquina", "Liberaciones", "Conformes", "% conformidad"], r.porMaquina.map(([maq, c]) => {
          const pct = porcentaje(c.conformes, c.total);
          return `<tr><td>${escHtml(maq)}</td><td>${c.total}</td><td>${c.conformes}</td><td class="${claseValor(pct, meta)}">${textoPct(pct)}</td></tr>`;
        }))}
        <h3 style="margin-top:18px;">Por turno</h3>
        ${tablaHtml(["Turno", "Liberaciones", "Conformes", "% conformidad"], r.porTurno.map(([t, c]) => {
          const pct = porcentaje(c.conformes, c.total);
          return `<tr><td>Turno #${escHtml(t)}</td><td>${c.total}</td><td>${c.conformes}</td><td class="${claseValor(pct, meta)}">${textoPct(pct)}</td></tr>`;
        }))}
      </div>
      <div class="tarjeta">
        <h3>Top 10 puntos en NO</h3>
        ${tablaTopFallas(r.topFallas, "Máquina — punto")}
      </div>
    </div>`;

  graficaApilada("grafica-imprentas-mes", meses.map(etiquetaMes), [
    { etiqueta: "Conformes", datos: confMes, color: COLOR_CUMPLE },
    { etiqueta: "Con algún NO", datos: noConfMes, color: COLOR_NO_CUMPLE },
  ]);
  return {
    final: r.porcentaje, total: r.total,
    porMes: Object.fromEntries(meses.map((m, i) => [m, porcentaje(confMes[i], confMes[i] + noConfMes[i])])),
  };
}

function renderBpm(datos, meses) {
  const r = calcularBpm(datos);
  const meta = METAS_INDICADORES.bpm;
  const porMesMapa = Object.fromEntries(r.porMes.map((m) => [m.mes, m]));

  const filas = r.secciones.map((s) => `<tr><td>${escHtml(s.etiqueta)}</td>${r.porMes.map((m) => {
    const v = m.secciones[s.id] ?? null;
    return `<td class="${claseValor(v, meta)}">${textoPct(v)}</td>`;
  }).join("")}</tr>`);
  if (r.porMes.length) {
    filas.push(`<tr class="ind-fila-total"><td><strong>Cumplimiento total</strong></td>${r.porMes.map((m) =>
      `<td class="${claseValor(m.porcentaje, meta)}"><strong>${textoPct(m.porcentaje)}</strong><br><span class="ayuda">${calificacionBpm(m.porcentaje)}</span></td>`).join("")}</tr>`);
  }

  document.getElementById("panel-bpm").innerHTML = `
    <div class="kpis">
      ${kpiHtml(textoPct(r.porcentaje), "Cumplimiento BPM del período", [calificacionBpm(r.porcentaje), textoMeta(meta)].filter(Boolean).join(" · "), claseValor(r.porcentaje, meta), { pct: r.porcentaje, meta })}
      ${kpiHtml(r.porMes.length, "Auditorías (meses)")}
      ${kpiHtml(r.noCumple.length, "Preguntas en NO")}
    </div>
    <div class="tarjeta">
      <h3>Resultado por sección</h3>
      <p class="ayuda">SI / (SI + NO) de cada sección; "No aplica" no cuenta. Calificación: ≤70% No cumple · ≤80% Regular · ≤92% Satisfactorio · &gt;92% Excelente.</p>
      ${tablaHtml(["Sección", ...r.porMes.map((m) => etiquetaMes(m.mes))], filas, "Sin auditorías BPM en el período seleccionado.")}
    </div>
    <div class="grid-2">
      <div class="tarjeta">
        <h3>Tendencia mensual</h3>
        <canvas id="grafica-bpm-mes"></canvas>
      </div>
      <div class="tarjeta">
        <h3>Preguntas que no cumplen</h3>
        ${tablaHtml(["Mes", "Sección", "Pregunta"], r.noCumple.map((n) =>
          `<tr><td>${etiquetaMes(n.mes)}</td><td>${escHtml(n.seccion)}</td><td>${escHtml(n.texto)}${n.obs ? `<div class="ayuda">${escHtml(n.obs)}</div>` : ""}</td></tr>`), "Sin preguntas en NO. 🎉")}
      </div>
    </div>`;

  const tendencia = meses.map((m) => porMesMapa[m]?.porcentaje ?? null);
  graficaPorcentajeConMeta("grafica-bpm-mes", meses.map(etiquetaMes), tendencia, meta, "Cumplimiento");
  return { final: r.porcentaje, porMes: Object.fromEntries(meses.map((m, i) => [m, tendencia[i]])) };
}

function renderVidrio(registros, meses) {
  const r = calcularVidrio(registros);
  const porMes = agruparPorMes(registros, (x) => x.fecha);
  const serieNivel = (nivel) => meses.map((m) => (porMes[m] || []).reduce((s, reg) => s + (reg.puntos || []).filter((p) => Number(p.riesgo) === nivel).length, 0));

  document.getElementById("panel-vidrio").innerHTML = `
    <div class="kpis">
      ${kpiHtml(r.inspecciones, "Inspecciones")}
      ${kpiHtml(r.puntos, "Puntos evaluados")}
      ${kpiHtml(r.niveles[3], "Acción urgente (riesgo 3)", "", r.niveles[3] ? "ind-bajo" : "ind-ok")}
      ${kpiHtml(r.niveles[2], "Riesgo medio (2)")}
      ${kpiHtml(textoPct(r.porcentajeSinUrgentes), "Puntos sin acción urgente")}
    </div>
    <div class="tarjeta">
      <h3>Puntos por nivel de riesgo y mes</h3>
      <canvas id="grafica-vidrio-mes"></canvas>
    </div>
    <div class="grid-2">
      <div class="tarjeta">
        <h3>Por proceso</h3>
        ${tablaHtml(["Proceso", "Puntos", "Ligero (1)", "Medio (2)", "Urgente (3)"], r.porProceso.map(([proc, c]) =>
          `<tr><td>${escHtml(proc)}</td><td>${c.total}</td><td>${c[1]}</td><td>${c[2]}</td><td class="${c[3] ? "ind-bajo" : ""}">${c[3]}</td></tr>`))}
      </div>
      <div class="tarjeta">
        <h3>Puntos de acción urgente</h3>
        ${tablaHtml(["Fecha", "Proceso / localización", "Acción requerida"], r.urgentes.map((u) =>
          `<tr><td>${escHtml(u.fecha)}</td><td>${escHtml(u.proceso)}<div class="ayuda">${escHtml([u.localizacion, u.material].filter(Boolean).join(" · "))}</div></td><td>${escHtml(u.accion)}</td></tr>`), "Sin puntos de acción urgente. 🎉")}
      </div>
    </div>`;

  graficaApilada("grafica-vidrio-mes", meses.map(etiquetaMes), [
    { etiqueta: "Ligero (1)", datos: serieNivel(1), color: COLOR_CUMPLE },
    { etiqueta: "Medio (2)", datos: serieNivel(2), color: COLOR_MEDIO },
    { etiqueta: "Urgente (3)", datos: serieNivel(3), color: COLOR_NO_CUMPLE },
  ]);
  const urgentesMes = serieNivel(3);
  return { urgentes: r.niveles[3], inspecciones: r.inspecciones, porMes: Object.fromEntries(meses.map((m, i) => [m, urgentesMes[i]])) };
}

function renderHisopado(registros, meses) {
  const r = calcularHisopado(registros);
  const meta = METAS_INDICADORES.hisopado;
  const porMes = agruparPorMes(registros, (x) => x.fecha);
  const tendencia = meses.map((m) => {
    const lista = porMes[m] || [];
    return porcentaje(lista.filter((h) => h.desviacion !== true).length, lista.length);
  });

  document.getElementById("panel-hisopado").innerHTML = `
    <div class="kpis">
      ${kpiHtml(textoPct(r.porcentaje), "Análisis dentro del límite", textoMeta(meta), claseValor(r.porcentaje, meta), { pct: r.porcentaje, meta })}
      ${kpiHtml(r.total, "Análisis realizados")}
      ${kpiHtml(r.desviaciones.length, "Desviaciones")}
    </div>
    <div class="grid-2">
      <div class="tarjeta">
        <h3>Tendencia mensual</h3>
        <canvas id="grafica-hisopado-mes"></canvas>
      </div>
      <div class="tarjeta">
        <h3>Por tipo de muestra</h3>
        ${tablaHtml(["Tipo", "Análisis", "Dentro del límite", "%"], r.porTipo.map(([tipo, c]) => {
          const pct = porcentaje(c.dentro, c.total);
          return `<tr><td>${escHtml(tipo)}</td><td>${c.total}</td><td>${c.dentro}</td><td class="${claseValor(pct, meta)}">${textoPct(pct)}</td></tr>`;
        }))}
      </div>
    </div>
    <div class="tarjeta">
      <h3>Desviaciones</h3>
      ${tablaHtml(["Fecha", "Superficie", "Área / máquina", "Resultado", "Límite"], r.desviaciones.map((h) =>
        `<tr><td>${escHtml(h.fecha)} · T${escHtml(h.turno)}</td><td>${escHtml(h.zonaNombre)}</td><td>${escHtml(h.areaMaquina)}</td><td class="ind-bajo">${escHtml(h.resultado)} ${escHtml(h.unidad || "")}</td><td>${escHtml(h.limiteMin ?? "")}–${escHtml(h.limiteMax ?? "")}</td></tr>`), "Sin desviaciones en el período. 🎉")}
    </div>`;

  graficaPorcentajeConMeta("grafica-hisopado-mes", meses.map(etiquetaMes), tendencia, meta, "Dentro del límite");
  return { final: r.porcentaje, total: r.total, porMes: Object.fromEntries(meses.map((m, i) => [m, tendencia[i]])) };
}

/** Cantidad de reportes de hallazgos por mes (colección "reportes"). */
function renderReportesPorMes(todosReportes, meses) {
  const porMes = agruparPorMes(todosReportes, fechaReporteISO);
  const validados = meses.map((m) => (porMes[m] || []).filter((r) => r.estado === "validado").length);
  const pendientes = meses.map((m, i) => (porMes[m] || []).length - validados[i]);
  graficaApilada("grafica-reportes-mes", meses.map(etiquetaMes), [
    { etiqueta: "Validados", datos: validados, color: COLOR_SERIE },
    { etiqueta: "Pendientes", datos: pendientes, color: COLOR_ACENTO },
  ]);
  return { total: todosReportes.length, porMes: Object.fromEntries(meses.map((m, i) => [m, validados[i] + pendientes[i]])) };
}

function renderResumen(res, meses) {
  // esPct distingue los indicadores en % (con medidor y meta opcional) de
  // los conteos (puntos urgentes, reportes).
  const celda = (valor, esPct, meta) => (esPct ? `<td class="${claseValor(valor, meta)}">${textoPct(valor)}</td>` : `<td>${valor ?? "–"}</td>`);
  const kpi = (clave, titulo, valorFn, esPct, meta) => {
    const r = res[clave];
    if (!r) return kpiHtml("–", titulo, "Sin acceso");
    const v = valorFn(r);
    return esPct
      ? kpiHtml(textoPct(v), titulo, textoMeta(meta), claseValor(v, meta), { pct: v, meta })
      : kpiHtml(v ?? "–", titulo);
  };
  const porMes = (clave, mes) => (res[clave] ? res[clave].porMes[mes] ?? null : null);

  document.getElementById("resumen-kpis").innerHTML = [
    kpi("ppr", "PPRs · SIG-FO-115", (r) => r.final, true, METAS_INDICADORES.ppr),
    kpi("contenedores", "Contenedores liberados", (r) => r.final, true, METAS_INDICADORES.contenedores),
    kpi("imprentas", "Imprentas · SIG-FO-101", (r) => r.final, true, METAS_INDICADORES.imprentas),
    kpi("bpm", "BPM · SIG-FO-116", (r) => r.final, true, METAS_INDICADORES.bpm),
    kpi("hisopado", "Hisopados en límite", (r) => r.final, true, METAS_INDICADORES.hisopado),
    kpi("vidrio", "Vidrio: puntos urgentes", (r) => r.urgentes),
    kpi("reportes", "Reportes de hallazgos", (r) => r.total),
  ].join("");

  document.getElementById("resumen-tabla-mes").innerHTML = tablaHtml(
    ["Mes", "PPRs", "Contenedores", "Imprentas", "BPM", "Hisopado", "Vidrio urgentes", "Reportes"],
    meses.map((m) => `<tr><td><strong>${etiquetaMes(m)}</strong></td>
      ${celda(porMes("ppr", m), true, METAS_INDICADORES.ppr)}
      ${celda(porMes("contenedores", m), true, METAS_INDICADORES.contenedores)}
      ${celda(porMes("imprentas", m), true, METAS_INDICADORES.imprentas)}
      ${celda(porMes("bpm", m), true, METAS_INDICADORES.bpm)}
      ${celda(porMes("hisopado", m), true, METAS_INDICADORES.hisopado)}
      ${celda(porMes("vidrio", m))}
      ${celda(porMes("reportes", m))}</tr>`)
  );
}

// ---------------------------------------------------------------------------
// PUNTO DE ENTRADA: carga y pinta todos los módulos del rango.
// ---------------------------------------------------------------------------
/**
 * @param {string} desdeISO "aaaa-mm-dd"
 * @param {string} hastaISO "aaaa-mm-dd"
 * @param {Array} todosReportes reportes del rango (ya cargados por el Dashboard)
 * @param {{incluirBorradores:boolean}} opciones
 */
async function cargarIndicadores(desdeISO, hastaISO, todosReportes, opciones = {}) {
  const meses = mesesEnRango(desdeISO, hastaISO);
  const resultados = {};
  const ejecutar = async (clave, idPanel, fn) => {
    try {
      resultados[clave] = await fn();
    } catch (err) {
      pintarError(idPanel, err);
    }
  };

  ["panel-ppr", "panel-contenedores", "panel-imprentas", "panel-bpm", "panel-vidrio", "panel-hisopado"].forEach((id) => {
    document.getElementById(id).innerHTML = `<div class="tarjeta"><p class="ayuda">Cargando…</p></div>`;
  });

  await Promise.all([
    ejecutar("ppr", "panel-ppr", async () => {
      const datos = await cargarDatosPPR(desdeISO, hastaISO);
      const total = datos.recorridos.length;
      if (!opciones.incluirBorradores) datos.recorridos = datos.recorridos.filter((r) => r.estado === "enviada");
      datos.excluidos = total - datos.recorridos.length;
      return renderPPR(datos, meses);
    }),
    ejecutar("contenedores", "panel-contenedores", async () =>
      renderContenedores(await consultarRangoISO("verificaciones_transporte", "fecha", desdeISO, hastaISO), meses)),
    ejecutar("imprentas", "panel-imprentas", async () =>
      renderImprentas(await consultarRangoISO("liberaciones", "fecha", desdeISO, hastaISO), meses)),
    ejecutar("bpm", "panel-bpm", async () => renderBpm(await cargarDatosBpm(desdeISO, hastaISO), meses)),
    ejecutar("vidrio", "panel-vidrio", async () =>
      renderVidrio(await consultarRangoISO("registrosVidrio", "fecha", desdeISO, hastaISO), meses)),
    ejecutar("hisopado", "panel-hisopado", async () =>
      renderHisopado(await consultarRangoISO("hisopados", "fecha", desdeISO, hastaISO), meses)),
  ]);
  resultados.reportes = renderReportesPorMes(todosReportes, meses);
  renderResumen(resultados, meses);
}
