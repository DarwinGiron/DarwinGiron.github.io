// =========================================================
// app.js — Controlador de index.html (Auditoría de BPM · SIG-FO-116)
//
// Adaptado del prototipo original: la lista de preguntas (SECTIONS), el
// cálculo de puntajes y el render de la UI vienen sin cambios. Lo único
// que cambió es la capa de datos: el prototipo usaba "window.storage"
// (una API de prueba que no existe en un navegador real); aquí se
// reemplazó por Firestore, vía las mismas funciones que ya usa el resto
// del hub (ver ../js/firestore.js).
//
// Modelo de datos: un documento por mes (id "aaaa-mm", ver idea igual a
// "inspecciones" en firestore.js) — NO por usuario. Es una auditoría
// compartida: cualquier usuario activo puede seguir llenándola donde la
// dejó otro. Si dos áreas distintas se auditan el mismo mes, la segunda
// sobrescribe a la primera (mismo comportamiento que el prototipo
// original) — evalúa con el equipo si hace falta separarlas por área
// más adelante.
// =========================================================

import { protegerPagina, cerrarSesion, etiquetaRol } from "../js/auth.js";
import { obtenerAuditoriaBpm, guardarAuditoriaBpm } from "../js/firestore.js";
import { iniciales, escaparHtml, mostrarToast } from "../js/utils.js";
import { preguntasBase, cargarPreguntasBpm, estructuraActiva } from "../js/bpm-checklist.js";

/* ============ DATA: preguntas de la auditoría ============
 * Las secciones y grupos son fijos; las preguntas dentro de cada grupo se
 * editan desde Configuraciones → SIG-FO-116 (ver bpm-checklist.js). Arranca
 * con las originales y se reemplaza al iniciar sesión por las configuradas
 * — si la lectura falla (sin señal, por ejemplo), se sigue con estas para
 * no dejar la auditoría bloqueada. */
let SECTIONS = estructuraActiva(preguntasBase());

/* ============ ESTADO ============ */
let usuarioActual = null;
let responses = {}; // { qid: {value:'SI'|'NO'|'NA', obs:''} }
let meta = { fecha: "", auditor: "", area: "" };
let activeSection = SECTIONS[0].id;
let avisoPreguntas = ""; // se muestra arriba del listado si falló la carga de preguntas configuradas

function todayStr() { return new Date().toISOString().slice(0, 10); }
function monthKey(dateStr) { return (dateStr || todayStr()).slice(0, 7); }

/* ============ ALMACENAMIENTO (Firestore) ============ */
async function saveCurrent(showToast) {
  const key = monthKey(meta.fecha);
  try {
    await guardarAuditoriaBpm(key, { meta, responses }, usuarioActual.uid);
    if (showToast) showToastMsg("Auditoría guardada");
  } catch (e) {
    console.error("No se pudo guardar la auditoría de BPM:", e);
    if (showToast) showToastMsg("No se pudo guardar. Verifica tu conexión.");
  }
}
async function loadMonth(key) {
  try {
    return await obtenerAuditoriaBpm(key);
  } catch (e) {
    console.error("No se pudo cargar la auditoría de ese mes:", e);
    return null;
  }
}

/* ============ PUNTUACIÓN ============ */
function qualify(pct) {
  if (pct === null) return { label: "Sin datos", cls: "na" };
  if (pct <= 70) return { label: "No cumple", cls: "bad" };
  if (pct <= 80) return { label: "Regular", cls: "gold" };
  if (pct <= 92) return { label: "Satisfactorio", cls: "ok" };
  return { label: "Excelente", cls: "ok" };
}
function allQids(sectionId) {
  const sec = SECTIONS.find((s) => s.id === sectionId);
  return sec.groups.flatMap((g) => g.qids);
}
function sectionScore(sectionId) {
  const qids = allQids(sectionId);
  let si = 0, no = 0, answered = 0;
  qids.forEach((q) => {
    const r = responses[q.id];
    if (r && r.value) {
      answered++;
      if (r.value === "SI") si++;
      else if (r.value === "NO") no++;
    }
  });
  const denom = si + no;
  const pct = denom > 0 ? Math.round((si / denom) * 1000) / 10 : null;
  return { total: qids.length, answered, pct };
}
function globalScore() {
  let si = 0, no = 0, answered = 0, total = 0;
  SECTIONS.forEach((sec) => {
    allQids(sec.id).forEach((q) => {
      total++;
      const r = responses[q.id];
      if (r && r.value) {
        answered++;
        if (r.value === "SI") si++;
        else if (r.value === "NO") no++;
      }
    });
  });
  const denom = si + no;
  const pct = denom > 0 ? Math.round((si / denom) * 1000) / 10 : null;
  return { total, answered, pct };
}

/* ============ RENDER ============ */
const tabsEl = document.getElementById("tabs");
const mainEl = document.getElementById("main");
const statusEl = document.getElementById("status");
const groupOpen = {}; // conserva abierto/cerrado de cada grupo entre re-renders

function renderTabs() {
  tabsEl.innerHTML = "";
  SECTIONS.forEach((sec) => {
    const s = sectionScore(sec.id);
    const btn = document.createElement("button");
    btn.className = (sec.id === activeSection ? "active " : "") + (s.answered === s.total ? "complete" : "");
    btn.innerHTML = `${escaparHtml(sec.label)}<span class="badge">${s.answered}/${s.total}</span>`;
    btn.onclick = () => { activeSection = sec.id; renderAll(); };
    tabsEl.appendChild(btn);
  });
}

function renderMain() {
  mainEl.innerHTML = "";
  const sec = SECTIONS.find((s) => s.id === activeSection);
  if (!sec) {
    // Todas las secciones se quedaron sin ninguna pregunta activa: no hay
    // nada que dibujar. Muy improbable (el admin tendría que desactivar
    // las 119), pero evita una pantalla rota si pasa.
    mainEl.innerHTML = '<p style="color:var(--text-soft);font-size:13px;">No hay preguntas activas configuradas. Revisa Configuraciones → SIG-FO-116.</p>';
    return;
  }
  const score = sectionScore(sec.id);
  const q = qualify(score.pct);

  const head = document.createElement("div");
  head.className = "section-head";
  head.innerHTML = `
    <h2>${escaparHtml(sec.label)}</h2>
    <span class="score" style="background:${chipBg(q.cls)};color:${chipFg(q.cls)}">
      ${score.pct === null ? "Sin datos" : score.pct + "% · " + q.label}
    </span>`;
  mainEl.appendChild(head);

  if (avisoPreguntas) {
    const aviso = document.createElement("div");
    aviso.style.cssText = "margin-bottom:10px; padding:8px 12px; border-radius:8px; background:#fef3c7; color:#92400e; font-size:12.5px; font-weight:600;";
    aviso.textContent = avisoPreguntas;
    mainEl.appendChild(aviso);
  }

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  toolbar.innerHTML = `<button id="expAll">Expandir todo</button><button id="colAll">Colapsar todo</button>`;
  mainEl.appendChild(toolbar);

  sec.groups.forEach((g, gi) => {
    const key = sec.id + "::" + gi;
    if (!(key in groupOpen)) groupOpen[key] = gi === 0; // primer grupo abierto, el resto cerrado — solo en el primer render

    const det = document.createElement("details");
    det.className = "group";
    det.open = groupOpen[key];
    det.addEventListener("toggle", () => { groupOpen[key] = det.open; });

    const answeredInGroup = g.qids.filter((q) => responses[q.id] && responses[q.id].value).length;
    const summary = document.createElement("summary");
    summary.innerHTML = `<span>${escaparHtml(g.name || sec.label)}</span><span class="meta-count">${answeredInGroup}/${g.qids.length}</span>`;
    det.appendChild(summary);

    g.qids.forEach((q) => { det.appendChild(renderQuestionRow(q)); });
    mainEl.appendChild(det);
  });

  mainEl.querySelector("#expAll").onclick = () => {
    sec.groups.forEach((g, gi) => { groupOpen[sec.id + "::" + gi] = true; });
    mainEl.querySelectorAll("details.group").forEach((d) => { d.open = true; });
  };
  mainEl.querySelector("#colAll").onclick = () => {
    sec.groups.forEach((g, gi) => { groupOpen[sec.id + "::" + gi] = false; });
    mainEl.querySelectorAll("details.group").forEach((d) => { d.open = false; });
  };
}

function chipBg(cls) { return { bad: "var(--bad-bg)", gold: "#FBF3E1", ok: "var(--ok-bg)", na: "var(--na-bg)" }[cls]; }
function chipFg(cls) { return { bad: "var(--bad)", gold: "var(--gold-dark)", ok: "var(--ok)", na: "var(--na)" }[cls]; }

function renderQuestionRow(q) {
  const row = document.createElement("div");
  const r = responses[q.id] || {};
  row.className = "q-row" + (r.value ? " answered-" + r.value : "");
  row.id = "row-" + q.id;

  const top = document.createElement("div");
  top.className = "q-top";
  top.innerHTML = `
    <div class="q-text"><span class="q-num">${q.num}.</span>${escaparHtml(q.text)}</div>
    <button class="note-toggle ${r.obs ? "has-note" : ""}" data-qid="${q.id}">📝 Nota</button>
  `;
  row.appendChild(top);

  const seg = document.createElement("div");
  seg.className = "seg";
  ["SI", "NO", "NA"].forEach((val) => {
    const b = document.createElement("button");
    b.className = val.toLowerCase() + (r.value === val ? " on" : "");
    b.textContent = val === "NA" ? "N/A" : val;
    b.onclick = () => setAnswer(q.id, val);
    seg.appendChild(b);
  });
  row.appendChild(seg);

  const ta = document.createElement("textarea");
  ta.className = "obs";
  ta.placeholder = "Observaciones / evidencia...";
  ta.value = r.obs || "";
  ta.style.display = r.obs || r.value === "NO" ? "block" : "none";
  ta.oninput = (e) => {
    responses[q.id] = responses[q.id] || {};
    responses[q.id].obs = e.target.value;
    saveCurrent(false);
  };
  row.appendChild(ta);

  row.querySelector(".note-toggle").onclick = () => {
    ta.style.display = ta.style.display === "none" ? "block" : "none";
    if (ta.style.display === "block") ta.focus();
  };

  return row;
}

function setAnswer(qid, val) {
  const cur = responses[qid] || {};
  cur.value = cur.value === val ? null : val;
  responses[qid] = cur;
  const scrollY = window.scrollY;
  renderAll();
  window.scrollTo(0, scrollY);
  saveCurrent(false);
}

function renderHeader() {
  const g = globalScore();
  const q = qualify(g.pct);
  document.getElementById("globalPct").textContent = g.pct === null ? "—" : g.pct + "%";
  document.getElementById("globalRing").style.setProperty("--pct", g.pct || 0);
  document.getElementById("globalQual").textContent = q.label;
  statusEl.innerHTML = `<b>${g.answered}/${g.total}</b> respondidas`;

  // Avance real (respondidas/total, no si/no), para el anillo compacto junto
  // a las pestañas: sube según se contesta, no depende del % de cumplimiento.
  const avance = g.total > 0 ? Math.round((g.answered / g.total) * 100) : 0;
  document.getElementById("tabsRing").style.setProperty("--pct", avance);
  document.getElementById("tabsPct").textContent = avance + "%";
}

function renderAll() {
  renderTabs();
  renderMain();
  renderHeader();
}

/* ============ CAMPOS DE ENCABEZADO ============ */
const fechaInput = document.getElementById("fecha");
const auditorInput = document.getElementById("auditor");
const areaInput = document.getElementById("area");

fechaInput.onchange = async () => {
  meta.fecha = fechaInput.value;
  const existing = await loadMonth(monthKey(meta.fecha));
  if (existing) {
    meta = existing.meta;
    responses = existing.responses;
    fechaInput.value = meta.fecha;
    auditorInput.value = meta.auditor || "";
    areaInput.value = meta.area || "";
    showToastMsg("Auditoría de ese mes cargada");
  }
  renderAll();
};
auditorInput.oninput = () => { meta.auditor = auditorInput.value; saveCurrent(false); };
areaInput.oninput = () => { meta.area = areaInput.value; saveCurrent(false); };

/* ============ ACCIONES DEL PIE ============ */
document.getElementById("btnGuardar").onclick = () => saveCurrent(true);
// El listado de auditorías guardadas y el botón "Historial" viven en su
// propia página (historial.html, ver bpm-historial.js) — igual que en el
// resto del hub — en vez de la hoja emergente que había antes aquí.

function showToastMsg(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}

/* ============ SESIÓN ============ */
document.getElementById("btnSalir").addEventListener("click", () => cerrarSesion());

/* ============ INICIO ============ */
protegerPagina({}, async ({ user, perfil }) => {
  usuarioActual = user;

  const nombreVisible = perfil.nombre || user.email;
  document.getElementById("nombreUsuario").textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  document.getElementById("avatarUsuario").textContent = iniciales(nombreVisible);

  await cargarPreguntasConfiguradas();

  // "Abrir" desde el Historial trae el mes elegido en la URL
  // (?mes=aaaa-mm, ver bpm-historial.js); sin ese parámetro arranca en el
  // mes actual, como "+ Nuevo registro".
  const mesPedido = new URLSearchParams(window.location.search).get("mes");
  meta.fecha = mesPedido ? `${mesPedido}-01` : todayStr();
  fechaInput.value = meta.fecha;

  const existing = await loadMonth(monthKey(meta.fecha));
  if (existing) {
    meta = existing.meta;
    responses = existing.responses;
    fechaInput.value = meta.fecha || todayStr();
    auditorInput.value = meta.auditor || "";
    areaInput.value = meta.area || "";
  } else if (mesPedido) {
    // El Historial solo enlaza meses que ya existen; si de todos modos no
    // se encontró (se borró entre que se listó y se abrió), se avisa en
    // vez de dejar la auditoría de ese mes en blanco sin explicación.
    showToastMsg("No se encontró esa auditoría; se muestra un mes nuevo.");
  }
  renderAll();
});

/**
 * Trae las preguntas vigentes (editadas en Configuraciones → SIG-FO-116).
 * Si falla la lectura no se bloquea la auditoría: sigue con las
 * originales, pero lo avisa arriba del listado.
 */
async function cargarPreguntasConfiguradas() {
  try {
    const { secciones } = await cargarPreguntasBpm();
    SECTIONS = estructuraActiva(secciones);
    avisoPreguntas = "";
  } catch (e) {
    console.error("No se pudieron cargar las preguntas configuradas:", e);
    avisoPreguntas = "No se pudieron cargar las preguntas actualizadas; se muestran las originales del formato. Recarga la página cuando tengas conexión.";
  }
  // Si la sección activa quedó vacía y se le quitaron todas sus preguntas
  // (o toda la auditoría se quedó sin ninguna sección con preguntas
  // activas), cae a la primera disponible en vez de dejar la pantalla en
  // blanco con una pestaña que ya no existe.
  if (!SECTIONS.some((s) => s.id === activeSection)) {
    activeSection = SECTIONS[0]?.id ?? null;
  }
}
