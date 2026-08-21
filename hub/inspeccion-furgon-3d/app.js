// =========================================================
// app.js — Inspector 3D del furgón desmontable (LOG-FO-101)
//
// Reimplementación en JS plano (sin el runtime "dc-runtime" del prototipo
// original) para que viva como el resto de módulos del hub: mismo patrón
// de auth.js / utils.js, sin dependencias externas de build. La lógica de
// cámara/inspección 3D (selección de parte, encuadre, apertura de puertas)
// se portó tal cual desde el prototipo; solo cambió la capa de render de
// la lista/checklist, que aquí es DOM directo en vez de un motor de
// plantillas.
// =========================================================

import { protegerPagina, cerrarSesion, etiquetaRol } from "../js/auth.js";
import { iniciales } from "../js/utils.js";

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

const STATUS_HEX = { pending: 0xB8B2A6, pass: 0x5f7a45, fail: 0xa8402b };
// Los paneles de calificación son casi invisibles sobre el camión real
// (ver extMat en FurgonModel.js) para no taparlo; al calificar una parte
// se vuelven bien opacos para que el color de estado se note con claridad.
const STATUS_OPACITY = { pending: 0.06, pass: 0.55, fail: 0.55 };
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
  headerFields: { placa: '', transportista: '', piloto: '', cliente: '' },
  showDialog: false,
  dialogSaved: false,
  saved: false,
  savedAt: null,
};

let THREE, model, camera, controls, stageEl;
let interiorConfigs = {}, interiorDefault = null, camExterior = null;

function partItemsAnswered(partId) { return state.answers[partId] || {}; }

function partStatus(partId) {
  const def = PART_DEFS[partId];
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

function updateMeshColors() {
  if (!model) return;
  Object.keys(PART_DEFS).forEach((partId) => {
    const status = partStatus(partId);
    const hex = STATUS_HEX[status];
    // El forro interior (int_*) no usa la opacidad para mostrar el estado
    // de la calificación — su opacidad la controla applyInteriorTranslucency()
    // según qué parte se esté enfocando, no si ya se calificó o no.
    const isInterior = partId.startsWith('int_');
    (model.meshesByPart[partId] || []).forEach((m) => {
      m.material.color.setHex(hex);
      if (m.material.transparent && !isInterior) m.material.opacity = STATUS_OPACITY[status];
    });
  });
}

// Al enfocar una parte del interior (una pared, por ejemplo), esa parte se
// deja sólida junto con el piso y la pared frontal (referencias fijas) y el
// resto (techo, pared opuesta, puerta) se vuelve translúcido para poder ver
// a través — solo aplica en Vista Interna.
const INT_WALL_GROUPS = ['int_pared_izquierda', 'int_pared_derecha', 'int_techo', 'int_piso', 'int_frente'];
const INT_ANCHOR_GROUPS = ['int_piso', 'int_frente'];
const INT_DOOR_IDS = ['ext_puertas', 'int_puertas'];
const INT_TRANSLUCENT_OPACITY = 0.14;

function applyInteriorTranslucency(focusPartId) {
  if (!model || state.viewMode !== 'interior') return;
  const m = model.meshesByPart;
  const focusing = !!focusPartId && (INT_WALL_GROUPS.includes(focusPartId) || INT_DOOR_IDS.includes(focusPartId));
  INT_WALL_GROUPS.forEach((g) => {
    const solid = !focusing || g === focusPartId || INT_ANCHOR_GROUPS.includes(g);
    (m[g] || []).forEach((x) => { x.material.opacity = solid ? 1 : INT_TRANSLUCENT_OPACITY; });
  });
  if (focusing) {
    const doorSolid = INT_DOOR_IDS.includes(focusPartId);
    (m['ext_puertas'] || []).forEach((x) => { x.material.opacity = doorSolid ? 0.9 : INT_TRANSLUCENT_OPACITY; });
  }
}

function applyExteriorVisibility() {
  const m = model.meshesByPart;
  // El forro interior propio (int_*) solo tiene sentido con el camión real
  // oculto (Vista Interna) — mostrarlo en Vista Externa lo hace ver como
  // una caja sólida encima del camión.
  const showInterior = state.viewMode === 'interior';
  ['ext_pared_izquierda', 'ext_pared_derecha', 'ext_techo', 'ext_puertas', 'ext_frente'].forEach((g) => {
    (m[g] || []).forEach((x) => (x.visible = true));
  });
  ['int_pared_izquierda', 'int_pared_derecha', 'int_techo', 'int_piso', 'int_puertas', 'int_frente'].forEach((g) => {
    (m[g] || []).forEach((x) => (x.visible = showInterior));
  });
}

function applyInteriorFocus(focusPartId) {
  applyExteriorVisibility();
  applyInteriorTranslucency(focusPartId);
}

function animateCamera(toPos, toTarget, duration, onDone) {
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
    if (t < 1) requestAnimationFrame(step);
    else { controls.enabled = true; if (onDone) onDone(); }
  };
  requestAnimationFrame(step);
}

function animateDoors(open, duration) {
  const { doorPivotL, doorPivotR } = model;
  const fromL = doorPivotL.rotation.y, fromR = doorPivotR.rotation.y;
  const toL = open ? -Math.PI / 2 : 0, toR = open ? Math.PI / 2 : 0;
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

function setViewMode(mode) {
  if (mode === state.viewMode || !model) return;
  if (mode === 'interior') {
    animateCamera(interiorDefault.cam.pos, interiorDefault.cam.target, 900);
    animateDoors(true, 900);
  } else {
    animateCamera(camExterior.pos, camExterior.target, 900);
    animateDoors(false, 900);
  }
  // el camión real (DAF) no tiene interior modelado: se oculta por completo
  // en Vista Interna y se muestra el forro propio en su lugar.
  if (model.daf) model.daf.visible = mode === 'exterior';
  state.viewMode = mode;
  state.selectedPart = null;
  applyExteriorVisibility();
  applyInteriorTranslucency(null);
  renderAll();
}

function selectPart(partId) {
  if (state.saved) return;
  if (model) {
    Object.values(model.meshesByPart).flat().forEach((m) => m.material.emissive && m.material.emissive.setHex(0x000000));
    (model.meshesByPart[partId] || []).forEach((m) => {
      m.material.emissive.setHex(0xC67139);
      m.material.emissiveIntensity = 0.3;
    });
    const config = interiorConfigs[partId];
    if (config) {
      applyInteriorFocus(partId);
      animateCamera(config.cam.pos, config.cam.target, 800);
    }
  }
  state.selectedPart = partId;
  renderAll();
}

function deselectPart() {
  if (model) {
    Object.values(model.meshesByPart).flat().forEach((m) => m.material.emissive && m.material.emissive.setHex(0x000000));
    if (state.viewMode === 'interior') {
      applyExteriorVisibility();
      applyInteriorTranslucency(null);
      animateCamera(interiorDefault.cam.pos, interiorDefault.cam.target, 800);
    }
  }
  state.selectedPart = null;
  renderAll();
}

function setAnswer(partId, itemId, value) {
  if (state.saved) return;
  state.answers[partId] = { ...state.answers[partId], [itemId]: value };
  updateMeshColors();
  renderAll();
}

function handlePick(e) {
  const rect = stageEl.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const targets = [];
  Object.entries(model.meshesByPart).forEach(([part, meshes]) => {
    if (PART_DEFS[part] && PART_DEFS[part].mode === state.viewMode) {
      meshes.forEach((m) => { if (m.visible) targets.push(m); });
    }
  });
  const hits = ray.intersectObjects(targets, false);
  if (hits.length) selectPart(hits[0].object.userData.part);
}

async function initStage(stage) {
  stageEl = stage;
  const ready = await stage.ready;
  THREE = ready.THREE;
  const mod = await import('./FurgonModel.js');
  model = await mod.buildTruck(THREE);
  stage.setObject(model.group);
  camera = stage._camera;
  controls = stage._controls;

  camExterior = { pos: camera.position.clone(), target: controls.target.clone() };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const extTarget = controls.target.clone();
  const extDist = camera.position.distanceTo(extTarget);
  const overviewTarget = V(model.boxCX * 0.4, model.floorY + model.boxH * 0.3, 0);
  const dir = new THREE.Vector3(1.1, 0.65, 1.2).normalize();
  const overviewCam = { pos: overviewTarget.clone().add(dir.multiplyScalar(extDist)), target: overviewTarget };

  interiorConfigs = {
    int_pared_izquierda: { cam: { pos: V(model.boxCX, model.floorY + model.boxH * 0.55, model.boxW * 2.7), target: V(model.boxCX, model.floorY + model.boxH * 0.4, 0) }, hide: ['ext_pared_derecha', 'int_pared_derecha', 'ext_techo', 'int_techo'] },
    int_pared_derecha: { cam: { pos: V(model.boxCX, model.floorY + model.boxH * 0.55, -model.boxW * 2.7), target: V(model.boxCX, model.floorY + model.boxH * 0.4, 0) }, hide: ['ext_pared_izquierda', 'int_pared_izquierda', 'ext_techo', 'int_techo'] },
    int_techo: { cam: { pos: V(model.boxCX - model.boxL * 0.15, model.boxTopY + model.boxH * 1.1, model.boxW * 1.8), target: V(model.boxCX, model.boxTopY - 0.05, 0) } },
    int_piso: { cam: { pos: V(model.boxCX, model.boxTopY + model.boxL * 0.75, 0.001), target: V(model.boxCX, model.floorY, 0) } },
    int_puertas: { cam: { pos: V(model.boxX1 + 2.4, model.floorY + model.boxH * 0.85, model.boxW * 1.9), target: V(model.boxX1 - 0.6, model.floorY + model.boxH * 0.35, -model.boxW * 0.15) } },
    int_frente: { cam: { pos: V(model.boxX1 + model.boxL * 0.55, model.floorY + model.boxH * 0.5, 0.01), target: V(model.boxX0, model.floorY + model.boxH * 0.4, 0) } },
  };
  interiorDefault = { cam: overviewCam };
  applyExteriorVisibility();
  updateMeshColors();

  let down = null;
  stage.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener('pointerup', (e) => {
    if (!down) return;
    const d = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (d < 6) handlePick(e);
  });
}

/* ============ UI ============ */

const els = {
  extBtn: document.getElementById('btnExterior'),
  intBtn: document.getElementById('btnInterior'),
  placa: document.getElementById('campoPlaca'),
  transportista: document.getElementById('campoTransportista'),
  piloto: document.getElementById('campoPiloto'),
  cliente: document.getElementById('campoCliente'),
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
  els.placa.value = state.headerFields.placa;
  els.transportista.value = state.headerFields.transportista;
  els.piloto.value = state.headerFields.piloto;
  els.cliente.value = state.headerFields.cliente;
  [els.placa, els.transportista, els.piloto, els.cliente].forEach((el) => { el.disabled = state.saved; });
  els.fecha.textContent = 'Fecha: ' + new Date().toLocaleDateString('es-GT');
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
      <div class="dialog-body">El registro de inspección se guardó correctamente. Este formulario queda como registro nuevo, de solo lectura.</div>
      <div class="dialog-actions"><button class="btn btn-primary" id="btnCerrarDialogo">Cerrar</button></div>
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
      ${failCount ? '<div style="font-size:13px;color:#8c491a;">Se guardarán las secciones rechazadas para seguimiento.</div>' : ''}
    </div>
    <div class="dialog-actions">
      <button class="btn btn-ghost" id="btnCancelarDialogo">Cancelar</button>
      <button class="btn btn-primary" id="btnGuardarDialogo">Guardar Inspección</button>
    </div>
  `;
  document.getElementById('btnCancelarDialogo').onclick = closeDialog;
  document.getElementById('btnGuardarDialogo').onclick = confirmSave;
}

function openFinalize() { state.showDialog = true; state.dialogSaved = false; renderAll(); }
function closeDialog() { state.showDialog = false; renderAll(); }

function confirmSave() {
  const record = {
    timestamp: new Date().toISOString(),
    header: state.headerFields,
    answers: state.answers,
    statuses: Object.fromEntries(Object.keys(PART_DEFS).map((p) => [p, partStatus(p)])),
  };
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    list.push(record);
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

/* ============ eventos de encabezado ============ */
els.extBtn.onclick = () => setViewMode('exterior');
els.intBtn.onclick = () => setViewMode('interior');
['placa', 'transportista', 'piloto', 'cliente'].forEach((field) => {
  els[field].oninput = (e) => { state.headerFields[field] = e.target.value; };
});
els.btnFinalizar.onclick = openFinalize;
els.dialogBackdrop.onclick = (e) => { if (e.target === els.dialogBackdrop) closeDialog(); };

/* ============ arranque del stage 3D ============ */
const stage = document.querySelector('three-d-stage');
customElements.whenDefined('three-d-stage').then(() => initStage(stage).then(renderAll));

/* ============ sesión ============ */
document.getElementById('btnSalir').addEventListener('click', () => cerrarSesion());

protegerPagina({}, ({ user, perfil }) => {
  const nombreVisible = perfil.nombre || user.email;
  document.getElementById('nombreUsuario').textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  document.getElementById('avatarUsuario').textContent = iniciales(nombreVisible);
  renderAll();
});
