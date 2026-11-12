// =========================================================
// tarimas.js
// Controlador de sig-fo-118/index.html — Inspección de tarimas.
//
// Un registro = un callejón: cuántas tarimas se inspeccionaron y cuántas
// estaban dañadas, separadas en madera y plástica con contadores táctiles.
// Cada registro se guarda como un documento en registrosTarimas.
// =========================================================

import { protegerPagina, cerrarSesion, esRolDeGestion, etiquetaRol } from "./auth.js";
import { crearRegistroTarimas, listarRegistrosTarimas } from "./firestore.js";
import { escaparHtml, fechaHoyISO, formatearFechaISOCorta, iniciales, mostrarToast } from "./utils.js";

const HALLAZGOS_BASE = [
  { v: "AS", d: "Astillada" },
  { v: "RO", d: "Rota" },
  { v: "HU", d: "Húmeda" },
  { v: "DE", d: "Deformada" },
  { v: "CI", d: "Clavos expuestos" },
  { v: "CO", d: "Manchada" },
];
const CLAVE_PERSONALIZADOS = "sig-fo-118-hallazgos";

const $ = (id) => document.getElementById(id);
const campoFecha = $("campo-fecha");
const campoEvaluador = $("campo-evaluador");
const campoBodega = $("campo-bodega");
const campoCallejon = $("campo-callejon");
const campoTotal = $("campo-total");
const btnGuardar = $("btn-guardar");

const estado = {
  usuario: null,
  perfil: null,
  conteo: { madera: 0, plastica: 0 },
  hallazgos: new Set(),
  personalizados: [],
  // Registros guardados en la nube para la fecha del formulario (de todos
  // los evaluadores si es gestión; del propio inspector si no, por las reglas).
  delDia: [],
  cargaDia: 0,
};

protegerPagina({}, ({ user, perfil }) => {
  estado.usuario = user;
  estado.perfil = perfil;

  const nombreVisible = perfil.nombre || user.email;
  $("texto-usuario").textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  $("avatar-usuario").textContent = iniciales(nombreVisible);

  campoFecha.value = fechaHoyISO();
  campoEvaluador.value = nombreVisible;
  try {
    campoBodega.value = localStorage.getItem("sig-fo-118-bodega") || "";
    estado.personalizados = JSON.parse(localStorage.getItem(CLAVE_PERSONALIZADOS) || "[]");
  } catch (_) { /* sin almacenamiento local: se sigue sin recordar */ }

  pintarChips();
  pintarContadores();
  cargarDelDia();
});

$("btn-salir").addEventListener("click", () => cerrarSesion());
[campoFecha, campoBodega, campoCallejon, campoTotal].forEach((c) =>
  c.addEventListener("input", () => c.closest(".campo").classList.remove("campo--falta"))
);
campoCallejon.addEventListener("input", () => { campoCallejon.value = campoCallejon.value.toUpperCase(); });
campoTotal.addEventListener("input", pintarContadores);
campoFecha.addEventListener("change", cargarDelDia);
campoBodega.addEventListener("change", () => {
  try { localStorage.setItem("sig-fo-118-bodega", campoBodega.value); } catch (_) {}
});

/* ---------- Contadores táctiles ---------- */

function pintarContadores() {
  $("cnt-madera").textContent = estado.conteo.madera;
  $("cnt-plastica").textContent = estado.conteo.plastica;

  const danadas = estado.conteo.madera + estado.conteo.plastica;
  const total = parseInt(campoTotal.value, 10) || 0;
  $("live-suma").textContent = danadas;

  const barra = $("live-barra");
  const pctEl = $("live-pct");
  if (total <= 0) {
    barra.style.width = "0%";
    barra.className = "live-barra__relleno";
    pctEl.textContent = "—";
    return;
  }
  const pct = Math.min((danadas / total) * 100, 100);
  barra.style.width = `${pct}%`;
  barra.className = `live-barra__relleno ${claseNivel(pct)}`;
  pctEl.textContent = `${pct.toFixed(1)}%`;
}

function claseNivel(pct) {
  return pct > 15 ? "critico" : pct > 5 ? "alerta" : "";
}

function abrirEdicion(tipo) {
  const panel = $(`edit-${tipo}`);
  const entrada = $(`inp-${tipo}`);
  entrada.value = estado.conteo[tipo];
  panel.classList.remove("oculto");
  setTimeout(() => { entrada.focus(); entrada.select(); }, 60);
}

function cerrarEdicion(tipo) {
  $(`edit-${tipo}`).classList.add("oculto");
}

function confirmarEdicion(tipo) {
  const valor = parseInt($(`inp-${tipo}`).value, 10);
  if (!Number.isNaN(valor) && valor >= 0) {
    estado.conteo[tipo] = valor;
    pintarContadores();
  }
  cerrarEdicion(tipo);
}

["madera", "plastica"].forEach((tipo) => {
  const tarjeta = $(`card-${tipo}`);
  const entrada = $(`inp-${tipo}`);
  let temporizador = null;
  let abiertoPorPulsacion = false;

  tarjeta.addEventListener("click", (e) => {
    if (e.target.closest(".tap-edit") || e.target.closest("[data-menos]")) return;
    if (abiertoPorPulsacion) { abiertoPorPulsacion = false; return; }
    estado.conteo[tipo] += 1;
    pintarContadores();
  });
  tarjeta.addEventListener("dblclick", (e) => {
    if (e.target.closest(".tap-edit") || e.target.closest("[data-menos]")) return;
    abrirEdicion(tipo);
  });
  // Pulsación larga (táctil): abre la edición directa.
  tarjeta.addEventListener("touchstart", (e) => {
    if (e.target.closest(".tap-edit") || e.target.closest("[data-menos]")) return;
    temporizador = setTimeout(() => { abiertoPorPulsacion = true; abrirEdicion(tipo); }, 600);
  }, { passive: true });
  ["touchend", "touchmove", "touchcancel"].forEach((ev) =>
    tarjeta.addEventListener(ev, () => clearTimeout(temporizador), { passive: true })
  );

  tarjeta.querySelector("[data-menos]").addEventListener("click", (e) => {
    e.stopPropagation();
    estado.conteo[tipo] = Math.max(0, estado.conteo[tipo] - 1);
    pintarContadores();
  });
  entrada.addEventListener("blur", () => confirmarEdicion(tipo));
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmarEdicion(tipo);
    if (e.key === "Escape") cerrarEdicion(tipo);
  });
});

/* ---------- Hallazgos ---------- */

function pintarChips() {
  const base = HALLAZGOS_BASE.map(
    (h) => `<button type="button" class="chip ${estado.hallazgos.has(h.v) ? "activo" : ""}" data-v="${h.v}">
      <code>${h.v}</code>${h.d}</button>`
  );
  const propios = estado.personalizados.map(
    (p) => `<button type="button" class="chip ${estado.hallazgos.has(p) ? "activo" : ""}" data-v="${escaparHtml(p)}">
      ${escaparHtml(p)}<span data-quitar="${escaparHtml(p)}" aria-label="Quitar">×</span></button>`
  );
  $("chips").innerHTML = [...base, ...propios, `<button type="button" class="chip chip--mas" data-otro>+ Otro</button>`].join("");
}

$("chips").addEventListener("click", (e) => {
  const quitar = e.target.closest("[data-quitar]");
  if (quitar) {
    const nombre = quitar.dataset.quitar;
    estado.personalizados = estado.personalizados.filter((p) => p !== nombre);
    estado.hallazgos.delete(nombre);
    guardarPersonalizados();
    pintarChips();
    return;
  }
  if (e.target.closest("[data-otro]")) {
    const nombre = (prompt("Nuevo tipo de hallazgo:") || "").trim().slice(0, 30);
    if (!nombre) return;
    const existente = [...HALLAZGOS_BASE.map((h) => h.d), ...estado.personalizados]
      .find((x) => x.toLowerCase() === nombre.toLowerCase());
    const final = existente || nombre;
    if (!existente) { estado.personalizados.push(nombre); guardarPersonalizados(); }
    estado.hallazgos.add(final);
    pintarChips();
    return;
  }
  const chip = e.target.closest(".chip[data-v]");
  if (!chip) return;
  const v = chip.dataset.v;
  if (estado.hallazgos.has(v)) estado.hallazgos.delete(v); else estado.hallazgos.add(v);
  pintarChips();
});

function guardarPersonalizados() {
  try { localStorage.setItem(CLAVE_PERSONALIZADOS, JSON.stringify(estado.personalizados)); } catch (_) {}
}

/* ---------- Guardar ---------- */

btnGuardar.addEventListener("click", async () => {
  const fecha = campoFecha.value;
  const bodega = campoBodega.value.trim();
  const callejon = campoCallejon.value.trim().toUpperCase();
  const total = parseInt(campoTotal.value, 10);
  const { madera, plastica } = estado.conteo;
  const danadas = madera + plastica;

  // Se revisan todos los campos juntos para avisar de TODO lo que falta,
  // no solo del primero.
  document.querySelectorAll(".campo--falta").forEach((c) => c.classList.remove("campo--falta"));
  const faltan = [];
  if (!fecha) faltan.push({ campo: campoFecha, texto: "la fecha" });
  if (!bodega) faltan.push({ campo: campoBodega, texto: "la bodega" });
  if (!callejon) faltan.push({ campo: campoCallejon, texto: "el callejón" });
  if (Number.isNaN(total) || total <= 0) faltan.push({ campo: campoTotal, texto: "el total de tarimas inspeccionadas" });
  if (faltan.length) {
    faltan.forEach((f) => f.campo.closest(".campo").classList.add("campo--falta"));
    faltan[0].campo.focus();
    return mostrarToast(`Falta ${unir(faltan.map((f) => f.texto))}.`, "alerta");
  }
  if (danadas > total) {
    campoTotal.closest(".campo").classList.add("campo--falta");
    return mostrarToast(`Las dañadas (${danadas}) superan el total inspeccionado (${total}).`, "alerta");
  }

  const tipo = madera && plastica ? "Madera + Plástica" : madera ? "Madera" : plastica ? "Plástica" : "—";
  const registro = {
    fecha,
    periodo: fecha.slice(0, 7),
    evaluador: campoEvaluador.value.trim(),
    bodega,
    callejon,
    tipo,
    totalInspeccionadas: total,
    cntMadera: madera,
    cntPlastica: plastica,
    danadas,
    porcentajeDano: Number(((danadas / total) * 100).toFixed(2)),
    hallazgos: [...estado.hallazgos],
    inspectorUid: estado.usuario.uid,
    inspectorNombre: estado.perfil.nombre || estado.usuario.email,
  };

  btnGuardar.disabled = true;
  try {
    const id = await crearRegistroTarimas(registro);
    if (fecha === campoFecha.value) {
      estado.delDia.unshift({ id, ...registro });
      pintarDelDia();
    }
    mostrarToast(`Guardado — ${callejon}: ${danadas} dañadas de ${total}`, "exito");
    reiniciarFormulario();
  } catch (error) {
    console.error("No se pudo guardar el registro de tarimas:", error);
    mostrarToast("No se pudo guardar. Verifica tu conexión e inténtalo de nuevo.", "error");
  } finally {
    btnGuardar.disabled = false;
  }
});

/** ["a", "b", "c"] -> "a, b y c" */
function unir(lista) {
  return lista.length > 1 ? `${lista.slice(0, -1).join(", ")} y ${lista[lista.length - 1]}` : lista[0];
}

function reiniciarFormulario() {
  estado.conteo = { madera: 0, plastica: 0 };
  estado.hallazgos = new Set();
  campoCallejon.value = "";
  campoTotal.value = "";
  pintarChips();
  pintarContadores();
  campoCallejon.focus();
}

/* ---------- Registros del día (desde la nube) ---------- */

async function cargarDelDia() {
  const fecha = campoFecha.value;
  const turno = ++estado.cargaDia; // descarta respuestas de una fecha anterior
  $("titulo-dia").textContent = fecha === fechaHoyISO()
    ? "Registros de hoy"
    : `Registros del ${formatearFechaISOCorta(fecha)}`;
  if (!fecha) { estado.delDia = []; return pintarDelDia(); }
  $("lista-sesion").innerHTML = '<p class="texto-suave texto-sm">Cargando registros del día…</p>';
  try {
    const filtros = { fecha };
    if (!esRolDeGestion(estado.perfil.rol)) filtros.inspectorUid = estado.usuario.uid;
    const registros = await listarRegistrosTarimas(filtros);
    if (turno !== estado.cargaDia) return;
    estado.delDia = registros;
    pintarDelDia();
  } catch (error) {
    if (turno !== estado.cargaDia) return;
    console.error("No se pudieron cargar los registros del día:", error);
    $("lista-sesion").innerHTML = '<p class="texto-suave texto-sm">No se pudieron cargar los registros del día.</p>';
  }
}

function pintarDelDia() {
  const regs = estado.delDia;
  $("contador-sesion").textContent = regs.length;
  if (!regs.length) {
    $("lista-sesion").innerHTML = '<p class="texto-suave texto-sm">Aún no hay registros para esta fecha.</p>';
    return;
  }
  const total = regs.reduce((s, r) => s + (r.totalInspeccionadas || 0), 0);
  const madera = regs.reduce((s, r) => s + (r.cntMadera || 0), 0);
  const plastica = regs.reduce((s, r) => s + (r.cntPlastica || 0), 0);
  const pctDia = total ? ((madera + plastica) / total) * 100 : 0;
  const resumen = `<div class="editor-item flex-entre" style="margin-bottom: var(--e2);">
      <div style="min-width:0;">
        <strong>Total del día</strong>
        <div class="texto-suave texto-sm">${regs.length} callejón(es) · ${total} insp. · 🪵 ${madera} · 🔵 ${plastica}</div>
      </div>
      <span class="badge ${claseBadge(pctDia)}">${pctDia.toFixed(1)}%</span>
    </div>`;
  $("lista-sesion").innerHTML = resumen + regs
    .map((r) => {
      const pct = Number(r.porcentajeDano) || 0;
      return `<div class="editor-item flex-entre" style="margin-bottom: var(--e2);">
        <div style="min-width:0;">
          <strong>${escaparHtml(r.callejon)}</strong> · <span class="texto-sm">${escaparHtml(r.bodega)}</span>
          <div class="texto-suave texto-sm">${r.totalInspeccionadas} insp. · 🪵 ${r.cntMadera} · 🔵 ${r.cntPlastica} · ${escaparHtml(r.evaluador || r.inspectorNombre || "")}</div>
        </div>
        <span class="badge ${claseBadge(pct)}">${pct.toFixed(1)}%</span>
      </div>`;
    })
    .join("");
}

function claseBadge(pct) {
  return pct > 15 ? "badge-error" : pct > 5 ? "badge-dorado" : "badge-exito";
}
