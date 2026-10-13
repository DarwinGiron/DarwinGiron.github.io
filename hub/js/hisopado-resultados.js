// =========================================================
// hisopado-resultados.js
// Controlador de hisopado/resultados.html — tabla de cumplimiento anual:
// la tabla de muestreo (SIG-TA-102) con el diseño del formato en papel y, en
// cada mes, solo los resultados de esa superficie contra el límite de su
// tipo (verde conforme, rojo fuera de límite).
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
import { zonasConLimite } from "./hisopado-datos.js";
import { pintarTablaMuestreo } from "./hisopado-tabla.js";
import { mostrarBloqueError } from "./aviso-carga.js";
import { escaparHtml, iniciales } from "./utils.js";

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
   Tabla (mismo diseño que el formato en papel, ver hisopado-tabla.js)
   --------------------------------------------------------- */

function renderTabla(registros) {
  pintarTablaMuestreo(tablaResultados, { zonas: estado.zonas, registros, anio: estado.anio });
}
