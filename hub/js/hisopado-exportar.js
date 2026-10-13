// =========================================================
// hisopado-exportar.js
// Descarga en Excel la tabla de muestreo de hisopados (SIG-TA-102) del año
// que se está viendo, con el mismo diseño del formato: encabezado con logo y
// código, franjas de color por turno dentro de cada mes, resultados en verde o
// rojo según el límite, conteo por turno y cumplimiento por mes.
//
// Lleva dos hojas:
//   - "Tabla": el formato.
//   - "Detalle": un renglón por resultado (fecha, turno, superficie, límite,
//     estado, área, supervisor…), con filtros, para revisar o analizar.
// Usa los datos que ya están en pantalla; no consulta nada. ExcelJS se
// descarga del CDN solo al pulsar el botón.
// =========================================================

import { MESES } from "./hisopado-datos.js";
import { TURNOS, turnosProgramados } from "./hisopado-tabla.js";

const URL_EXCELJS = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";

// Mismos colores del formato en Excel (azul, naranja, amarillo).
const COLOR_TURNO = { 1: "FF9CC2E5", 2: "FFF4B083", 3: "FFFFD965" };
const MARINO = "FF0F2A4A";
const BORDE = { style: "thin", color: { argb: "FF9AA7BA" } };
const BORDES = { top: BORDE, left: BORDE, bottom: BORDE, right: BORDE };

let promesaExcelJS = null;
function cargarExcelJS() {
  if (window.ExcelJS) return Promise.resolve();
  if (promesaExcelJS) return promesaExcelJS;
  promesaExcelJS = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = URL_EXCELJS;
    s.onload = resolve;
    s.onerror = () => {
      promesaExcelJS = null;
      reject(new Error("No se pudo cargar la librería de Excel. Revisa tu conexión a internet."));
    };
    document.head.appendChild(s);
  });
  return promesaExcelJS;
}

function relleno(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

export async function descargarTablaHisopados({ zonas, registros, anio, encabezado = {} }) {
  await cargarExcelJS();
  const libro = new window.ExcelJS.Workbook();
  libro.creator = "COGUSA · SGI";
  const hoja = libro.addWorksheet(`Tabla ${anio}`, { views: [{ state: "frozen", xSplit: 3, ySplit: 6 }] });
  const COL_MES = 4; // los meses empiezan en la columna D
  const ULTIMA = COL_MES + MESES.length - 1;

  hoja.columns = [
    { width: 10 }, { width: 17 }, { width: 26 },
    ...MESES.map(() => ({ width: 8 })),
  ];

  // --- Encabezado: logo y código ---
  hoja.getRow(1).height = 30;
  try {
    const respuesta = await fetch("/assets/logo-empresa.png");
    if (respuesta.ok) {
      const imagen = libro.addImage({ buffer: await respuesta.arrayBuffer(), extension: "png" });
      hoja.addImage(imagen, { tl: { col: 0.1, row: 0.1 }, ext: { width: 250, height: 42 } });
    }
  } catch (_) { /* sin logo: el resto del archivo no cambia */ }
  hoja.getCell(1, ULTIMA).value = encabezado.codigo || "SIG-TA-102";
  hoja.getCell(2, ULTIMA).value = encabezado.revision || "Rev. 00";
  [1, 2].forEach((f) => { hoja.getCell(f, ULTIMA).alignment = { horizontal: "right" }; hoja.getCell(f, ULTIMA).font = { size: 9, color: { argb: "FF555555" } }; });

  hoja.mergeCells(4, 1, 4, ULTIMA);
  const titulo = hoja.getCell(4, 1);
  titulo.value = `TABLA DE MUESTREO DE HISOPADOS · ${anio}`;
  titulo.font = { bold: true, size: 13 };
  titulo.alignment = { horizontal: "center", vertical: "middle" };
  hoja.getRow(4).height = 24;

  // --- Cabeceras de columna ---
  const cabecera = (celda, texto, extra = {}) => {
    celda.value = texto;
    celda.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    celda.fill = relleno(MARINO);
    celda.border = BORDES;
    celda.alignment = { horizontal: "center", vertical: "middle", wrapText: true, ...extra };
  };
  hoja.mergeCells(5, 1, 6, 1); cabecera(hoja.getCell(5, 1), "Cantidad");
  hoja.mergeCells(5, 2, 6, 2); cabecera(hoja.getCell(5, 2), "Rangos y superficies");
  hoja.mergeCells(5, 3, 6, 3); cabecera(hoja.getCell(5, 3), "Tipo de muestra");
  hoja.mergeCells(5, COL_MES, 5, ULTIMA); cabecera(hoja.getCell(5, COL_MES), "Meses");
  MESES.forEach((m, i) => cabecera(hoja.getCell(6, COL_MES + i), m, { textRotation: 90 }));
  hoja.getRow(6).height = 66;

  // --- Resultados por superficie, mes y turno ---
  const porClave = new Map(); // "zona|mes|turno" -> resultados
  const fueraDePrograma = [];
  const posicionDos = new Map();
  zonas.filter((z) => Number(z.cantidad) === 2).forEach((z, i) => posicionDos.set(z.id, i));
  const conocidas = new Set(zonas.map((z) => z.id));

  registros.forEach((r) => {
    if (!r.fecha || !conocidas.has(r.zonaId)) return;
    const mes = Number(r.fecha.slice(5, 7)) - 1;
    if (mes < 0 || mes > 11) return;
    const zona = zonas.find((z) => z.id === r.zonaId);
    const programados = turnosProgramados(zona, mes, posicionDos.get(zona.id) ?? 0);
    if (!programados.includes(Number(r.turno))) { fueraDePrograma.push(r); return; }
    const clave = `${r.zonaId}|${mes}|${Number(r.turno)}`;
    if (!porClave.has(clave)) porClave.set(clave, []);
    porClave.get(clave).push(r);
  });

  let fila = 7;
  let grupo = null;
  let inicioGrupo = fila;
  const cerrarGrupo = () => {
    if (!grupo) return;
    const fin = fila - 1;
    if (fin > inicioGrupo) hoja.mergeCells(inicioGrupo, 2, fin, 2);
    const c = hoja.getCell(inicioGrupo, 2);
    c.value = `${grupo.nombre.toUpperCase()}\nRANGOS = ${grupo.limiteMin} a ${grupo.limiteMax} ${grupo.unidad || "RLU"}`;
    c.font = { bold: true, size: 9 };
    c.alignment = { textRotation: 90, horizontal: "center", vertical: "middle", wrapText: true };
    c.border = BORDES;
    for (let f = inicioGrupo; f <= fin; f++) hoja.getCell(f, 2).border = BORDES;
  };

  zonas.forEach((zona) => {
    if (!grupo || grupo.tipoId !== zona.tipoId) {
      cerrarGrupo();
      grupo = { tipoId: zona.tipoId, nombre: zona.tipoNombre, limiteMin: zona.limiteMin, limiteMax: zona.limiteMax, unidad: zona.unidad };
      inicioGrupo = fila;
    }
    const filas = Math.max(Number(zona.cantidad) || 1, 1);
    const inicioZona = fila;
    for (let k = 0; k < filas; k++) {
      hoja.getRow(fila + k).height = 22;
      for (let mes = 0; mes < MESES.length; mes++) {
        const turnos = turnosProgramados(zona, mes, posicionDos.get(zona.id) ?? 0);
        const turno = turnos[k];
        const celda = hoja.getCell(fila + k, COL_MES + mes);
        celda.border = BORDES;
        celda.alignment = { horizontal: "center", vertical: "middle" };
        if (turno) celda.fill = relleno(COLOR_TURNO[turno]);
        const resultados = (porClave.get(`${zona.id}|${mes}|${turno}`) || []).slice().sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
        if (resultados.length) {
          celda.value = resultados.map((r) => r.resultado).join(" / ");
          const fuera = resultados.some((r) => r.desviacion);
          celda.font = { bold: true, size: 10, color: { argb: fuera ? "FFC00000" : "FF006100" } };
          if (fuera) celda.border = { ...BORDES, top: { style: "medium", color: { argb: "FFC00000" } }, bottom: { style: "medium", color: { argb: "FFC00000" } }, left: { style: "medium", color: { argb: "FFC00000" } }, right: { style: "medium", color: { argb: "FFC00000" } } };
        }
      }
    }
    // Cantidad y nombre de la superficie, combinados sobre sus filas
    hoja.mergeCells(inicioZona, 1, inicioZona + filas - 1, 1);
    hoja.mergeCells(inicioZona, 3, inicioZona + filas - 1, 3);
    const cantidad = hoja.getCell(inicioZona, 1);
    cantidad.value = zona.cantidad ?? "";
    cantidad.font = { bold: true };
    cantidad.alignment = { horizontal: "center", vertical: "middle" };
    const nombre = hoja.getCell(inicioZona, 3);
    nombre.value = zona.nombre;
    nombre.font = { bold: true, size: 10 };
    nombre.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    for (let f = inicioZona; f < inicioZona + filas; f++) { hoja.getCell(f, 1).border = BORDES; hoja.getCell(f, 3).border = BORDES; }
    fila += filas;
  });
  cerrarGrupo();

  // --- Pie: análisis hechos / programados por turno ---
  const hechos = new Map(); // "turno|mes"
  const programadosTotal = new Map();
  const totalMes = Array(12).fill(0);
  const fueraMes = Array(12).fill(0);
  zonas.forEach((z) => {
    for (let mes = 0; mes < 12; mes++) {
      turnosProgramados(z, mes, posicionDos.get(z.id) ?? 0).forEach((t) => programadosTotal.set(`${t}|${mes}`, (programadosTotal.get(`${t}|${mes}`) || 0) + 1));
    }
  });
  registros.forEach((r) => {
    if (!r.fecha || !conocidas.has(r.zonaId)) return;
    const mes = Number(r.fecha.slice(5, 7)) - 1;
    if (mes < 0 || mes > 11) return;
    totalMes[mes]++;
    if (r.desviacion) fueraMes[mes]++;
    if (TURNOS.includes(Number(r.turno))) hechos.set(`${Number(r.turno)}|${mes}`, (hechos.get(`${Number(r.turno)}|${mes}`) || 0) + 1);
  });

  fila += 1;
  TURNOS.forEach((t) => {
    hoja.mergeCells(fila, 1, fila, 3);
    const etiqueta = hoja.getCell(fila, 1);
    etiqueta.value = `TURNO ${t}  (hechos / programados)`;
    etiqueta.font = { bold: true, size: 10 };
    etiqueta.fill = relleno(COLOR_TURNO[t]);
    etiqueta.alignment = { vertical: "middle", indent: 1 };
    for (let c = 1; c <= 3; c++) hoja.getCell(fila, c).border = BORDES;
    for (let mes = 0; mes < 12; mes++) {
      const c = hoja.getCell(fila, COL_MES + mes);
      c.value = `${hechos.get(`${t}|${mes}`) || 0}/${programadosTotal.get(`${t}|${mes}`) || 0}`;
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = BORDES;
      c.font = { size: 10 };
    }
    fila++;
  });

  // --- Cumplimiento por mes y del año ---
  const totalAnio = totalMes.reduce((a, n) => a + n, 0);
  const fueraAnio = fueraMes.reduce((a, n) => a + n, 0);
  hoja.mergeCells(fila, 1, fila, 3);
  const etqCumpl = hoja.getCell(fila, 1);
  etqCumpl.value = totalAnio
    ? `CUMPLIMIENTO  ·  Año: ${(Math.round(((totalAnio - fueraAnio) / totalAnio) * 1000) / 10)}% (${totalAnio - fueraAnio} de ${totalAnio})`
    : "CUMPLIMIENTO";
  etqCumpl.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  etqCumpl.fill = relleno(MARINO);
  etqCumpl.alignment = { vertical: "middle", indent: 1, wrapText: true };
  for (let c = 1; c <= 3; c++) hoja.getCell(fila, c).border = BORDES;
  hoja.getRow(fila).height = 26;
  for (let mes = 0; mes < 12; mes++) {
    const c = hoja.getCell(fila, COL_MES + mes);
    c.border = BORDES;
    c.alignment = { horizontal: "center", vertical: "middle" };
    if (totalMes[mes] === 0) { c.value = "—"; c.font = { color: { argb: "FF888888" } }; continue; }
    const pct = (totalMes[mes] - fueraMes[mes]) / totalMes[mes];
    c.value = pct;
    c.numFmt = "0.0%";
    c.font = { bold: true, size: 10, color: { argb: fueraMes[mes] === 0 ? "FFFFFFFF" : "FF9C0006" } };
    c.fill = relleno(fueraMes[mes] === 0 ? "FF00A651" : "FFFDE3E1");
  }
  fila += 2;

  hoja.getCell(fila, 1).value = "Franjas: azul = turno 1, naranja = turno 2, amarillo = turno 3. Verde = dentro del límite; rojo con borde = fuera del límite. Cumplimiento = resultados dentro del límite entre todos los resultados del mes.";
  hoja.getCell(fila, 1).font = { size: 9, italic: true, color: { argb: "FF555555" } };
  if (fueraDePrograma.length) {
    hoja.getCell(fila + 1, 1).value = `${fueraDePrograma.length} resultado(s) de un turno que ese mes no estaba programado no caben en esta hoja; están en la hoja "Detalle".`;
    hoja.getCell(fila + 1, 1).font = { size: 9, italic: true, color: { argb: "FF555555" } };
  }

  hoja.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  // ---------------- Hoja Detalle ----------------
  const detalle = libro.addWorksheet("Detalle", { views: [{ state: "frozen", ySplit: 1 }] });
  detalle.columns = [
    { header: "Fecha", width: 13 }, { header: "Turno", width: 8 }, { header: "Superficie", width: 28 }, { header: "Tipo de muestra", width: 28 },
    { header: "Resultado", width: 11 }, { header: "Unidad", width: 8 }, { header: "Límite mín.", width: 11 }, { header: "Límite máx.", width: 11 },
    { header: "Estado", width: 16 }, { header: "Programado ese mes", width: 18 }, { header: "Área / Máquina", width: 24 }, { header: "Supervisor", width: 22 },
    { header: "Registró", width: 26 }, { header: "Observaciones", width: 44 },
  ];
  const ordenados = registros.filter((r) => r.fecha).slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.zonaNombre || "").localeCompare(b.zonaNombre || ""));
  ordenados.forEach((r) => {
    const zona = zonas.find((z) => z.id === r.zonaId);
    const mes = Number(r.fecha.slice(5, 7)) - 1;
    const programado = zona ? turnosProgramados(zona, mes, posicionDos.get(zona.id) ?? 0).includes(Number(r.turno)) : null;
    const filaD = detalle.addRow([
      r.fechaAproximada ? `${r.fecha.slice(0, 7)} (día no registrado)` : r.fecha,
      Number(r.turno) || "", r.zonaNombre || "", r.tipoNombre || "", Number(r.resultado), r.unidad || "RLU",
      r.limiteMin ?? "", r.limiteMax ?? "", r.desviacion ? "Fuera del límite" : "Conforme",
      programado === null ? "—" : programado ? "Sí" : "No", r.areaMaquina || "", r.supervisor || "", r.inspectorNombre || "", r.observaciones || "",
    ]);
    const estado = filaD.getCell(9);
    estado.font = { bold: true, color: { argb: r.desviacion ? "FF9C0006" : "FF006100" } };
    estado.fill = relleno(r.desviacion ? "FFFDE3E1" : "FFE3F4E8");
  });
  const cab = detalle.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = relleno(MARINO);
  cab.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cab.height = 28;
  detalle.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 14 } };

  // ---------------- Descarga ----------------
  const buffer = await libro.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = `${encabezado.codigo || "SIG-TA-102"}_Tabla_de_Muestreo_de_Hisopados_${anio}.xlsx`;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 10000);
}
