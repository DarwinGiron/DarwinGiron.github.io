// ============================================================================
// EXPORTAR-EXCEL.JS - Descarga en Excel de lo que muestra el Dashboard
// ============================================================================
// Exporta, para el período cargado en el Dashboard, cada módulo en un libro
// de Excel (.xlsx) con:
//   - una hoja de resumen: indicadores, tablas por mes / por área y las
//     gráficas de cumplimiento (como imagen);
//   - la base de datos completa del período: una fila por registro (o por
//     punto evaluado), con filtros, lista para tablas dinámicas.
// Desde la pestaña "Resumen" se descarga todo junto en un solo libro.
//
// Usa exactamente los registros que el Dashboard ya cargó de Firestore
// (datosIndicadores en js/indicadores.js y los reportes del período): no
// hace consultas nuevas, así el Excel coincide con lo que se ve en pantalla.
//
// La librería ExcelJS (~900 KB) se carga solo al presionar el botón.
// Las gráficas se generan con Chart.js en un lienzo oculto y se insertan
// como imagen PNG; ExcelJS no puede crear gráficas nativas de Excel.
// ============================================================================

const URL_EXCELJS = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";

const XL = {
  tinta: "FF222222",
  gris: "FF6A6A6A",
  linea: "FFDDDDDD",
  suave: "FFF7F7F7",
  blanco: "FFFFFFFF",
  rojo: "FFC13515",
};

const BORDE_FINO = {
  top: { style: "thin", color: { argb: XL.linea } },
  bottom: { style: "thin", color: { argb: XL.linea } },
  left: { style: "thin", color: { argb: XL.linea } },
  right: { style: "thin", color: { argb: XL.linea } },
};

const NIVELES_VIDRIO = { 1: "Riesgo ligero", 2: "Riesgo medio", 3: "Acción urgente" };
const RESPUESTA_PPR = { cumple: "Cumple", no_cumple: "No cumple", na: "No aplica" };
const SIMBOLO_PPR = { cumple: "✔", no_cumple: "✘", na: "N/A" };
const RESPUESTA_BPM = { SI: "Sí", NO: "No", NA: "No aplica" };

// Qué exporta cada pestaña del Dashboard.
const EXPORTACIONES = {
  resumen: { nombre: "Todo el período", archivo: "Indicadores", hojas: hojasTodo },
  ppr: { nombre: "PPRs", archivo: "PPRs_SIG-FO-115", hojas: hojasPPR, datos: "ppr" },
  contenedores: { nombre: "Contenedores", archivo: "Contenedores", hojas: hojasContenedores, datos: "contenedores" },
  imprentas: { nombre: "Imprentas", archivo: "Imprentas_SIG-FO-101", hojas: hojasImprentas, datos: "imprentas" },
  bpm: { nombre: "BPM", archivo: "BPM_SIG-FO-116", hojas: hojasBpm, datos: "bpm" },
  vidrio: { nombre: "Vidrio y plástico", archivo: "Vidrio_SIG-FO-111", hojas: hojasVidrio, datos: "vidrio" },
  hisopado: { nombre: "Hisopado", archivo: "Hisopado", hojas: hojasHisopado, datos: "hisopado" },
  reportes: { nombre: "Hallazgos", archivo: "Hallazgos", hojas: hojasHallazgos, datos: "reportes" },
};

// ---------------------------------------------------------------------------
// CARGA DE LA LIBRERÍA Y DESCARGA
// ---------------------------------------------------------------------------
let _promesaExcelJS = null;
function cargarExcelJS() {
  if (window.ExcelJS) return Promise.resolve();
  if (_promesaExcelJS) return _promesaExcelJS;
  _promesaExcelJS = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = URL_EXCELJS;
    s.onload = resolve;
    s.onerror = () => {
      _promesaExcelJS = null;
      reject(new Error("No se pudo cargar la librería de Excel. Revisa tu conexión a internet."));
    };
    document.head.appendChild(s);
  });
  return _promesaExcelJS;
}

/**
 * Genera y descarga el Excel de la pestaña indicada.
 * @param {string} panel clave de la pestaña ("resumen", "ppr", ...)
 */
async function exportarExcel(panel) {
  const def = EXPORTACIONES[panel];
  if (!def) throw new Error("Esta pestaña no tiene exportación.");
  const d = datosIndicadores;
  if (!d || !d.listo) throw new Error("Espera a que terminen de cargar los datos del período.");
  if (def.datos && d[def.datos] === undefined) {
    throw new Error(`No se pudieron cargar los datos de ${def.nombre} (revisa el aviso en la pestaña).`);
  }

  await cargarExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Dashboard COGUSA SGI";
  wb.created = new Date();
  await def.hojas(wb, d, "");

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Dashboard_${def.archivo}_${d.desdeISO}_a_${d.hastaISO}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------------------------------------------------------------------------
// UTILIDADES DE HOJA
// ---------------------------------------------------------------------------
function fechaCorta(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function textoPeriodoExcel(d) {
  return `Período: ${fechaCorta(d.desdeISO)} al ${fechaCorta(d.hastaISO)} · Generado el ${new Date().toLocaleString("es-GT")}`;
}

/** Fecha ISO "aaaa-mm-dd" como fecha de Excel (sin desfase por zona horaria). */
function fechaExcel(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || null;
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

/** Timestamp de Firestore como fecha y hora de Excel, en la hora local de quien exporta. */
function fechaHoraExcel(ts) {
  const f = ts?.toDate ? ts.toDate() : null;
  if (!f) return null;
  return new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate(), f.getHours(), f.getMinutes()));
}

function nombreHoja(prefijo, nombre) {
  return (prefijo + nombre).replace(/[\\/?*[\]:]/g, "-").slice(0, 31);
}

const pct = (valor) => ({ valor, tipo: "pct" });

/** % exacto (el redondeo lo pone el formato de la celda). */
const ratio = (parte, total) => (total > 0 ? (parte / total) * 100 : null);

function nuevaHoja(wb, prefijo, nombre, titulo, d) {
  const ws = wb.addWorksheet(nombreHoja(prefijo, nombre), { views: [{ showGridLines: false }] });
  const t = ws.getCell(1, 1);
  t.value = titulo;
  t.font = { bold: true, size: 16, color: { argb: XL.tinta } };
  const s = ws.getCell(2, 1);
  s.value = textoPeriodoExcel(d);
  s.font = { size: 10, color: { argb: XL.gris } };
  ws.getColumn(1).width = 34;
  return ws;
}

function escribirCelda(celda, valor, tipo, ligero) {
  if (valor && typeof valor === "object" && !(valor instanceof Date)) {
    tipo = valor.tipo;
    valor = valor.valor;
  }
  if (valor === null || valor === undefined || valor === "") {
    celda.value = null;
  } else if (tipo === "pct") {
    celda.value = typeof valor === "number" ? valor / 100 : null;
    celda.numFmt = "0.0%";
  } else if (tipo === "fecha") {
    celda.value = valor;
    celda.numFmt = "dd/mm/yyyy";
  } else if (tipo === "fechaHora") {
    celda.value = valor;
    celda.numFmt = "dd/mm/yyyy hh:mm";
  } else {
    celda.value = valor;
  }
  if (!ligero) {
    celda.border = BORDE_FINO;
    celda.alignment = { vertical: "top", wrapText: tipo === "largo" };
  }
}

/**
 * Escribe una tabla con encabezado oscuro.
 * @param columnas [{ titulo, ancho, tipo: "pct"|"fecha"|"fechaHora"|"largo"|undefined }]
 * @param filas arreglos de valores; un valor puede ser { valor, tipo } para cambiar su formato
 * @returns la siguiente fila libre (dejando una en blanco)
 */
function escribirTabla(ws, fila, col, columnas, filas, opciones = {}) {
  if (opciones.titulo) {
    const c = ws.getCell(fila, col);
    c.value = opciones.titulo;
    c.font = { bold: true, size: 12, color: { argb: XL.tinta } };
    fila++;
  }
  const filaEncabezado = fila;
  columnas.forEach((def, i) => {
    const c = ws.getCell(fila, col + i);
    c.value = def.titulo;
    c.font = { bold: true, color: { argb: XL.blanco } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.tinta } };
    c.alignment = { vertical: "middle", wrapText: true };
    c.border = BORDE_FINO;
    const columna = ws.getColumn(col + i);
    if (def.ancho && (columna.width || 0) < def.ancho) columna.width = def.ancho;
  });
  filas.forEach((valores, k) => {
    valores.forEach((v, i) => escribirCelda(ws.getCell(fila + 1 + k, col + i), v, columnas[i]?.tipo, opciones.ligero));
  });
  if (!filas.length) {
    const c = ws.getCell(fila + 1, col);
    c.value = opciones.vacio || "Sin registros en el período.";
    c.font = { italic: true, color: { argb: XL.gris } };
  }
  const ultima = fila + Math.max(filas.length, 1);
  if (opciones.autoFiltro && filas.length) {
    ws.autoFilter = { from: { row: filaEncabezado, column: col }, to: { row: ultima, column: col + columnas.length - 1 } };
  }
  if (opciones.congelar) ws.views = [{ state: "frozen", ySplit: filaEncabezado, xSplit: opciones.congelarColumnas || 0, showGridLines: false }];
  return ultima + 2;
}

/** Hoja de base de datos: encabezado en la fila 4, filtros y encabezado fijo. */
function hojaBaseDatos(wb, prefijo, nombre, titulo, d, columnas, filas) {
  const ws = nuevaHoja(wb, prefijo, nombre, titulo, d);
  ws.getCell(3, 1).value = `${filas.length} registro(s)`;
  ws.getCell(3, 1).font = { size: 10, color: { argb: XL.gris } };
  escribirTabla(ws, 4, 1, columnas, filas, { autoFiltro: true, congelar: true, ligero: filas.length > 3000 });
  return ws;
}

/** Inserta varias gráficas una debajo de otra a partir de (fila, col). */
async function insertarGraficas(wb, ws, fila, col, graficas) {
  // Una misma gráfica en dos hojas se genera e incrusta una sola vez.
  wb._imagenesDashboard = wb._imagenesDashboard || new Map();
  for (const g of graficas) {
    let img = wb._imagenesDashboard.get(g);
    if (!img) {
      const { url, ancho, alto } = await imagenGrafica(g.config, g.titulo);
      img = { id: wb.addImage({ base64: url, extension: "png" }), ancho: 640, alto: Math.round(640 * alto / ancho) };
      wb._imagenesDashboard.set(g, img);
    }
    ws.addImage(img.id, { tl: { col: col - 1, row: fila - 1 }, ext: { width: img.ancho, height: img.alto } });
    fila += Math.ceil(img.alto / 20) + 2;
  }
  return fila;
}

// ---------------------------------------------------------------------------
// GRÁFICAS COMO IMAGEN
// ---------------------------------------------------------------------------
const FONDO_BLANCO = {
  id: "fondoBlanco",
  beforeDraw(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  },
};

// En una imagen no hay "tooltip": cada barra lleva escrito su valor (en las
// apiladas, el total arriba de la columna).
const ETIQUETAS_VALOR = {
  id: "etiquetasValor",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const horizontal = chart.options.indexAxis === "y";
    const esPct = chart.options.plugins?.etiquetasValor?.pct === true;
    const barras = chart.data.datasets
      .map((ds, i) => ({ ds, meta: chart.getDatasetMeta(i) }))
      .filter(({ ds, meta }) => (ds.type || chart.config.type) === "bar" && !meta.hidden);
    if (!barras.length) return;
    ctx.save();
    ctx.fillStyle = "#222222";
    ctx.font = "600 12px 'Nunito Sans', system-ui, sans-serif";
    chart.data.labels.forEach((_, i) => {
      const total = barras.reduce((s, { ds }) => s + (Number(ds.data[i]) || 0), 0);
      const valores = barras.map(({ ds }) => ds.data[i]).filter((v) => v !== null && v !== undefined);
      if (!valores.length || (!esPct && total === 0)) return;
      const texto = esPct ? textoPct(barras.length === 1 ? valores[0] : total) : String(total);
      // La barra más alejada del eje es la última dibujada de la pila.
      const el = barras[barras.length - 1].meta.data[i];
      if (!el) return;
      if (horizontal) {
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(texto, el.x + 6, el.y);
      } else {
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(texto, el.x, el.y - 4);
      }
    });
    ctx.restore();
  },
};

/** Con muchas categorías (p. ej. 17 procesos) las barras horizontales dejan leer los nombres. */
function aHorizontal(config) {
  const { x = {}, y = {} } = config.options.scales || {};
  return {
    ...config,
    options: { ...config.options, indexAxis: "y", scales: { x: { ...y, grid: { display: true } }, y: { ...x, grid: { display: false } } } },
  };
}

/** Dibuja una configuración de Chart.js en un lienzo oculto y devuelve el PNG (data URL). */
async function imagenGrafica(config, titulo) {
  const categorias = config.data.labels.length;
  const horizontal = categorias > 6;
  const cfg = horizontal ? aHorizontal(config) : config;
  const ancho = 960;
  const alto = horizontal ? Math.max(450, 90 + categorias * 34) : 450;
  const contenedor = document.createElement("div");
  contenedor.style.cssText = `position:fixed;left:-10000px;top:0;width:${ancho}px;height:${alto}px;`;
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  contenedor.appendChild(canvas);
  document.body.appendChild(contenedor);
  try {
    const escalaValor = horizontal ? "x" : "y";
    const escalas = { ...cfg.options.scales };
    const esPct = escalas[escalaValor]?.max === 100;
    // Espacio para la etiqueta de la barra más larga/alta.
    if (esPct) escalas[escalaValor] = { ...escalas[escalaValor], max: horizontal ? 110 : 108, ticks: { ...escalas[escalaValor].ticks, callback: (v) => (v <= 100 ? v + "%" : "") } };
    else escalas[escalaValor] = { ...escalas[escalaValor], grace: "12%" };
    const chart = new Chart(canvas.getContext("2d"), {
      ...cfg,
      options: {
        ...cfg.options,
        scales: escalas,
        responsive: false,
        animation: false,
        devicePixelRatio: 2,
        layout: { padding: { top: 8, right: 24, bottom: 8, left: 8 } },
        plugins: {
          ...cfg.options.plugins,
          etiquetasValor: { pct: esPct },
          title: { display: true, text: titulo, color: "#222222", font: { size: 16, weight: "bold" }, align: "start", padding: { bottom: 16 } },
        },
      },
      plugins: [FONDO_BLANCO, ETIQUETAS_VALOR],
    });
    const url = chart.toBase64Image("image/png", 1);
    chart.destroy();
    return { url, ancho, alto };
  } finally {
    contenedor.remove();
  }
}

// ---------------------------------------------------------------------------
// SIG-FO-115 — PPRs
// ---------------------------------------------------------------------------
function ordenarRecorridos(recorridos) {
  return [...recorridos].sort((a, b) =>
    String(a.fechaInspeccion).localeCompare(String(b.fechaInspeccion)) ||
    Number(a.turno || 0) - Number(b.turno || 0) ||
    String(a.inspectorNombre || "").localeCompare(String(b.inspectorNombre || "")));
}

async function hojasPPR(wb, d, prefijo) {
  const datos = d.ppr;
  const r = calcularCumplimientoPPR(datos);
  const porMes = agruparPorMes(datos.recorridos, (x) => x.fechaInspeccion);
  const tendencia = d.meses.map((m) => (porMes[m] ? calcularCumplimientoPPR({ ...datos, recorridos: porMes[m] }).final : null));
  const meta = METAS_INDICADORES.ppr;
  const graficaProcesos = {
    titulo: "Cumplimiento por proceso",
    config: configPorcentaje(r.procesos.map((p) => p.nombre), r.procesos.map((p) => p.porcentaje), meta, "Cumplimiento"),
  };

  // --- Resumen
  const ws = nuevaHoja(wb, prefijo, "Resumen PPRs", "SIG-FO-115 · Cumplimiento de PPRs", d);
  const turnos = Object.keys(r.porTurno).sort();
  let fila = escribirTabla(ws, 4, 1, [{ titulo: "Indicador", ancho: 34 }, { titulo: "Valor", ancho: 14 }], [
    ["Cumplimiento final", pct(r.final)],
    ["Recorridos considerados", datos.recorridos.length],
    ["Borradores excluidos", datos.excluidos || 0],
    ["Aspectos evaluados (✔ + ✘)", r.totalEvaluados],
    ["Cumple (✔)", r.totalSi],
    ["No cumple (✘)", r.totalEvaluados - r.totalSi],
    ...turnos.map((t) => [`Cumplimiento turno #${t}`, pct(ratio(r.porTurno[t].si, r.porTurno[t].total))]),
  ]);
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Mes" }, { titulo: "Cumplimiento", tipo: "pct" }],
    d.meses.map((m, i) => [etiquetaMes(m), tendencia[i]]), { titulo: "Cumplimiento por mes" });
  escribirTabla(ws, fila, 1, [{ titulo: "Proceso — aspecto que no cumple", tipo: "largo" }, { titulo: "Veces" }],
    r.topFallas.map(([texto, veces]) => [texto, veces]), { titulo: "Top 10 aspectos que no cumplen", vacio: "Sin incumplimientos en el período." });
  ws.getColumn(1).width = 60;
  await insertarGraficas(wb, ws, 4, 4, [
    graficaProcesos,
    { titulo: "Cumplimiento por mes", config: configPorcentaje(d.meses.map(etiquetaMes), tendencia, meta, "Cumplimiento") },
  ]);

  // --- Resultado por proceso (como la hoja "Resultado" del consolidado)
  const wr = nuevaHoja(wb, prefijo, "Resultado por proceso", "SIG-FO-115 · Resultado por proceso", d);
  const columnas = [
    { titulo: "Proceso", ancho: 34 }, { titulo: "Cuestión", ancho: 36 }, { titulo: "Resultado individual", ancho: 14, tipo: "pct" },
    { titulo: "Total del proceso", ancho: 14, tipo: "pct" }, { titulo: "Cumple (✔)", ancho: 11 }, { titulo: "Evaluados", ancho: 11 },
  ];
  const filas = [];
  const grupos = [];
  r.procesos.forEach((p) => {
    grupos.push({ desde: filas.length, hasta: filas.length + p.cuestiones.length - 1 });
    p.cuestiones.forEach((c, i) => filas.push([i === 0 ? p.nombre : "", c.titulo, c.porcentaje, i === 0 ? p.porcentaje : null, c.si, c.evaluados]));
  });
  if (filas.length) filas.push(["% DE CUMPLIMIENTO DEL PERÍODO", "", null, r.final, r.totalSi, r.totalEvaluados]);
  const sigFila = escribirTabla(wr, 4, 1, columnas, filas, { vacio: "Sin recorridos en el período." });
  grupos.forEach((g) => {
    if (g.hasta > g.desde) {
      wr.mergeCells(5 + g.desde, 1, 5 + g.hasta, 1);
      wr.mergeCells(5 + g.desde, 4, 5 + g.hasta, 4);
    }
    wr.getCell(5 + g.desde, 1).font = { bold: true };
    wr.getCell(5 + g.desde, 4).font = { bold: true };
  });
  if (filas.length) {
    const ultima = 4 + filas.length;
    wr.mergeCells(ultima, 1, ultima, 3);
    for (let c = 1; c <= 6; c++) {
      wr.getCell(ultima, c).font = { bold: true };
      wr.getCell(ultima, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.suave } };
    }
  }
  wr.getCell(sigFila, 1).value = "% aspecto = ✔ / evaluados en el período; cada cuestión promedia sus aspectos, cada proceso promedia sus cuestiones y el final promedia los procesos.";
  wr.getCell(sigFila, 1).font = { size: 9, italic: true, color: { argb: XL.gris } };
  await insertarGraficas(wb, wr, 4, 8, [graficaProcesos]);

  hojaTablaDatosPPR(wb, prefijo, d, r);
  hojaBaseDatosPPR(wb, prefijo, d);
}

/** Matriz aspecto × recorrido (✔ / ✘ / N/A), igual a la "Tabla de Datos" del consolidado. */
function hojaTablaDatosPPR(wb, prefijo, d, r) {
  const { recorridos, aspectos, secciones } = d.ppr;
  const columnasRec = ordenarRecorridos(recorridos);
  const ordenAspecto = new Map([...aspectos.keys()].map((id, i) => [id, i]));
  const ordenProceso = new Map(r.procesos.map((p, i) => [p.areaId, i]));

  // estructura[areaId][seccionId] = Set(aspectoId), con todo lo respondido (incluido N/A)
  const estructura = {};
  const nombres = {};
  recorridos.forEach((rec) => Object.entries(rec.areas || {}).forEach(([areaId, area]) => {
    nombres[areaId] = nombres[areaId] || area.areaNombre || areaId;
    Object.entries(area.respuestas || {}).forEach(([aspectoId, resp]) => {
      if (!resp || !SIMBOLO_PPR[resp.valor]) return;
      const seccionId = aspectos.get(aspectoId)?.seccionId || "_otros";
      ((estructura[areaId] = estructura[areaId] || {})[seccionId] = estructura[areaId][seccionId] || new Set()).add(aspectoId);
    });
  }));

  const ws = nuevaHoja(wb, prefijo, "Tabla de datos", "SIG-FO-115 · Tabla de datos (todo lo evaluado)", d);
  const fijas = ["Proceso", "Cuestión", "Aspecto a evaluar"];
  const finales = ["Evaluados", "Conteo ✔", "% Aspecto"];
  const totalCols = fijas.length + columnasRec.length + finales.length;
  const estiloEnc = (c) => {
    c.font = { bold: true, color: { argb: XL.blanco }, size: 9 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.tinta } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  };
  // Tres filas de encabezado: fecha, turno, inspector.
  for (let f = 4; f <= 6; f++) for (let c = 1; c <= totalCols; c++) estiloEnc(ws.getCell(f, c));
  fijas.forEach((t, i) => { ws.getCell(4, i + 1).value = t; ws.mergeCells(4, i + 1, 6, i + 1); });
  columnasRec.forEach((rec, i) => {
    const c = fijas.length + 1 + i;
    ws.getCell(4, c).value = fechaExcel(rec.fechaInspeccion);
    ws.getCell(4, c).numFmt = "dd/mm";
    ws.getCell(5, c).value = `T${rec.turno || "?"}`;
    ws.getCell(6, c).value = rec.inspectorNombre || "";
    ws.getColumn(c).width = 6.5;
  });
  finales.forEach((t, i) => {
    const c = fijas.length + columnasRec.length + 1 + i;
    ws.getCell(4, c).value = t;
    ws.mergeCells(4, c, 6, c);
    ws.getColumn(c).width = 10;
  });
  ws.getRow(6).height = 42;
  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 26;
  ws.getColumn(3).width = 60;

  let fila = 7;
  Object.keys(estructura)
    .sort((a, b) => (ordenProceso.get(a) ?? 999) - (ordenProceso.get(b) ?? 999) || nombres[a].localeCompare(nombres[b]))
    .forEach((areaId) => {
      Object.keys(estructura[areaId])
        .sort((a, b) => (secciones.get(a)?.orden ?? 999) - (secciones.get(b)?.orden ?? 999))
        .forEach((seccionId) => {
          [...estructura[areaId][seccionId]]
            .sort((a, b) => (ordenAspecto.get(a) ?? 1e9) - (ordenAspecto.get(b) ?? 1e9))
            .forEach((aspectoId) => {
              let si = 0, total = 0;
              ws.getCell(fila, 1).value = nombres[areaId];
              ws.getCell(fila, 2).value = secciones.get(seccionId)?.titulo || "Otros";
              ws.getCell(fila, 3).value = aspectos.get(aspectoId)?.texto || aspectoId;
              columnasRec.forEach((rec, i) => {
                const valor = rec.areas?.[areaId]?.respuestas?.[aspectoId]?.valor;
                if (!SIMBOLO_PPR[valor]) return;
                const c = ws.getCell(fila, fijas.length + 1 + i);
                c.value = SIMBOLO_PPR[valor];
                c.alignment = { horizontal: "center" };
                if (valor === "no_cumple") c.font = { bold: true, color: { argb: XL.rojo } };
                if (valor === "cumple") si++;
                if (valor !== "na") total++;
              });
              const base = fijas.length + columnasRec.length;
              ws.getCell(fila, base + 1).value = total;
              ws.getCell(fila, base + 2).value = si;
              if (total) {
                ws.getCell(fila, base + 3).value = si / total;
                ws.getCell(fila, base + 3).numFmt = "0.0%";
              }
              fila++;
            });
        });
    });
  if (fila === 7) ws.getCell(7, 1).value = "Sin recorridos en el período.";
  else ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: fila - 1, column: totalCols } };
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 6, showGridLines: false }];
}

/** Una fila por respuesta: la base de datos completa del período. */
function hojaBaseDatosPPR(wb, prefijo, d) {
  const { aspectos, secciones } = d.ppr;
  const filas = [];
  ordenarRecorridos(d.ppr.recorridos).forEach((rec) => {
    Object.entries(rec.areas || {}).forEach(([areaId, area]) => {
      Object.entries(area.respuestas || {}).forEach(([aspectoId, resp]) => {
        if (!resp || !RESPUESTA_PPR[resp.valor]) return;
        const info = aspectos.get(aspectoId);
        filas.push([
          fechaExcel(rec.fechaInspeccion), rec.turno ?? "", rec.inspectorNombre || "", rec.estado === "enviada" ? "Terminado" : "Borrador",
          area.areaNombre || areaId, secciones.get(info?.seccionId)?.titulo || "Otros", info?.texto || aspectoId,
          RESPUESTA_PPR[resp.valor], resp.observacion || "", area.comentarios || "",
        ]);
      });
    });
  });
  hojaBaseDatos(wb, prefijo, "Base de datos", "SIG-FO-115 · Base de datos de respuestas", d, [
    { titulo: "Fecha", ancho: 12, tipo: "fecha" }, { titulo: "Turno", ancho: 8 }, { titulo: "Inspector", ancho: 24 },
    { titulo: "Recorrido", ancho: 12 }, { titulo: "Proceso", ancho: 28 }, { titulo: "Cuestión", ancho: 30 },
    { titulo: "Aspecto", ancho: 60 }, { titulo: "Resultado", ancho: 12 }, { titulo: "Observación", ancho: 40 },
    { titulo: "Comentarios del proceso", ancho: 40 },
  ], filas);
}

// ---------------------------------------------------------------------------
// CONTENEDORES — Verificación de transporte
// ---------------------------------------------------------------------------
async function hojasContenedores(wb, d, prefijo) {
  const registros = [...d.contenedores].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const r = calcularContenedores(registros);
  // Empresa unificada ("Oliva" y "OLIVA" salen igual); la original queda al lado.
  const nombres = nombresProveedores(registros);
  const empresa = (x) => nombres.get(claveProveedor(x.transporte)) || "";
  const porMes = agruparPorMes(registros, (x) => x.fecha);
  const filasMes = d.meses.map((m) => {
    const lista = porMes[m] || [];
    const aprob = lista.filter(contenedorAprobado).length;
    return [etiquetaMes(m), lista.length, aprob, lista.length - aprob, pct(ratio(aprob, lista.length))];
  });

  const ws = nuevaHoja(wb, prefijo, "Resumen contenedores", "Liberación de contenedores · Verificación de transporte", d);
  let fila = escribirTabla(ws, 4, 1, [{ titulo: "Indicador", ancho: 34 }, { titulo: "Valor", ancho: 14 }], [
    ["Contenedores liberados (aprobados)", pct(r.porcentaje)],
    ["Verificaciones", r.total],
    ["Aprobados", r.aprobados],
    ["Rechazados", r.rechazados],
    ["Cumplimiento promedio del checklist", pct(r.promedioChecklist)],
  ]);
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Mes" }, { titulo: "Verificaciones", ancho: 14 }, { titulo: "Aprobados", ancho: 12 }, { titulo: "Rechazados", ancho: 12 }, { titulo: "% liberación", ancho: 12 }],
    filasMes, { titulo: "Por mes" });
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Empresa de transporte" }, { titulo: "Verificaciones" }, { titulo: "Aprobados" }, { titulo: "% liberación", tipo: "pct" }],
    r.porEmpresa.map(([emp, c]) => [emp, c.total, c.aprobados, ratio(c.aprobados, c.total)]), { titulo: "Por empresa de transporte" });
  escribirTabla(ws, fila, 1, [{ titulo: "Zona — punto que no cumple", tipo: "largo" }, { titulo: "Veces" }],
    r.topFallas.map(([t, v]) => [t, v]), { titulo: "Top 10 puntos que no cumplen", vacio: "Sin incumplimientos en el período." });
  ws.getColumn(1).width = 50;
  await insertarGraficas(wb, ws, 4, 7, [{
    titulo: "Contenedores aprobados y rechazados por mes",
    config: configApilada(d.meses.map(etiquetaMes), [
      { etiqueta: "Aprobados", datos: filasMes.map((f) => f[2]), color: COLOR_CUMPLE },
      { etiqueta: "Rechazados", datos: filasMes.map((f) => f[3]), color: COLOR_NO_CUMPLE },
    ]),
  }]);

  hojaBaseDatos(wb, prefijo, "Base de datos", "Verificación de transporte · Base de datos", d, [
    { titulo: "Fecha", ancho: 12, tipo: "fecha" }, { titulo: "Inspector", ancho: 22 }, { titulo: "Empresa de transporte", ancho: 26 },
    { titulo: "Empresa (como se escribió)", ancho: 26 }, { titulo: "Piloto", ancho: 22 }, { titulo: "Placa", ancho: 12 }, { titulo: "TC", ancho: 14 }, { titulo: "No. equipo", ancho: 12 },
    { titulo: "Marchamo", ancho: 12 }, { titulo: "Orden de producción", ancho: 16 }, { titulo: "Cliente", ancho: 22 },
    { titulo: "Picking", ancho: 12 }, { titulo: "Resultado", ancho: 12 }, { titulo: "% checklist", ancho: 11, tipo: "pct" },
    { titulo: "Puntos cumplidos", ancho: 10 }, { titulo: "Puntos evaluados", ancho: 10 }, { titulo: "Inspector de inocuidad", ancho: 22 },
    { titulo: "Observaciones", ancho: 40 },
  ], registros.map((x) => [
    fechaExcel(x.fecha), x.inspectorNombre || "", empresa(x), x.transporte || "", x.nombrePiloto || "", x.placaCamion || "", x.tc || "",
    x.numeroEquipo || "", x.numeroMarchamo || "", x.ordenProduccion || "", x.cliente || "", x.numeroPicking || "",
    contenedorAprobado(x) ? "Aprobado" : "Rechazado", typeof x.cumplimientoPorcentaje === "number" ? x.cumplimientoPorcentaje : null,
    x.cumplidos ?? "", x.total ?? "", x.inspectorInocuidad || "", x.observacionesGenerales || "",
  ]));

  const detalle = [];
  registros.forEach((x) => {
    const base = [fechaExcel(x.fecha), x.placaCamion || "", x.tc || "", empresa(x)];
    Object.values(x.respuestasPorZona || {}).forEach((zona) => {
      [["externa", "Exterior"], ["interna", "Interior"]].forEach(([modo, lado]) => (zona[modo] || []).forEach((p) => {
        detalle.push([...base, zona.nombre || "", lado, p.texto || "", p.valor === "si" ? "Sí" : p.valor === "no" ? "No" : p.valor || "", p.observacion || ""]);
      }));
    });
    (x.respuestasCabina || []).forEach((p) => {
      detalle.push([...base, "Cabina", "Cabina", p.texto || "", p.valor === "si" ? "Sí" : p.valor === "no" ? "No" : p.valor || "", p.observacion || ""]);
    });
  });
  hojaBaseDatos(wb, prefijo, "Detalle de puntos", "Verificación de transporte · Detalle de cada punto evaluado", d, [
    { titulo: "Fecha", ancho: 12, tipo: "fecha" }, { titulo: "Placa", ancho: 12 }, { titulo: "TC", ancho: 14 },
    { titulo: "Empresa de transporte", ancho: 26 }, { titulo: "Zona", ancho: 20 }, { titulo: "Lado", ancho: 10 },
    { titulo: "Punto", ancho: 50 }, { titulo: "Cumple", ancho: 9 }, { titulo: "Observación", ancho: 40 },
  ], detalle);
}

// ---------------------------------------------------------------------------
// IMPRENTAS — Liberación SIG-FO-101
// ---------------------------------------------------------------------------
async function hojasImprentas(wb, d, prefijo) {
  const registros = [...d.imprentas].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || Number(a.turno || 0) - Number(b.turno || 0));
  const r = calcularImprentas(registros);
  const porMes = agruparPorMes(registros, (x) => x.fecha);
  const filasMes = d.meses.map((m) => {
    const lista = porMes[m] || [];
    const conf = lista.filter(liberacionConforme).length;
    return [etiquetaMes(m), lista.length, conf, lista.length - conf, pct(ratio(conf, lista.length))];
  });

  const ws = nuevaHoja(wb, prefijo, "Resumen imprentas", "SIG-FO-101 · Liberación de imprentas", d);
  let fila = escribirTabla(ws, 4, 1, [{ titulo: "Indicador", ancho: 34 }, { titulo: "Valor", ancho: 14 }], [
    ["Liberaciones conformes", pct(r.porcentaje)],
    ["Liberaciones registradas", r.total],
    ["Conformes (todo en SÍ)", r.conformes],
    ["Con algún NO", r.noConformes],
  ]);
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Mes" }, { titulo: "Liberaciones", ancho: 13 }, { titulo: "Conformes", ancho: 12 }, { titulo: "Con algún NO", ancho: 13 }, { titulo: "% conformidad", ancho: 13 }],
    filasMes, { titulo: "Por mes" });
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Máquina" }, { titulo: "Liberaciones" }, { titulo: "Conformes" }, { titulo: "% conformidad", tipo: "pct" }],
    r.porMaquina.map(([m, c]) => [m, c.total, c.conformes, ratio(c.conformes, c.total)]), { titulo: "Por máquina" });
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Turno" }, { titulo: "Liberaciones" }, { titulo: "Conformes" }, { titulo: "% conformidad", tipo: "pct" }],
    r.porTurno.map(([t, c]) => [`Turno #${t}`, c.total, c.conformes, ratio(c.conformes, c.total)]), { titulo: "Por turno" });
  escribirTabla(ws, fila, 1, [{ titulo: "Máquina — punto en NO", tipo: "largo" }, { titulo: "Veces" }],
    r.topFallas.map(([t, v]) => [t, v]), { titulo: "Top 10 puntos en NO", vacio: "Sin puntos en NO en el período." });
  ws.getColumn(1).width = 50;
  await insertarGraficas(wb, ws, 4, 7, [
    {
      titulo: "Liberaciones por mes",
      config: configApilada(d.meses.map(etiquetaMes), [
        { etiqueta: "Conformes", datos: filasMes.map((f) => f[2]), color: COLOR_CUMPLE },
        { etiqueta: "Con algún NO", datos: filasMes.map((f) => f[3]), color: COLOR_NO_CUMPLE },
      ]),
    },
    {
      titulo: "Conformidad por máquina",
      config: configPorcentaje(r.porMaquina.map(([m]) => m), r.porMaquina.map(([, c]) => ratio(c.conformes, c.total)), METAS_INDICADORES.imprentas, "Conformidad"),
    },
  ]);

  // Una columna por pregunta (en el orden en que aparecen), con SÍ / NO.
  const preguntas = [];
  registros.forEach((l) => (l.respuestas || []).forEach((p) => { if (!preguntas.includes(p.texto)) preguntas.push(p.texto); }));
  hojaBaseDatos(wb, prefijo, "Base de datos", "SIG-FO-101 · Base de datos de liberaciones", d, [
    { titulo: "Fecha", ancho: 12, tipo: "fecha" }, { titulo: "Turno", ancho: 8 }, { titulo: "Máquina", ancho: 22 },
    { titulo: "Orden No.", ancho: 12 }, { titulo: "Cliente", ancho: 22 }, { titulo: "Inspector", ancho: 22 },
    { titulo: "Resultado", ancho: 14 }, ...preguntas.map((t) => ({ titulo: t, ancho: 16 })), { titulo: "Observaciones", ancho: 40 },
  ], registros.map((l) => {
    const respuestas = new Map((l.respuestas || []).map((p) => [p.texto, p.valor]));
    return [
      fechaExcel(l.fecha), l.turno ?? "", l.maquina || "", l.ordenNo || "", l.cliente || "", l.inspectorNombre || "",
      liberacionConforme(l) ? "Conforme" : "Con algún NO",
      ...preguntas.map((t) => (respuestas.has(t) ? (respuestas.get(t) ? "SÍ" : "NO") : "")),
      l.observaciones || "",
    ];
  }));
}

// ---------------------------------------------------------------------------
// BPM — SIG-FO-116
// ---------------------------------------------------------------------------
async function hojasBpm(wb, d, prefijo) {
  const datos = d.bpm;
  const r = calcularBpm(datos);
  const porMesMapa = Object.fromEntries(r.porMes.map((m) => [m.mes, m]));
  const tendencia = d.meses.map((m) => porMesMapa[m]?.porcentaje ?? null);

  const ws = nuevaHoja(wb, prefijo, "Resumen BPM", "SIG-FO-116 · Auditoría de Buenas Prácticas de Manufactura", d);
  let fila = escribirTabla(ws, 4, 1, [{ titulo: "Indicador", ancho: 34 }, { titulo: "Valor", ancho: 16 }], [
    ["Cumplimiento BPM del período", pct(r.porcentaje)],
    ["Calificación", calificacionBpm(r.porcentaje)],
    ["Auditorías (meses)", r.porMes.length],
    ["Preguntas en NO", r.noCumple.length],
  ]);
  const filasSeccion = r.secciones.map((s) => [s.etiqueta, ...r.porMes.map((m) => pct(m.secciones[s.id] ?? null))]);
  if (r.porMes.length) {
    filasSeccion.push(["Cumplimiento total", ...r.porMes.map((m) => pct(m.porcentaje))]);
    filasSeccion.push(["Calificación", ...r.porMes.map((m) => calificacionBpm(m.porcentaje))]);
  }
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Sección" }, ...r.porMes.map((m) => ({ titulo: etiquetaMes(m.mes), ancho: 14 }))],
    filasSeccion, { titulo: "Resultado por sección (SÍ / (SÍ + NO))", vacio: "Sin auditorías BPM en el período." });
  ws.getCell(fila - 1, 1).value = "Calificación: ≤70% No cumple · ≤80% Regular · ≤92% Satisfactorio · >92% Excelente.";
  ws.getCell(fila - 1, 1).font = { size: 9, italic: true, color: { argb: XL.gris } };
  ws.getColumn(1).width = 40;
  await insertarGraficas(wb, ws, 4, Math.max(4, r.porMes.length + 3), [
    { titulo: "Cumplimiento BPM por mes", config: configPorcentaje(d.meses.map(etiquetaMes), tendencia, METAS_INDICADORES.bpm, "Cumplimiento") },
  ]);

  // Base de datos: una fila por pregunta respondida.
  const ordenPregunta = new Map([...datos.preguntas.keys()].map((id, i) => [id, i]));
  const filas = [];
  datos.auditorias.forEach((aud) => {
    Object.entries(aud.responses || {})
      .filter(([qid, resp]) => resp && RESPUESTA_BPM[resp.value] && datos.preguntas.get(qid)?.activa !== false)
      .sort((a, b) => (ordenPregunta.get(a[0]) ?? 1e9) - (ordenPregunta.get(b[0]) ?? 1e9) || a[0].localeCompare(b[0]))
      .forEach(([qid, resp]) => {
        const info = datos.preguntas.get(qid);
        const seccionId = info?.seccionId || qid.replace(/-\d+$/, "");
        filas.push([
          etiquetaMes(aud.id), fechaExcel(aud.meta?.fecha), aud.meta?.auditor || "", aud.meta?.area || "",
          datos.etiquetas[seccionId] || seccionId, info?.grupo || "", info?.texto || qid,
          RESPUESTA_BPM[resp.value], resp.obs || "",
        ]);
      });
  });
  hojaBaseDatos(wb, prefijo, "Base de datos", "SIG-FO-116 · Base de datos de respuestas", d, [
    { titulo: "Mes", ancho: 10 }, { titulo: "Fecha de auditoría", ancho: 14, tipo: "fecha" }, { titulo: "Auditor", ancho: 22 },
    { titulo: "Área", ancho: 18 }, { titulo: "Sección", ancho: 30 }, { titulo: "Grupo", ancho: 20 },
    { titulo: "Pregunta", ancho: 70 }, { titulo: "Respuesta", ancho: 11 }, { titulo: "Observación", ancho: 40 },
  ], filas);
}

// ---------------------------------------------------------------------------
// VIDRIO Y PLÁSTICO QUEBRADIZO — SIG-FO-111
// ---------------------------------------------------------------------------
async function hojasVidrio(wb, d, prefijo) {
  const registros = [...d.vidrio].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const r = calcularVidrio(registros);
  const porMes = agruparPorMes(registros, (x) => x.fecha);
  const nivelMes = (m, n) => (porMes[m] || []).reduce((s, reg) => s + (reg.puntos || []).filter((p) => Number(p.riesgo) === n).length, 0);
  const filasMes = d.meses.map((m) => [etiquetaMes(m), (porMes[m] || []).length, nivelMes(m, 1), nivelMes(m, 2), nivelMes(m, 3)]);

  const ws = nuevaHoja(wb, prefijo, "Resumen vidrio", "SIG-FO-111 · Vidrio y plástico quebradizo", d);
  let fila = escribirTabla(ws, 4, 1, [{ titulo: "Indicador", ancho: 34 }, { titulo: "Valor", ancho: 14 }], [
    ["Inspecciones", r.inspecciones],
    ["Puntos evaluados", r.puntos],
    ["Riesgo ligero (1)", r.niveles[1]],
    ["Riesgo medio (2)", r.niveles[2]],
    ["Acción urgente (3)", r.niveles[3]],
    ["Puntos sin acción urgente", pct(r.porcentajeSinUrgentes)],
  ]);
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Mes" }, { titulo: "Inspecciones", ancho: 13 }, { titulo: "Ligero (1)", ancho: 11 }, { titulo: "Medio (2)", ancho: 11 }, { titulo: "Urgente (3)", ancho: 11 }],
    filasMes, { titulo: "Por mes" });
  escribirTabla(ws, fila, 1, [{ titulo: "Proceso" }, { titulo: "Puntos" }, { titulo: "Ligero (1)" }, { titulo: "Medio (2)" }, { titulo: "Urgente (3)" }],
    r.porProceso.map(([p, c]) => [p, c.total, c[1], c[2], c[3]]), { titulo: "Por proceso" });
  await insertarGraficas(wb, ws, 4, 8, [{
    titulo: "Puntos por nivel de riesgo y mes",
    config: configApilada(d.meses.map(etiquetaMes), [
      { etiqueta: "Ligero (1)", datos: filasMes.map((f) => f[2]), color: COLOR_CUMPLE },
      { etiqueta: "Medio (2)", datos: filasMes.map((f) => f[3]), color: COLOR_MEDIO },
      { etiqueta: "Urgente (3)", datos: filasMes.map((f) => f[4]), color: COLOR_NO_CUMPLE },
    ]),
  }]);

  const filas = [];
  registros.forEach((x) => (x.puntos || []).forEach((p) => filas.push([
    fechaExcel(x.fecha), x.inspeccionadoPor || "", x.revisadoPor || "", p.proceso || "", p.localizacion || "",
    p.material || "", p.tipo || "", Number(p.riesgo) || "", NIVELES_VIDRIO[Number(p.riesgo)] || "", p.accion || "", x.comentarios || "",
  ])));
  hojaBaseDatos(wb, prefijo, "Base de datos", "SIG-FO-111 · Base de datos de puntos inspeccionados", d, [
    { titulo: "Fecha", ancho: 12, tipo: "fecha" }, { titulo: "Inspeccionado por", ancho: 22 }, { titulo: "Revisado por", ancho: 22 },
    { titulo: "Proceso", ancho: 22 }, { titulo: "Localización", ancho: 28 }, { titulo: "Material", ancho: 16 }, { titulo: "Tipo", ancho: 16 },
    { titulo: "Riesgo", ancho: 8 }, { titulo: "Nivel de riesgo", ancho: 16 }, { titulo: "Acción requerida", ancho: 40 },
    { titulo: "Comentarios de la inspección", ancho: 40 },
  ], filas);
}

// ---------------------------------------------------------------------------
// HISOPADO
// ---------------------------------------------------------------------------
async function hojasHisopado(wb, d, prefijo) {
  const registros = [...d.hisopado].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || Number(a.turno || 0) - Number(b.turno || 0));
  const r = calcularHisopado(registros);
  const porMes = agruparPorMes(registros, (x) => x.fecha);
  const filasMes = d.meses.map((m) => {
    const lista = porMes[m] || [];
    const dentro = lista.filter((h) => h.desviacion !== true).length;
    return [etiquetaMes(m), lista.length, dentro, lista.length - dentro, pct(ratio(dentro, lista.length))];
  });

  const ws = nuevaHoja(wb, prefijo, "Resumen hisopado", "Hisopado · Análisis de superficies", d);
  let fila = escribirTabla(ws, 4, 1, [{ titulo: "Indicador", ancho: 34 }, { titulo: "Valor", ancho: 14 }], [
    ["Análisis dentro del límite", pct(r.porcentaje)],
    ["Análisis realizados", r.total],
    ["Dentro del límite", r.dentro],
    ["Desviaciones", r.desviaciones.length],
  ]);
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Mes" }, { titulo: "Análisis", ancho: 11 }, { titulo: "Dentro del límite", ancho: 14 }, { titulo: "Desviaciones", ancho: 13 }, { titulo: "% dentro", ancho: 11 }],
    filasMes, { titulo: "Por mes" });
  escribirTabla(ws, fila, 1, [{ titulo: "Tipo de muestra" }, { titulo: "Análisis" }, { titulo: "Dentro del límite" }, { titulo: "%", tipo: "pct" }],
    r.porTipo.map(([t, c]) => [t, c.total, c.dentro, ratio(c.dentro, c.total)]), { titulo: "Por tipo de muestra" });
  await insertarGraficas(wb, ws, 4, 8, [{
    titulo: "Análisis dentro del límite por mes",
    config: configPorcentaje(d.meses.map(etiquetaMes), filasMes.map((f) => f[4].valor), METAS_INDICADORES.hisopado, "Dentro del límite"),
  }]);

  hojaBaseDatos(wb, prefijo, "Base de datos", "Hisopado · Base de datos de análisis", d, [
    { titulo: "Fecha", ancho: 12, tipo: "fecha" }, { titulo: "Turno", ancho: 8 }, { titulo: "Superficie", ancho: 28 },
    { titulo: "Tipo de muestra", ancho: 22 }, { titulo: "Área / máquina", ancho: 24 }, { titulo: "Resultado", ancho: 11 },
    { titulo: "Unidad", ancho: 8 }, { titulo: "Límite mín.", ancho: 11 }, { titulo: "Límite máx.", ancho: 11 },
    { titulo: "Evaluación", ancho: 18 }, { titulo: "Supervisor", ancho: 22 }, { titulo: "Inspector", ancho: 22 },
    { titulo: "Observaciones", ancho: 40 },
  ], registros.map((h) => [
    fechaExcel(h.fecha), h.turno ?? "", h.zonaNombre || "", h.tipoNombre || "", h.areaMaquina || "",
    typeof h.resultado === "number" ? h.resultado : h.resultado ?? "", h.unidad || "", h.limiteMin ?? "", h.limiteMax ?? "",
    h.desviacion === true ? "Desviación" : "Dentro del límite", h.supervisor || "", h.inspectorNombre || "", h.observaciones || "",
  ]));
}

// ---------------------------------------------------------------------------
// HALLAZGOS — Reportes de inspección
// ---------------------------------------------------------------------------
async function hojasHallazgos(wb, d, prefijo) {
  const todos = [...d.reportes].sort((a, b) => (a.fechaHora?.toMillis?.() || 0) - (b.fechaHora?.toMillis?.() || 0));
  const validados = todos.filter((r) => r.estado === "validado");
  const kpis = calcularKPIs(todos);
  const cierre = calcularTasaCierre(validados);
  const dias = calcularTiempoPromedioValidacion(validados);
  const reincidencia = calcularTasaReincidencia(validados);
  const porMes = agruparPorMes(todos, fechaReporteISO);
  const filasMes = d.meses.map((m) => {
    const lista = porMes[m] || [];
    const val = lista.filter((r) => r.estado === "validado").length;
    return [etiquetaMes(m), lista.length, val, lista.length - val];
  });
  const conteo = (campo) => Object.entries(contarPorCampo(validados, campo)).sort((a, b) => b[1] - a[1]);
  const porCategoria = Object.entries(contarPorCampo(validados.map((r) => ({ categoria: textoCategoria(r) })), "categoria")).sort((a, b) => b[1] - a[1]);
  const porGravedad = Object.entries(contarPorCampo(validados, "gravedad")).sort((a, b) => b[1] - a[1]);

  const ws = nuevaHoja(wb, prefijo, "Resumen hallazgos", "Reportes de hallazgos de inspección", d);
  let fila = escribirTabla(ws, 4, 1, [{ titulo: "Indicador", ancho: 34 }, { titulo: "Valor", ancho: 14 }], [
    ["Reportes del período", kpis.total],
    ["Pendientes de validar", kpis.pendientes],
    ["Validados", kpis.validados],
    ["Tasa de cierre de hallazgos", pct(cierre.tasa)],
    ["Días promedio de validación", dias === null ? "" : Math.round(dias * 10) / 10],
    ["Tasa de reincidencia", pct(reincidencia.tasa)],
  ]);
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Mes" }, { titulo: "Reportes", ancho: 11 }, { titulo: "Validados", ancho: 11 }, { titulo: "Pendientes", ancho: 11 }],
    filasMes, { titulo: "Cantidad de reportes por mes" });
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Proceso" }, { titulo: "Validados" }], conteo("proceso"), { titulo: "Validados por proceso" });
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Zona" }, { titulo: "Validados" }], conteo("zona"), { titulo: "Validados por zona" });
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Categoría" }, { titulo: "Validados" }], porCategoria, { titulo: "Validados por categoría" });
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Gravedad" }, { titulo: "Validados" }], porGravedad, { titulo: "Validados por gravedad" });
  fila = escribirTabla(ws, fila, 1, [{ titulo: "Inspector" }, { titulo: "Validados" }], conteo("inspectorNombre"), { titulo: "Validados por inspector" });
  escribirTabla(ws, fila, 1, [{ titulo: "Zona" }, { titulo: "Proceso", ancho: 22 }, { titulo: "Categoría", ancho: 22 }, { titulo: "Veces", ancho: 8 }],
    calcularTopRepetitivos(validados).map((g) => [g.zona, g.proceso, g.categoria, g.cantidad]), { titulo: "Top 10 hallazgos más repetitivos" });
  await insertarGraficas(wb, ws, 4, 7, [
    {
      titulo: "Cantidad de reportes por mes",
      config: configApilada(d.meses.map(etiquetaMes), [
        { etiqueta: "Validados", datos: filasMes.map((f) => f[2]), color: COLOR_SERIE },
        { etiqueta: "Pendientes", datos: filasMes.map((f) => f[3]), color: COLOR_ACENTO },
      ]),
    },
    {
      titulo: "Hallazgos validados por proceso",
      config: configApilada(conteo("proceso").map(([p]) => p), [{ etiqueta: "Validados", datos: conteo("proceso").map(([, n]) => n), color: COLOR_SERIE }]),
    },
    {
      titulo: "Hallazgos validados por categoría",
      config: configApilada(porCategoria.map(([c]) => c), [{ etiqueta: "Validados", datos: porCategoria.map(([, n]) => n), color: COLOR_SERIE }]),
    },
  ]);

  hojaBaseDatos(wb, prefijo, "Base de datos", "Reportes de hallazgos · Base de datos", d, [
    { titulo: "Fecha y hora", ancho: 16, tipo: "fechaHora" }, { titulo: "Turno", ancho: 8 }, { titulo: "Inspector", ancho: 22 },
    { titulo: "Zona", ancho: 24 }, { titulo: "Proceso", ancho: 22 }, { titulo: "Categoría", ancho: 22 },
    { titulo: "Descripción", ancho: 60 }, { titulo: "Gravedad", ancho: 12 }, { titulo: "Estado", ancho: 11 },
    { titulo: "Seguimiento del hallazgo", ancho: 14 }, { titulo: "Validado por", ancho: 22 },
    { titulo: "Fecha de validación", ancho: 16, tipo: "fechaHora" }, { titulo: "Latitud", ancho: 11 }, { titulo: "Longitud", ancho: 11 },
    { titulo: "Fotos", ancho: 50 },
  ], todos.map((r) => [
    fechaHoraExcel(r.fechaHora), r.turno ?? "", r.inspectorNombre || "", r.zona || "", r.proceso || "", textoCategoria(r),
    r.descripcion || "", r.gravedad || "", r.estado === "validado" ? "Validado" : "Pendiente",
    ETIQUETAS_ESTADO_HALLAZGO[r.estadoHallazgo || "abierto"] || r.estadoHallazgo || "", r.validadoPorNombre || "",
    { valor: fechaHoraExcel(r.fechaValidacion), tipo: "fechaHora" }, r.gps?.lat ?? "", r.gps?.lng ?? "", (r.fotos || []).join(" "),
  ]));
}

// ---------------------------------------------------------------------------
// TODO JUNTO (pestaña Resumen)
// ---------------------------------------------------------------------------
async function hojasTodo(wb, d) {
  const res = d.resultados || {};
  const ws = nuevaHoja(wb, "", "Resumen general", "Indicadores de cumplimiento · Resumen general", d);
  const valor = (clave, campo, esPct) => {
    if (!res[clave]) return "Sin acceso";
    return esPct ? pct(res[clave][campo]) : res[clave][campo] ?? "";
  };
  let fila = escribirTabla(ws, 4, 1, [{ titulo: "Indicador", ancho: 36 }, { titulo: "Valor", ancho: 14 }], [
    ["Cumplimiento PPRs (SIG-FO-115)", valor("ppr", "final", true)],
    ["Contenedores liberados", valor("contenedores", "final", true)],
    ["Imprentas: liberaciones conformes (SIG-FO-101)", valor("imprentas", "final", true)],
    ["Cumplimiento BPM (SIG-FO-116)", valor("bpm", "final", true)],
    ["Hisopados dentro del límite", valor("hisopado", "final", true)],
    ["Vidrio y plástico: puntos de acción urgente", valor("vidrio", "urgentes", false)],
    ["Reportes de hallazgos", valor("reportes", "total", false)],
  ]);
  const porMes = (clave, m) => (res[clave] ? res[clave].porMes[m] ?? null : null);
  escribirTabla(ws, fila, 1, [
    { titulo: "Mes" }, { titulo: "PPRs", ancho: 14, tipo: "pct" }, { titulo: "Contenedores", ancho: 14, tipo: "pct" },
    { titulo: "Imprentas", ancho: 14, tipo: "pct" }, { titulo: "BPM", ancho: 14, tipo: "pct" }, { titulo: "Hisopado", ancho: 14, tipo: "pct" },
    { titulo: "Vidrio urgentes", ancho: 14 }, { titulo: "Reportes", ancho: 14 },
  ], d.meses.map((m) => [etiquetaMes(m), porMes("ppr", m), porMes("contenedores", m), porMes("imprentas", m),
    porMes("bpm", m), porMes("hisopado", m), porMes("vidrio", m), porMes("reportes", m)]), { titulo: "Indicadores por mes" });
  await insertarGraficas(wb, ws, 4, 10, [{
    titulo: "Cumplimiento por módulo",
    config: configPorcentaje(
      ["PPRs", "Contenedores", "Imprentas", "BPM", "Hisopado"],
      ["ppr", "contenedores", "imprentas", "bpm", "hisopado"].map((k) => res[k]?.final ?? null), null, "Cumplimiento"),
  }]);

  const modulos = [
    ["ppr", "PPR "], ["contenedores", "Cont "], ["imprentas", "Impr "], ["bpm", "BPM "],
    ["vidrio", "Vidrio "], ["hisopado", "Hisop "], ["reportes", "Hallaz "],
  ];
  for (const [clave, prefijo] of modulos) {
    if (d[clave] === undefined) continue; // sin permiso o con error: ya se avisó en su pestaña
    await EXPORTACIONES[clave].hojas(wb, d, prefijo);
  }
}
