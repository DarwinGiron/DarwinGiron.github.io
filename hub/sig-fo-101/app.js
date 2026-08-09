// =========================================================
// app.js
// Controlador de index.html — captura de liberaciones con el
// mínimo de toques posible, y cola offline en localStorage.
// =========================================================

import { db, FieldValue } from "./firebase-config.js";
import { protegerPagina, cerrarSesion, esAdministrador } from "./auth.js";
import { turnoPorHora, fechaHoyISO } from "./config.js";
import { obtenerConfig } from "./datos.js";
import { mostrarToast, vibrar, iniciales, escaparHtml } from "./utils.js";

const CLAVE_ULTIMA_MAQUINA = "sfo101_ultima_maquina";
const CLAVE_CLIENTES_CACHE = "sfo101_clientes_cache";
const CLAVE_COLA_PENDIENTES = "sfo101_cola_pendientes";

const textoUsuario = document.getElementById("texto-usuario");
const btnSalir = document.getElementById("btn-salir");
const barraOffline = document.getElementById("barra-offline");
const linkAdmin = document.getElementById("link-admin");

const campoFecha = document.getElementById("campo-fecha");
const segmentosTurno = document.getElementById("segmentos-turno");
const chipsMaquina = document.getElementById("chips-maquina");

const campoOrden = document.getElementById("campo-orden");
const campoCliente = document.getElementById("campo-cliente");
const listaClientes = document.getElementById("lista-clientes");

const preguntasContenedor = document.getElementById("preguntas-contenedor");
const campoObservacionesCont = document.getElementById("campo-observaciones-cont");
const etiquetaObservaciones = document.getElementById("etiqueta-observaciones");
const campoObservaciones = document.getElementById("campo-observaciones");

const btnLiberar = document.getElementById("btn-liberar");

const estado = {
  usuario: null,
  perfil: null,
  maquinas: [],
  preguntas: [], // [{ id, texto, orden }]
  respuestas: {}, // preguntaId -> boolean (true = SÍ), default true
  maquinaSeleccionada: null,
  guardando: false,
};

/* ---------------------------------------------------------
   Arranque
   --------------------------------------------------------- */

protegerPagina(async ({ user, perfil }) => {
  estado.usuario = user;
  estado.perfil = perfil;
  textoUsuario.textContent = `${perfil.nombre || user.email} (${iniciales(perfil.nombre || user.email)})`;
  if (esAdministrador(perfil.rol)) linkAdmin.classList.remove("oculto");

  inicializarFechaTurno();
  cargarClientesConocidos();
  actualizarIndicadorOffline();
  sincronizarPendientes();

  try {
    const config = await obtenerConfig();
    estado.maquinas = config.maquinas;
    estado.preguntas = config.preguntas;
    inicializarMaquinas();
    inicializarPreguntas();
  } catch (error) {
    console.error("No se pudo cargar la configuración de SIG-FO-101:", error);
    mostrarToast(`No se pudo cargar la configuración. ${error.message || ""}`, "error");
  }
});

btnSalir.addEventListener("click", () => cerrarSesion());

/* ---------------------------------------------------------
   Fecha y turno
   --------------------------------------------------------- */

function inicializarFechaTurno() {
  campoFecha.value = fechaHoyISO();
  campoFecha.max = fechaHoyISO();

  const turnoInferido = turnoPorHora();
  const radio = segmentosTurno.querySelector(`input[value="${turnoInferido}"]`);
  if (radio) radio.checked = true;
}

/* ---------------------------------------------------------
   Máquina (chips grandes, última selección persiste)
   --------------------------------------------------------- */

function inicializarMaquinas() {
  const ultima = localStorage.getItem(CLAVE_ULTIMA_MAQUINA);

  chipsMaquina.innerHTML = "";
  estado.maquinas.forEach((maquina) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = maquina;
    chip.addEventListener("click", () => seleccionarMaquina(maquina));
    chipsMaquina.appendChild(chip);
  });

  seleccionarMaquina(ultima && estado.maquinas.includes(ultima) ? ultima : null, { silencioso: true });
}

function seleccionarMaquina(maquina, { silencioso = false } = {}) {
  estado.maquinaSeleccionada = maquina;
  [...chipsMaquina.children].forEach((chip) => {
    chip.classList.toggle("seleccionado", chip.textContent === maquina);
  });
  if (maquina && !silencioso) {
    localStorage.setItem(CLAVE_ULTIMA_MAQUINA, maquina);
  }
}

/* ---------------------------------------------------------
   Cliente (datalist alimentado de Firestore + caché local)
   --------------------------------------------------------- */

function leerCacheClientes() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_CLIENTES_CACHE) || "[]");
  } catch {
    return [];
  }
}

function agregarClienteACache(nombre) {
  if (!nombre) return;
  const cache = new Set(leerCacheClientes());
  cache.add(nombre);
  // Se limita a los 200 más recientes para no crecer sin control.
  localStorage.setItem(CLAVE_CLIENTES_CACHE, JSON.stringify([...cache].slice(-200)));
  renderListaClientes([...cache]);
}

function renderListaClientes(nombres) {
  listaClientes.innerHTML = [...new Set(nombres)]
    .sort((a, b) => a.localeCompare(b))
    .map((nombre) => `<option value="${nombre.replace(/"/g, "&quot;")}"></option>`)
    .join("");
}

async function cargarClientesConocidos() {
  renderListaClientes(leerCacheClientes());
  if (!navigator.onLine) return;

  try {
    const snap = await db
      .collection("liberaciones")
      .orderBy("timestamp", "desc")
      .limit(200)
      .get();
    const nombres = new Set(leerCacheClientes());
    snap.forEach((doc) => {
      const cliente = doc.data().cliente;
      if (cliente) nombres.add(cliente);
    });
    localStorage.setItem(CLAVE_CLIENTES_CACHE, JSON.stringify([...nombres].slice(-200)));
    renderListaClientes([...nombres]);
  } catch (error) {
    console.warn("No se pudo cargar el catálogo de clientes desde Firestore:", error);
  }
}

/* ---------------------------------------------------------
   Preguntas SI/NO (una fila con su propio toggle por cada pregunta
   configurada en Administración → SIG-FO-101). Empiezan SIN marcar —
   nada de "SÍ" por defecto — para obligar a revisar cada una a
   propósito en vez de solo confirmar lo que ya viene seleccionado. No
   se puede liberar hasta responder todas; si cualquiera queda en NO,
   las observaciones se vuelven visibles y obligatorias.
   --------------------------------------------------------- */

function inicializarPreguntas() {
  estado.respuestas = {};
  const ordenadas = [...estado.preguntas].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  preguntasContenedor.innerHTML = ordenadas
    .map(
      (pregunta) => `
      <div class="pregunta-fila" data-pregunta-id="${pregunta.id}">
        <span class="pregunta-fila__texto">${escaparHtml(pregunta.texto)}</span>
        <div class="toggle-si-no toggle-si-no--sm" role="group" aria-label="${escaparHtml(pregunta.texto)}">
          <button type="button" class="toggle-si-no__opcion" data-valor="si">SÍ</button>
          <button type="button" class="toggle-si-no__opcion" data-valor="no">NO</button>
        </div>
      </div>`
    )
    .join("");

  preguntasContenedor.querySelectorAll(".pregunta-fila").forEach((fila) => {
    const preguntaId = fila.dataset.preguntaId;
    fila.querySelectorAll(".toggle-si-no__opcion").forEach((boton) => {
      boton.addEventListener("click", () => {
        estado.respuestas[preguntaId] = boton.dataset.valor === "si";
        fila.querySelectorAll(".toggle-si-no__opcion").forEach((o) => {
          o.classList.toggle("activo", o === boton);
        });
        actualizarObservacionesRequeridas();
      });
    });
  });

  actualizarObservacionesRequeridas();
}

/** ¿Ya se respondió (SÍ o NO, lo que sea) cada pregunta configurada? */
function todoRespondido() {
  return estado.preguntas.every((p) => estado.respuestas[p.id] !== undefined);
}

/** ¿Hay al menos una pregunta ya marcada explícitamente en NO? */
function hayAlgunNo() {
  return Object.values(estado.respuestas).some((valor) => valor === false);
}

function actualizarObservacionesRequeridas() {
  const requerido = hayAlgunNo();
  campoObservacionesCont.classList.toggle("oculto", !requerido);
  etiquetaObservaciones.textContent = requerido
    ? "Observaciones (obligatorio: describe por qué no se liberó)"
    : "Observaciones (opcional)";
  campoObservaciones.required = requerido;
}

/* ---------------------------------------------------------
   Guardar (online directo, u offline encolado)
   --------------------------------------------------------- */

function leerCola() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_COLA_PENDIENTES) || "[]");
  } catch {
    return [];
  }
}

function guardarCola(cola) {
  localStorage.setItem(CLAVE_COLA_PENDIENTES, JSON.stringify(cola));
  actualizarIndicadorOffline();
}

function actualizarIndicadorOffline() {
  const pendientes = leerCola().length;
  if (pendientes === 0) {
    barraOffline.classList.add("oculto");
    return;
  }
  barraOffline.classList.remove("oculto");
  barraOffline.textContent = navigator.onLine
    ? `Sincronizando ${pendientes} liberación(es) pendiente(s)…`
    : `Sin conexión — ${pendientes} liberación(es) por sincronizar cuando vuelva la señal.`;
}

/** Intenta escribir cada registro pendiente en Firestore, en orden, y descarta los que ya se guardaron. */
async function sincronizarPendientes() {
  if (!navigator.onLine) return;
  const cola = leerCola();
  if (cola.length === 0) return;

  actualizarIndicadorOffline();
  const restantes = [];

  for (const registro of cola) {
    try {
      const { idLocal, ...datos } = registro;
      await db.collection("liberaciones").add({
        ...datos,
        timestamp: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error("No se pudo sincronizar un registro pendiente:", error);
      restantes.push(registro);
    }
  }

  guardarCola(restantes);
  if (restantes.length === 0 && cola.length > 0) {
    mostrarToast("Liberaciones pendientes sincronizadas.", "exito");
  }
}

window.addEventListener("online", () => {
  actualizarIndicadorOffline();
  sincronizarPendientes();
});
window.addEventListener("offline", actualizarIndicadorOffline);

function validar() {
  if (!estado.maquinaSeleccionada) {
    mostrarToast("Selecciona la máquina.", "error");
    return false;
  }
  if (!campoOrden.value.trim()) {
    mostrarToast("Ingresa el número de orden.", "error");
    campoOrden.focus();
    return false;
  }
  if (!campoCliente.value.trim()) {
    mostrarToast("Ingresa el cliente.", "error");
    campoCliente.focus();
    return false;
  }
  if (!todoRespondido()) {
    mostrarToast("Responde SÍ o NO en cada pregunta antes de liberar.", "error");
    return false;
  }
  if (hayAlgunNo() && !campoObservaciones.value.trim()) {
    mostrarToast("Describe el hallazgo en Observaciones antes de liberar.", "error");
    campoObservaciones.focus();
    return false;
  }
  return true;
}

btnLiberar.addEventListener("click", async () => {
  if (estado.guardando || !validar()) return;

  const cliente = campoCliente.value.trim();
  // Se guarda una "foto" del texto de cada pregunta tal como estaba al
  // momento de liberar: si el admin la edita o la elimina después, este
  // registro histórico sigue siendo legible tal como se capturó.
  const respuestas = estado.preguntas.map((pregunta) => ({
    preguntaId: pregunta.id,
    texto: pregunta.texto,
    valor: estado.respuestas[pregunta.id] === true,
  }));

  const registro = {
    fecha: campoFecha.value,
    turno: Number(segmentosTurno.querySelector('input[name="turno"]:checked')?.value || 1),
    maquina: estado.maquinaSeleccionada,
    ordenNo: campoOrden.value.trim(),
    cliente,
    respuestas,
    limpiezaSanitizacion: respuestas.every((r) => r.valor),
    observaciones: campoObservaciones.value.trim(),
    inspectorUid: estado.usuario.uid,
    inspectorNombre: estado.perfil.nombre || estado.usuario.email,
  };

  estado.guardando = true;
  btnLiberar.disabled = true;
  const etiquetaOriginal = btnLiberar.textContent;
  btnLiberar.textContent = "Guardando…";

  try {
    if (navigator.onLine) {
      await db.collection("liberaciones").add({
        ...registro,
        timestamp: FieldValue.serverTimestamp(),
      });
    } else {
      const cola = leerCola();
      cola.push({ ...registro, idLocal: `local_${Date.now()}` });
      guardarCola(cola);
    }

    agregarClienteACache(cliente);
    mostrarToast(
      navigator.onLine ? "Liberación registrada." : "Guardada localmente. Se sincronizará al reconectar.",
      "exito"
    );
    vibrar(30);
    limpiarParaSiguienteRegistro();
  } catch (error) {
    console.error("Error al guardar la liberación:", error);
    // Si falla la escritura online (p. ej. la conexión se cae a mitad de la
    // petición), no se pierde el registro: se encola igual que si hubiera
    // estado offline desde el principio.
    const cola = leerCola();
    cola.push({ ...registro, idLocal: `local_${Date.now()}` });
    guardarCola(cola);
    mostrarToast("No se pudo enviar en este momento. Se guardó para sincronizar después.", "error");
    limpiarParaSiguienteRegistro();
  } finally {
    estado.guardando = false;
    btnLiberar.disabled = false;
    btnLiberar.textContent = etiquetaOriginal;
  }
});

/** Limpia solo No. de Orden y Cliente; conserva fecha, turno y máquina para la siguiente liberación del mismo recorrido. */
function limpiarParaSiguienteRegistro() {
  campoOrden.value = "";
  campoCliente.value = "";
  campoObservaciones.value = "";
  inicializarPreguntas();
  campoOrden.focus();
}
