// =========================================================
// hisopado-tabla.js
// Dibuja la Tabla de muestreo de hisopados (SIG-TA-102) con el diseño del
// formato en Excel:
//
//   Cantidad | Rangos y superficies | Tipo de muestra | Ene … Dic
//
// Dentro de cada mes hay una franja por turno (azul = turno 1, naranja =
// turno 2, amarillo = turno 3; tantas franjas como indique la cantidad de esa
// superficie). El resultado de cada toma va en su franja, en verde si está
// dentro del límite de su tipo y en rojo si lo incumple. Al pie, cuántos
// análisis hubo por turno cada mes.
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

const TURNOS = [1, 2, 3];

/**
 * @param {HTMLTableElement} tabla elemento <table> donde se dibuja
 * @param {{zonas: Array, registros: Array, anio: number, encabezado?: {codigo?: string, revision?: string}}} datos
 *   zonas ya con límite resuelto (zonasConLimite) y los análisis del año.
 */
export function pintarTablaMuestreo(tabla, { zonas, registros, anio, encabezado = {} }) {
  const porZonaMes = new Map();
  const conteoTurnoMes = new Map(); // "turno|mes" -> cantidad de análisis
  const zonasConocidas = new Set(zonas.map((z) => z.id));

  registros.forEach((r) => {
    if (!r.fecha || !r.zonaId || !zonasConocidas.has(r.zonaId)) return;
    const mes = Number(r.fecha.slice(5, 7)) - 1;
    if (Number.isNaN(mes) || mes < 0 || mes > 11) return;
    const clave = `${r.zonaId}|${mes}`;
    if (!porZonaMes.has(clave)) porZonaMes.set(clave, []);
    porZonaMes.get(clave).push(r);
    const t = Number(r.turno);
    if (TURNOS.includes(t)) conteoTurnoMes.set(`${t}|${mes}`, (conteoTurnoMes.get(`${t}|${mes}`) || 0) + 1);
  });

  const chip = (r, zona) =>
    `<span class="valor-resultado ${r.desviacion ? "valor-resultado--fuera" : "valor-resultado--conforme"}" title="${escaparHtml(
      tituloDeResultado(r, zona)
    )}">${escaparHtml(String(r.resultado ?? "—"))}</span>`;

  // Una franja por turno (1..cantidad). Una toma sin turno, o de un turno
  // fuera de ese rango, va en una franja extra sin color para no perderla.
  const celdaMes = (zona, mes) => {
    const delMes = (porZonaMes.get(`${zona.id}|${mes}`) || [])
      .slice()
      .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
    const franjas = Math.min(Math.max(Number(zona.cantidad) || 1, 1), TURNOS.length);
    let html = "";
    for (let t = 1; t <= franjas; t++) {
      const deTurno = delMes.filter((r) => Number(r.turno) === t);
      html += `<div class="tp-franja tp-t${t}">${deTurno.map((r) => chip(r, zona)).join("")}</div>`;
    }
    const otras = delMes.filter((r) => !(Number(r.turno) >= 1 && Number(r.turno) <= franjas));
    if (otras.length) html += `<div class="tp-franja tp-tx">${otras.map((r) => chip(r, zona)).join("")}</div>`;
    return `<td class="tp-celda"><div class="tp-franjas">${html}</div></td>`;
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

  const resumen = TURNOS.map(
    (t) => `<tr class="tp-resumen">
      <th class="tp-turno tp-t${t}" colspan="3">Turno ${t}</th>
      ${MESES.map((_, mes) => {
        const n = conteoTurnoMes.get(`${t}|${mes}`) || 0;
        return `<td class="${n ? "" : "tp-cero"}">${n}</td>`;
      }).join("")}
    </tr>`
  ).join("");

  const codigo = [encabezado.codigo, encabezado.revision].filter(Boolean);

  tabla.classList.add("tabla-papel");
  tabla.innerHTML = `
    <thead>
      <tr><th class="tp-cabecera" colspan="${3 + MESES.length}">
        <div class="tp-cabecera__fila">
          <img src="/assets/logo-empresa.png" alt="Empresas Galindo · Corrugadora Guatemala" class="tp-logo" />
          <div class="tp-cabecera__codigo">${codigo.map((c) => `<span>${escaparHtml(c)}</span>`).join("")}</div>
        </div>
      </th></tr>
      <tr><th class="tp-titulo" colspan="${3 + MESES.length}">Tabla de muestreo de hisopados · ${anio}</th></tr>
      <tr>
        <th class="tp-cantidad" rowspan="2">Cantidad</th>
        <th rowspan="2">Rangos y superficies</th>
        <th rowspan="2">Tipo de muestra</th>
        <th colspan="${MESES.length}">Meses</th>
      </tr>
      <tr>${MESES.map((m) => `<th class="tp-mes"><span>${escaparHtml(m)}</span></th>`).join("")}</tr>
    </thead>
    <tbody>${cuerpo}</tbody>
    <tfoot>${resumen}</tfoot>
  `;
}
