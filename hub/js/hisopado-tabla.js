// =========================================================
// hisopado-tabla.js
// Dibuja la Tabla de muestreo de hisopados (SIG-TA-102) con el mismo diseño
// del formato en papel y, dentro de cada mes, solo los resultados:
//
//   Cantidad | Tipo de muestra (con su rango) | Superficie | Ene … Dic
//
// Cada resultado es un número en verde (dentro del límite de su tipo) o en
// rojo (fuera del límite). Los meses sin análisis quedan en blanco.
// Lo usan el historial (vista "Tabla") y la pantalla de resultados.
// =========================================================

import { MESES } from "./hisopado-datos.js";
import { escaparHtml, formatearFechaISOCorta } from "./utils.js";

function tituloDeResultado(r, zona) {
  return [
    formatearFechaISOCorta(r.fecha),
    r.turno ? `Turno ${r.turno}` : "",
    r.areaMaquina || "",
    r.supervisor ? `Sup. ${r.supervisor}` : "",
    `Límite ${r.limiteMin ?? zona.limiteMin} a ${r.limiteMax ?? zona.limiteMax} ${r.unidad || zona.unidad || "RLU"}`,
    r.desviacion ? "FUERA DEL LÍMITE" : "Conforme",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * @param {HTMLTableElement} tabla elemento <table> donde se dibuja
 * @param {{zonas: Array, registros: Array, anio: number}} datos zonas ya con
 *   límite resuelto (zonasConLimite) y los análisis del año.
 */
export function pintarTablaMuestreo(tabla, { zonas, registros, anio }) {
  // Varias tomas de la misma superficie en el mismo mes caben en la misma
  // celda, una debajo de otra (como las filas de la hoja en papel).
  const porZonaMes = new Map();
  registros.forEach((r) => {
    if (!r.fecha || !r.zonaId) return;
    const mes = Number(r.fecha.slice(5, 7)) - 1;
    if (Number.isNaN(mes) || mes < 0 || mes > 11) return;
    const clave = `${r.zonaId}|${mes}`;
    if (!porZonaMes.has(clave)) porZonaMes.set(clave, []);
    porZonaMes.get(clave).push(r);
  });

  const celdaMes = (zona, mes) => {
    const delMes = (porZonaMes.get(`${zona.id}|${mes}`) || [])
      .slice()
      .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
    const chips = delMes
      .map(
        (r) => `<span class="valor-resultado ${r.desviacion ? "valor-resultado--fuera" : "valor-resultado--conforme"}" title="${escaparHtml(
          tituloDeResultado(r, zona)
        )}">${escaparHtml(String(r.resultado ?? "—"))}</span>`
      )
      .join("");
    return `<td class="tp-celda">${chips}</td>`;
  };

  // Agrupa las zonas por tipo conservando el orden de la tabla.
  const grupos = [];
  zonas.forEach((z) => {
    let g = grupos[grupos.length - 1];
    if (!g || g.tipoId !== z.tipoId) {
      g = { tipoId: z.tipoId, nombre: z.tipoNombre, limiteMin: z.limiteMin, limiteMax: z.limiteMax, unidad: z.unidad, zonas: [] };
      grupos.push(g);
    }
    g.zonas.push(z);
  });

  const cuerpo = grupos
    .map((g) =>
      g.zonas
        .map((z, i) => {
          const tipo =
            i === 0
              ? `<td class="tp-tipo" rowspan="${g.zonas.length}"><div class="tp-tipo__texto"><strong>${escaparHtml(
                  g.nombre
                )}</strong><span>Rangos = ${g.limiteMin} a ${g.limiteMax} ${escaparHtml(g.unidad || "RLU")}</span></div></td>`
              : "";
          return `<tr>
            <td class="tp-cantidad">${z.cantidad ?? ""}</td>
            ${tipo}
            <td class="tp-zona">${escaparHtml(z.nombre)}</td>
            ${MESES.map((_, mes) => celdaMes(z, mes)).join("")}
          </tr>`;
        })
        .join("")
    )
    .join("");

  tabla.classList.add("tabla-papel");
  tabla.innerHTML = `
    <thead>
      <tr><th class="tp-titulo" colspan="${3 + MESES.length}">Tabla de muestreo de hisopados · ${anio}</th></tr>
      <tr>
        <th class="tp-cantidad" rowspan="2">Cantidad</th>
        <th rowspan="2" colspan="2">Tipo de muestra</th>
        <th colspan="${MESES.length}">Meses</th>
      </tr>
      <tr>${MESES.map((m) => `<th class="tp-mes"><span>${escaparHtml(m)}</span></th>`).join("")}</tr>
    </thead>
    <tbody>${cuerpo}</tbody>
  `;
}
