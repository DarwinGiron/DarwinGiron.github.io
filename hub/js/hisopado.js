// =========================================================
// hisopado.js
// Controlador de hisopado/index.html — registro de una toma de hisopado.
//
// El hisopado vivía como una sección eventual dentro de cada proceso del
// recorrido SIG-FO-115. Se separó a su propio formato porque no sigue el
// ritmo del recorrido: se hisopa cuando toca muestrear, lo acompaña un
// supervisor y el resultado del laboratorio puede llegar después.
//
// Un documento = UNA toma, con sus muestras (una por superficie) y, si
// alguna se salió del límite, las correcciones inmediatas aplicadas.
// =========================================================

import { protegerPagina, cerrarSesion, etiquetaRol } from "./auth.js";
import { crearHisopado } from "./firestore.js";
import { fechaHoyISO, generarId, iniciales, mostrarToast } from "./utils.js";

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

const estado = {
  usuario: null,
  perfil: null,
  muestras: [],
};

protegerPagina({}, ({ user, perfil }) => {
  estado.usuario = user;
  estado.perfil = perfil;

  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);

  campoFecha.value = fechaHoyISO();
  agregarMuestra();
});

btnSalir.addEventListener("click", () => cerrarSesion());

/* ---------------------------------------------------------
   Muestras
   --------------------------------------------------------- */

btnAgregarMuestra.addEventListener("click", () => agregarMuestra());

function agregarMuestra() {
  const muestra = {
    id: generarId("hiso"),
    areaMaquina: "",
    superficie: "",
    limite: "",
    resultado: "",
    desviacion: false,
  };
  estado.muestras.push(muestra);
  muestrasContenedor.appendChild(crearNodoMuestra(muestra));
  actualizarResumen();
}

function crearNodoMuestra(muestra) {
  const nodo = plantillaMuestra.content.firstElementChild.cloneNode(true);
  nodo.dataset.muestraId = muestra.id;

  nodo.querySelectorAll("[data-campo]").forEach((input) => {
    const campo = input.dataset.campo;
    input.id = `${muestra.id}-${campo}`;
    // El checkbox va dentro de su <label>, no después de él: solo los
    // inputs de texto tienen una etiqueta hermana que enlazar.
    if (input.type !== "checkbox") {
      input.previousElementSibling?.setAttribute("for", input.id);
      input.value = muestra[campo] || "";
    } else {
      input.checked = Boolean(muestra[campo]);
    }

    input.addEventListener("input", () => {
      muestra[campo] = input.type === "checkbox" ? input.checked : input.value;
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

  return nodo;
}

/** ¿Alguna muestra quedó fuera del límite? De eso depende que las correcciones sean obligatorias. */
function hayDesviacion() {
  return estado.muestras.some((m) => m.desviacion);
}

/**
 * Renumera las muestras y ajusta la tarjeta de correcciones: mientras
 * todo esté dentro del límite el campo sigue disponible (por si igual se
 * quiere anotar algo), pero solo se exige cuando hay una desviación.
 */
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

  const muestras = estado.muestras
    .map((m) => ({
      areaMaquina: m.areaMaquina.trim(),
      superficie: m.superficie.trim(),
      limite: m.limite.trim(),
      resultado: m.resultado.trim(),
      desviacion: Boolean(m.desviacion),
    }))
    .filter((m) => m.areaMaquina || m.superficie || m.resultado);

  if (muestras.length === 0) {
    mostrarToast("Llena al menos una muestra antes de guardar.", "alerta");
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
