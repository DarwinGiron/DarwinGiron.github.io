// =========================================================
// hisopado.js
// Controlador de hisopado/index.html — registro de una toma de hisopado.
//
// El hisopado vivía como una sección eventual dentro de cada proceso del
// recorrido SIG-FO-115. Se separó a su propio formato porque no sigue el
// ritmo del recorrido: se hisopa cuando toca muestrear, lo acompaña un
// supervisor y el resultado del laboratorio puede llegar después.
//
// El límite NO se teclea: se elige la zona y el rango sale de la tabla de
// muestreo SIG-TA-102 (ver hisopado/admin.html). La desviación tampoco se
// marca a mano — se calcula comparando el resultado contra ese rango, así
// que nadie puede guardar un valor fuera de rango como si fuera conforme.
//
// Un documento = UNA toma, con sus muestras y, si alguna se salió del
// límite, las correcciones inmediatas aplicadas.
// =========================================================

import { protegerPagina, cerrarSesion, etiquetaRol } from "./auth.js";
import { crearHisopado, obtenerTablaHisopado } from "./firestore.js";
import {
  MESES,
  evaluarResultado,
  textoLimite,
  zonasConLimite,
} from "./hisopado-datos.js";
import {
  escaparHtml,
  fechaHoyISO,
  generarId,
  iniciales,
  mostrarToast,
} from "./utils.js";

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");

const campoFecha = document.getElementById("campo-fecha");
const campoProceso = document.getElementById("campo-proceso");
const campoSupervisor = document.getElementById("campo-supervisor");
const campoCorrecciones = document.getElementById("campo-correcciones");
const campoObservaciones = document.getElementById("campo-observaciones");

const tarjetaCorrecciones = document.getElementById("tarjeta-correcciones");
const ayudaCorrecciones = document.getElementById("ayuda-correcciones");
const muestrasContenedor = document.getElementById("muestras-contenedor");
const contadorMuestras = document.getElementById("contador-muestras");
const btnAgregarMuestra = document.getElementById("btn-agregar-muestra");
const plantillaMuestra = document.getElementById("plantilla-muestra");
const btnGuardar = document.getElementById("btn-guardar");

const tablaReferencia = document.getElementById("tabla-referencia");
const etiquetaMes = document.getElementById("etiqueta-mes");
const ayudaTabla = document.getElementById("ayuda-tabla");

const estado = {
  usuario: null,
  perfil: null,
  muestras: [],
  zonas: [],
  tabla: null,
};

protegerPagina({}, async ({ user, perfil }) => {
  estado.usuario = user;
  estado.perfil = perfil;

  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);

  campoFecha.value = fechaHoyISO();

  try {
    estado.tabla = await obtenerTablaHisopado();
    estado.zonas = zonasConLimite(estado.tabla);
  } catch (error) {
    console.error("No se pudo cargar la tabla de muestreo:", error);
    mostrarToast("No se pudo cargar la tabla de muestreo.", "error");
  }

  renderTablaReferencia();

  if (estado.zonas.length === 0) {
    ayudaTabla.textContent =
      "Todavía no hay tabla de muestreo configurada. Un administrador debe cargarla en Configuraciones → Hisopados.";
  }

  agregarMuestra();
});

btnSalir.addEventListener("click", () => cerrarSesion());

/* ---------------------------------------------------------
   Tabla de referencia: los rangos vigentes y qué toca este mes.
   --------------------------------------------------------- */

function mesActual() {
  // La fecha del formulario manda: si el inspector registra una toma de
  // otro mes, la programación que se resalta es la de ESE mes.
  const [, mes] = (campoFecha.value || fechaHoyISO()).split("-");
  return Number(mes) - 1;
}

function renderTablaReferencia() {
  const mes = mesActual();
  etiquetaMes.textContent = MESES[mes] || "—";

  if (estado.zonas.length === 0) {
    tablaReferencia.innerHTML = `<tbody><tr><td>Sin tabla configurada.</td></tr></tbody>`;
    return;
  }

  const filas = estado.zonas
    .map((zona) => {
      const toca = (zona.meses || []).includes(mes);
      return `
        <tr>
          <td>${escaparHtml(zona.tipoNombre)}</td>
          <td>${escaparHtml(zona.nombre)}</td>
          <td style="text-align:center;">${zona.cantidad}</td>
          <td>${escaparHtml(textoLimite(zona))}</td>
          <td>
            <span class="badge ${toca ? "badge-dorado" : "badge-neutro"}">
              ${toca ? "Programada" : "—"}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");

  tablaReferencia.innerHTML = `
    <thead>
      <tr><th>Tipo</th><th>Zona</th><th>Cant.</th><th>Rango</th><th>${escaparHtml(
        MESES[mes] || ""
      )}</th></tr>
    </thead>
    <tbody>${filas}</tbody>
  `;
}

campoFecha.addEventListener("change", renderTablaReferencia);

/* ---------------------------------------------------------
   Muestras
   --------------------------------------------------------- */

btnAgregarMuestra.addEventListener("click", () => agregarMuestra());

function agregarMuestra() {
  const muestra = {
    id: generarId("hiso"),
    zonaId: estado.zonas[0]?.id || "",
    detalle: "",
    resultado: "",
  };
  estado.muestras.push(muestra);
  muestrasContenedor.appendChild(crearNodoMuestra(muestra));
  actualizarResumen();
}

function zonaDe(muestra) {
  return estado.zonas.find((z) => z.id === muestra.zonaId) || null;
}

function crearNodoMuestra(muestra) {
  const nodo = plantillaMuestra.content.firstElementChild.cloneNode(true);
  nodo.dataset.muestraId = muestra.id;

  const veredicto = nodo.querySelector(".muestra-veredicto");
  const selectZona = nodo.querySelector("[data-campo=zonaId]");

  selectZona.innerHTML = estado.zonas.length
    ? estado.zonas
        .map(
          (z) =>
            `<option value="${escaparHtml(z.id)}">${escaparHtml(
              `${z.tipoNombre} · ${z.nombre}`
            )}</option>`
        )
        .join("")
    : `<option value="">Sin zonas configuradas</option>`;
  selectZona.value = muestra.zonaId;

  nodo.querySelectorAll("[data-campo]").forEach((entrada) => {
    const campo = entrada.dataset.campo;
    entrada.id = `${muestra.id}-${campo}`;
    entrada.previousElementSibling?.setAttribute("for", entrada.id);
    if (campo !== "zonaId") entrada.value = muestra[campo] || "";

    entrada.addEventListener("input", () => {
      muestra[campo] = entrada.value;
      pintarVeredicto(muestra, veredicto);
      actualizarResumen();
    });
  });

  nodo.querySelector(".btn-eliminar-muestra").addEventListener("click", () => {
    if (estado.muestras.length === 1) {
      mostrarToast("El registro necesita al menos una muestra.", "alerta");
      return;
    }
    estado.muestras = estado.muestras.filter((m) => m.id !== muestra.id);
    nodo.remove();
    actualizarResumen();
  });

  pintarVeredicto(muestra, veredicto);
  return nodo;
}

/** Muestra el rango de la zona elegida y, si ya hay resultado, el veredicto. */
function pintarVeredicto(muestra, veredicto) {
  const zona = zonaDe(muestra);
  if (!zona) {
    veredicto.textContent = "Elige una zona para ver su límite.";
    veredicto.className = "texto-suave texto-sm mb-0 muestra-veredicto";
    return;
  }

  const fuera = evaluarResultado(zona, muestra.resultado);
  const limite = `Límite: ${textoLimite(zona)}`;

  if (fuera === null) {
    veredicto.textContent = `${limite} · captura el resultado.`;
    veredicto.className = "texto-suave texto-sm mb-0 muestra-veredicto";
    return;
  }

  veredicto.textContent = fuera
    ? `${limite} · FUERA DEL LÍMITE`
    : `${limite} · conforme`;
  veredicto.className = `texto-sm mb-0 muestra-veredicto ${
    fuera ? "texto-alerta" : "texto-exito"
  }`;
}

/** ¿Alguna muestra se salió del rango de su zona? */
function hayDesviacion() {
  return estado.muestras.some((m) => evaluarResultado(zonaDe(m), m.resultado) === true);
}

function actualizarResumen() {
  contadorMuestras.textContent = String(estado.muestras.length);

  muestrasContenedor.querySelectorAll(".muestra-titulo").forEach((titulo, i) => {
    titulo.textContent = `Muestra ${i + 1}`;
  });

  const desviacion = hayDesviacion();
  tarjetaCorrecciones.classList.toggle("tarjeta--alerta", desviacion);
  ayudaCorrecciones.textContent = desviacion
    ? "Hay muestras fuera del límite: describe qué se hizo de inmediato con ellas."
    : "Qué se hizo en el momento con las superficies que se salieron del límite.";
}

/* ---------------------------------------------------------
   Guardado
   --------------------------------------------------------- */

btnGuardar.addEventListener("click", async () => {
  const fecha = campoFecha.value;
  const proceso = campoProceso.value.trim();
  const supervisor = campoSupervisor.value.trim();
  const correcciones = campoCorrecciones.value.trim();

  if (!fecha) {
    mostrarToast("Indica la fecha de la toma.", "alerta");
    return;
  }
  if (!proceso) {
    mostrarToast("Indica el proceso o área donde se hisopó.", "alerta");
    campoProceso.focus();
    return;
  }

  // El límite se congela dentro de cada muestra: si mañana cambia la tabla,
  // el registro sigue diciendo contra qué rango se evaluó ese día.
  const muestras = estado.muestras
    .filter((m) => String(m.resultado).trim() !== "")
    .map((m) => {
      const zona = zonaDe(m);
      return {
        zonaId: m.zonaId,
        zonaNombre: zona?.nombre || "",
        tipoNombre: zona?.tipoNombre || "",
        detalle: m.detalle.trim(),
        resultado: Number(String(m.resultado).replace(",", ".")),
        limiteMin: zona?.limiteMin ?? null,
        limiteMax: zona?.limiteMax ?? null,
        unidad: zona?.unidad || "URL",
        desviacion: evaluarResultado(zona, m.resultado) === true,
      };
    });

  if (muestras.length === 0) {
    mostrarToast("Captura el resultado de al menos una muestra.", "alerta");
    return;
  }
  if (muestras.some((m) => !m.zonaId)) {
    mostrarToast("Cada muestra necesita una zona de la tabla de muestreo.", "alerta");
    return;
  }

  const conDesviacion = muestras.filter((m) => m.desviacion).length;
  if (conDesviacion > 0 && !correcciones) {
    mostrarToast(
      "Hay muestras fuera del límite: anota las correcciones inmediatas.",
      "alerta"
    );
    campoCorrecciones.focus();
    return;
  }

  btnGuardar.disabled = true;
  btnGuardar.textContent = "Guardando…";

  try {
    await crearHisopado({
      fecha,
      proceso,
      supervisor,
      muestras,
      desviaciones: conDesviacion,
      correcciones,
      observaciones: campoObservaciones.value.trim(),
      inspectorUid: estado.usuario.uid,
      inspectorNombre: estado.perfil.nombre || estado.usuario.email,
    });
    mostrarToast("Registro de hisopado guardado.", "exito");
    window.location.href = "historial.html";
  } catch (error) {
    console.error("No se pudo guardar el hisopado:", error);
    mostrarToast("No se pudo guardar el registro. Verifica tu conexión.", "error");
    btnGuardar.disabled = false;
    btnGuardar.textContent = "Guardar registro";
  }
});
