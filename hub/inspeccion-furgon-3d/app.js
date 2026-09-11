// =========================================================
// app.js — Inspector 3D del Contenedor Marítimo (LOG-FO-101)
//
// Módulo de inspección 3D con maqueta técnica seccionada del contenedor
// marítimo (chapa corrugada azul, marco estructural perimetral, piso de
// madera con rejilla, puertas dobles con barras de cierre).
//
// Vistas dinámicas (cutaway):
// - Vista Externa: contenedor cerrado para inspección de exteriores.
// - Vista Interna: corte seccionado automático (pared frontal abierta
//   manteniendo rieles y postes) exactamente como en la maqueta de referencia.
// - Al orbitar o seleccionar cada sección del checklist, la pared que
//   obstruye la visión se oculta automáticamente y la cámara encuadra la zona.
// =========================================================

import { protegerPagina, cerrarSesion, etiquetaRol } from "../js/auth.js";
import { iniciales, forzarMayusculas, forzarFormatoPlaca } from "../js/utils.js";
import { db } from "../js/firebase-config.js";
import { collection, doc, getDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  configurarAutocompletadoProveedor,
  registrarProveedorSiNoExiste,
  normalizarNombreProveedor,
} from "../js/proveedores-transporte.js";
import {
  preguntasBase,
  cargarPreguntasLiberacion,
  seccionesDelFormulario,
  preguntasEvaluadas,
  construirRespuestasRegistro,
} from "../js/liberacion-checklist.js";

let currentUser = null;
let currentPerfil = null;

// Las preguntas se editan desde verificacion-transporte/admin.html (ver
// liberacion-checklist.js). Arranca con las originales y se reemplaza al
// iniciar sesión: por las configuradas en una inspección nueva, o por las
// que se evaluaron en su momento al abrir una ya guardada.
let PART_DEFS = seccionesDelFormulario(preguntasBase());

const STATUS_CSS = {
  pending: { color: '#8f887c', bg: '#e4ded2', label: 'Sin evaluar' },
  pass: { color: '#3f5a2c', bg: '#dbe6cf', label: 'Aprobado' },
  fail: { color: '#7a2416', bg: '#f1d7cf', label: 'Rechazado' },
};

const STORAGE_KEY = 'furgon_desmontable_inspecciones_v1';

const state = {
  viewMode: 'exterior',
  selectedPart: null,
  answers: {},
  headerFields: {
    transporte: '',
    piloto: '',
    placa: '',
    tc: '',
  },
  showDialog: false,
  dialogSaved: false,
  saved: false,
  savedAt: null,
  aprobado: null,
  resultado: null,
  avisoPreguntas: '',
};

let THREE, model, camera, controls, stageEl;
let interiorConfigs = {}, exteriorConfigs = {}, interiorDefault = null, camExterior = null;

/** Fecha de HOY en hora local (no UTC) como "AAAA-MM-DD". Ver nota en confirmSave(). */
function fechaHoyLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function partItemsAnswered(partId) { return state.answers[partId] || {}; }

function partStatus(partId) {
  const def = PART_DEFS[partId];
  if (!def) return 'pending';
  const ans = partItemsAnswered(partId);
  let anyNo = false, allYes = true;
  def.items.forEach((it) => {
    const v = ans[it.id];
    if (v === 'no') anyNo = true;
    if (v !== 'si') allYes = false;
  });
  if (anyNo) return 'fail';
  if (allYes) return 'pass';
  return 'pending';
}

function partComplete(partId) {
  const ans = partItemsAnswered(partId);
  return PART_DEFS[partId].items.every((it) => ans[it.id]);
}

/**
 * Aplica los colores de estado y resaltado a los componentes 3D.
 */
function updateMeshColors() {
  if (!model) return;

  Object.keys(PART_DEFS).forEach((partId) => {
    const status = partStatus(partId);
    const isSelected = (partId === state.selectedPart);

    (model.meshesByPart[partId] || []).forEach((m) => {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => {
        if (!mat || !mat.emissive) return;

        if (isSelected) {
          // Resaltado naranja cálido al seleccionar una parte
          mat.emissive.setHex(0xE5A512);
          mat.emissiveIntensity = 0.5;
        } else if (status === 'pass') {
          // Tinte verde suave si está aprobada
          mat.emissive.setHex(0x2E7D32);
          mat.emissiveIntensity = 0.28;
        } else if (status === 'fail') {
          // Tinte rojo si está rechazada
          mat.emissive.setHex(0xC62828);
          mat.emissiveIntensity = 0.38;
        } else {
          // Estado pendiente: sin emisión
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0.0;
        }
      });
    });
  });
}

/**
 * Animación fluida de la cámara (posición y objetivo orbital).
 */
function animateCamera(toPos, toTarget, duration = 800, onDone) {
  if (!camera || !controls) return;
  const fromPos = camera.position.clone();
  const fromTarget = controls.target.clone();
  const start = performance.now();
  controls.enabled = false;

  const step = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    camera.position.lerpVectors(fromPos, toPos, e);
    controls.target.lerpVectors(fromTarget, toTarget, e);
    controls.update();
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      controls.enabled = true;
      if (onDone) onDone();
    }
  };
  requestAnimationFrame(step);
}

/**
 * Animación de apertura y cierre de las puertas traseras de doble hoja.
 */
function animateDoors(open, duration = 800) {
  if (!model || !model.doorPivotL || !model.doorPivotR) return;
  const { doorPivotL, doorPivotR } = model;
  const fromL = doorPivotL.rotation.y, fromR = doorPivotR.rotation.y;
  const toL = open ? -Math.PI / 2 : 0;
  const toR = open ? Math.PI / 2 : 0;
  const start = performance.now();

  const step = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    doorPivotL.rotation.y = fromL + (toL - fromL) * e;
    doorPivotR.rotation.y = fromR + (toR - fromR) * e;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let listFilterMode = 'active'; // 'active', 'exterior', 'interior', 'all'

/**
 * Cambia el modo principal entre Vista Externa y Vista Interna.
 */
function setViewMode(mode) {
  state.viewMode = mode;
  state.selectedPart = null;
  listFilterMode = mode;

  // 1. INMEDIATO: Actualizar la interfaz (pestañas superiores y listado lateral)
  renderAll();

  // 2. Transición 3D protegida
  if (model) {
    try {
      if (mode === 'interior') {
        // Abrir puertas y activar corte seccionado
        animateDoors(true, 800);
        const zSign = camera ? (camera.position.z >= 0 ? 1 : -1) : 1;
        model.applyCutaway('interior', null, zSign);
        const pos = interiorDefault?.cam?.pos || interiorDefault?.pos;
        const target = interiorDefault?.cam?.target || interiorDefault?.target;
        if (pos && target) animateCamera(pos, target, 800);
      } else {
        // Cerrar puertas y contenedor sólido
        animateDoors(false, 800);
        model.applyCutaway('exterior');
        const pos = camExterior?.cam?.pos || camExterior?.pos;
        const target = camExterior?.cam?.target || camExterior?.target;
        if (pos && target) animateCamera(pos, target, 800);
      }
      updateMeshColors();
    } catch (err) {
      console.warn('Aviso al animar vista 3D:', err);
    }
  }
}

/**
 * Selecciona una sección para inspección detallada.
 */
function selectPart(partId) {
  if (state.saved || !PART_DEFS[partId]) return;
  state.selectedPart = partId;

  const isInterior = partId.startsWith('int_');

  // Si la parte seleccionada es de otro modo de vista (por ejemplo desde clic 3D), sincronizar
  if (isInterior && state.viewMode !== 'interior') {
    state.viewMode = 'interior';
  } else if (!isInterior && state.viewMode !== 'exterior') {
    state.viewMode = 'exterior';
  }

  // 1. Actualizar interfaz de inmediato
  renderAll();

  // 2. Transición de cámara y corte seccionado 3D
  if (model) {
    try {
      if (state.viewMode === 'interior') {
        animateDoors(true, 800);
        const zSign = camera ? (camera.position.z >= 0 ? 1 : -1) : 1;
        model.applyCutaway('interior', partId, zSign);
        const config = interiorConfigs[partId];
        if (config) animateCamera(config.cam.pos, config.cam.target, 800);
      } else {
        animateDoors(false, 800);
        model.applyCutaway('exterior');
        const config = exteriorConfigs[partId];
        if (config) animateCamera(config.cam.pos, config.cam.target, 800);
      }
      updateMeshColors();
    } catch (err) {
      console.warn('Aviso al enfocar pieza 3D:', err);
    }
  }
}

/**
 * Deselecciona la parte activa y regresa a la vista general.
 */
function deselectPart() {
  state.selectedPart = null;

  // 1. Actualizar interfaz de inmediato
  renderAll();

  // 2. Transición de cámara y reseteo 3D
  if (model) {
    try {
      if (state.viewMode === 'interior') {
        const zSign = camera ? (camera.position.z >= 0 ? 1 : -1) : 1;
        model.applyCutaway('interior', null, zSign);
        const pos = interiorDefault?.cam?.pos || interiorDefault?.pos;
        const target = interiorDefault?.cam?.target || interiorDefault?.target;
        if (pos && target) animateCamera(pos, target, 700);
      } else {
        model.applyCutaway('exterior');
        const pos = camExterior?.cam?.pos || camExterior?.pos;
        const target = camExterior?.cam?.target || camExterior?.target;
        if (pos && target) animateCamera(pos, target, 700);
      }
      updateMeshColors();
    } catch (err) {
      console.warn('Aviso al resetear vista 3D:', err);
    }
  }
}

function setAnswer(partId, itemId, value) {
  if (state.saved) return;
  state.answers[partId] = { ...state.answers[partId], [itemId]: value };
  updateMeshColors();
  renderAll();
}

// Mapeo entre piezas externas e internas para permitir seleccionar la parte correspondiente
// sin importar si el usuario hace clic en la cara exterior o interior del contenedor
const EXT_TO_INT_MAP = {
  ext_pared_izquierda: 'int_pared_izquierda',
  ext_pared_derecha:   'int_pared_derecha',
  ext_techo:           'int_techo',
  ext_puertas:         'int_puertas',
  cabina:              'int_frente',
};

const INT_TO_EXT_MAP = {
  int_pared_izquierda: 'ext_pared_izquierda',
  int_pared_derecha:   'ext_pared_derecha',
  int_techo:           'ext_techo',
  int_puertas:         'ext_puertas',
  int_frente:          'cabina',
};

/**
 * Raycasting para hacer clic directamente en las piezas 3D.
 * Selecciona la pieza adecuada manteniéndose en el modo actual (exterior o interior).
 */
function handlePick(e) {
  if (!model || !stageEl || !camera) return;
  const rect = stageEl.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);

  const hits = ray.intersectObjects(model.group.children, true);
  for (let i = 0; i < hits.length; i++) {
    const hitObj = hits[i].object;

    // 1. Descartar mallas que estén ocultas o dentro de un grupo oculto
    let isVisible = true;
    let curr = hitObj;
    while (curr && curr !== model.group) {
      if (curr.visible === false) { isVisible = false; break; }
      curr = curr.parent;
    }
    if (!isVisible) continue;

    // 2. Buscar si la pieza o su contenedor tiene un identificador de inspección
    let target = hitObj;
    let matchedPart = null;
    while (target && target !== model.group) {
      const part = target.userData && target.userData.part;
      if (part && PART_DEFS[part]) {
        matchedPart = part;
        break;
      }
      target = target.parent;
    }
    if (!matchedPart) continue;

    // 3. Coincidencia directa con el modo actual (interior o exterior)
    if (PART_DEFS[matchedPart].mode === state.viewMode) {
      selectPart(matchedPart);
      return;
    }

    // 4. Si estamos en modo interior y se hizo clic sobre una superficie exterior visible
    if (state.viewMode === 'interior' && EXT_TO_INT_MAP[matchedPart]) {
      selectPart(EXT_TO_INT_MAP[matchedPart]);
      return;
    }

    // 5. Si estamos en modo exterior y se hizo clic sobre una superficie interior visible
    if (state.viewMode === 'exterior' && INT_TO_EXT_MAP[matchedPart]) {
      selectPart(INT_TO_EXT_MAP[matchedPart]);
      return;
    }
  }
}

/**
 * Inicialización del Stage 3D y configuración de posiciones de cámara.
 */
async function initStage(stage) {
  stageEl = stage;
  const ready = await stage.ready;
  THREE = ready.THREE;
  const mod = await import('./FurgonModel.js');
  model = await mod.buildTruck(THREE);
  stage.setObject(model.group);
  camera = stage._camera;
  controls = stage._controls;

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const { L, W, H } = mod.DIMS;
  const halfL = L / 2;
  const halfW = W / 2;

  // Cámara general exterior
  camExterior = {
    pos: V(halfL * 1.3, H * 1.6, W * 2.8),
    target: V(0, H * 0.45, 0),
    cam: {
      pos: V(halfL * 1.3, H * 1.6, W * 2.8),
      target: V(0, H * 0.45, 0),
    },
  };

  // Cámara general interior: vista de túnel desde la entrada con puertas abiertas y todas las paredes visibles
  interiorDefault = {
    pos: V(halfL + 2.6, H * 0.58, 0.001),
    target: V(-halfL * 0.2, H * 0.45, 0),
    cam: {
      pos: V(halfL + 2.6, H * 0.58, 0.001),
      target: V(-halfL * 0.2, H * 0.45, 0),
    },
  };

  // Vistas enfocadas para partes exteriores (Piloto = +Z, Copiloto = -Z)
  exteriorConfigs = {
    ext_pared_izquierda: { cam: { pos: V(0, H * 0.5, W * 2.8), target: V(0, H * 0.5, 0) } },
    ext_pared_derecha:   { cam: { pos: V(0, H * 0.5, -W * 2.8), target: V(0, H * 0.5, 0) } },
    ext_techo:           { cam: { pos: V(0, H * 2.6, W * 1.4), target: V(0, H, 0) } },
    ext_puertas:         { cam: { pos: V(halfL + 3.2, H * 0.55, 0.001), target: V(halfL, H * 0.5, 0) } },
    cabina:              { cam: { pos: V(-halfL - 3.2, H * 0.55, 0.001), target: V(-halfL, H * 0.45, 0) } },
    generales:           { cam: { pos: V(halfL * 0.5, 0.35, -W * 2.4), target: V(halfL * 0.3, 0.1, 0) } },
  };

  // Vistas enfocadas para partes interiores
  interiorConfigs = {
    // Pared Izquierda (+Z): se abre pared derecha (-Z) y la cámara mira desde afuera hacia +Z
    int_pared_izquierda: { cam: { pos: V(0, H * 0.5, -W * 2.4), target: V(0, H * 0.5, halfW - 0.1) } },
    // Pared Derecha (-Z): se abre pared izquierda (+Z) y la cámara mira desde afuera hacia -Z
    int_pared_derecha:   { cam: { pos: V(0, H * 0.5, W * 2.4), target: V(0, H * 0.5, -halfW + 0.1) } },
    // Piso: techo retirado, cámara cenital enfocando piso de madera y rejilla
    int_piso:            { cam: { pos: V(0.5, H * 2.4, W * 1.5), target: V(0.5, 0.1, 0) } },
    // Techo: pared abierta para encuadrar las vigas y chapa superior
    int_techo:           { cam: { pos: V(0, 0.45, W * 1.6), target: V(0, H - 0.05, 0) } },
    // Puertas interiores
    int_puertas:         { cam: { pos: V(halfL + 2.5, H * 0.6, W * 1.2), target: V(halfL - 0.2, H * 0.5, 0) } },
    // Pared frontal (fondo): todas las paredes presentes, vista frontal directa hacia el fondo
    int_frente:          { cam: { pos: V(halfL * 0.6, H * 0.55, 0.001), target: V(-halfL + 0.1, H * 0.5, 0) } },
  };

  // En vista general reposan todas las paredes visibles
  model.applyCutaway('exterior');
  updateMeshColors();

  // Detección de clics rápidos para no interferir con el arrastre orbital
  let down = null;
  const canvasTarget = (stage._renderer && stage._renderer.domElement) || stage;

  const onPointerDown = (e) => {
    down = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e) => {
    if (!down) return;
    const d = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (d < 6) handlePick(e);
  };

  canvasTarget.addEventListener('pointerdown', onPointerDown);
  canvasTarget.addEventListener('pointerup', onPointerUp);
  if (canvasTarget !== stage) {
    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointerup', onPointerUp);
  }
}

/* ============ UI ============ */

const els = {
  extBtn: document.getElementById('btnExterior'),
  intBtn: document.getElementById('btnInterior'),
  transporte: document.getElementById('campoTransporte'),
  listaSugerenciasTransporte: document.getElementById('listaSugerenciasTransporte'),
  badgeProveedor: document.getElementById('badgeProveedor'),
  piloto: document.getElementById('campoPiloto'),
  placa: document.getElementById('campoPlaca'),
  tc: document.getElementById('campoTc'),
  fecha: document.getElementById('fechaHoy'),
  savedBanner: document.getElementById('savedBanner'),
  progressCount: document.getElementById('progressCount'),
  progressBar: document.getElementById('progressBar'),
  btnFinalizar: document.getElementById('btnFinalizar'),
  panelBody: document.getElementById('panelBody'),
  hint: document.getElementById('hintOverlay'),
  dialogBackdrop: document.getElementById('dialogBackdrop'),
  dialogBody: document.getElementById('dialogBody'),
};

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

function renderHeaderFields() {
  ['transporte', 'piloto', 'placa', 'tc'].forEach((key) => {
    if (els[key]) {
      els[key].value = state.headerFields[key] || '';
      els[key].disabled = state.saved;
    }
  });
  if (els.fecha) {
    els.fecha.textContent = 'Fecha: ' + new Date().toLocaleDateString('es-GT');
  }
}

function renderTabs() {
  const isExt = state.viewMode === 'exterior';
  const isInt = state.viewMode === 'interior';

  const ext = els.extBtn || document.getElementById('btnExterior');
  const int = els.intBtn || document.getElementById('btnInterior');

  if (ext) {
    ext.classList.toggle('active', isExt);
    ext.setAttribute('aria-selected', isExt ? 'true' : 'false');
  }
  if (int) {
    int.classList.toggle('active', isInt);
    int.setAttribute('aria-selected', isInt ? 'true' : 'false');
  }
}

function renderProgress() {
  const allIds = Object.keys(PART_DEFS);
  const doneCount = allIds.filter((id) => partComplete(id)).length;
  const totalParts = allIds.length;
  els.progressCount.textContent = `${doneCount}/${totalParts}`;
  els.progressBar.style.width = Math.round((doneCount / totalParts) * 100) + '%';
  els.btnFinalizar.disabled = doneCount < totalParts || state.saved;
  return { doneCount, totalParts };
}

function renderSavedBanner() {
  if (state.saved) {
    els.savedBanner.style.display = 'block';
    const aprobado = state.aprobado === true || state.resultado === 'aprobado';
    els.savedBanner.style.background = aprobado ? '#e6f6e6' : '#fceaea';
    els.savedBanner.style.color = aprobado ? '#006300' : '#b32626';
    els.savedBanner.style.border = aprobado ? '1.5px solid #86efac' : '1.5px solid #fca5a5';
    els.savedBanner.style.padding = '10px 16px';
    els.savedBanner.style.fontWeight = '700';
    els.savedBanner.innerHTML = `
      Modo solo lectura (${aprobado ? '✓ CONTENEDOR APROBADO' : '✕ CONTENEDOR RECHAZADO'}) · Placa: <u>${escapeHtml(state.headerFields.placa || '—')}</u> · TC: <u>${escapeHtml(state.headerFields.tc || '—')}</u> · Piloto: ${escapeHtml(state.headerFields.piloto || '—')}
    `;
  } else {
    els.savedBanner.style.display = 'none';
  }
}

function renderPanel() {
  // Se conserva la posición del scroll: al responder Sí/No, renderAll()
  // reconstruye TODO el listado (ahora largo, con las ~12 secciones a la
  // vez), y sin esto la página saltaría al inicio con cada clic.
  const scrollY = window.scrollY;
  els.panelBody.innerHTML = '';
  els.panelBody.appendChild(renderPartsInline());
  window.scrollTo(0, scrollY);
}

/**
 * Un solo listado continuo con TODAS las secciones (Cabina, Paredes,
 * Puertas, Techo, Generales…) de la vista activa (Exterior/Interior), cada
 * una con sus preguntas Sí/No visibles de una vez. Antes había que entrar a
 * cada sección y volver al listado para pasar a la siguiente — eso es lo
 * que se quitó aquí.
 */
function renderPartsInline() {
  const wrap = document.createElement('div');

  if (state.avisoPreguntas) {
    const aviso = document.createElement('div');
    aviso.className = 'aviso-preguntas';
    aviso.style.cssText = 'margin-bottom:10px; padding:8px 12px; border-radius:8px; background:#fef3c7; color:#92400e; font-size:12.5px; font-weight:600;';
    aviso.textContent = state.avisoPreguntas;
    wrap.appendChild(aviso);
  }

  const isInterior = state.viewMode === 'interior';
  const heading = document.createElement('div');
  heading.className = 'list-heading';
  heading.textContent = isInterior ? 'CONDICIÓN INTERNA' : 'CONDICIÓN EXTERNA';
  wrap.appendChild(heading);

  const keys = Object.keys(PART_DEFS).filter((id) => PART_DEFS[id].mode === state.viewMode);
  keys.forEach((id) => wrap.appendChild(renderPartSection(id)));

  return wrap;
}

function renderPartSection(partId) {
  const def = PART_DEFS[partId];
  const ans = partItemsAnswered(partId);
  const status = partStatus(partId);
  const css = STATUS_CSS[status];

  const wrap = document.createElement('div');
  wrap.className = 'part-section';

  const headRow = document.createElement('div');
  headRow.className = 'detail-head';
  headRow.innerHTML = `
    <span class="dot" style="background:${css.color}"></span>
    <div class="card-title">${escapeHtml(def.label)}</div>
    <span class="tag" style="background:${css.bg};color:${css.color};margin-left:auto;">${css.label}</span>
  `;
  wrap.appendChild(headRow);

  def.items.forEach((it) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    const label = document.createElement('div');
    label.className = 'item-row__label';
    label.textContent = it.label;
    row.appendChild(label);

    const seg = document.createElement('div');
    seg.className = 'seg item-toggle';
    const si = document.createElement('button');
    si.type = 'button';
    si.textContent = '✓ Cumple';
    si.className = 'seg-opt seg-opt--cumple' + (ans[it.id] === 'si' ? ' active' : '');
    si.disabled = state.saved;
    si.onclick = () => setAnswer(partId, it.id, 'si');
    const no = document.createElement('button');
    no.type = 'button';
    no.textContent = '✕ No Cumple';
    no.className = 'seg-opt seg-opt--nocumple' + (ans[it.id] === 'no' ? ' active' : '');
    no.disabled = state.saved;
    no.onclick = () => setAnswer(partId, it.id, 'no');
    seg.appendChild(si);
    seg.appendChild(no);
    row.appendChild(seg);
    wrap.appendChild(row);
  });

  return wrap;
}

function renderDialog() {
  if (!state.showDialog) {
    els.dialogBackdrop.style.display = 'none';
    return;
  }
  els.dialogBackdrop.style.display = 'flex';
  els.dialogBody.innerHTML = '';

  if (state.dialogSaved) {
    els.dialogBody.innerHTML = `
      <div class="dialog-title">Inspección guardada</div>
      <div class="dialog-body">El registro de inspección se guardó correctamente en la base de datos (verificaciones_transporte). Puedes revisarlo en el historial o cerrar este cuadro.</div>
      <div class="dialog-actions">
        <button class="btn btn-ghost" id="btnCerrarDialogo">Cerrar</button>
        <a class="btn btn-primary" href="../verificacion-transporte/historial.html" style="text-decoration:none; display:inline-flex; align-items:center;">Ver en Historial</a>
      </div>
    `;
    document.getElementById('btnCerrarDialogo').onclick = closeDialog;
    return;
  }

  const allIds = Object.keys(PART_DEFS);
  let passCount = 0, failCount = 0;
  allIds.forEach((id) => {
    const st = partStatus(id);
    if (st === 'pass') passCount += 1;
    if (st === 'fail') failCount += 1;
  });

  let totalPuntos = 0, puntosCumplidos = 0;
  allIds.forEach((id) => {
    const def = PART_DEFS[id];
    const ans = partItemsAnswered(id);
    def.items.forEach((it) => {
      totalPuntos++;
      if (ans[it.id] === 'si') puntosCumplidos++;
    });
  });
  const pct = totalPuntos > 0 ? Math.round((puntosCumplidos / totalPuntos) * 100) : 100;
  const esAprobado = failCount === 0 && puntosCumplidos === totalPuntos;

  els.dialogBody.innerHTML = `
    <div class="dialog-title">Confirmar Calificación de Inspección</div>
    <div class="dialog-body">
      <div style="padding:12px 14px; border-radius:8px; margin-bottom:12px; font-weight:700; ${esAprobado ? 'background:#dcfce7; color:#15803d; border:1.5px solid #86efac;' : 'background:#fee2e2; color:#b91c1c; border:1.5px solid #fca5a5;'}">
        <div style="font-size:14px; display:flex; align-items:center; gap:6px;">
          ${esAprobado ? '✓ Calificación: 100% · CONTENEDOR APROBADO' : `✕ Calificación: ${pct}% · CONTENEDOR RECHAZADO`}
        </div>
        <div style="font-size:12px; font-weight:500; margin-top:4px; opacity:0.9;">
          ${esAprobado 
            ? 'Cumple satisfactoriamente con todos los puntos evaluados.' 
            : `Se detectaron ${failCount} sección${failCount > 1 ? 'es' : ''} no conformes.`}
        </div>
      </div>
      <div style="font-size:12.5px; color:var(--text-soft); line-height:1.4;">
        Este registro se guardará directamente en la base de datos con el estado de liberación: 
        <strong style="color:${esAprobado ? '#15803d' : '#b91c1c'}; font-size:13px;">${esAprobado ? 'APROBADO' : 'RECHAZADO'}</strong>.
      </div>
    </div>
    <div class="dialog-actions">
      <button class="btn btn-ghost" id="btnCancelarDialogo">Cancelar</button>
      <button class="btn btn-primary" id="btnGuardarDialogo">Guardar Inspección</button>
    </div>
  `;
  document.getElementById('btnCancelarDialogo').onclick = closeDialog;
  document.getElementById('btnGuardarDialogo').onclick = confirmSave;
}

function openFinalize() {
  const transporte = (state.headerFields.transporte || '').trim();
  const piloto = (state.headerFields.piloto || '').trim();
  const placa = (state.headerFields.placa || '').trim();
  const tc = (state.headerFields.tc || '').trim();

  if (!transporte || !piloto || !placa || !tc) {
    alert('Por favor completa los datos obligatorios de la unidad:\n• Empresa / Transporte\n• Nombre de Piloto\n• Placa\n• Tarjeta de Circulación (TC)');
    return;
  }

  state.showDialog = true;
  state.dialogSaved = false;
  renderAll();
}

function closeDialog() { state.showDialog = false; renderAll(); }

async function confirmSave() {
  const allIds = Object.keys(PART_DEFS);
  let passCount = 0, failCount = 0;
  allIds.forEach((id) => {
    const st = partStatus(id);
    if (st === 'pass') passCount += 1;
    if (st === 'fail') failCount += 1;
  });

  const btnGuardar = document.getElementById('btnGuardarDialogo');
  if (btnGuardar) {
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';
  }

  // Estructurar respuestas por zona según el esquema oficial LOG-FO-101,
  // con las preguntas que se evaluaron en ESTA inspección (ver
  // liberacion-checklist.js). La Pared Frontal (interior) va dentro de
  // respuestasCabina: antes se perdía al guardar y una falla ahí no
  // bajaba la calificación.
  const { respuestasPorZona, respuestasCabina: respuestasCabinaFinal } =
    construirRespuestasRegistro(PART_DEFS, state.answers);

  let totalPuntos = 0, puntosCumplidos = 0;
  Object.values(respuestasPorZona).forEach((z) => {
    ['externa', 'interna'].forEach((m) => {
      z[m].forEach((item) => {
        totalPuntos++;
        if (item.valor === 'si') puntosCumplidos++;
      });
    });
  });
  respuestasCabinaFinal.forEach((item) => {
    totalPuntos++;
    if (item.valor === 'si') puntosCumplidos++;
  });

  const pct = totalPuntos > 0 ? Math.round((puntosCumplidos / totalPuntos) * 100) : 100;
  // OJO: new Date().toISOString() da la fecha en UTC, no la fecha local.
  // Guatemala es UTC-6, así que cualquier inspección guardada entre las
  // 18:00 y la medianoche locales caía en el DÍA SIGUIENTE en UTC. Esa
  // fecha "adelantada" quedaba por encima del "hasta" (hoy, en hora local)
  // que usa el historial para filtrar, así que el registro más reciente
  // del día desaparecía de la lista por defecto sin ningún error.
  const fechaISO = state.headerFields.fecha || fechaHoyLocalISO();
  const esAprobado = failCount === 0 && puntosCumplidos === totalPuntos;
  const resultadoTexto = esAprobado ? 'aprobado' : 'rechazado';
  const estadoTexto = esAprobado ? 'Aprobado' : 'Rechazado';

  // Normalizar y registrar automáticamente en proveedores_transporte para unificar mayúsculas/minúsculas
  const transporteNormalizado = await registrarProveedorSiNoExiste(
    state.headerFields.transporte,
    currentUser?.uid || ''
  );
  state.headerFields.transporte = transporteNormalizado;

  const datos = {
    fecha: fechaISO,
    fechaCreacion: serverTimestamp(),
    inspectorUid: currentUser?.uid || '',
    inspectorNombre: currentPerfil?.nombre || currentUser?.email || 'Inspector',
    transporte: transporteNormalizado,
    nombrePiloto: (state.headerFields.piloto || '').trim(),
    placaCamion: (state.headerFields.placa || '').trim(),
    tc: (state.headerFields.tc || '').trim(),
    // Se guarda explícitamente si fue aprobado o no en base a la calificación
    aprobado: esAprobado,
    resultado: resultadoTexto,
    estado: estadoTexto,
    calificacion: pct,
    cumplimientoPorcentaje: pct,
    cumplidos: puntosCumplidos,
    total: totalPuntos,
    origen: 'inspeccion_3d',
    respuestasPorZona,
    respuestasCabina: respuestasCabinaFinal,
    answers: state.answers,
    // Copia de las preguntas tal como estaban al inspeccionar: si luego se
    // editan desde el admin, este registro se sigue abriendo con las suyas.
    preguntasEvaluadas: preguntasEvaluadas(PART_DEFS),
    statuses: Object.fromEntries(allIds.map((p) => [p, partStatus(p)])),
    // Las fotos NO se guardan en Firestore: van como data URL en base64
    // (varios cientos de KB a varios MB cada una) y un documento de
    // Firestore tiene un límite de 1 MiB. Con 1-2 fotos adjuntas el
    // addDoc de abajo fallaba (documento demasiado grande) y ese error
    // quedaba oculto: la UI igual mostraba "guardado" porque el fallo se
    // silenciaba. Las fotos quedan solo en el respaldo local.
  };

  // Guardar en Firestore (colección oficial verificaciones_transporte).
  // Si falla, se detiene aquí y se avisa: antes este error se silenciaba
  // (solo un console.warn) y la pantalla igual mostraba "Guardado", por lo
  // que un registro rechazado -o cualquiera con fotos pesadas- podía NUNCA
  // llegar a la base de datos sin que el inspector se enterara.
  if (!currentUser?.uid) {
    alert('No se pudo guardar: no hay una sesión activa. Vuelve a iniciar sesión e intenta de nuevo.');
    if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.textContent = 'Guardar Inspección'; }
    return;
  }

  try {
    const docRef = await addDoc(collection(db, 'verificaciones_transporte'), datos);
    datos.firestoreId = docRef.id;
  } catch (err) {
    console.error('No se pudo guardar la inspección en Firestore:', err);
    alert(`No se pudo guardar la inspección en la base de datos.\n\nDetalle: ${err.message || err}\n\nLa inspección NO quedó registrada. Verifica tu conexión e intenta de nuevo.`);
    if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.textContent = 'Guardar Inspección'; }
    return;
  }

  // Respaldo local en localStorage.
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    list.push(datos);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {}

  state.dialogSaved = true;
  state.saved = true;
  state.savedAt = new Date();
  state.aprobado = esAprobado;
  state.resultado = resultadoTexto;
  renderAll();
}

function renderAll() {
  renderHeaderFields();
  renderTabs();
  renderSavedBanner();
  renderProgress();
  renderPanel();
  renderDialog();
}

/* ============ Eventos de encabezado ============ */
function enlazarBotonesModo() {
  const ext = els.extBtn || document.getElementById('btnExterior');
  const int = els.intBtn || document.getElementById('btnInterior');

  if (ext) {
    ext.onclick = (e) => {
      e.preventDefault();
      setViewMode('exterior');
    };
    ext.addEventListener('click', (e) => {
      e.preventDefault();
      setViewMode('exterior');
    });
  }
  if (int) {
    int.onclick = (e) => {
      e.preventDefault();
      setViewMode('interior');
    };
    int.addEventListener('click', (e) => {
      e.preventDefault();
      setViewMode('interior');
    });
  }
}
enlazarBotonesModo();

// Configurar buscador con autocompletado y normalización en tiempo real
configurarAutocompletadoProveedor({
  inputEl: els.transporte,
  dropdownEl: els.listaSugerenciasTransporte,
  badgeEl: els.badgeProveedor,
  onSeleccion: (val) => {
    state.headerFields.transporte = val;
  },
});

// Todo el encabezado se captura en mayúsculas, y la placa además con el
// formato C-####. Los escuchas de formato se registran ANTES que el que
// guarda en state para que lo guardado sea ya el texto corregido.
forzarMayusculas(els.transporte);
['piloto', 'tc'].forEach((key) => forzarMayusculas(els[key]));
forzarFormatoPlaca(els.placa); // ya incluye las mayúsculas

['piloto', 'placa', 'tc'].forEach((key) => {
  if (els[key]) {
    els[key].addEventListener('input', (e) => {
      state.headerFields[key] = e.target.value;
    });
    // El formato de la placa también se corrige al salir del campo: hay que
    // guardar ese ajuste, que no dispara "input".
    els[key].addEventListener('blur', (e) => {
      state.headerFields[key] = e.target.value;
    });
  }
});

els.btnFinalizar.onclick = openFinalize;
els.dialogBackdrop.onclick = (e) => { if (e.target === els.dialogBackdrop) closeDialog(); };

/* ============ Carga de inspección existente desde historial ============ */
async function cargarInspeccionExistente(docId) {
  try {
    const snap = await getDoc(doc(db, 'verificaciones_transporte', docId));
    if (snap.exists()) {
      const d = snap.data();
      state.headerFields.transporte = normalizarNombreProveedor(d.transporte || '');
      state.headerFields.piloto = d.nombrePiloto || '';
      state.headerFields.placa = d.placaCamion || '';
      state.headerFields.tc = d.tc || '';

      if (d.answers && typeof d.answers === 'object') {
        state.answers = d.answers;
      }
      // Los registros anteriores a las preguntas editables no traen copia:
      // se evaluaron con las originales, que son las del arranque.
      if (d.preguntasEvaluadas && typeof d.preguntasEvaluadas === 'object') {
        PART_DEFS = seccionesDelFormulario(d.preguntasEvaluadas);
      }

      state.saved = true;
      state.savedAt = d.fechaCreacion?.toDate?.() || (d.fecha ? new Date(d.fecha + 'T12:00:00') : new Date());

      const aprobado = typeof d.aprobado === 'boolean'
        ? d.aprobado
        : (d.resultado === 'aprobado' || d.cumplimientoPorcentaje === 100);
      state.aprobado = aprobado;
      state.resultado = aprobado ? 'aprobado' : 'rechazado';

      renderAll();
      updateMeshColors();
    }
  } catch (err) {
    console.error('Error al cargar inspección en 3D:', err);
    renderAll();
  }
}

/* ============ Arranque del stage 3D (Comentado a solicitud: versión con 3D respaldada en copia-3d-respaldo/ y app-3d-backup.js) ============ */
/*
const stage = document.querySelector('three-d-stage');
if (stage) {
  customElements.whenDefined('three-d-stage')
    .then(() => initStage(stage).then(() => {
      renderAll();
      updateMeshColors();
    }))
    .catch((err) => console.error('Error inicializando visor 3D:', err));
}
*/

/* ============ Sesión ============ */
document.getElementById('btnSalir').addEventListener('click', () => cerrarSesion());

protegerPagina({}, async ({ user, perfil }) => {
  currentUser = user;
  currentPerfil = perfil;
  const nombreVisible = perfil.nombre || user.email;
  document.getElementById('nombreUsuario').textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  document.getElementById('avatarUsuario').textContent = iniciales(nombreVisible);

  const urlParams = new URLSearchParams(window.location.search);
  const idVer = urlParams.get('ver') || urlParams.get('id');
  if (idVer) {
    await cargarInspeccionExistente(idVer);
  } else {
    await cargarPreguntasConfiguradas();
    renderAll();
  }
});

/**
 * Trae las preguntas vigentes. Si la lectura falla (sin señal, por
 * ejemplo) no se bloquea la inspección: sigue con las originales, pero
 * lo avisa arriba del listado para que no pase desapercibido.
 */
async function cargarPreguntasConfiguradas() {
  try {
    const { preguntas } = await cargarPreguntasLiberacion();
    PART_DEFS = seccionesDelFormulario(preguntas);
    state.avisoPreguntas = '';
  } catch (err) {
    console.error('No se pudieron cargar las preguntas configuradas:', err);
    state.avisoPreguntas = 'No se pudieron cargar las preguntas actualizadas; se muestran las originales del formato. Recarga la página cuando tengas conexión.';
  }
}
