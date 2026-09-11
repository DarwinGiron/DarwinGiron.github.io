// =========================================================
// hisopado-resultados.js
// Controlador de hisopado/resultados.html — tabla de cumplimiento anual:
// cada superficie de la tabla de muestreo (SIG-TA-102) en una fila, cada
// mes en una columna, y en cada celda el resultado de esa superficie ese
// mes contra el límite de su tipo (verde conforme, rojo fuera de límite).
//
// A diferencia del historial (una tarjeta por toma, para revisar o
// corregir un registro puntual), esta es la vista de cumplimiento: de un
// vistazo dice si a una superficie se le dejó de dar seguimiento algún
// mes. Por eso lee TODOS los análisis del año elegido, no solo los del
// usuario que la abre (ver el "list" ampliado en firestore.rules).
//
// Si una superficie está programada ese mes (zona.meses, ver
// hisopado-admin.js) y no tiene ningún registro, se marca "Pendiente" en
// vez de dejarla en blanco sin más — pero solo para meses que ya deberían
// haberse cumplido (el mes en curso o uno anterior), nunca para meses
// futuros del año que todavía no llegan.
// =========================================================

import { protegerPagina, cerrarSesion, etiquetaRol } from "./auth.js";
import { obtenerTablaHisopado, listarHisopados } from "./firestore.js";
import { MESES, zonasConLimite } from "./hisopado-datos.js";
import { mostrarBloqueError } from "./aviso-carga.js";
import { escaparHtml, formatearFechaISOCorta, iniciales } from "./utils.js";

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");
const campoAnio = document.getElementById("campo-anio");
const zonaMensaje = document.getElementById("zona-mensaje");
const zonaTabla = document.getElementById("zona-tabla");
const tablaResultados = document.getElementById("tabla-resultados");

const estado = { zonas: [], anio: new Date().getFullYear() };

protegerPagina({}, async ({ user, perfil }) => {
  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);

  llenarSelectorAnio();
  await cargarTodo();
});

btnSalir.addEventListener("click", () => cerrarSesion());

/** Trae la tabla de muestreo (una vez) y luego los resultados del año elegido. */
async function cargarTodo() {
  zonaMensaje.classList.add("oculto");

  try {
    estado.zonas = zonasConLimite(await obtenerTablaHisopado());
  } catch (error) {
    console.error("No se pudo cargar la tabla de muestreo:", error);
    zonaTabla.classList.add("oculto");
    mostrarBloqueError(zonaMensaje, { error, alReintentar: cargarTodo });
    return;
  }

  if (estado.zonas.length === 0) {
    mostrarMensaje(
      "Todavía no hay tabla de muestreo configurada. Un administrador debe cargarla en Configuraciones."
    );
    return;
  }

  await cargarAnio(estado.anio);
}

function llenarSelectorAnio() {
  const actual = new Date().getFullYear();
  const anios = [actual, actual - 1, actual - 2, actual - 3, actual - 4];
  campoAnio.innerHTML = anios.map((a) => `<option value="${a}">${a}</option>`).join("");
  campoAnio.value = String(estado.anio);
}

campoAnio.addEventListener("change", () => cargarAnio(Number(campoAnio.value)));

function mostrarMensaje(texto) {
  zonaTabla.classList.add("oculto");
  zonaMensaje.classList.remove("oculto");
  zonaMensaje.innerHTML = `<p class="texto-suave texto-sm mb-0">${escaparHtml(texto)}</p>`;
}

async function cargarAnio(anio) {
  estado.anio = anio;
  zonaMensaje.classList.add("oculto");
  zonaTabla.classList.remove("oculto");
  // Se pinta dentro de la propia tabla (no se reemplaza "zonaTabla": es el
  // contenedor con scroll horizontal, y tablaResultados es la referencia
  // fija que usa renderTabla() más abajo).
  tablaResultados.innerHTML = `<tbody><tr><td class="texto-suave texto-sm">Cargando resultados…</td></tr></tbody>`;

  try {
    const registros = await listarHisopados({
      desde: `${anio}-01-01`,
      hasta: `${anio}-12-31`,
      max: 3000,
    });
    renderTabla(registros);
  } catch (error) {
    console.error("No se pudieron cargar los resultados de hisopado:", error);
    zonaTabla.classList.add("oculto");
    mostrarBloqueError(zonaMensaje, { error, alReintentar: () => cargarAnio(anio) });
  }
}

/* ---------------------------------------------------------
   Tabla
   --------------------------------------------------------- */

function renderTabla(registros) {
  // Agrupa por "zonaId|mes" (0 = enero): varias tomas de la misma
  // superficie en el mismo mes (distinto turno o repetición) caben en la
  // misma celda, una junto a otra.
  const porZonaMes = new Map();
  registros.forEach((r) => {
    if (!r.fecha || !r.zonaId) return;
    const mes = Number(r.fecha.slice(5, 7)) - 1;
    if (Number.isNaN(mes) || mes < 0 || mes > 11) return;
    const clave = `${r.zonaId}|${mes}`;
    if (!porZonaMes.has(clave)) porZonaMes.set(clave, []);
    porZonaMes.get(clave).push(r);
  });

  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth();

  const filas = estado.zonas
    .map(
      (zona) => `
        <tr>
          <td>${escaparHtml(zona.tipoNombre)}</td>
          <td>${escaparHtml(zona.nombre)}</td>
          ${MESES.map((_, mes) =>
            celda(zona, mes, porZonaMes.get(`${zona.id}|${mes}`) || [], anioActual, mesActual)
          ).join("")}
        </tr>
      `
    )
    .join("");

  tablaResultados.innerHTML = `
    <thead>
      <tr>
        <th>Tipo</th>
        <th>Superficie</th>
        ${MESES.map((m) => `<th title="${escaparHtml(m)}">${escaparHtml(m.slice(0, 3))}</th>`).join("")}
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  `;
}

function celda(zona, mes, registrosDelMes, anioActual, mesActual) {
  if (registrosDelMes.length > 0) {
    const chips = registrosDelMes
      .slice()
      .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""))
      .map((r) => {
        const fuera = Boolean(r.desviacion);
        const titulo = `${formatearFechaISOCorta(r.fecha)}${
          r.turno ? ` · Turno ${r.turno}` : ""
        }${r.areaMaquina ? ` · ${r.areaMaquina}` : ""}${
          r.supervisor ? ` · Sup. ${r.supervisor}` : ""
        } · Límite ${r.limiteMin ?? zona.limiteMin} a ${r.limiteMax ?? zona.limiteMax} ${
          r.unidad || zona.unidad
        }`;
        return `<span class="valor-resultado ${fuera ? "valor-resultado--fuera" : "valor-resultado--conforme"}" title="${escaparHtml(
          titulo
        )}">${escaparHtml(String(r.resultado ?? "—"))}</span>`;
      })
      .join("");
    return `<td class="celda-resultado">${chips}</td>`;
  }

  const programada = (zona.meses || []).includes(mes);
  const yaDebioHacerse = anioActual > estado.anio || (anioActual === estado.anio && mes <= mesActual);

  if (programada && yaDebioHacerse) {
    return `<td class="celda-resultado"><span class="valor-resultado valor-resultado--pendiente" title="Programada este mes, todavía sin registrar">·</span></td>`;
  }
  return `<td class="celda-resultado"><span class="valor-resultado valor-resultado--vacio">—</span></td>`;
}
