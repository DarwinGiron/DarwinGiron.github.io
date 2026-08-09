// =========================================================
// transporte.js
// Controlador de verificacion-transporte (index.html e historial.html)
// =========================================================

import { protegerPagina, cerrarSesion, esRolDeGestion, etiquetaRol } from "./auth.js";
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  fechaHoyISO,
  formatearFechaISOCorta,
  formatearFechaHora,
  mostrarToast,
  escaparHtml,
  generarId,
  iniciales,
} from "./utils.js";

const COLEC_REGISTROS = "verificaciones_transporte";
const DOC_CONFIG_PREGUNTAS = "checklists/sig-fo-transporte";

const PREGUNTAS_DEFECTO = [
  { id: "p1", texto: "¿El camión se encuentra limpio, libre de olores extraños, plagas o residuos?", activa: true },
  { id: "p2", texto: "¿La estructura de la caja/furgón está libre de goteras, agujeros, roturas o polvo excesivo?", activa: true },
  { id: "p3", texto: "¿Las puertas y sellos de seguridad del camión ajustan y cierran correctamente?", activa: true },
  { id: "p4", texto: "¿El piloto porta equipo de protección personal (EPP) completo y uniforme adecuado?", activa: true },
  { id: "p5", texto: "¿El piloto presenta tarjeta de circulación (TC) y licencia de conducir vigentes?", activa: true },
  { id: "p6", texto: "¿La unidad cuenta con llantas en buen estado y elementos de sujeción adecuados?", activa: true },
  { id: "p7", texto: "¿El camión está libre de fugas de aceite, combustible u otros fluidos nocivos?", activa: true },
];

let usuarioActual = null;
let perfilActual = null;
let preguntasVigentes = [];

// Elementos del DOM
const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");
const linkAdminSuperior = document.getElementById("link-admin-superior");

const formTransporte = document.getElementById("form-transporte");
const campoFecha = document.getElementById("campo-fecha");
const contenedorPreguntas = document.getElementById("contenedor-preguntas-transporte");
const btnGuardar = document.getElementById("btn-guardar-transporte");

const listaVerificaciones = document.getElementById("lista-verificaciones-transporte");
const vistaLista = document.getElementById("vista-lista");
const vistaDetalle = document.getElementById("vista-detalle");
const detalleContenido = document.getElementById("detalle-contenido-transporte");
const btnVolver = document.getElementById("btn-volver");

protegerPagina({}, async ({ user, perfil }) => {
  usuarioActual = user;
  perfilActual = perfil;

  const nombreVisible = perfil.nombre || user.email;
  if (textoUsuario) textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  if (avatarUsuario) avatarUsuario.textContent = iniciales(nombreVisible);

  if (!esRolDeGestion(perfil.rol) && linkAdminSuperior) {
    linkAdminSuperior.classList.add("oculto");
  }

  preguntasVigentes = await cargarPreguntasConfiguradas();

  if (formTransporte) {
    campoFecha.value = fechaHoyISO();
    campoFecha.max = fechaHoyISO();
    renderizarFormularioPreguntas(preguntasVigentes);
    inicializarFormulario();
  }

  if (listaVerificaciones) {
    inicializarHistorial();
  }
});

if (btnSalir) {
  btnSalir.addEventListener("click", () => cerrarSesion());
}

export async function cargarPreguntasConfiguradas() {
  try {
    const snap = await getDoc(doc(db, DOC_CONFIG_PREGUNTAS));
    if (snap.exists() && Array.isArray(snap.data().preguntas)) {
      return snap.data().preguntas.filter((p) => p.activa !== false);
    }
  } catch (e) {
    console.warn("No se pudo cargar la configuración de transporte, usando plantilla por defecto:", e);
  }
  return PREGUNTAS_DEFECTO;
}

function renderizarFormularioPreguntas(preguntas) {
  if (!contenedorPreguntas) return;
  contenedorPreguntas.innerHTML = "";

  preguntas.forEach((p, idx) => {
    const item = document.createElement("article");
    item.className = "aspecto";
    item.dataset.preguntaId = p.id;

    item.innerHTML = `
      <p class="aspecto__texto">
        <strong>${idx + 1}.</strong> ${escaparHtml(p.texto)}
      </p>
      <div class="calificacion" role="radiogroup">
        <button type="button" class="calificacion__opcion cumple" data-valor="si">
          <span>✓ Sí (Cumple)</span>
        </button>
        <button type="button" class="calificacion__opcion no_cumple" data-valor="no">
          <span>✕ No (Incumple)</span>
        </button>
      </div>
      <div class="aspecto__observacion oculto mt-2">
        <input type="text" class="campo-obs-pregunta" placeholder="Observaciones sobre esta verificación (opcional)" />
      </div>
    `;

    const botones = item.querySelectorAll(".calificacion__opcion");
    const obsBloque = item.querySelector(".aspecto__observacion");

    botones.forEach((btn) => {
      btn.addEventListener("click", () => {
        botones.forEach((b) => b.classList.remove("seleccionado"));
        btn.classList.add("seleccionado");
        item.dataset.respuesta = btn.dataset.valor;

        if (btn.dataset.valor === "no") {
          obsBloque.classList.remove("oculto");
        } else {
          obsBloque.classList.add("oculto");
        }
      });
    });

    contenedorPreguntas.appendChild(item);
  });
}

function inicializarFormulario() {
  formTransporte.addEventListener("submit", async (e) => {
    e.preventDefault();

    const transporte = document.getElementById("campo-transporte").value.trim();
    const nombrePiloto = document.getElementById("campo-piloto").value.trim();
    const tc = document.getElementById("campo-tc").value.trim();
    const placaCamion = document.getElementById("campo-placa").value.trim();
    const fecha = campoFecha.value;
    const observacionesGenerales = document.getElementById("campo-observaciones-generales").value.trim();

    if (!transporte || !nombrePiloto || !tc || !placaCamion || !fecha) {
      mostrarToast("Completa todos los campos obligatorios del camión y piloto.", "error");
      return;
    }

    const articulos = contenedorPreguntas.querySelectorAll(".aspecto");
    let respuestas = [];
    let noRespondidas = 0;
    let cumplidos = 0;

    articulos.forEach((art) => {
      const pId = art.dataset.preguntaId;
      const resp = art.dataset.respuesta;
      const pTexto = art.querySelector(".aspecto__texto").innerText;
      const obsInput = art.querySelector(".campo-obs-pregunta");
      const obs = obsInput ? obsInput.value.trim() : "";

      if (!resp) {
        noRespondidas++;
      } else {
        if (resp === "si") cumplidos++;
        respuestas.push({
          preguntaId: pId,
          texto: pTexto,
          respuesta: resp,
          observacion: obs,
        });
      }
    });

    if (noRespondidas > 0) {
      mostrarToast(`Debes responder todas las preguntas (${noRespondidas} pendientes).`, "error");
      return;
    }

    const total = respuestas.length;
    const porcentajeCumplimiento = total > 0 ? Math.round((cumplidos / total) * 100) : 0;

    btnGuardar.disabled = true;
    btnGuardar.textContent = "Guardando...";

    try {
      await addDoc(collection(db, COLEC_REGISTROS), {
        transporte,
        nombrePiloto,
        tc,
        placaCamion,
        fecha,
        respuestas,
        observacionesGenerales,
        cumplimientoPorcentaje: porcentajeCumplimiento,
        cumplidos,
        total,
        inspectorUid: usuarioActual.uid,
        inspectorNombre: perfilActual.nombre || usuarioActual.email,
        fechaCreacion: serverTimestamp(),
      });

      mostrarToast("Verificación de transporte guardada exitosamente.", "exito");
      setTimeout(() => {
        const partes = window.location.pathname.split('/');
        const idx = partes.indexOf("verificacion-transporte");
        let basePath = "/";
        if (idx !== -1) {
          basePath = partes.slice(0, idx).join('/') + "/verificacion-transporte/";
        }
        window.location.href = basePath + "historial.html";
      }, 1000);
    } catch (err) {
      console.error("Error al guardar verificación de transporte:", err);
      mostrarToast("No se pudo guardar la verificación. Intenta de nuevo.", "error");
      btnGuardar.disabled = false;
      btnGuardar.textContent = "Guardar Verificación";
    }
  });
}

async function inicializarHistorial() {
  const parametrosUrl = new URLSearchParams(window.location.search);
  const idVer = parametrosUrl.get("ver");

  if (idVer) {
    await verDetalle(idVer);
    return;
  }

  if (btnVolver) {
    btnVolver.addEventListener("click", () => {
      vistaDetalle.classList.add("oculto");
      vistaLista.classList.remove("oculto");
      history.pushState(null, "", "historial.html");
    });
  }

  try {
    const q = query(collection(db, COLEC_REGISTROS), orderBy("fechaCreacion", "desc"), limit(20));
    const snap = await getDocs(q);

    if (snap.empty) {
      listaVerificaciones.innerHTML = '<p class="texto-suave texto-sm text-center">No hay inspecciones de transporte registradas aún.</p>';
      return;
    }

    listaVerificaciones.innerHTML = "";
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const item = document.createElement("div");
      item.className = "editor-item";

      const estadoClase = data.cumplimientoPorcentaje >= 90 ? "alerta-exito" : "alerta-error";

      item.innerHTML = `
        <div class="editor-item__cabecera">
          <div>
            <div class="editor-item__titulo">
              Placa: ${escaparHtml(data.placaCamion || "—")} — ${escaparHtml(data.transporte || "Transporte")}
            </div>
            <div class="texto-suave texto-xs mt-1">
              Piloto: <strong>${escaparHtml(data.nombrePiloto || "—")}</strong> · TC: ${escaparHtml(data.tc || "—")} · Fecha: ${formatearFechaISOCorta(data.fecha)}
            </div>
            <div class="texto-suave texto-xs">
              Inspector: ${escaparHtml(data.inspectorNombre || "—")}
            </div>
          </div>
          <div style="text-align: right;">
            <span class="badge ${data.cumplimientoPorcentaje >= 90 ? 'badge-exito' : 'badge-critico'}" style="font-size: var(--txt-xs); padding: 4px 8px;">
              ${data.cumplimientoPorcentaje}% Cumplimiento
            </span>
            <div class="mt-2">
              <button type="button" class="btn btn-secundario btn-sm btn-ver-detalle" data-id="${docSnap.id}">
                Ver Detalle →
              </button>
            </div>
          </div>
        </div>
      `;

      item.querySelector(".btn-ver-detalle").addEventListener("click", () => verDetalle(docSnap.id));
      listaVerificaciones.appendChild(item);
    });
  } catch (err) {
    console.error("Error al cargar historial de transporte:", err);
    listaVerificaciones.innerHTML = '<p class="texto-suave texto-sm text-center">Error al cargar registros.</p>';
  }
}

async function verDetalle(docId) {
  try {
    const snap = await getDoc(doc(db, COLEC_REGISTROS, docId));
    if (!snap.exists()) {
      mostrarToast("El registro solicitado no existe.", "error");
      return;
    }

    const data = snap.data();
    vistaLista.classList.add("oculto");
    vistaDetalle.classList.remove("oculto");

    detalleContenido.innerHTML = `
      <section class="tarjeta">
        <div class="flex-entre mb-2">
          <h2 class="tarjeta__titulo mb-0">Verificación de Unidad de Transporte</h2>
          <span class="badge ${data.cumplimientoPorcentaje >= 90 ? 'badge-exito' : 'badge-critico'}" style="font-size: var(--txt-md);">
            ${data.cumplimientoPorcentaje}% Cumplimiento
          </span>
        </div>

        <div class="fichas mb-3" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
          <div class="ficha">
            <div class="ficha__etiqueta">Empresa / Transporte</div>
            <div class="ficha__valor" style="font-size: var(--txt-md);">${escaparHtml(data.transporte)}</div>
          </div>
          <div class="ficha">
            <div class="ficha__etiqueta">Nombre de Piloto</div>
            <div class="ficha__valor" style="font-size: var(--txt-md);">${escaparHtml(data.nombrePiloto)}</div>
          </div>
          <div class="ficha">
            <div class="ficha__etiqueta">Placa de Camión</div>
            <div class="ficha__valor" style="font-size: var(--txt-md);">${escaparHtml(data.placaCamion)}</div>
          </div>
          <div class="ficha">
            <div class="ficha__etiqueta">Tarjeta Circulación (TC)</div>
            <div class="ficha__valor" style="font-size: var(--txt-md);">${escaparHtml(data.tc)}</div>
          </div>
          <div class="ficha">
            <div class="ficha__etiqueta">Fecha Inspección</div>
            <div class="ficha__valor" style="font-size: var(--txt-md);">${formatearFechaISOCorta(data.fecha)}</div>
          </div>
          <div class="ficha">
            <div class="ficha__etiqueta">Inspector</div>
            <div class="ficha__valor" style="font-size: var(--txt-sm);">${escaparHtml(data.inspectorNombre)}</div>
          </div>
        </div>
      </section>

      <section class="tarjeta mb-4">
        <h2 class="tarjeta__titulo">Respuestas de Verificación</h2>
        <div class="editor-lista">
          ${(data.respuestas || []).map((r, i) => `
            <div class="editor-item">
              <div class="flex-entre">
                <div>
                  <strong>${i + 1}.</strong> ${escaparHtml(r.texto)}
                  ${r.observacion ? `<div class="texto-suave texto-xs mt-1">Obs: ${escaparHtml(r.observacion)}</div>` : ''}
                </div>
                <div>
                  ${r.respuesta === 'si' 
                    ? '<span class="badge badge-exito">✓ Sí (Cumple)</span>' 
                    : '<span class="badge badge-critico">✕ No (Incumple)</span>'}
                </div>
              </div>
            </div>
          `).join("")}
        </div>
      </section>

      ${data.observacionesGenerales ? `
        <section class="tarjeta mb-4">
          <h2 class="tarjeta__titulo">Observaciones Generales</h2>
          <p class="mb-0">${escaparHtml(data.observacionesGenerales)}</p>
        </section>
      ` : ''}
    `;
  } catch (err) {
    console.error("Error al obtener detalle de verificación:", err);
    mostrarToast("No se pudo cargar el detalle.", "error");
  }
}
