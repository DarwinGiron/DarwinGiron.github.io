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
import { iniciales } from "../js/utils.js";
import { db } from "../js/firebase-config.js";
import { collection, doc, getDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let currentUser = null;
let currentPerfil = null;

const PART_DEFS = {
  cabina: { label: 'Cabina, Camión y Piloto', mode: 'exterior', items: [
    { id: 'cabina_limpia', label: 'Cabina limpia' },
    { id: 'quinta_rueda', label: 'Quinta rueda y acople en buen estado, sin fugas' },
    { id: 'piloto_apto', label: 'Piloto en condiciones aptas (sobrio, uniforme, identificación, EPP)' },
  ]},
  ext_pared_izquierda: { label: 'Pared Izquierda (exterior)', mode: 'exterior', items: [
    { id: 'limpia', label: 'Limpia' },
    { id: 'agujeros', label: 'Sin agujeros' },
    { id: 'abolladuras', label: 'Sin abolladuras mayores' },
    { id: 'cinta', label: 'Cinta reflectiva en buen estado' },
  ]},
  ext_pared_derecha: { label: 'Pared Derecha (exterior)', mode: 'exterior', items: [
    { id: 'limpia', label: 'Limpia' },
    { id: 'agujeros', label: 'Sin agujeros' },
    { id: 'abolladuras', label: 'Sin abolladuras mayores' },
    { id: 'cinta', label: 'Cinta reflectiva en buen estado' },
  ]},
  ext_techo: { label: 'Techo (exterior)', mode: 'exterior', items: [
    { id: 'limpio', label: 'Limpio' },
    { id: 'abolladuras', label: 'Sin abolladuras' },
    { id: 'filtraciones', label: 'Sin señales de filtración' },
  ]},
  ext_puertas: { label: 'Puertas (exterior)', mode: 'exterior', items: [
    { id: 'empaques', label: 'Empaques en buen estado' },
    { id: 'barras', label: 'Barras y manibelas de apertura/cierre funcionan' },
    { id: 'hermeticidad', label: 'Hermeticidad al cerrar (sin paso de contaminantes)' },
  ]},
  generales: { label: 'Generales (chasis, llantas, seguros)', mode: 'exterior', items: [
    { id: 'llantas', label: 'Llantas y rines limpios' },
    { id: 'seguros', label: 'Seguros giratorios (twist locks) trabados correctamente' },
    { id: 'conos', label: 'Conos de seguridad presentes' },
    { id: 'alarma', label: 'Alarma de retroceso funcional' },
    { id: 'fumigacion', label: 'Certificado de fumigación vigente (10 días)' },
  ]},
  int_pared_izquierda: { label: 'Pared Izquierda (interior)', mode: 'interior', items: [
    { id: 'plywood', label: 'Plywood sin quebraduras' },
    { id: 'limpia', label: 'Limpia, sin humedad' },
  ]},
  int_pared_derecha: { label: 'Pared Derecha (interior)', mode: 'interior', items: [
    { id: 'plywood', label: 'Plywood sin quebraduras' },
    { id: 'limpia', label: 'Limpia, sin humedad' },
  ]},
  int_techo: { label: 'Techo (interior)', mode: 'interior', items: [
    { id: 'filtracion', label: 'Sin agujeros que permitan filtración de agua' },
    { id: 'plywood', label: 'Plywood sin quebraduras' },
  ]},
  int_piso: { label: 'Piso', mode: 'interior', items: [
    { id: 'deteriorado', label: 'Piso no deteriorado' },
    { id: 'limpio', label: 'Limpio, sin agentes contaminantes' },
    { id: 'insectos', label: 'Libre de insectos' },
    { id: 'olor', label: 'Sin mal olor' },
  ]},
  int_puertas: { label: 'Puertas (interior)', mode: 'interior', items: [
    { id: 'empaques', label: 'Empaques en buen estado' },
    { id: 'hermeticidad', label: 'Hermeticidad al cerrar' },
    { id: 'plywood', label: 'Plywood sin quebraduras' },
  ]},
  int_frente: { label: 'Pared Frontal (interior)', mode: 'interior', items: [
    { id: 'plywood', label: 'Plywood sin quebraduras' },
    { id: 'limpia', label: 'Limpia, sin humedad' },
  ]},
};

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
  photos: {},
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
};

let THREE, model, camera, controls, stageEl;
let interiorConfigs = {}, exteriorConfigs = {}, interiorDefault = null, camExterior = null;

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

/**
 * Cambia el modo principal entre Vista Externa y Vista Interna.
 */
function setViewMode(mode) {
  if (mode === state.viewMode || !model) return;
  state.viewMode = mode;
  state.selectedPart = null;

  if (mode === 'interior') {
    // Abrir puertas y activar corte seccionado idéntico a la imagen
    animateDoors(true, 850);
    model.applyCutaway('interior', null, camera.position.z >= 0 ? 1 : -1);
    animateCamera(interiorDefault.cam.pos, interiorDefault.cam.target, 850);
  } else {
    // Cerrar puertas y contenedor sólido
    animateDoors(false, 850);
    model.applyCutaway('exterior');
    animateCamera(camExterior.pos, camExterior.target, 850);
  }

  updateMeshColors();
  renderAll();
}

/**
 * Selecciona una sección para inspección detallada.
 */
function selectPart(partId) {
  if (state.saved || !PART_DEFS[partId]) return;
  state.selectedPart = partId;

  const isInterior = partId.startsWith('int_');

  // Si la parte seleccionada es de otro modo de vista (por ejemplo desde la lista lateral), sincronizar
  if (isInterior && state.viewMode !== 'interior') {
    state.viewMode = 'interior';
    animateDoors(true, 800);
  } else if (!isInterior && state.viewMode !== 'exterior') {
    state.viewMode = 'exterior';
    animateDoors(false, 800);
  }

  // Aplicar el corte seccionado correspondiente sin ocultar la pared seleccionada
  if (state.viewMode === 'interior') {
    const zSign = camera ? (camera.position.z >= 0 ? 1 : -1) : 1;
    model.applyCutaway('interior', partId, zSign);
    const config = interiorConfigs[partId];
    if (config) animateCamera(config.cam.pos, config.cam.target, 800);
  } else {
    model.applyCutaway('exterior');
    const config = exteriorConfigs[partId];
    if (config) animateCamera(config.cam.pos, config.cam.target, 800);
  }

  updateMeshColors();
  renderAll();
}

/**
 * Deselecciona la parte activa y regresa a la vista general.
 */
function deselectPart() {
  state.selectedPart = null;

  if (state.viewMode === 'interior') {
    const zSign = camera ? (camera.position.z >= 0 ? 1 : -1) : 1;
    model.applyCutaway('interior', null, zSign);
    animateCamera(interiorDefault.cam.pos, interiorDefault.cam.target, 700);
  } else {
    model.applyCutaway('exterior');
    animateCamera(camExterior.pos, camExterior.target, 700);
  }

  updateMeshColors();
  renderAll();
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
  };

  // Cámara general interior: vista de túnel desde la entrada con puertas abiertas y todas las paredes visibles
  interiorDefault = {
    pos: V(halfL + 2.6, H * 0.58, 0.001),
    target: V(-halfL * 0.2, H * 0.45, 0),
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
  els.extBtn.classList.toggle('active', state.viewMode === 'exterior');
  els.intBtn.classList.toggle('active', state.viewMode === 'interior');
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
    els.savedBanner.textContent = `Inspección guardada el ${state.savedAt ? state.savedAt.toLocaleString('es-GT') : ''} — registro cerrado (solo lectura).`;
  } else {
    els.savedBanner.style.display = 'none';
  }
}

function renderPanel() {
  els.panelBody.innerHTML = '';
  if (state.selectedPart) {
    els.panelBody.appendChild(renderPartDetail(state.selectedPart));
  } else {
    els.panelBody.appendChild(renderPartList());
  }
}

function renderPartList() {
  const wrap = document.createElement('div');
  const heading = document.createElement('div');
  heading.className = 'list-heading';
  heading.textContent = state.viewMode === 'exterior' ? 'Condición Externa' : 'Condición Interna';
  wrap.appendChild(heading);

  Object.keys(PART_DEFS).filter((id) => PART_DEFS[id].mode === state.viewMode).forEach((id) => {
    const status = model ? partStatus(id) : 'pending';
    const css = STATUS_CSS[status];
    const row = document.createElement('div');
    row.className = 'part-row part-row--list';
    row.innerHTML = `
      <span class="dot" style="background:${css.color}"></span>
      <span class="part-row__label">${escapeHtml(PART_DEFS[id].label)}</span>
      <span class="tag" style="background:${css.bg};color:${css.color}">${css.label}</span>
    `;
    row.onclick = () => selectPart(id);
    wrap.appendChild(row);
  });
  return wrap;
}

function renderPartDetail(partId) {
  const def = PART_DEFS[partId];
  const ans = partItemsAnswered(partId);
  const status = model ? partStatus(partId) : 'pending';
  const css = STATUS_CSS[status];

  const wrap = document.createElement('div');

  const back = document.createElement('button');
  back.className = 'btn btn-ghost';
  back.textContent = '‹ Volver a la lista';
  back.onclick = deselectPart;
  wrap.appendChild(back);

  const headRow = document.createElement('div');
  headRow.className = 'detail-head';
  headRow.innerHTML = `<span class="dot" style="background:${css.color}"></span><div class="card-title">${escapeHtml(def.label)}</div>`;
  wrap.appendChild(headRow);

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.style.background = css.bg;
  tag.style.color = css.color;
  tag.style.marginBottom = '12px';
  tag.style.display = 'inline-block';
  tag.textContent = css.label;
  wrap.appendChild(tag);

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
    si.textContent = 'Cumple';
    si.className = 'seg-opt' + (ans[it.id] === 'si' ? ' active' : '');
    si.disabled = state.saved;
    si.onclick = () => setAnswer(partId, it.id, 'si');
    const no = document.createElement('button');
    no.type = 'button';
    no.textContent = 'No Cumple';
    no.className = 'seg-opt' + (ans[it.id] === 'no' ? ' active' : '');
    no.disabled = state.saved;
    no.onclick = () => setAnswer(partId, it.id, 'no');
    seg.appendChild(si);
    seg.appendChild(no);
    row.appendChild(seg);
    wrap.appendChild(row);
  });

  const photoWrap = document.createElement('div');
  photoWrap.className = 'photo-wrap';
  const photoLabel = document.createElement('label');
  photoLabel.textContent = 'Evidencia fotográfica (opcional)';
  photoWrap.appendChild(photoLabel);

  const photoSlot = document.createElement('div');
  photoSlot.className = 'photo-slot';
  const existing = state.photos[partId];
  if (existing) {
    const img = document.createElement('img');
    img.src = existing;
    photoSlot.appendChild(img);
  } else {
    photoSlot.classList.add('photo-slot--empty');
    photoSlot.textContent = 'Adjuntar foto si aplica';
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.style.display = 'none';
  input.disabled = state.saved;
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.photos[partId] = reader.result;
      renderAll();
    };
    reader.readAsDataURL(file);
  };
  photoSlot.onclick = () => { if (!state.saved) input.click(); };
  photoWrap.appendChild(photoSlot);
  photoWrap.appendChild(input);
  wrap.appendChild(photoWrap);

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
    const st = model ? partStatus(id) : 'pending';
    if (st === 'pass') passCount += 1;
    if (st === 'fail') failCount += 1;
  });

  els.dialogBody.innerHTML = `
    <div class="dialog-title">Confirmar inspección</div>
    <div class="dialog-body">
      <div style="margin-bottom:8px;">Se evaluaron ${allIds.length} secciones: <b>${passCount}</b> aprobadas, <b>${failCount}</b> rechazadas.</div>
      ${failCount ? '<div style="font-size:13px;color:#8c491a;margin-bottom:8px;">Se registrarán las secciones rechazadas para seguimiento.</div>' : ''}
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
    const st = model ? partStatus(id) : 'pending';
    if (st === 'pass') passCount += 1;
    if (st === 'fail') failCount += 1;
  });

  const btnGuardar = document.getElementById('btnGuardarDialogo');
  if (btnGuardar) {
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';
  }

  // Estructurar respuestas por zona según el esquema oficial LOG-FO-101
  const respuestasPorZona = {
    'pared-izquierda': {
      nombre: 'Pared Izquierda',
      externa: [
        { texto: 'Limpia', valor: state.answers['ext_pared_izquierda']?.limpia || 'si' },
        { texto: 'Sin agujeros', valor: state.answers['ext_pared_izquierda']?.agujeros || 'si' },
        { texto: 'Sin abolladuras mayores', valor: state.answers['ext_pared_izquierda']?.abolladuras || 'si' },
        { texto: 'Cinta reflectiva en buen estado', valor: state.answers['ext_pared_izquierda']?.cinta || 'si' },
      ],
      interna: [
        { texto: 'Plywood sin quebraduras', valor: state.answers['int_pared_izquierda']?.plywood || 'si' },
        { texto: 'Limpia, sin humedad', valor: state.answers['int_pared_izquierda']?.limpia || 'si' },
      ],
    },
    'pared-derecha': {
      nombre: 'Pared Derecha',
      externa: [
        { texto: 'Limpia', valor: state.answers['ext_pared_derecha']?.limpia || 'si' },
        { texto: 'Sin agujeros', valor: state.answers['ext_pared_derecha']?.agujeros || 'si' },
        { texto: 'Sin abolladuras mayores', valor: state.answers['ext_pared_derecha']?.abolladuras || 'si' },
        { texto: 'Cinta reflectiva en buen estado', valor: state.answers['ext_pared_derecha']?.cinta || 'si' },
      ],
      interna: [
        { texto: 'Plywood sin quebraduras', valor: state.answers['int_pared_derecha']?.plywood || 'si' },
        { texto: 'Limpia, sin humedad', valor: state.answers['int_pared_derecha']?.limpia || 'si' },
      ],
    },
    'puertas': {
      nombre: 'Puertas',
      externa: [
        { texto: 'Empaques en buen estado', valor: state.answers['ext_puertas']?.empaques || 'si' },
        { texto: 'Funcionamiento de barras y manijas de apertura y cierre', valor: state.answers['ext_puertas']?.barras || 'si' },
        { texto: 'Hermeticidad al cerrar (evita el ingreso de contaminantes)', valor: state.answers['ext_puertas']?.hermeticidad || 'si' },
      ],
      interna: [
        { texto: 'Empaques en buen estado', valor: state.answers['int_puertas']?.empaques || 'si' },
        { texto: 'Hermeticidad al cerrar', valor: state.answers['int_puertas']?.hermeticidad || 'si' },
        { texto: 'Plywood sin quebraduras', valor: state.answers['int_puertas']?.plywood || 'si' },
      ],
    },
    'techo': {
      nombre: 'Techo',
      externa: [
        { texto: 'Limpio', valor: state.answers['ext_techo']?.limpio || 'si' },
        { texto: 'Sin abolladuras', valor: state.answers['ext_techo']?.abolladuras || 'si' },
        { texto: 'Sin señales de filtración', valor: state.answers['ext_techo']?.filtraciones || 'si' },
      ],
      interna: [
        { texto: 'Agujeros que permitan filtración de agua', valor: state.answers['int_techo']?.filtracion === 'si' ? 'no' : 'si' },
        { texto: 'Plywood sin quebraduras', valor: state.answers['int_techo']?.plywood || 'si' },
      ],
    },
    'generales': {
      nombre: 'Generales / Piso',
      externa: [
        { texto: 'Llantas y rines limpios', valor: state.answers['generales']?.llantas || 'si' },
        { texto: 'Seguros giratorios (twist locks) trabados correctamente', valor: state.answers['generales']?.seguros || 'si' },
        { texto: 'Conos de seguridad presentes', valor: state.answers['generales']?.conos || 'si' },
        { texto: 'Alarma de retroceso funcional', valor: state.answers['generales']?.alarma || 'si' },
        { texto: 'Certificado de fumigación vigente (10 días)', valor: state.answers['generales']?.fumigacion || 'si' },
      ],
      interna: [
        { texto: 'Piso no deteriorado', valor: state.answers['int_piso']?.deteriorado || 'si' },
        { texto: 'Limpio, sin agentes contaminantes', valor: state.answers['int_piso']?.limpio || 'si' },
        { texto: 'Libre de insectos', valor: state.answers['int_piso']?.insectos || 'si' },
        { texto: 'Sin mal olor', valor: state.answers['int_piso']?.olor || 'si' },
      ],
    },
  };

  const respuestasCabinaFinal = [
    { texto: 'Cabina limpia', valor: state.answers['cabina']?.cabina_limpia || 'si' },
    { texto: 'Quinta rueda y acople en buen estado, sin fugas', valor: state.answers['cabina']?.quinta_rueda || 'si' },
    { texto: 'Piloto en condiciones aptas (sobrio, uniforme, identificación, EPP)', valor: state.answers['cabina']?.piloto_apto || 'si' },
  ];

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
  const fechaISO = state.headerFields.fecha || new Date().toISOString().slice(0, 10);
  const resultado = failCount > 0 ? 'rechazado' : 'aprobado';

  const datos = {
    fecha: fechaISO,
    fechaCreacion: serverTimestamp(),
    inspectorUid: currentUser?.uid || '',
    inspectorNombre: currentPerfil?.nombre || currentUser?.email || 'Inspector',
    transporte: (state.headerFields.transporte || '').trim(),
    nombrePiloto: (state.headerFields.piloto || '').trim(),
    placaCamion: (state.headerFields.placa || '').trim(),
    tc: (state.headerFields.tc || '').trim(),
    resultado,
    cumplidos: puntosCumplidos,
    total: totalPuntos,
    cumplimientoPorcentaje: pct,
    origen: 'inspeccion_3d',
    respuestasPorZona,
    respuestasCabina: respuestasCabinaFinal,
    answers: state.answers,
    statuses: Object.fromEntries(allIds.map((p) => [p, partStatus(p)])),
    photos: state.photos,
  };

  // Guardar en Firestore (colección oficial verificaciones_transporte)
  try {
    if (currentUser?.uid) {
      const docRef = await addDoc(collection(db, 'verificaciones_transporte'), datos);
      datos.firestoreId = docRef.id;
    }
  } catch (err) {
    console.warn('No se pudo guardar en Firestore (se guarda respaldo local):', err);
  }

  // Respaldo local en localStorage
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    list.push(datos);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {}

  state.dialogSaved = true;
  state.saved = true;
  state.savedAt = new Date();
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
els.extBtn.onclick = () => setViewMode('exterior');
els.intBtn.onclick = () => setViewMode('interior');

['transporte', 'piloto', 'placa', 'tc'].forEach((key) => {
  if (els[key]) {
    els[key].oninput = (e) => {
      state.headerFields[key] = e.target.value;
    };
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
      state.headerFields.transporte = d.transporte || '';
      state.headerFields.piloto = d.nombrePiloto || '';
      state.headerFields.placa = d.placaCamion || '';
      state.headerFields.tc = d.tc || '';

      if (d.answers && typeof d.answers === 'object') {
        state.answers = d.answers;
      }
      if (d.photos && typeof d.photos === 'object') {
        state.photos = d.photos;
      }

      state.saved = true;
      state.savedAt = d.fechaCreacion?.toDate?.() || (d.fecha ? new Date(d.fecha + 'T12:00:00') : new Date());

      const aprobado = d.resultado === 'aprobado' || d.cumplimientoPorcentaje === 100;
      if (els.savedBanner) {
        els.savedBanner.style.display = 'block';
        els.savedBanner.style.background = aprobado ? '#e6f6e6' : '#fceaea';
        els.savedBanner.style.color = aprobado ? '#006300' : '#b32626';
        els.savedBanner.style.border = aprobado ? '1.5px solid #86efac' : '1.5px solid #fca5a5';
        els.savedBanner.style.padding = '10px 16px';
        els.savedBanner.style.fontWeight = '700';
        els.savedBanner.innerHTML = `
          Modo solo lectura (${aprobado ? '✓ CONTENEDOR APROBADO' : '✕ CONTENEDOR RECHAZADO'}) · Placa: <u>${escapeHtml(d.placaCamion || '—')}</u> · TC: <u>${escapeHtml(d.tc || '—')}</u> · Piloto: ${escapeHtml(d.nombrePiloto || '—')}
        `;
      }

      renderAll();
      updateMeshColors();
    }
  } catch (err) {
    console.error('Error al cargar inspección en 3D:', err);
    renderAll();
  }
}

/* ============ Arranque del stage 3D ============ */
const stage = document.querySelector('three-d-stage');
customElements.whenDefined('three-d-stage')
  .then(() => initStage(stage).then(() => {
    renderAll();
    updateMeshColors();
  }))
  .catch((err) => console.error('Error inicializando visor 3D:', err));

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
    renderAll();
  }
});
