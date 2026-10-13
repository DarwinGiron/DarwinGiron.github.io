// =========================================================
// hisopado-tabla.js
// Dibuja la Tabla de muestreo de hisopados (SIG-TA-102) con el diseño del
// formato en Excel:
//
//   Cantidad | Rangos y superficies | Tipo de muestra | Ene … Dic
//
// Dentro de cada mes hay una franja por turno (azul = turno 1, naranja =
// turno 2, amarillo = turno 3). Qué turnos le tocan a cada superficie ese mes
// sigue la lógica del Excel:
//   - 3 muestras: siempre los tres turnos (1, 2 y 3).
//   - 2 muestras: dos turnos distintos que rotan y se repiten cada 3 meses
//     (ver PATRON_DOS_MUESTRAS).
// El resultado de cada toma va en la franja de su turno, en verde si está
// dentro del límite de su tipo y en rojo si lo incumple. Al pie, por turno y
// mes, los análisis hechos contra los programados (el "7 6 7 7…" del Excel), y
// el porcentaje de cumplimiento: resultados dentro del límite entre todos los
// resultados del mes (100 % si ninguno salió fuera), más el del año.
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

export const TURNOS = [1, 2, 3];

/**
 * Turnos de las superficies de 2 muestras, leídos de los colores del Excel
 * (azul = 1, naranja = 2, amarillo = 3, de arriba hacia abajo). Cada fila es
 * una superficie, en el orden en que aparecen en la tabla entre las de 2
 * muestras (Mesas, Rodillos, Bandas, Papel y láminas); cada columna es el mes
 * dentro del ciclo de 3 (ene/abr/jul/oct, feb/may/ago/nov, mar/jun/sep/dic).
 * Si hay más de cuatro superficies de 2 muestras, el patrón se vuelve a usar.
 */
export const PATRON_DOS_MUESTRAS = [
  [[1, 3], [2, 3], [2, 1]],
  [[1, 2], [1, 3], [2, 3]],
  [[3, 2], [1, 2], [1, 3]],
  [[3, 1], [3, 2], [1, 2]],
];

/** Turnos (de arriba hacia abajo) que le tocan a una superficie en un mes. */
export function turnosProgramados(zona, mes, posicionDos) {
  const cantidad = Math.max(Number(zona.cantidad) || 1, 1);
  if (cantidad >= TURNOS.length) return [...TURNOS];
  if (cantidad === 2) return PATRON_DOS_MUESTRAS[posicionDos % PATRON_DOS_MUESTRAS.length][mes % 3];
  return [1];
}

/**
 * @param {HTMLTableElement} tabla elemento <table> donde se dibuja
 * @param {{zonas: Array, registros: Array, anio: number, encabezado?: {codigo?: string, revision?: string}}} datos
 *   zonas ya con límite resuelto (zonasConLimite) y los análisis del año.
 */
export function pintarTablaMuestreo(tabla, { zonas, registros, anio, encabezado = {} }) {
  const porZonaMes = new Map();
  const conteoTurnoMes = new Map(); // "turno|mes" -> cantidad de análisis
  const totalMes = Array(MESES.length).fill(0); // análisis del mes
  const fueraMes = Array(MESES.length).fill(0); // los que salieron fuera de límite
  const zonasConocidas = new Set(zonas.map((z) => z.id));

  registros.forEach((r) => {
    if (!r.fecha || !r.zonaId || !zonasConocidas.has(r.zonaId)) return;
    const mes = Number(r.fecha.slice(5, 7)) - 1;
    if (Number.isNaN(mes) || mes < 0 || mes > 11) return;
    const clave = `${r.zonaId}|${mes}`;
    if (!porZonaMes.has(clave)) porZonaMes.set(clave, []);
    porZonaMes.get(clave).push(r);
    totalMes[mes]++;
    if (r.desviacion) fueraMes[mes]++;
    const t = Number(r.turno);
    if (TURNOS.includes(t)) conteoTurnoMes.set(`${t}|${mes}`, (conteoTurnoMes.get(`${t}|${mes}`) || 0) + 1);
  });

  // Posición de cada superficie de 2 muestras (0, 1, 2…) para elegir su patrón.
  const posicionDos = new Map();
  zonas.filter((z) => Number(z.cantidad) === 2).forEach((z, i) => posicionDos.set(z.id, i));

  // Turnos programados por mes (para las franjas y para el pie).
  const programadosTurnoMes = new Map(); // "turno|mes" -> cantidad programada
  zonas.forEach((z) => {
    for (let mes = 0; mes < MESES.length; mes++) {
      turnosProgramados(z, mes, posicionDos.get(z.id) ?? 0).forEach((t) => {
        programadosTurnoMes.set(`${t}|${mes}`, (programadosTurnoMes.get(`${t}|${mes}`) || 0) + 1);
      });
    }
  });

  const chip = (r, zona, fueraDePrograma, turnoAro = 0) =>
    `<span class="valor-resultado ${r.desviacion ? "valor-resultado--fuera" : "valor-resultado--conforme"}${
      fueraDePrograma ? ` valor-resultado--extra tp-aro-t${turnoAro}` : ""
    }" title="${escaparHtml(tituloDeResultado(r, zona) + (fueraDePrograma ? " · Turno no programado este mes" : ""))}">${escaparHtml(
      String(r.resultado ?? "—")
    )}</span>`;

  // Una franja por cada turno que le toca a la superficie ese mes, todas de la
  // misma altura. Si se hizo una toma de un turno que ese mes no le tocaba (o
  // sin turno), no se pierde ni se encima con las franjas: va aparte, en una
  // tira neutra debajo, con un aro del color de SU turno.
  const celdaMes = (zona, mes) => {
    const delMes = (porZonaMes.get(`${zona.id}|${mes}`) || [])
      .slice()
      .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
    const turnos = turnosProgramados(zona, mes, posicionDos.get(zona.id) ?? 0);

    const franjas = turnos
      .map((t) => `<div class="tp-franja tp-t${t}">${delMes.filter((r) => Number(r.turno) === t).map((r) => chip(r, zona, false)).join("")}</div>`)
      .join("");

    const fuera = delMes.filter((r) => !turnos.includes(Number(r.turno)));
    const extras = fuera.length
      ? `<div class="tp-extras">${fuera.map((r) => chip(r, zona, true, TURNOS.includes(Number(r.turno)) ? Number(r.turno) : 0)).join("")}</div>`
      : "";

    return `<td class="tp-celda"><div class="tp-franjas"><div class="tp-planeadas">${franjas}</div>${extras}</div></td>`;
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

  // Pie: por turno y mes, análisis hechos / programados.
  const resumen = TURNOS.map(
    (t) => `<tr class="tp-resumen">
      <th class="tp-turno tp-t${t}" colspan="3">Turno ${t}</th>
      ${MESES.map((_, mes) => {
        const hechos = conteoTurnoMes.get(`${t}|${mes}`) || 0;
        const prog = programadosTurnoMes.get(`${t}|${mes}`) || 0;
        const clase = prog > 0 && hechos >= prog ? "tp-completo" : hechos === 0 ? "tp-cero" : "";
        return `<td class="${clase}" title="Turno ${t}: ${hechos} hechos de ${prog} programados"><strong>${hechos}</strong><small>/${prog}</small></td>`;
      }).join("")}
    </tr>`
  ).join("");

  // Cumplimiento: dentro del límite / todos los resultados. Un mes sin
  // resultados no tiene porcentaje (no es 0 %, simplemente no hay qué medir).
  const pctTexto = (total, fuera) => (total > 0 ? `${Math.round(((total - fuera) / total) * 1000) / 10}%` : "—");
  const totalAnio = totalMes.reduce((a, n) => a + n, 0);
  const fueraAnio = fueraMes.reduce((a, n) => a + n, 0);
  const filaCumplimiento = `<tr class="tp-cumplimiento">
      <th class="tp-turno tp-cumpl-etiqueta" colspan="3">
        Cumplimiento
        <small>Año: <strong>${pctTexto(totalAnio, fueraAnio)}</strong>${totalAnio ? ` (${totalAnio - fueraAnio} de ${totalAnio})` : ""}</small>
      </th>
      ${MESES.map((_, mes) => {
        const total = totalMes[mes];
        const fuera = fueraMes[mes];
        const clase = total === 0 ? "tp-cero" : fuera === 0 ? "tp-cumple" : "tp-incumple";
        const titulo = total === 0 ? "Sin resultados este mes" : `${total - fuera} de ${total} dentro del límite`;
        return `<td class="${clase}" title="${titulo}"><strong>${pctTexto(total, fuera)}</strong></td>`;
      }).join("")}
    </tr>`;

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
    <tfoot>${resumen}${filaCumplimiento}</tfoot>
    <caption class="tp-nota">Pie de tabla: análisis hechos / programados por turno, y cumplimiento (resultados dentro del límite entre el total de resultados) de cada mes.</caption>
  `;
}
