// Construye el modelo 3D del inspector: un camión DAF real (modelo .glb
// gratuito, reducido con Draco) para la cabina + semirremolque visual, con
// paneles de inspección propios (invisibles/traslúcidos) superpuestos para
// el picking y el color de estado (pendiente/aprobado/rechazado) por parte
// del checklist — igual que hacían los paneles de pared en la versión
// dibujada a mano, solo que ahora flotan sobre la malla real en vez de ser
// la única geometría visible.
//
// El modelo real no tiene una cabina y una caja separables de forma limpia
// (la carrocería viene fusionada en una sola malla), así que en "Vista
// Interna" el camión real se oculta por completo y se muestra un interior
// propio (paredes/techo/piso/puertas) — el mismo forro que ya usábamos.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const MODEL_URL = './modelo/camion_daf.glb';
const DRACO_DECODER = 'https://unpkg.com/three@0.184.0/examples/jsm/libs/draco/';

// Nombres de nodo (sin puntos: el pipeline de conversión los limpia) que
// sirven de referencia para saber dónde está la cabina dentro del modelo
// real y así orientar el grupo — la carrocería viene fusionada en una sola
// malla (cabina+chasis+caja), así que la división cabina/caja se hace por
// proporción del largo total, no por nodos separados.
const LANDMARK_CAB = 'truck_dafCube';
const LANDMARK_REAR = 'Cube001_Cube007';
const DROP_NODES = ['Plane', 'Plane001'];
const CAB_FRACTION = 0.3; // fracción del largo total que ocupa la cabina

function findNode(root, wanted) {
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = norm(wanted);
  let hit = null;
  root.traverse((o) => {
    if (hit) return;
    if (norm(o.name) === target) hit = o;
  });
  return hit;
}

export async function buildTruck(THREE) {
  const group = new THREE.Group();
  group.name = 'inspector_furgon';
  const meshesByPart = {};

  function reg(mesh, part) {
    if (part) {
      mesh.userData.part = part;
      (meshesByPart[part] = meshesByPart[part] || []).push(mesh);
    }
    group.add(mesh);
    return mesh;
  }

  let extI = 0, intI = 0;
  function extMat() {
    // Muy tenue en reposo: la idea es que se note el camión real debajo y
    // que el panel solo "aparezca" (más opaco) cuando se califica la parte
    // — ver updateMeshColors() en app.js, que sube la opacidad junto con el color.
    const m = new THREE.MeshStandardMaterial({ color: 0xB8B2A6, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
    m.name = 'ext_panel_' + (extI++);
    return m;
  }
  function intMat() {
    // transparent:true desde el inicio (aunque arranca en opacity 1, sólido)
    // para poder aclarar el panel cuando el inspector enfoca otra parte del
    // interior — ver applyInteriorTranslucency() en app.js.
    const m = new THREE.MeshStandardMaterial({ color: 0xC9A869, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide, transparent: true, opacity: 1, depthWrite: true });
    m.name = 'int_liner_' + (intI++);
    return m;
  }
  const matMarker = new THREE.MeshStandardMaterial({ color: 0xB8B2A6, roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false });
  matMarker.name = 'marcador_generales';

  // ---- 1. Cargar el camión DAF real ----
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_DECODER);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const gltf = await new Promise((resolve, reject) => loader.load(MODEL_URL, resolve, undefined, reject));
  const daf = gltf.scene;
  daf.name = 'daf_visual';

  DROP_NODES.forEach((n) => {
    const o = findNode(daf, n);
    if (o && o.parent) o.parent.remove(o);
  });

  // El modelo trae su longitud sobre Z; el inspector arma sus cámaras y
  // paneles asumiendo el largo sobre X, así que se rota 90°.
  daf.rotation.y = Math.PI / 2;
  daf.updateWorldMatrix(true, true);

  const cabRef = findNode(daf, LANDMARK_CAB);
  const rearRef = findNode(daf, LANDMARK_REAR);
  if (cabRef && rearRef) {
    const cabX = new THREE.Box3().setFromObject(cabRef).getCenter(new THREE.Vector3()).x;
    const rearX = new THREE.Box3().setFromObject(rearRef).getCenter(new THREE.Vector3()).x;
    if (cabX > rearX) daf.rotation.y += Math.PI; // la cabina debe quedar del lado -X
  }
  daf.updateWorldMatrix(true, true);

  group.add(daf);

  // ---- 2. Medir el modelo real para ubicar los paneles de inspección ----
  const fullBox = new THREE.Box3().setFromObject(daf);
  const floorY = fullBox.min.y;
  const totalLen = fullBox.max.x - fullBox.min.x;

  const boxX0 = fullBox.min.x + totalLen * CAB_FRACTION;
  const boxX1 = fullBox.max.x - totalLen * 0.02;
  const boxCX = (boxX0 + boxX1) / 2;
  const boxW = fullBox.max.z - fullBox.min.z;
  const boxTopY = fullBox.max.y - (fullBox.max.y - floorY) * 0.06; // deja algo de margen bajo el techo real
  const boxH = boxTopY - floorY;
  const boxL = boxX1 - boxX0;

  // ---- 3. Paneles de inspección: invisibles/traslúcidos, solo se notan
  // cuando cambian de color al calificar una sección ----
  const frente = new THREE.Mesh(new THREE.BoxGeometry(0.02, boxH, boxW * 0.98), extMat());
  frente.position.set(boxX0, floorY + boxH / 2, 0);
  reg(frente, 'ext_frente');

  const techo = new THREE.Mesh(new THREE.BoxGeometry(boxL, 0.02, boxW * 0.98), extMat());
  techo.position.set(boxCX, boxTopY, 0);
  reg(techo, 'ext_techo');

  const izq = new THREE.Mesh(new THREE.BoxGeometry(boxL, boxH * 0.96, 0.02), extMat());
  izq.position.set(boxCX, floorY + boxH / 2, -boxW / 2);
  reg(izq, 'ext_pared_izquierda');

  const der = new THREE.Mesh(new THREE.BoxGeometry(boxL, boxH * 0.96, 0.02), extMat());
  der.position.set(boxCX, floorY + boxH / 2, boxW / 2);
  reg(der, 'ext_pared_derecha');

  // Marco/sello de las puertas: barras oscuras y OPACAS (no traslúcidas)
  // que marcan el corte entre las dos hojas — así se lee como una puerta
  // partida en dos incluso cuando el panel de calificación está casi
  // invisible en reposo.
  const matFrame = new THREE.MeshStandardMaterial({ color: 0x1c1a16, roughness: 0.5, metalness: 0.3 });
  matFrame.name = 'marco_puertas';
  const frameDepth = 0.03;
  const seam = new THREE.Mesh(new THREE.BoxGeometry(frameDepth, boxH * 0.94, 0.05), matFrame);
  seam.position.set(boxX1 + frameDepth / 2, floorY + boxH / 2, 0);
  group.add(seam);
  [[boxTopY - 0.02, boxH * 0.94], [floorY + 0.02, boxH * 0.94]].forEach(([y]) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(frameDepth, 0.05, boxW * 0.98), matFrame);
    bar.position.set(boxX1 + frameDepth / 2, y, 0);
    group.add(bar);
  });

  const leafW = boxW / 2 - 0.05, leafH = boxH * 0.9;
  function makeDoor(side) {
    const pivot = new THREE.Group();
    pivot.position.set(boxX1, floorY + boxH / 2, side * boxW / 2);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.06, leafH, leafW), extMat());
    leaf.position.set(0, 0, -side * leafW / 2);
    leaf.userData.part = 'ext_puertas';
    (meshesByPart['ext_puertas'] = meshesByPart['ext_puertas'] || []).push(leaf);
    // marco propio de la hoja (borde opaco) para que se note incluso con
    // el panel de calificación casi transparente
    const outline = new THREE.Mesh(new THREE.BoxGeometry(0.02, leafH, leafW), new THREE.MeshBasicMaterial({ color: 0x1c1a16, wireframe: true }));
    leaf.add(outline);
    pivot.add(leaf);
    group.add(pivot);
    return pivot;
  }
  const doorPivotL = makeDoor(-1);
  const doorPivotR = makeDoor(1);

  // panel de cabina: cubre la zona del frente (cabina real) para poder
  // calificarla y resaltarla igual que cualquier otra parte
  const cabLen = boxX0 - fullBox.min.x;
  const cabina = new THREE.Mesh(new THREE.BoxGeometry(Math.max(cabLen * 0.9, 0.4), boxH * 0.75, boxW * 0.85), extMat());
  cabina.position.set(fullBox.min.x + cabLen / 2, floorY + boxH * 0.4, 0);
  reg(cabina, 'cabina');

  // marcadores de "generales" (llantas/chasis/seguros): discos pequeños
  // cerca de las llantas reales, solo para picking + color de estado
  [[boxX0 + boxL * 0.15, -boxW * 0.55], [boxX0 + boxL * 0.15, boxW * 0.55], [boxX1 - boxL * 0.1, -boxW * 0.55], [boxX1 - boxL * 0.1, boxW * 0.55]].forEach(([x, z]) => {
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(boxH * 0.14, boxH * 0.14, 0.03, 16), matMarker);
    marker.position.set(x, floorY + 0.02, z);
    reg(marker, 'generales');
  });

  // ---- 4. Interior propio (el modelo real no trae interior modelado) ----
  const inset = Math.min(0.08, boxW * 0.03);
  const intPiso = new THREE.Mesh(new THREE.BoxGeometry(boxL - inset * 2, 0.04, boxW - inset * 2), intMat());
  intPiso.position.set(boxCX, floorY + 0.02, 0);
  reg(intPiso, 'int_piso');

  const intTecho = new THREE.Mesh(new THREE.BoxGeometry(boxL - inset * 2, 0.04, boxW - inset * 2), intMat());
  intTecho.position.set(boxCX, boxTopY - 0.05, 0);
  reg(intTecho, 'int_techo');

  const intIzq = new THREE.Mesh(new THREE.BoxGeometry(boxL - inset * 2, boxH - inset * 2, 0.03), intMat());
  intIzq.position.set(boxCX, floorY + boxH / 2, -boxW / 2 + inset);
  reg(intIzq, 'int_pared_izquierda');

  const intDer = new THREE.Mesh(new THREE.BoxGeometry(boxL - inset * 2, boxH - inset * 2, 0.03), intMat());
  intDer.position.set(boxCX, floorY + boxH / 2, boxW / 2 - inset);
  reg(intDer, 'int_pared_derecha');

  const intFrente = new THREE.Mesh(new THREE.BoxGeometry(0.03, boxH - inset * 2, boxW - inset * 2), intMat());
  intFrente.position.set(boxX0 + inset, floorY + boxH / 2, 0);
  reg(intFrente, 'int_frente');

  const box = new THREE.Box3().setFromObject(group);

  return {
    group,
    meshesByPart,
    doorPivotL,
    doorPivotR,
    daf,
    box,
    floorY,
    boxTopY,
    boxCX,
    boxW,
    boxH,
    boxL,
    boxX0,
    boxX1,
  };
}
