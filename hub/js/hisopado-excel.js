// =========================================================
// hisopado-excel.js
// Lee el Excel "SIG-TA-102 Tabla de muestreo de hisopados" (una hoja por año)
// y lo convierte en una lista de resultados. No toca Firebase ni el DOM: solo
// interpreta la hoja, así se puede probar aparte.
//
// Cómo está armada cada hoja (igual en todos los años):
//   - Fila de meses: las últimas 12 columnas con nombre de mes son enero…diciembre
//     (las primeras columnas con "Enero…Mayo" son un resto que no tiene datos).
//   - Columna C: la superficie; columna A: cuántas muestras (3 o 2). Cada
//     superficie ocupa tantas filas como muestras tenga.
//   - Cada celda con número es el resultado de una muestra de ese mes.
//
// El turno de cada muestra sale de su posición, con la misma regla de los colores
// del formato (azul = 1, naranja = 2, amarillo = 3):
//   - 3 muestras: fila 1 → turno 1, fila 2 → turno 2, fila 3 → turno 3.
//   - 2 muestras: dos turnos que rotan y se repiten cada 3 meses (patrón).
// Se comprobó contra los colores de las 8 hojas: coincide en todas las celdas
// salvo dos de 2025 con el color mal puesto.
// =========================================================

import { PATRON_DOS_MUESTRAS } from "./hisopado-tabla.js";

const MESES_NOMBRE = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function normalizarTexto(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * @param {object} XLSX librería SheetJS ya cargada
 * @param {ArrayBuffer} datos contenido del archivo .xlsx
 * @returns {{registros: Array, anomalias: Array, hojas: Array}}
 */
export function leerLibroHisopados(XLSX, datos) {
  const libro = XLSX.read(datos, { type: "array" });
  const registros = [];
  const anomalias = [];
  const hojas = [];

  libro.SheetNames.forEach((nombreHoja) => {
    const anio = Number((nombreHoja.match(/(19|20)\d{2}/) || [])[0]);
    if (!anio) {
      anomalias.push({ hoja: nombreHoja, motivo: "El nombre de la hoja no trae un año; se omitió." });
      return;
    }
    const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja], { header: 1, raw: true, defval: null, blankrows: true });

    // Fila de meses y las 12 columnas de enero a diciembre.
    let filaMeses = -1;
    let columnasMes = [];
    for (let r = 0; r < Math.min(filas.length, 20); r++) {
      const cols = (filas[r] || [])
        .map((v, c) => ({ c, mes: MESES_NOMBRE.indexOf(normalizarTexto(v)) }))
        .filter((x) => x.mes >= 0);
      if (cols.length >= 12) {
        filaMeses = r;
        columnasMes = cols.slice(-12).map((x) => x.c);
        break;
      }
    }
    if (filaMeses < 0) {
      anomalias.push({ hoja: nombreHoja, motivo: "No se encontró la fila de meses; se omitió la hoja." });
      return;
    }

    // Superficies: nombre en la columna C, cantidad en la A.
    const zonas = [];
    for (let r = filaMeses + 1; r < filas.length; r++) {
      const nombre = normalizarTexto(filas[r]?.[2]);
      const cantidad = Number(filas[r]?.[0]);
      if (nombre && nombre !== "tipo de muestra" && cantidad >= 1) {
        zonas.push({ fila: r, nombre: String(filas[r][2]).replace(/\s+/g, " ").trim(), cantidad });
      }
    }

    let leidos = 0;
    let posicionDos = -1;
    zonas.forEach((zona) => {
      if (zona.cantidad === 2) posicionDos++;
      for (let k = 0; k < zona.cantidad; k++) {
        columnasMes.forEach((columna, mes) => {
          const valor = filas[zona.fila + k]?.[columna];
          if (valor === null || valor === undefined || valor === "") return;
          const celda = `${XLSX.utils.encode_col(columna)}${zona.fila + k + 1}`;
          if (typeof valor !== "number" || Number.isNaN(valor)) {
            anomalias.push({ hoja: nombreHoja, celda, zona: zona.nombre, mes, valor: String(valor), motivo: `No es un número ("${valor}"); no se importó.` });
            return;
          }
          const turno = zona.cantidad >= 3 ? k + 1 : zona.cantidad === 2 ? PATRON_DOS_MUESTRAS[posicionDos % PATRON_DOS_MUESTRAS.length][mes % 3][k] : 1;
          registros.push({ anio, mes, hoja: nombreHoja, celda, zonaExcel: zona.nombre, turno, valor });
          leidos++;
        });
      }
    });
    hojas.push({ hoja: nombreHoja, anio, zonas: zonas.length, resultados: leidos });
  });

  return { registros, anomalias, hojas };
}
