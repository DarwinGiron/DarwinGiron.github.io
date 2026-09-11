// =========================================================
// hisopado.js
// Controlador de hisopado/index.html — registro de una toma de hisopado.
//
// El hisopado vivía como una sección eventual dentro de cada proceso del
// recorrido SIG-FO-115. Se separó a su propio formato porque no sigue el
// ritmo del recorrido: se hisopa cuando toca muestrear, lo acompaña un
// supervisor y el resultado del laboratorio puede llegar después.
//
// Se captura lo mismo que la fila del formato en papel: ÁREA/MÁQUINA,
// SUPERFICIE, SUPERVISOR, LÍMITE y RESULTADO. De esos cinco solo tres se
// escriben — el límite sale de la tabla de muestreo SIG-TA-102 al elegir
// la superficie (ver hisopado/admin.html), y la desviación se calcula
// comparando el resultado en RLU contra ese rango, así que nadie puede
// guardar un valor fuera de rango como si fuera conforme.
//
// Área/Máquina y Supervisor son campos de texto con búsqueda sobre lo ya
// registrado (mismo widget que el proveedor en Liberación de
// Contenedores, ver autocompletado.js): se escribe, aparece el
// desplegable con las coincidencias y un badge que dice si ya está
// registrado o si es nuevo, y si es nuevo se da de alta solo al guardar.
// "Área/Máquina" es el contexto más amplio de dónde se hisopó (ej. "Línea
// 3"); "Superficie" es el punto puntual de la tabla de muestreo (ej.
// "Manos Alimentadores") — son cosas distintas, así que van por separado.
//
// Un documento = UN análisis: una superficie, en un turno, en una fecha.
// Esa combinación es el id del documento, así que el mismo turno no puede
// volver a registrar la misma superficie el mismo día.
// =========================================================

import { protegerPagina, cerrarSesion, etiquetaRol } from "./auth.js";
import { crearHisopado, obtenerTablaHisopado } from "./firestore.js";
import { evaluarResultado, textoLimite, zonasConLimite } from "./hisopado-datos.js";
import {
  configurarAutocompletadoSupervisor,
  normalizarNombreSupervisor,
  obtenerCatalogoSupervisores,
  registrarSupervisorSiNoExiste,
} from "./supervisores.js";
import {
  configurarAutocompletadoAreaMaquina,
  normalizarNombreAreaMaquina,
  obtenerCatalogoAreasMaquina,
  registrarAreaMaquinaSiNoExiste,
} from "./areas-maquina.js";
import { escaparHtml, fechaHoyISO, iniciales, mostrarToast } from "./utils.js";

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");

const campoFecha = document.getElementById("campo-fecha");
const campoTurno = document.getElementById("campo-turno");
const campoAreaMaquina = document.getElementById("campo-area-maquina");
const campoSuperficie = document.getElementById("campo-superficie");
const campoSupervisor = document.getElementById("campo-supervisor");
const campoResultado = document.getElementById("campo-resultado");
const campoObservaciones = document.getElementById("campo-observaciones");

const veredicto = document.getElementById("veredicto");
const tarjetaObservaciones = document.getElementById("tarjeta-observaciones");
const ayudaObservaciones = document.getElementById("ayuda-observaciones");
const badgeAreaMaquina = document.getElementById("badge-area-maquina");
const sugerenciasAreaMaquina = document.getElementById("sugerencias-area-maquina");
const badgeSupervisor = document.getElementById("badge-supervisor");
const sugerenciasSupervisor = document.getElementById("sugerencias-supervisor");
const btnGuardar = document.getElementById("btn-guardar");

const estado = {
  usuario: null,
  perfil: null,
  zonas: [],
};

protegerPagina({}, async ({ user, perfil }) => {
  estado.usuario = user;
  estado.perfil = perfil;

  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);

  campoFecha.value = fechaHoyISO();

  try {
    estado.zonas = zonasConLimite(await obtenerTablaHisopado());
  } catch (error) {
    console.error("No se pudo cargar la tabla de muestreo:", error);
    mostrarToast("No se pudo cargar la tabla de muestreo.", "error");
  }

  llenarSuperficies();
  configurarAutocompletadoAreaMaquina({
    inputEl: campoAreaMaquina,
    dropdownEl: sugerenciasAreaMaquina,
    badgeEl: badgeAreaMaquina,
  });
  configurarAutocompletadoSupervisor({
    inputEl: campoSupervisor,
    dropdownEl: sugerenciasSupervisor,
    badgeEl: badgeSupervisor,
  });

  pintarVeredicto();
});

btnSalir.addEventListener("click", () => cerrarSesion());

/* ---------------------------------------------------------
   Superficie y límite
   --------------------------------------------------------- */

function llenarSuperficies() {
  if (estado.zonas.length === 0) {
    campoSuperficie.innerHTML = `<option value="">Sin tabla de muestreo configurada</option>`;
    mostrarToast(
      "Todavía no hay tabla de muestreo. Un administrador debe cargarla en Configuraciones.",
      "alerta"
    );
    return;
  }

  campoSuperficie.innerHTML = estado.zonas
    .map(
      (z) =>
        `<option value="${escaparHtml(z.id)}">${escaparHtml(
          `${z.tipoNombre} · ${z.nombre}`
        )}</option>`
    )
    .join("");
}

function zonaElegida() {
  return estado.zonas.find((z) => z.id === campoSuperficie.value) || null;
}

/** Muestra el rango de la superficie elegida y, si ya hay resultado, el veredicto. */
function pintarVeredicto() {
  const zona = zonaElegida();
  if (!zona) {
    veredicto.textContent = "Elige una superficie para ver su límite.";
    veredicto.className = "texto-suave texto-sm mb-0";
    actualizarObservaciones(false);
    return;
  }

  const fuera = evaluarResultado(zona, campoResultado.value);
  const limite = `Límite: ${textoLimite(zona)}`;

  if (fuera === null) {
    veredicto.textContent = `${limite} · captura el resultado.`;
    veredicto.className = "texto-suave texto-sm mb-0";
    actualizarObservaciones(false);
    return;
  }

  veredicto.textContent = fuera ? `${limite} · FUERA DEL LÍMITE` : `${limite} · conforme`;
  veredicto.className = `texto-sm mb-0 ${fuera ? "texto-alerta" : "texto-exito"}`;
  actualizarObservaciones(fuera);
}

function actualizarObservaciones(fueraDelLimite) {
  tarjetaObservaciones.classList.toggle("tarjeta--alerta", fueraDelLimite);
  ayudaObservaciones.textContent = fueraDelLimite
    ? "El resultado quedó fuera del límite: anota qué acciones inmediatas se realizaron."
    : "Qué acciones inmediatas se realizaron y cualquier otra nota de la toma.";
}

campoSuperficie.addEventListener("change", pintarVeredicto);
campoResultado.addEventListener("input", pintarVeredicto);

/* ---------------------------------------------------------
   Guardado
   --------------------------------------------------------- */

btnGuardar.addEventListener("click", async () => {
  const fecha = campoFecha.value;
  const turno = Number(campoTurno.value);
  const zona = zonaElegida();
  const observaciones = campoObservaciones.value.trim();
  // El widget de autocompletado ya normaliza al salir del campo (ver
  // autocompletado.js), pero se vuelve a normalizar aquí por si se guarda
  // sin haber salido del campo (p. ej. con el teclado numérico abierto en
  // otro campo, sin foco perdido) — el catálogo ya está en caché, así que
  // no cuesta una lectura nueva a Firestore.
  const areaMaquina = normalizarNombreAreaMaquina(
    campoAreaMaquina.value,
    await obtenerCatalogoAreasMaquina()
  );
  const supervisor = normalizarNombreSupervisor(
    campoSupervisor.value,
    await obtenerCatalogoSupervisores()
  );

  if (!fecha) {
    mostrarToast("Indica la fecha de la toma.", "alerta");
    return;
  }
  if (!areaMaquina) {
    mostrarToast("Indica el área o máquina donde se tomó la muestra.", "alerta");
    campoAreaMaquina.focus();
    return;
  }
  if (!zona) {
    mostrarToast("Elige la superficie de la tabla de muestreo.", "alerta");
    return;
  }
  if (!supervisor) {
    mostrarToast("Indica el supervisor que acompañó la toma.", "alerta");
    campoSupervisor.focus();
    return;
  }

  const fuera = evaluarResultado(zona, campoResultado.value);
  if (fuera === null) {
    mostrarToast("Captura el resultado en RLU.", "alerta");
    campoResultado.focus();
    return;
  }
  if (fuera && !observaciones) {
    mostrarToast(
      "El resultado quedó fuera del límite: anota qué acciones inmediatas se realizaron.",
      "alerta"
    );
    campoObservaciones.focus();
    return;
  }

  btnGuardar.disabled = true;
  btnGuardar.textContent = "Guardando…";

  try {
    // Las áreas/máquinas y los supervisores nuevos se dan de alta aquí, no
    // en una pantalla aparte: la lista crece con el uso.
    await registrarAreaMaquinaSiNoExiste(areaMaquina, estado.usuario.uid);
    await registrarSupervisorSiNoExiste(supervisor, estado.usuario.uid);

    // El límite se congela en el registro: si mañana cambia la tabla, el
    // documento sigue diciendo contra qué rango se evaluó ese día.
    await crearHisopado({
      fecha,
      turno,
      areaMaquina,
      zonaId: zona.id,
      zonaNombre: zona.nombre,
      tipoNombre: zona.tipoNombre,
      supervisor,
      resultado: Number(String(campoResultado.value).replace(",", ".")),
      limiteMin: zona.limiteMin,
      limiteMax: zona.limiteMax,
      unidad: zona.unidad || "RLU",
      desviacion: fuera,
      observaciones,
      inspectorUid: estado.usuario.uid,
      inspectorNombre: estado.perfil.nombre || estado.usuario.email,
    });
    mostrarToast("Análisis de hisopado guardado.", "exito");
    window.location.href = "historial.html";
  } catch (error) {
    btnGuardar.disabled = false;
    btnGuardar.textContent = "Guardar registro";

    if (error?.codigo === "duplicado") {
      mostrarToast(
        `El turno ${turno} ya registró "${zona.nombre}" el ${fecha}. Elige otra superficie u otro turno.`,
        "error"
      );
      return;
    }
    console.error("No se pudo guardar el hisopado:", error);
    mostrarToast("No se pudo guardar el registro. Verifica tu conexión.", "error");
  }
});
