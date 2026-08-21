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
import { obtenerAuditoriaBpm, guardarAuditoriaBpm, listarAuditoriasBpm } from "../js/firestore.js";
import { iniciales, escaparHtml, mostrarToast } from "../js/utils.js";

/* ============ DATA: preguntas replicadas del formato SIG-FO-116 ============ */
const SECTIONS = [
  {
    id: "calidad", label: "Control de Calidad",
    groups: [{ name: null, items: [
      "¿Se cuenta con certificaciones del Sistema de Calidad (ISO-HACCP-FDA)?",
      "¿Se cuenta con un programa de auditorías internas?",
      "¿Se cumple con algún sistema para atender las reclamaciones y devoluciones hechas por parte de los clientes?",
      "¿Se analizan los orígenes de reclamaciones y devoluciones para eliminarlos? (evidencias)",
      "¿Se llevan a cabo o se implementan acciones correctivas? (evidencias)",
      "¿Se cuenta con los instrumentos calibrados que sirvan para liberar la calidad y aceptación del producto, además de sus certificados?",
      "¿Cómo establecen y estipulan los acuerdos y especificaciones de calidad con sus clientes?",
      "¿Se encuentran controladas las especificaciones de los clientes?",
      "¿Los operadores conocen los planes de reacción en caso de encontrar producto no conforme?",
      "¿El proveedor demuestra un mejoramiento continuo de la calidad?",
      "¿Tiene certificaciones de Medio Ambiente (sistemas de gestión, autorizaciones o reconocimientos de entes gubernamentales)?",
      "¿Tiene programas de Responsabilidad Social?",
      "¿Tiene programas de Seguridad Industrial acorde al sector al que pertenece?",
      "¿Cuentan con Unidad o Departamento de Calidad con autonomía para la toma de decisiones?",
      "¿Emite un certificado de calidad para los productos que comercializa?",
      "¿Está previsto cómo notificar cambios a los clientes en las especificaciones, insumos, procesos de manufactura y fabricantes, antes de su implementación?",
      "¿Está documentado que las materias primas / materiales se compran a proveedores aprobados por Aseguramiento / Control de Calidad?",
      "¿Se cuenta con un sistema para la evaluación de proveedores?"
    ]}]
  },
  {
    id: "proceso", label: "Control de Proceso",
    groups: [{ name: null, items: [
      "¿Se tienen definidas las variables de los diferentes procesos clave?",
      "¿Se monitorea diariamente y durante el proceso el comportamiento de las variables inspeccionadas?",
      "¿Se cuenta con frecuencias definidas para el monitoreo del proceso y las variables establecidas?",
      "¿Los procedimientos y/o instructivos de trabajo son conocidos por el personal?",
      "¿Los operadores del proceso entienden e interpretan las gráficas de control, paretos e ishikawas?",
      "¿Se realizan acciones correctivas cuando el proceso lo requiere?",
      "¿Están documentadas las acciones correctivas?",
      "¿Se cuenta con un sistema de identificación y trazabilidad?",
      "¿Se mantienen las especificaciones vigentes en el piso de trabajo?",
      "¿Cómo son controladas las especificaciones vigentes?",
      "¿Se cuenta con un programa de mantenimiento de equipos?",
      "¿Está actualizada la calibración cuando es requerida (equipos usados en puntos críticos de control u otros equipos críticos)?",
      "¿Las actividades de inspección se realizan al arranque de la corrida y durante? ¿Con qué frecuencia? ¿Se encuentran documentadas?",
      "¿Cuenta con un sistema homogéneo de asignación de número de lote por corrida de producción?",
      "¿Se encuentran identificados claramente los materiales de desecho y sus recipientes?",
      "¿Las áreas están separadas e identificadas de acuerdo a la actividad que allí se realiza?",
      "¿Existen áreas separadas para recepción, muestreo, rechazos, materiales aprobados y devoluciones?",
      "¿Se cuenta con los implementos necesarios para cada una de las actividades a realizar?",
      "¿Los estantes o racks están separados de la pared al menos 30 cm?",
      "¿Se da mantenimiento a las instalaciones según cronograma de actividades?",
      "¿El flujo de los procesos garantiza que no se mezclan materiales rechazados con aprobados?"
    ]}]
  },
  {
    id: "bpm", label: "Buenas Prácticas de Manufactura",
    groups: [
      { name: "Personal", items: [
        "¿En el programa de capacitación anual se incluyen las Buenas Prácticas de Manufactura? Evidencia.",
        "¿Los trabajadores conocen, entienden y siguen las BPM?",
        "¿En las áreas de proceso existen letreros que indiquen \"NO COMER, NO FUMAR\", etc.?",
        "¿Se prohíbe comer, fumar, escupir o masticar chicle mientras se encuentre en el área de trabajo?",
        "¿Se tiene establecida la forma como el personal debe portar su uniforme, así como su equipo de protección personal?",
        "¿El personal cuenta con el entrenamiento apropiado de acuerdo a la naturaleza de las actividades que desarrolla?"
      ]},
      { name: "Instalaciones", items: [
        "¿El resanado de paredes está en buenas condiciones, selladas adecuadamente sin cuarteaduras o grietas para prevenir la propagación de plagas?",
        "¿Están los techos libres de contaminantes potenciales?",
        "¿Los pisos son adecuados y están bien mantenidos para prevenir una contaminación?",
        "¿Existe alumbrado suficiente en las áreas de producción e inspección?",
        "¿La ventilación es adecuada para minimizar los posibles olores?",
        "¿Existe separación de áreas de trabajo con áreas de proceso del producto (ej. carga y descarga separado de proceso; almacén de químicos separado de proceso)?",
        "¿El área de mantenimiento está limpia, ordenada y bien aislada?",
        "¿Se cuenta con áreas destinadas para almacenar equipos o materiales, para prevenir errores y contaminación cruzada?",
        "¿El drenaje es adecuado a las instalaciones?",
        "¿Los drenajes están provistos de rejillas para evitar la entrada de plagas?"
      ]},
      { name: "Baños", items: [
        "¿Los baños cuentan con puertas y no tienen acceso directo al proceso, materias primas o área de empaque?",
        "¿Los baños cuentan con dispositivos para el jabón?",
        "¿Se cuenta con papel y/o dispositivo para el secado de manos?",
        "¿Se encuentran limpios los baños y/o mingitorios?"
      ]},
      { name: "Terrenos y Patios", items: [
        "¿En el exterior de la nave de proceso se mantiene un perímetro sin objetos, plantas, animales y libre de escombros?",
        "¿Las áreas verdes y jardines son podados y conservados regularmente para minimizar el posible refugio de plagas?",
        "¿Los escombros, desperdicios, compactados y basura están almacenados de manera que se elimine el refugio de plagas y alejados de la nave de proceso?",
        "¿Se da mantenimiento adecuado a estas áreas para evitar la propagación de plagas?",
        "¿Las áreas exteriores cercanas a las áreas de proceso se encuentran libres de agua estancada, fugas u otros problemas que generen propagación de plagas?"
      ]},
      { name: "Control de Plagas", items: [
        "¿Se cuenta con un programa documentado, vigente y continuo de fumigación contra insectos y plagas?",
        "¿Es contratado?",
        "¿Es de planta?",
        "¿El proveedor conoce los materiales que se utilizan para la fumigación de su instalación?",
        "¿El proveedor tiene una lista de sustancias químicas autorizadas para la fumigación de su instalación?",
        "¿Se cumple con el programa de Control de Plagas?",
        "¿Se utiliza este espacio para la inspección del control de roedores? (Se recomienda pintura blanca para el perímetro, facilita mantenimiento e inspección)",
        "¿El plano de localización para trampas de roedores indica la posición actual de las trampas?",
        "¿Hay buena protección contra insectos, roedores y pájaros?",
        "¿Existe un área de almacenamiento de basura?",
        "¿Los contenedores de basura están limpios e identificados para prevenir contaminaciones?"
      ]},
      { name: "Manejo de Residuos Peligrosos", items: [
        "¿Los cuadros de clasificación de riesgos de sustancias químicas utilizadas en la planta están a la vista del personal?",
        "¿Todo el material y desperdicio peligroso es almacenado correctamente?"
      ]},
      { name: "Instalaciones (continuación)", items: [
        "¿Es adecuada la construcción para los procesos que se llevan a cabo?",
        "¿El acabado de paredes, pisos y techos facilita su mantenimiento y limpieza?",
        "¿Se dispone de servicios sanitarios, vestidores y regaderas apropiados para el personal, separados de las áreas operativas?",
        "¿La iluminación es adecuada para la operación?",
        "¿Las áreas productivas se encuentran limpias y ordenadas?",
        "¿La delimitación e identificación de las áreas productivas es adecuada para los diferentes procesos?",
        "¿Se encuentran identificadas adecuadamente, por código de colores, las tuberías de los servicios generales (aire comprimido, gas, agua, vapor)?"
      ]},
      { name: "Personal (continuación)", items: [
        "¿Se reubica al personal que se encuentra enfermo en procesos de bajo riesgo de contaminación?",
        "Recipientes de basura identificados y con tapa",
        "Elementos de protección personal",
        "Exámenes de visiometría para personal de inspección visual"
      ]}
    ]
  },
  {
    id: "haccp", label: "HACCP",
    groups: [{ name: null, items: [
      "¿Se emplea alguna agencia externa reconocida para la verificación de cumplimiento de HACCP?",
      "¿Se tienen identificados los riesgos o peligros para el producto?",
      "¿Se tienen determinados los puntos críticos de control?",
      "¿Se cuenta con especificaciones en cada punto crítico de control?",
      "¿Se cuenta con mecanismos de monitoreo de cada punto crítico de control?",
      "¿Se cuenta con registros de calidad (documentado)?",
      "¿Se cuenta con procedimientos de verificación?"
    ]}]
  },
  {
    id: "almacenamiento", label: "Almacenamiento y Transporte",
    groups: [{ name: null, items: [
      "¿El producto terminado se encuentra almacenado sobre tarimas?",
      "¿El producto se encuentra identificado con estatus de calidad e información para rastreo?",
      "¿Los vehículos de transporte son inspeccionados antes de cargar los productos, asegurándose que se encuentran en óptimas condiciones sanitarias, libres de hoyos y posibles contaminaciones?",
      "¿El personal que realiza las maniobras de carga del producto conoce los procedimientos de manipulación?",
      "¿Se identifican las cajas adecuadamente para evitar la confusión en los envíos?",
      "¿Los almacenes se encuentran limpios, ordenados, sin humedad ni indicio de plagas? ¿Sólo se encuentran los materiales propios de cada almacén?",
      "¿Las materias primas, ingredientes y materiales de empaque se encuentran almacenados sobre tarimas?",
      "¿Las materias primas y materiales se encuentran identificados con su estatus de calidad e información para trazabilidad?",
      "¿El proveedor tiene en ejecución un procedimiento para la medida y el análisis de los datos de satisfacción del cliente?",
      "¿Hay un procedimiento documentado de la queja del cliente que demuestre la resolución eficaz de las peticiones del cliente por medios apropiados?",
      "¿Los resultados de problemas anteriores están cerrados según lo definido en el plan de acción correctiva?",
      "¿El proveedor maneja indicadores como exactitud de inventario, cumplimiento del plan de producción, cumplimiento del plan de mantenimiento preventivo, STC, CTR? ¿Su cumplimiento y metas están acorde con las mejores prácticas?",
      "¿El proveedor muestra un mejoramiento continuo en los indicadores de desempeño (en promedio)?",
      "¿Cuenta con procedimientos escritos para la recepción, identificación y almacenamiento de materias primas y materiales?",
      "¿Se encuentra ordenado y limpio el almacén?",
      "¿Se cuenta con extintores suficientes y está libre el acceso a ellos?",
      "¿Tiene establecido un programa de control de plagas y mantiene registros de los servicios realizados?",
      "¿Cuentan con procedimiento y registros de limpieza de los almacenes?",
      "¿El acceso es controlado a materiales rechazados?",
      "¿Los instrumentos de inspección y medición están calibrados?",
      "¿Existe procedimiento para el manejo de derrames e imprevistos?",
      "¿Se controla la limpieza de camiones al despacho?"
    ]}]
  },
  {
    id: "mejora", label: "Mejora Contínua",
    groups: [{ name: null, items: [
      "¿Se cuenta con una estrategia de mejora continua?",
      "¿Dentro de esta estrategia se contemplan conceptos de Poka Yokes, Kaizen, SMED?"
    ]}]
  }
];

/* Arma el registro plano de preguntas con ids estables. */
SECTIONS.forEach((sec) => {
  let n = 0;
  sec.groups.forEach((g) => {
    g.qids = g.items.map((text) => {
      n++;
      return { id: sec.id + "-" + n, text, num: n };
    });
  });
});

/* ============ ESTADO ============ */
let usuarioActual = null;
let responses = {}; // { qid: {value:'SI'|'NO'|'NA', obs:''} }
let meta = { fecha: "", auditor: "", area: "" };
let activeSection = SECTIONS[0].id;

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

const overlay = document.getElementById("overlay");
document.getElementById("btnHistorial").onclick = async () => {
  const list = document.getElementById("histList");
  list.innerHTML = '<p style="color:var(--text-soft);font-size:13px;">Cargando…</p>';
  overlay.classList.add("show");

  let auditorias = [];
  try {
    auditorias = await listarAuditoriasBpm();
  } catch (e) {
    console.error("No se pudieron listar las auditorías de BPM:", e);
    list.innerHTML = '<p style="color:var(--bad);font-size:13px;">No se pudo cargar el historial.</p>';
    return;
  }

  list.innerHTML = "";
  if (auditorias.length === 0) {
    list.innerHTML = '<p style="color:var(--text-soft);font-size:13px;">Aún no hay auditorías guardadas.</p>';
    return;
  }
  auditorias.forEach((data) => {
    const item = document.createElement("div");
    item.className = "hist-item";
    const g = computeFromResponses(data.responses);
    item.innerHTML = `
      <div class="l">${escaparHtml(data.id)}<small>${data.meta && data.meta.auditor ? "Auditor: " + escaparHtml(data.meta.auditor) : "Sin auditor registrado"}${g.pct !== null ? " · " + g.pct + "%" : ""}</small></div>
      <button data-key="${escaparHtml(data.id)}">Abrir</button>`;
    item.querySelector("button").onclick = async () => {
      meta = data.meta || { fecha: "", auditor: "", area: "" };
      responses = data.responses || {};
      fechaInput.value = meta.fecha || "";
      auditorInput.value = meta.auditor || "";
      areaInput.value = meta.area || "";
      renderAll();
      overlay.classList.remove("show");
    };
    list.appendChild(item);
  });
};
document.getElementById("closeSheet").onclick = () => overlay.classList.remove("show");
overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove("show"); };

function computeFromResponses(resp) {
  let si = 0, no = 0;
  Object.values(resp || {}).forEach((r) => {
    if (r.value === "SI") si++;
    else if (r.value === "NO") no++;
  });
  const denom = si + no;
  return { pct: denom > 0 ? Math.round((si / denom) * 1000) / 10 : null };
}

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

  meta.fecha = todayStr();
  fechaInput.value = meta.fecha;

  const existing = await loadMonth(monthKey(meta.fecha));
  if (existing) {
    meta = existing.meta;
    responses = existing.responses;
    fechaInput.value = meta.fecha || todayStr();
    auditorInput.value = meta.auditor || "";
    areaInput.value = meta.area || "";
  }
  renderAll();
});
