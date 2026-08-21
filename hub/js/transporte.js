// =========================================================
// transporte.js
// Controlador de verificacion-transporte (index.html e historial.html)
//
// El checklist (ZONAS/ZONA_CABINA) vive en transporte-datos.js, replicado
// del formato LOG-FO-101. Cada zona del furgón (paredes, puertas, techo,
// generales) se evalúa en dos vistas — Exterior e Interior — y el
// diagrama interactivo del furgón es solo una forma alterna de navegar a
// esas mismas secciones (no duplica datos: hace scroll + resalta la
// tarjeta correspondiente, igual que "volver al hallazgo" en SIG-FO-115).
// =========================================================

import { protegerPagina, cerrarSesion, esRolDeGestion, etiquetaRol } from "./auth.js";
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  fechaHoyISO,
  formatearFechaISOCorta,
  mostrarToast,
  escaparHtml,
  iniciales,
} from "./utils.js";
import { ZONAS, ZONA_CABINA, idItem } from "./transporte-datos.js";

const COLEC_REGISTROS = "verificaciones_transporte";
const ETIQUETA_VISTA = { externa: "Exterior", interna: "Interior" };

let usuarioActual = null;
let perfilActual = null;
let vistaActual = "externa";
const respuestas = {}; // idItem(zonaId,modo,indice) -> { valor:'si'|'no'|null, observacion:'' }
const otros = {}; // `${zonaId}.${modo}` -> texto libre ("Otros: Describir")
const respuestasCabina = {}; // indice -> { valor, observacion }

/* ---------------------------------------------------------
   Elementos del DOM
   --------------------------------------------------------- */
const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");
const linkAdminSuperior = document.getElementById("link-admin-superior");

const formTransporte = document.getElementById("form-transporte");
const campoFecha = document.getElementById("campo-fecha");
const contenedorZonas = document.getElementById("contenedor-zonas");
const contenedorCabina = document.getElementById("contenedor-cabina");
const diagramaFurgon = document.getElementById("diagrama-furgon");
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

  if (formTransporte) {
    campoFecha.value = fechaHoyISO();
    campoFecha.max = fechaHoyISO();
    renderZonas();
    renderCabina();
    actualizarDiagrama();
    actualizarVistaDiagrama();
    inicializarDiagrama();
    inicializarToggleVista();
    inicializarFormulario();
  }

  if (listaVerificaciones) {
    inicializarHistorial();
  }
});

if (btnSalir) {
  btnSalir.addEventListener("click", () => cerrarSesion());
}

/* ---------------------------------------------------------
   Render de las zonas (Exterior/Interior) y de Cabina
   --------------------------------------------------------- */

function renderZonas() {
  contenedorZonas.innerHTML = "";
  ZONAS.forEach((zona) => {
    const bloque = zona[vistaActual];
    const seccion = document.createElement("section");
    seccion.className = "tarjeta";
    seccion.dataset.zona = zona.id;

    const encabezado = document.createElement("div");
    encabezado.className = "flex-entre mb-2";
    encabezado.innerHTML = `
      <h2 class="tarjeta__titulo mb-0">${escaparHtml(zona.nombre)}</h2>
      <span class="badge badge-marino">${ETIQUETA_VISTA[vistaActual]}</span>
    `;
    seccion.appendChild(encabezado);

    const lista = document.createElement("div");
    lista.className = "editor-lista";
    bloque.items.forEach((texto, indice) => {
      lista.appendChild(renderFilaItem(zona.id, vistaActual, indice, texto));
    });
    seccion.appendChild(lista);

    if (bloque.otros) {
      const claveOtros = `${zona.id}.${vistaActual}`;
      const campo = document.createElement("div");
      campo.className = "campo mb-0 mt-3";
      campo.innerHTML = `
        <label>Otros (describir)</label>
        <textarea placeholder="Cualquier otra observación de esta zona (opcional)">${escaparHtml(otros[claveOtros] || "")}</textarea>
      `;
      campo.querySelector("textarea").addEventListener("input", (e) => {
        otros[claveOtros] = e.target.value;
      });
      seccion.appendChild(campo);
    }

    contenedorZonas.appendChild(seccion);
  });
}

function renderCabina() {
  contenedorCabina.innerHTML = "";
  ZONA_CABINA.items.forEach((texto, indice) => {
    contenedorCabina.appendChild(renderFilaItemCabina(indice, texto));
  });
}

function renderFilaItem(zonaId, modo, indice, texto) {
  const id = idItem(zonaId, modo, indice);
  const r = respuestas[id] || {};
  const fila = document.createElement("article");
  fila.className = "aspecto" + (r.valor === "si" ? " aspecto--respondido" : r.valor === "no" ? " aspecto--incumple" : "");
  fila.dataset.itemId = id;

  fila.innerHTML = `
    <p class="aspecto__texto">${escaparHtml(texto)}</p>
    <div class="calificacion" role="radiogroup" aria-label="${escaparHtml(texto)}">
      <button type="button" class="calificacion__opcion cumple ${r.valor === "si" ? "seleccionado" : ""}" data-valor="si">
        <span class="simbolo" aria-hidden="true">✓</span><span>Sí</span>
      </button>
      <button type="button" class="calificacion__opcion no_cumple ${r.valor === "no" ? "seleccionado" : ""}" data-valor="no">
        <span class="simbolo" aria-hidden="true">✗</span><span>No</span>
      </button>
    </div>
    <div class="aspecto__observacion ${r.valor === "no" ? "" : "oculto"}">
      <textarea placeholder="Describe el hallazgo (opcional)">${escaparHtml(r.observacion || "")}</textarea>
    </div>
  `;

  cablearFilaItem(fila, id, texto, (valor) => {
    respuestas[id] = respuestas[id] || {};
    respuestas[id].valor = valor;
  }, (obs) => {
    respuestas[id] = respuestas[id] || {};
    respuestas[id].observacion = obs;
  }, () => respuestas[id]);

  return fila;
}

function renderFilaItemCabina(indice, texto) {
  const r = respuestasCabina[indice] || {};
  const fila = document.createElement("article");
  fila.className = "aspecto" + (r.valor === "si" ? " aspecto--respondido" : r.valor === "no" ? " aspecto--incumple" : "");
  fila.dataset.itemId = "cabina." + indice;

  fila.innerHTML = `
    <p class="aspecto__texto">${escaparHtml(texto)}</p>
    <div class="calificacion" role="radiogroup" aria-label="${escaparHtml(texto)}">
      <button type="button" class="calificacion__opcion cumple ${r.valor === "si" ? "seleccionado" : ""}" data-valor="si">
        <span class="simbolo" aria-hidden="true">✓</span><span>Sí</span>
      </button>
      <button type="button" class="calificacion__opcion no_cumple ${r.valor === "no" ? "seleccionado" : ""}" data-valor="no">
        <span class="simbolo" aria-hidden="true">✗</span><span>No</span>
      </button>
    </div>
    <div class="aspecto__observacion ${r.valor === "no" ? "" : "oculto"}">
      <textarea placeholder="Describe el hallazgo (opcional)">${escaparHtml(r.observacion || "")}</textarea>
    </div>
  `;

  cablearFilaItem(fila, indice, texto, (valor) => {
    respuestasCabina[indice] = respuestasCabina[indice] || {};
    respuestasCabina[indice].valor = valor;
  }, (obs) => {
    respuestasCabina[indice] = respuestasCabina[indice] || {};
    respuestasCabina[indice].observacion = obs;
  }, () => respuestasCabina[indice]);

  return fila;
}

/** Cablea los botones Sí/No y el textarea de una fila de item, sin importar si es de zona o de cabina. */
function cablearFilaItem(fila, claveProgreso, texto, alElegir, alEscribirObs) {
  const opciones = fila.querySelectorAll(".calificacion__opcion");
  const bloqueObs = fila.querySelector(".aspecto__observacion");
  const textarea = bloqueObs.querySelector("textarea");

  opciones.forEach((opcion) => {
    opcion.addEventListener("click", () => {
      const actual = opcion.classList.contains("seleccionado");
      const valor = actual ? null : opcion.dataset.valor;

      opciones.forEach((o) => o.classList.remove("seleccionado"));
      fila.classList.remove("aspecto--respondido", "aspecto--incumple");
      if (valor) {
        opcion.classList.add("seleccionado");
        fila.classList.add(valor === "si" ? "aspecto--respondido" : "aspecto--incumple");
      }

      alElegir(valor);

      const mostrar = valor === "no";
      bloqueObs.classList.toggle("oculto", !mostrar);
      if (mostrar) textarea.focus({ preventScroll: true });

      actualizarDiagrama();
    });
  });

  textarea.addEventListener("input", (e) => alEscribirObs(e.target.value));
}

/* ---------------------------------------------------------
   Toggle Exterior / Interior — con transición (reutiliza el mismo
   fundido+deslizamiento que usa el recorrido de SIG-FO-115).
   --------------------------------------------------------- */
function inicializarToggleVista() {
  document.querySelectorAll('input[name="vista-transporte"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked || radio.value === vistaActual) return;
      cambiarVista(radio.value);
    });
  });
}

function cambiarVista(nuevaVista) {
  contenedorZonas.classList.add("contenido-recorrido");
  contenedorZonas.style.opacity = "0";
  contenedorZonas.style.transform = "translateX(10px)";
  setTimeout(() => {
    vistaActual = nuevaVista;
    renderZonas();
    actualizarDiagrama();
    actualizarVistaDiagrama();
    contenedorZonas.style.transform = "translateX(-10px)";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      contenedorZonas.style.opacity = "1";
      contenedorZonas.style.transform = "translateX(0)";
    }));
  }, 180);
}

/** Abre/cierra las puertas dibujadas del furgón según la vista activa, y
 * actualiza el texto de ayuda debajo del diagrama. */
function actualizarVistaDiagrama() {
  if (!diagramaFurgon) return;
  diagramaFurgon.dataset.vista = vistaActual;
  const nota = document.getElementById("furgon-nota-vista");
  if (nota) {
    nota.textContent = vistaActual === "interna"
      ? "Puertas abiertas — vista interior."
      : "Puertas cerradas — vista exterior.";
  }
}

/* ---------------------------------------------------------
   Diagrama interactivo del furgón
   --------------------------------------------------------- */
function inicializarDiagrama() {
  if (!diagramaFurgon) return;
  diagramaFurgon.querySelectorAll(".furgon-zona").forEach((grupo) => {
    grupo.addEventListener("click", () => irAZona(grupo.dataset.zona));
    grupo.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        irAZona(grupo.dataset.zona);
      }
    });
  });
}

function irAZona(mapaId) {
  const destino = mapaId === "cabina"
    ? document.getElementById("seccion-cabina")
    : contenedorZonas.querySelector(`[data-zona="${zonaIdDeMapaId(mapaId)}"]`);
  if (!destino) return;

  destino.scrollIntoView({ behavior: "smooth", block: "center" });
  destino.classList.remove("zona-transporte--resaltada");
  // Forzar reflow para poder re-disparar la animación aunque ya se haya usado antes.
  void destino.offsetWidth;
  destino.classList.add("zona-transporte--resaltada");

  // Pulso breve también sobre la zona tocada en el propio diagrama, para
  // que quede claro "esto es lo que tocaste, aquí es a donde te llevó".
  const grupoDiagrama = diagramaFurgon?.querySelector(`[data-zona="${mapaId}"]`);
  if (grupoDiagrama) {
    grupoDiagrama.classList.add("furgon-zona--activa");
    setTimeout(() => grupoDiagrama.classList.remove("furgon-zona--activa"), 1200);
  }
}

function zonaIdDeMapaId(mapaId) {
  const zona = ZONAS.find((z) => z.mapaId === mapaId);
  return zona ? zona.id : null;
}

/** Progreso por zona (para la vista activa) + cabina, pintado en el diagrama. */
function actualizarDiagrama() {
  if (!diagramaFurgon) return;

  ZONAS.forEach((zona) => {
    const bloque = zona[vistaActual];
    let respondidos = 0;
    bloque.items.forEach((_texto, indice) => {
      if (respuestas[idItem(zona.id, vistaActual, indice)]?.valor) respondidos++;
    });
    pintarZonaDiagrama(zona.mapaId, respondidos, bloque.items.length);
  });

  let respondidosCabina = 0;
  ZONA_CABINA.items.forEach((_texto, indice) => {
    if (respuestasCabina[indice]?.valor) respondidosCabina++;
  });
  pintarZonaDiagrama("cabina", respondidosCabina, ZONA_CABINA.items.length);
}

function pintarZonaDiagrama(mapaId, respondidos, total) {
  const grupo = diagramaFurgon.querySelector(`[data-zona="${mapaId}"]`);
  if (!grupo) return;
  const estado = respondidos === 0 ? "vacio" : respondidos === total ? "completo" : "parcial";
  grupo.dataset.estado = estado;
}

/* ---------------------------------------------------------
   Envío del formulario
   --------------------------------------------------------- */
function inicializarFormulario() {
  formTransporte.addEventListener("submit", async (e) => {
    e.preventDefault();

    const transporte = document.getElementById("campo-transporte").value.trim();
    const nombrePiloto = document.getElementById("campo-piloto").value.trim();
    const tc = document.getElementById("campo-tc").value.trim();
    const placaCamion = document.getElementById("campo-placa").value.trim();
    const fecha = campoFecha.value;
    const resultado = document.getElementById("campo-resultado").value;
    const observacionesGenerales = document.getElementById("campo-observaciones-generales").value.trim();

    if (!transporte || !nombrePiloto || !tc || !placaCamion || !fecha || !resultado) {
      mostrarToast("Completa los campos obligatorios: empresa, piloto, TC, placa, fecha y resultado.", "error");
      return;
    }

    // La validación de "todo respondido" recorre el ESTADO (respuestas/respuestasCabina),
    // no el DOM: solo una vista (Exterior o Interior) está renderizada a la vez, pero
    // ambas deben quedar completas antes de poder guardar.
    let faltantes = 0;
    const respuestasPorZona = {};
    ZONAS.forEach((zona) => {
      respuestasPorZona[zona.id] = { nombre: zona.nombre, externa: [], interna: [] };
      ["externa", "interna"].forEach((modo) => {
        zona[modo].items.forEach((texto, indice) => {
          const r = respuestas[idItem(zona.id, modo, indice)];
          if (!r || !r.valor) { faltantes++; return; }
          respuestasPorZona[zona.id][modo].push({
            texto,
            valor: r.valor,
            observacion: r.observacion || "",
          });
        });
        if (zona[modo].otros) {
          respuestasPorZona[zona.id][modo + "Otros"] = otros[`${zona.id}.${modo}`] || "";
        }
      });
    });

    const respuestasCabinaFinal = [];
    ZONA_CABINA.items.forEach((texto, indice) => {
      const r = respuestasCabina[indice];
      if (!r || !r.valor) { faltantes++; return; }
      respuestasCabinaFinal.push({ texto, valor: r.valor, observacion: r.observacion || "" });
    });

    if (faltantes > 0) {
      mostrarToast(`Faltan ${faltantes} puntos por responder (revisa Exterior e Interior).`, "error");
      return;
    }

    let si = 0, total = 0;
    Object.values(respuestasPorZona).forEach((z) => {
      ["externa", "interna"].forEach((modo) => {
        z[modo].forEach((r) => { total++; if (r.valor === "si") si++; });
      });
    });
    respuestasCabinaFinal.forEach((r) => { total++; if (r.valor === "si") si++; });
    const porcentajeCumplimiento = total > 0 ? Math.round((si / total) * 100) : 0;

    btnGuardar.disabled = true;
    btnGuardar.textContent = "Guardando...";

    try {
      await addDoc(collection(db, COLEC_REGISTROS), {
        transporte,
        nombrePiloto,
        tc,
        placaCamion,
        fecha,
        numeroEquipo: document.getElementById("campo-equipo").value.trim(),
        numeroMarchamo: document.getElementById("campo-marchamo").value.trim(),
        ordenProduccion: document.getElementById("campo-orden").value.trim(),
        cliente: document.getElementById("campo-cliente").value.trim(),
        numeroPicking: document.getElementById("campo-picking").value.trim(),
        respuestasPorZona,
        respuestasCabina: respuestasCabinaFinal,
        resultado,
        inspectorInocuidad: document.getElementById("campo-inspector-inocuidad").value.trim(),
        observacionesGenerales,
        cumplimientoPorcentaje: porcentajeCumplimiento,
        cumplidos: si,
        total,
        inspectorUid: usuarioActual.uid,
        inspectorNombre: perfilActual.nombre || usuarioActual.email,
        fechaCreacion: serverTimestamp(),
      });

      mostrarToast("Verificación de transporte guardada exitosamente.", "exito");
      setTimeout(() => { window.location.href = "/hub/verificacion-transporte/historial.html"; }, 1000);
    } catch (err) {
      console.error("Error al guardar verificación de transporte:", err);
      mostrarToast("No se pudo guardar la verificación. Intenta de nuevo.", "error");
      btnGuardar.disabled = false;
      btnGuardar.textContent = "Guardar Verificación";
    }
  });
}

/* ---------------------------------------------------------
   Historial y detalle
   --------------------------------------------------------- */
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
      history.pushState(null, "", "/hub/verificacion-transporte/historial.html");
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

      const aprobado = data.resultado === "aprobado";

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
            <span class="badge ${aprobado ? "badge-exito" : "badge-error"}">
              ${aprobado ? "Aprobado" : "Rechazado"} · ${data.cumplimientoPorcentaje ?? 0}%
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

    const aprobado = data.resultado === "aprobado";
    const ficha = (etiqueta, valor) => `
      <div class="ficha">
        <div class="ficha__etiqueta">${escaparHtml(etiqueta)}</div>
        <div class="ficha__valor" style="font-size: var(--txt-md);">${escaparHtml(valor || "—")}</div>
      </div>`;

    const filaRespuesta = (r) => `
      <div class="editor-item">
        <div class="flex-entre">
          <div>
            ${escaparHtml(r.texto)}
            ${r.observacion ? `<div class="texto-suave texto-xs mt-1">Obs: ${escaparHtml(r.observacion)}</div>` : ""}
          </div>
          <div>
            ${r.valor === "si"
              ? '<span class="badge badge-exito">✓ Sí</span>'
              : '<span class="badge badge-error">✗ No</span>'}
          </div>
        </div>
      </div>`;

    const bloqueZona = (zonaId, z) => `
      <section class="tarjeta mb-3">
        <h3 class="tarjeta__titulo" style="font-size: var(--txt-md);">${escaparHtml(z.nombre)}</h3>
        <p class="texto-suave texto-xs" style="font-weight:700; margin: 0 0 var(--e2);">Exterior</p>
        <div class="editor-lista mb-2">${z.externa.map(filaRespuesta).join("")}</div>
        ${z.externaOtros ? `<p class="texto-sm"><strong>Otros:</strong> ${escaparHtml(z.externaOtros)}</p>` : ""}
        <p class="texto-suave texto-xs" style="font-weight:700; margin: var(--e2) 0;">Interior</p>
        <div class="editor-lista">${z.interna.map(filaRespuesta).join("")}</div>
        ${z.internaOtros ? `<p class="texto-sm"><strong>Otros:</strong> ${escaparHtml(z.internaOtros)}</p>` : ""}
      </section>`;

    detalleContenido.innerHTML = `
      <section class="tarjeta">
        <div class="flex-entre mb-2">
          <h2 class="tarjeta__titulo mb-0">Verificación de Unidad de Transporte</h2>
          <span class="badge ${aprobado ? "badge-exito" : "badge-error"}" style="font-size: var(--txt-md);">
            ${aprobado ? "Aprobado" : "Rechazado"} · ${data.cumplimientoPorcentaje ?? 0}%
          </span>
        </div>

        <div class="fichas mb-3" style="grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));">
          ${ficha("Empresa / Transporte", data.transporte)}
          ${ficha("Nombre de Piloto", data.nombrePiloto)}
          ${ficha("Placa", data.placaCamion)}
          ${ficha("Tarjeta Circulación (TC)", data.tc)}
          ${ficha("# Equipo", data.numeroEquipo)}
          ${ficha("# Marchamo", data.numeroMarchamo)}
          ${ficha("Orden de Producción", data.ordenProduccion)}
          ${ficha("Cliente", data.cliente)}
          ${ficha("No. de Picking", data.numeroPicking)}
          ${ficha("Fecha Inspección", formatearFechaISOCorta(data.fecha))}
          ${ficha("Inspector", data.inspectorNombre)}
          ${ficha("Inspector de Inocuidad", data.inspectorInocuidad)}
        </div>
      </section>

      <section class="tarjeta mb-4">
        <h2 class="tarjeta__titulo">Cabina, Camión y Piloto</h2>
        <div class="editor-lista">
          ${(data.respuestasCabina || []).map(filaRespuesta).join("")}
        </div>
      </section>

      ${Object.entries(data.respuestasPorZona || {}).map(([zonaId, z]) => bloqueZona(zonaId, z)).join("")}

      ${data.observacionesGenerales ? `
        <section class="tarjeta mb-4">
          <h2 class="tarjeta__titulo">Comentarios Adicionales</h2>
          <p class="mb-0">${escaparHtml(data.observacionesGenerales)}</p>
        </section>
      ` : ""}
    `;
  } catch (err) {
    console.error("Error al obtener detalle de verificación:", err);
    mostrarToast("No se pudo cargar el detalle.", "error");
  }
}
