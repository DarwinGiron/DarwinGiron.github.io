// =========================================================
// FurgonModel.js — Maquetado 3D del Contenedor Marítimo (LOG-FO-101)
//
// Construcción 100% procedural en Three.js idéntica a la maqueta técnica
// de referencia:
// - Contenedor azul marítimo (RAL 5010) con chapa corrugada.
// - Marco perimetral completo: 4 postes esquineros, rieles superior e
//   inferior, esquineros ISO con perforaciones y franjas de advertencia.
// - Puertas de doble hoja con sellos, bisagras y 4 barras de cierre verticales
//   metálicas con manijas y cerrojos de leva.
// - Piso interior de contrachapado de madera con la rejilla metálica en el
//   extremo, exactamente como en la imagen de referencia.
// - Llantas orientadas naturalmente a lo largo del eje transversal Z.
// - Orientación correcta de paredes: Pared Izquierda (lado piloto, +Z) y
//   Pared Derecha (lado copiloto, -Z).
// - En vista general (sin selección): todas las paredes son visibles.
// - Al seleccionar una parte: corte seccionado (cutaway) específico.
// =========================================================

// Dimensiones de contenedor ISO de 40 pies (escalado para inspección)
export const DIMS = {
  L: 11.0,  // Largo (eje X: de -L/2 a +L/2)
  W: 2.45,  // Ancho (eje Z: de -W/2 a +W/2)
  H: 2.65,  // Alto  (eje Y: de 0 a H)
  railThick: 0.10, // Grosor de vigas y postes
  castingSize: 0.16, // Tamaño del esquinero ISO
};

// =========================================================
// Generadores de Texturas Procedurales en Canvas
// =========================================================

function createCorrugatedTexture(isVertical, baseHex = '#1D5396', width = 1024, height = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, width, height);

  const numWaves = 28;
  const step = (isVertical ? width : height) / numWaves;

  for (let i = 0; i < numWaves; i++) {
    const pos = i * step;
    const grad = isVertical
      ? ctx.createLinearGradient(pos, 0, pos + step, 0)
      : ctx.createLinearGradient(0, pos, 0, pos + step);

    grad.addColorStop(0.00, 'rgba(0, 0, 0, 0.42)');
    grad.addColorStop(0.20, 'rgba(0, 0, 0, 0.15)');
    grad.addColorStop(0.50, 'rgba(255, 255, 255, 0.25)');
    grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.05)');
    grad.addColorStop(1.00, 'rgba(0, 0, 0, 0.42)');

    ctx.fillStyle = grad;
    if (isVertical) {
      ctx.fillRect(pos, 0, step, height);
    } else {
      ctx.fillRect(0, pos, width, step);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    if (isVertical) {
      ctx.fillRect(pos, 0, 1.5, height);
    } else {
      ctx.fillRect(0, pos, width, 1.5);
    }
  }

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let p = 0; p < data.length; p += 4) {
    const noise = (Math.random() - 0.5) * 14;
    data[p] = Math.min(255, Math.max(0, data[p] + noise));
    data[p + 1] = Math.min(255, Math.max(0, data[p + 1] + noise));
    data[p + 2] = Math.min(255, Math.max(0, data[p + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  return canvas;
}

function createFloorTexture(width = 1024, height = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#A37C4C';
  ctx.fillRect(0, 0, width, height);

  const numPlanks = 14;
  const plankH = height / numPlanks;
  for (let i = 0; i < numPlanks; i++) {
    const y = i * plankH;
    const v = (Math.sin(i * 3.7) + 1) * 18 - 9;
    ctx.fillStyle = `rgba(${175 + v}, ${135 + v * 0.9}, ${90 + v * 0.7}, 0.85)`;
    ctx.fillRect(0, y, width, plankH);

    for (let j = 0; j < 6; j++) {
      ctx.fillStyle = 'rgba(80, 50, 20, 0.08)';
      const waveY = y + (j / 6) * plankH;
      ctx.fillRect(0, waveY, width, 1.5);
    }

    ctx.fillStyle = 'rgba(40, 25, 12, 0.75)';
    ctx.fillRect(0, y, width, 2);

    ctx.fillStyle = 'rgba(45, 40, 35, 0.6)';
    for (let k = 40; k < width; k += 80) {
      ctx.beginPath();
      ctx.arc(k, y + plankH * 0.3, 1.8, 0, Math.PI * 2);
      ctx.arc(k, y + plankH * 0.7, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // SECCIÓN DE REJILLA METÁLICA (extremo frontal del piso)
  const grateX = Math.round(width * 0.65);
  const grateY = Math.round(height * 0.18);
  const grateW = Math.round(width * 0.28);
  const grateH = Math.round(height * 0.64);

  ctx.fillStyle = '#181C20';
  ctx.fillRect(grateX, grateY, grateW, grateH);

  ctx.strokeStyle = '#3A424A';
  ctx.lineWidth = 6;
  ctx.strokeRect(grateX, grateY, grateW, grateH);

  const numBars = 20;
  const barSpacing = grateW / numBars;
  for (let b = 0; b <= numBars; b++) {
    const bx = grateX + b * barSpacing;
    ctx.fillStyle = '#4E5762';
    ctx.fillRect(bx, grateY + 3, 3, grateH - 6);
    ctx.fillStyle = '#7E8896';
    ctx.fillRect(bx + 1, grateY + 3, 1, grateH - 6);
  }

  ctx.strokeStyle = '#22262B';
  ctx.lineWidth = 2;
  ctx.strokeRect(grateX + 3, grateY + 3, grateW - 6, grateH - 6);

  return canvas;
}

function createHazardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#E5A512';
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = '#1A1C1E';
  const stripeW = 24;
  for (let x = -128; x < 256; x += stripeW * 2) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + stripeW, 0);
    ctx.lineTo(x + stripeW + 128, 128);
    ctx.lineTo(x + 128, 128);
    ctx.closePath();
    ctx.fill();
  }
  return canvas;
}

function createCastingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#163E70';
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = '#0B1E38';
  ctx.beginPath();
  ctx.ellipse(64, 64, 34, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#3267A8';
  ctx.lineWidth = 3;
  ctx.stroke();

  return canvas;
}

// =========================================================
// Constructor Principal del Modelo 3D
// =========================================================

export async function buildTruck(THREE) {
  const group = new THREE.Group();
  group.name = 'inspector_furgon_3d';

  const { L, W, H, railThick, castingSize } = DIMS;
  const halfL = L / 2;
  const halfW = W / 2;

  const meshesByPart = {};
  function reg(mesh, part) {
    if (part) {
      mesh.userData.part = part;
      (meshesByPart[part] = meshesByPart[part] || []).push(mesh);
    }
    return mesh;
  }

  // --- Texturas procedimentales ---
  const texWallCanvas = createCorrugatedTexture(true, '#1D5396', 1024, 512);
  const texWall = new THREE.CanvasTexture(texWallCanvas);
  texWall.wrapS = THREE.RepeatWrapping;
  texWall.wrapT = THREE.RepeatWrapping;

  const texRoofCanvas = createCorrugatedTexture(false, '#1C4F90', 1024, 512);
  const texRoof = new THREE.CanvasTexture(texRoofCanvas);
  texRoof.wrapS = THREE.RepeatWrapping;
  texRoof.wrapT = THREE.RepeatWrapping;

  const texFloorCanvas = createFloorTexture(1024, 512);
  const texFloor = new THREE.CanvasTexture(texFloorCanvas);

  const texHazardCanvas = createHazardTexture();
  const texHazard = new THREE.CanvasTexture(texHazardCanvas);

  const texCastingCanvas = createCastingTexture();
  const texCasting = new THREE.CanvasTexture(texCastingCanvas);

  // --- Materiales Base ---
  const BLUE_FRAME = 0x18467F;
  const BLUE_BODY = 0x1D5396;
  const STEEL_METAL = 0xCCD4DC;
  const RUBBER_BLACK = 0x1C1E20;

  const matFrame = new THREE.MeshStandardMaterial({
    color: BLUE_FRAME,
    roughness: 0.45,
    metalness: 0.65,
  });

  const matCasting = new THREE.MeshStandardMaterial({
    color: 0x174075,
    map: texCasting,
    roughness: 0.5,
    metalness: 0.7,
  });

  const matHazard = new THREE.MeshStandardMaterial({
    map: texHazard,
    roughness: 0.4,
    metalness: 0.2,
  });

  function makeWallMat(name) {
    const m = new THREE.MeshStandardMaterial({
      color: BLUE_BODY,
      map: texWall,
      roughness: 0.42,
      metalness: 0.6,
      side: THREE.DoubleSide,
    });
    m.name = name;
    return m;
  }

  const matRoof = new THREE.MeshStandardMaterial({
    color: 0x1B4E8E,
    map: texRoof,
    roughness: 0.48,
    metalness: 0.6,
    side: THREE.DoubleSide,
  });

  const matFloor = new THREE.MeshStandardMaterial({
    map: texFloor,
    roughness: 0.65,
    metalness: 0.15,
    side: THREE.FrontSide,
  });

  const matLockingRod = new THREE.MeshStandardMaterial({
    color: STEEL_METAL,
    roughness: 0.22,
    metalness: 0.9,
  });

  const matGasket = new THREE.MeshStandardMaterial({
    color: RUBBER_BLACK,
    roughness: 0.85,
    metalness: 0.05,
  });

  // =========================================================
  // 1. MARCO ESTRUCTURAL PERIMETRAL (SIEMPRE VISIBLE)
  // =========================================================
  const frameGroup = new THREE.Group();
  frameGroup.name = 'marco_estructural_contenedor';

  const postGeo = new THREE.BoxGeometry(railThick, H, railThick);
  [
    [-halfL + railThick / 2, H / 2, -halfW + railThick / 2],
    [-halfL + railThick / 2, H / 2, halfW - railThick / 2],
    [halfL - railThick / 2, H / 2, -halfW + railThick / 2],
    [halfL - railThick / 2, H / 2, halfW - railThick / 2],
  ].forEach(([x, y, z]) => {
    const post = new THREE.Mesh(postGeo, matFrame);
    post.position.set(x, y, z);
    post.castShadow = true;
    post.receiveShadow = true;
    frameGroup.add(post);
  });

  const longRailGeo = new THREE.BoxGeometry(L - railThick * 2, railThick, railThick);
  [
    [-halfW + railThick / 2, railThick / 2],
    [halfW - railThick / 2, railThick / 2],
    [-halfW + railThick / 2, H - railThick / 2],
    [halfW - railThick / 2, H - railThick / 2],
  ].forEach(([z, y]) => {
    const rail = new THREE.Mesh(longRailGeo, matFrame);
    rail.position.set(0, y, z);
    rail.castShadow = true;
    rail.receiveShadow = true;
    frameGroup.add(rail);
  });

  const transRailGeo = new THREE.BoxGeometry(railThick, railThick, W - railThick * 2);
  [
    [-halfL + railThick / 2, railThick / 2],
    [-halfL + railThick / 2, H - railThick / 2],
    [halfL - railThick / 2, railThick / 2],
    [halfL - railThick / 2, H - railThick / 2],
  ].forEach(([x, y]) => {
    const rail = new THREE.Mesh(transRailGeo, matFrame);
    rail.position.set(x, y, 0);
    rail.castShadow = true;
    rail.receiveShadow = true;
    frameGroup.add(rail);
  });

  const castingGeo = new THREE.BoxGeometry(castingSize, castingSize, castingSize);
  [
    [-halfL + castingSize / 2, castingSize / 2, -halfW + castingSize / 2],
    [-halfL + castingSize / 2, castingSize / 2, halfW - castingSize / 2],
    [halfL - castingSize / 2, castingSize / 2, -halfW + castingSize / 2],
    [halfL - castingSize / 2, castingSize / 2, halfW - castingSize / 2],
    [-halfL + castingSize / 2, H - castingSize / 2, -halfW + castingSize / 2],
    [-halfL + castingSize / 2, H - castingSize / 2, halfW - castingSize / 2],
    [halfL - castingSize / 2, H - castingSize / 2, -halfW + castingSize / 2],
    [halfL - castingSize / 2, H - castingSize / 2, halfW - castingSize / 2],
  ].forEach(([x, y, z]) => {
    const isTopCorner = y > H / 2;
    const block = new THREE.Mesh(castingGeo, isTopCorner && (x > 0 || x < -halfL + 1) ? matHazard : matCasting);
    block.position.set(x, y, z);
    block.castShadow = true;
    frameGroup.add(block);
    if (!isTopCorner) reg(block, 'generales');
  });

  group.add(frameGroup);

  // =========================================================
  // 2. PISO INTERIOR DE MADERA CON REJILLA
  // =========================================================
  const floorMeshL = L - railThick * 2;
  const floorMeshW = W - railThick * 2;
  const floorGeo = new THREE.BoxGeometry(floorMeshL, 0.04, floorMeshW);
  const floorMesh = new THREE.Mesh(floorGeo, matFloor);
  floorMesh.position.set(0, railThick + 0.02, 0);
  floorMesh.receiveShadow = true;
  reg(floorMesh, 'int_piso');
  group.add(floorMesh);

  // Vigas transversales estructurales inferiores
  const numBeams = 18;
  const beamSpacing = (L - railThick * 2) / (numBeams - 1);
  const underBeamGeo = new THREE.BoxGeometry(0.06, 0.08, W - 0.04);
  const matUnderBeam = new THREE.MeshStandardMaterial({ color: 0x133763, roughness: 0.6, metalness: 0.5 });
  for (let i = 0; i < numBeams; i++) {
    const bx = -halfL + railThick + i * beamSpacing;
    const uBeam = new THREE.Mesh(underBeamGeo, matUnderBeam);
    uBeam.position.set(bx, 0.04, 0);
    reg(uBeam, 'generales');
    group.add(uBeam);
  }

  // =========================================================
  // 3. PANELES DE PARED Y TECHO (ORIENTACIÓN REAL VEHICULAR)
  // Frente: -X, Atrás: +X.
  // Mirando hacia el frente (-X):
  // - IZQUIERDA (Piloto): +Z
  // - DERECHA (Copiloto): -Z
  // =========================================================
  const wallH = H - railThick * 2;
  const wallL = L - railThick * 2;
  const wallW = W - railThick * 2;

  // PARED IZQUIERDA (Z = +halfW, Lado Piloto)
  const paredIzqGeo = new THREE.BoxGeometry(wallL, wallH, 0.02);
  const paredIzqExt = new THREE.Mesh(paredIzqGeo, makeWallMat('mat_pared_izq_ext'));
  paredIzqExt.position.set(0, H / 2, halfW - 0.01);
  paredIzqExt.castShadow = true;
  paredIzqExt.receiveShadow = true;
  reg(paredIzqExt, 'ext_pared_izquierda');
  group.add(paredIzqExt);

  const paredIzqInt = new THREE.Mesh(paredIzqGeo, makeWallMat('mat_pared_izq_int'));
  paredIzqInt.position.set(0, H / 2, halfW - 0.025);
  paredIzqInt.receiveShadow = true;
  reg(paredIzqInt, 'int_pared_izquierda');
  group.add(paredIzqInt);

  // PARED DERECHA (Z = -halfW, Lado Copiloto)
  const paredDerGeo = new THREE.BoxGeometry(wallL, wallH, 0.02);
  const paredDerExt = new THREE.Mesh(paredDerGeo, makeWallMat('mat_pared_der_ext'));
  paredDerExt.position.set(0, H / 2, -halfW + 0.01);
  paredDerExt.castShadow = true;
  paredDerExt.receiveShadow = true;
  reg(paredDerExt, 'ext_pared_derecha');
  group.add(paredDerExt);

  const paredDerInt = new THREE.Mesh(paredDerGeo, makeWallMat('mat_pared_der_int'));
  paredDerInt.position.set(0, H / 2, -halfW + 0.025);
  paredDerInt.receiveShadow = true;
  reg(paredDerInt, 'int_pared_derecha');
  group.add(paredDerInt);

  // TECHO (Y = H)
  const techoGeo = new THREE.BoxGeometry(wallL, 0.02, wallW);
  const techoExt = new THREE.Mesh(techoGeo, matRoof);
  techoExt.position.set(0, H - railThick / 2 + 0.01, 0);
  techoExt.castShadow = true;
  techoExt.receiveShadow = true;
  reg(techoExt, 'ext_techo');
  group.add(techoExt);

  const techoInt = new THREE.Mesh(techoGeo, matRoof.clone());
  techoInt.position.set(0, H - railThick / 2 - 0.01, 0);
  reg(techoInt, 'int_techo');
  group.add(techoInt);

  // Vigas interiores del techo
  const numRoofRibs = 14;
  const ribSpacing = wallL / (numRoofRibs - 1);
  const ribGeo = new THREE.BoxGeometry(0.04, 0.03, wallW - 0.02);
  const matRib = new THREE.MeshStandardMaterial({ color: 0x164278, roughness: 0.5, metalness: 0.6 });
  const roofRibs = [];
  for (let r = 0; r < numRoofRibs; r++) {
    const rx = -halfL + railThick + r * ribSpacing;
    const rib = new THREE.Mesh(ribGeo, matRib);
    rib.position.set(rx, H - railThick - 0.015, 0);
    reg(rib, 'int_techo');
    roofRibs.push(rib);
    group.add(rib);
  }

  // PARED FRONTAL (X = -halfL)
  const frenteGeo = new THREE.BoxGeometry(0.02, wallH, wallW);
  const frenteExt = new THREE.Mesh(frenteGeo, makeWallMat('mat_pared_frente_ext'));
  frenteExt.position.set(-halfL + 0.01, H / 2, 0);
  frenteExt.castShadow = true;
  frenteExt.receiveShadow = true;
  reg(frenteExt, 'cabina');
  group.add(frenteExt);

  const frenteInt = new THREE.Mesh(frenteGeo, makeWallMat('mat_pared_frente_int'));
  frenteInt.position.set(-halfL + 0.025, H / 2, 0);
  frenteInt.receiveShadow = true;
  reg(frenteInt, 'int_frente');
  group.add(frenteInt);

  // Plato de acople de quinta rueda / Kingpin
  const kingpinGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.04, 24);
  const matKingpin = new THREE.MeshStandardMaterial({ color: 0x2A2E33, roughness: 0.3, metalness: 0.8 });
  const kingpin = new THREE.Mesh(kingpinGeo, matKingpin);
  kingpin.position.set(-halfL + 1.2, 0.02, 0);
  reg(kingpin, 'cabina');
  group.add(kingpin);

  // =========================================================
  // 4. PUERTAS TRASERAS DE DOBLE HOJA CON BARRAS DE CIERRE
  // =========================================================
  const doorLeafW = (wallW) / 2 - 0.01;
  const doorLeafH = wallH - 0.02;

  function buildDoorLeaf(side) {
    const pivot = new THREE.Group();
    pivot.position.set(halfL - railThick / 2, H / 2, side * (halfW - railThick / 2));

    const doorGroup = new THREE.Group();
    doorGroup.position.set(0, 0, -side * doorLeafW / 2);

    const leafGeo = new THREE.BoxGeometry(0.035, doorLeafH, doorLeafW);
    const leafExt = new THREE.Mesh(leafGeo, makeWallMat('mat_puerta_ext_' + (side < 0 ? 'der' : 'izq')));
    leafExt.castShadow = true;
    leafExt.receiveShadow = true;
    reg(leafExt, 'ext_puertas');
    doorGroup.add(leafExt);

    const leafInt = new THREE.Mesh(leafGeo, makeWallMat('mat_puerta_int_' + (side < 0 ? 'der' : 'izq')));
    leafInt.position.set(-0.015, 0, 0);
    reg(leafInt, 'int_puertas');
    doorGroup.add(leafInt);

    const sealWire = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, doorLeafH + 0.01, doorLeafW + 0.01),
      matGasket
    );
    doorGroup.add(sealWire);

    const rodGeo = new THREE.CylinderGeometry(0.016, 0.016, doorLeafH + 0.06, 16);
    const camGeo = new THREE.BoxGeometry(0.04, 0.05, 0.035);
    const handleGeo = new THREE.BoxGeometry(0.02, 0.22, 0.025);

    const rodOffsets = [-doorLeafW * 0.24, doorLeafW * 0.24];
    rodOffsets.forEach((rodZ) => {
      const rod = new THREE.Mesh(rodGeo, matLockingRod);
      rod.position.set(0.032, 0, rodZ);
      reg(rod, 'ext_puertas');
      doorGroup.add(rod);

      const camTop = new THREE.Mesh(camGeo, matLockingRod);
      camTop.position.set(0.032, doorLeafH / 2 + 0.02, rodZ);
      reg(camTop, 'ext_puertas');
      doorGroup.add(camTop);

      const camBottom = new THREE.Mesh(camGeo, matLockingRod);
      camBottom.position.set(0.032, -doorLeafH / 2 - 0.02, rodZ);
      reg(camBottom, 'ext_puertas');
      doorGroup.add(camBottom);

      const handle = new THREE.Mesh(handleGeo, matLockingRod);
      handle.position.set(0.048, -0.15, rodZ + 0.03);
      reg(handle, 'ext_puertas');
      doorGroup.add(handle);
    });

    const hingeGeo = new THREE.BoxGeometry(0.05, 0.08, 0.04);
    [-0.38, -0.12, 0.12, 0.38].forEach((fraction) => {
      const hinge = new THREE.Mesh(hingeGeo, matLockingRod);
      hinge.position.set(0, doorLeafH * fraction, side * doorLeafW / 2);
      reg(hinge, 'ext_puertas');
      doorGroup.add(hinge);
    });

    pivot.add(doorGroup);
    group.add(pivot);

    return { pivot, doorGroup, leafExt, leafInt };
  }

  // Hoja derecha (Z = -halfW, copiloto) y hoja izquierda (Z = +halfW, piloto)
  const doorR = buildDoorLeaf(-1);
  const doorL = buildDoorLeaf(1);

  // =========================================================
  // 5. MARCADORES DEL TREN INFERIOR (LLANTAS NATURALES / EJES / GENERALES)
  // Las ruedas rotan con su eje a lo largo de Z (eje transversal vehicular)
  // =========================================================
  const wheelRadius = 0.48;
  const wheelWidth = 0.28;
  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
  wheelGeo.rotateX(Math.PI / 2); // Eje a lo largo de Z para que ruede naturalmente hacia adelante/atras en X

  const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, wheelWidth + 0.01, 18);
  rimGeo.rotateX(Math.PI / 2);

  const axleGeo = new THREE.CylinderGeometry(0.06, 0.06, W + 0.15, 12);
  axleGeo.rotateX(Math.PI / 2);

  const matTire = new THREE.MeshStandardMaterial({ color: 0x1A1C1E, roughness: 0.92, metalness: 0.08 });
  const matRim = new THREE.MeshStandardMaterial({ color: 0xD0D6DC, roughness: 0.35, metalness: 0.8 });
  const matAxle = new THREE.MeshStandardMaterial({ color: 0x1E2228, roughness: 0.6, metalness: 0.6 });

  function makeAxleAssembly(x) {
    const axle = new THREE.Mesh(axleGeo, matAxle);
    axle.position.set(x, -0.22, 0);
    reg(axle, 'generales');
    group.add(axle);

    // Llantas en el lado derecho (-Z) e izquierdo (+Z)
    [-halfW - 0.08, halfW + 0.08].forEach((z) => {
      const tire = new THREE.Mesh(wheelGeo, matTire);
      tire.position.set(x, -0.22, z);
      tire.castShadow = true;
      tire.receiveShadow = true;
      const rim = new THREE.Mesh(rimGeo, matRim);
      rim.position.set(x, -0.22, z);
      reg(tire, 'generales');
      reg(rim, 'generales');
      group.add(tire);
      group.add(rim);
    });
  }

  // Doble eje trasero del semirremolque
  [halfL - 2.8, halfL - 1.5].forEach((wx) => {
    makeAxleAssembly(wx);
  });

  const legGeo = new THREE.BoxGeometry(0.12, 0.5, 0.12);
  const matLeg = new THREE.MeshStandardMaterial({ color: 0x22262C, roughness: 0.6, metalness: 0.4 });
  [-halfW * 0.7, halfW * 0.7].forEach((lz) => {
    const leg = new THREE.Mesh(legGeo, matLeg);
    leg.position.set(-halfL + 2.4, -0.22, lz);
    reg(leg, 'generales');
    group.add(leg);
  });

  const box = new THREE.Box3().setFromObject(group);

  // =========================================================
  // CONTROL DE VISTAS Y CORTE SECCIONADO (CUTAWAY API)
  // =========================================================

  function setWallVisibility(side, visible) {
    if (side === 'izq') {
      paredIzqExt.visible = visible;
      paredIzqInt.visible = visible;
    } else if (side === 'der') {
      paredDerExt.visible = visible;
      paredDerInt.visible = visible;
    }
  }

  function applyCutaway(mode, focusPartId = null, cameraZSign = 1) {
    if (mode === 'exterior') {
      // Vista Externa: contenedor 100% sólido y cerrado.
      paredIzqExt.visible = true;
      paredIzqInt.visible = false;
      paredDerExt.visible = true;
      paredDerInt.visible = false;
      techoExt.visible = true;
      techoInt.visible = false;
      roofRibs.forEach((r) => (r.visible = false));
      frenteExt.visible = true;
      frenteInt.visible = false;
      doorL.leafExt.visible = true;
      doorL.leafInt.visible = false;
      doorR.leafExt.visible = true;
      doorR.leafInt.visible = false;
      doorL.pivot.rotation.y = 0;
      doorR.pivot.rotation.y = 0;
      return;
    }

    // MODO INTERIOR:
    // Puertas abiertas
    doorL.leafInt.visible = true;
    doorL.leafExt.visible = true;
    doorR.leafInt.visible = true;
    doorR.leafExt.visible = true;
    frenteInt.visible = true;
    frenteExt.visible = false;

    // 1. SI NO HAY NADA SELECCIONADO (VISTA GENERAL INTERIOR):
    // "si no hay nada seleccionado lo que tiene que hacer es mostrar todas las partes porque es una vista general"
    if (!focusPartId) {
      setWallVisibility('izq', true);
      setWallVisibility('der', true);
      techoExt.visible = true;
      techoInt.visible = true;
      roofRibs.forEach((r) => (r.visible = true));
      return;
    }

    // 2. AL SELECCIONAR UNA PARTE ESPECÍFICA:
    if (focusPartId === 'int_frente') {
      // "primera imagen alli tiene que aparecer todas las paredes. porque el enfoque es el fondo."
      setWallVisibility('izq', true);
      setWallVisibility('der', true);
      techoExt.visible = true;
      techoInt.visible = true;
      roofRibs.forEach((r) => (r.visible = true));
    } else if (focusPartId === 'int_pared_izquierda') {
      // Pared Izquierda (lado piloto, +Z): abrimos la pared derecha (-Z) para mirar hacia ella
      setWallVisibility('der', false);
      setWallVisibility('izq', true);
      techoExt.visible = true;
      techoInt.visible = true;
      roofRibs.forEach((r) => (r.visible = true));
    } else if (focusPartId === 'int_pared_derecha') {
      // Pared Derecha (lado copiloto, -Z): abrimos la pared izquierda (+Z) para mirar hacia ella
      setWallVisibility('izq', false);
      setWallVisibility('der', true);
      techoExt.visible = true;
      techoInt.visible = true;
      roofRibs.forEach((r) => (r.visible = true));
    } else if (focusPartId === 'int_piso') {
      // "al seleccionar el piso al menos el techo deberia de desaparecer para visualizar el resto"
      techoExt.visible = false;
      techoInt.visible = false;
      roofRibs.forEach((r) => (r.visible = false));
      // Abrimos la pared lateral más cercana a la cámara
      setWallVisibility('der', cameraZSign > 0);
      setWallVisibility('izq', cameraZSign <= 0);
    } else if (focusPartId === 'int_techo') {
      // Inspeccionando techo: abrir pared lateral para mirar hacia arriba
      techoExt.visible = true;
      techoInt.visible = true;
      roofRibs.forEach((r) => (r.visible = true));
      setWallVisibility('der', cameraZSign > 0);
      setWallVisibility('izq', cameraZSign <= 0);
    } else {
      // int_puertas u otras
      setWallVisibility('izq', true);
      setWallVisibility('der', true);
      techoExt.visible = true;
      techoInt.visible = true;
      roofRibs.forEach((r) => (r.visible = true));
    }
  }

  return {
    group,
    meshesByPart,
    doorPivotL: doorL.pivot,
    doorPivotR: doorR.pivot,
    paredIzqExt,
    paredIzqInt,
    paredDerExt,
    paredDerInt,
    techoExt,
    techoInt,
    frenteExt,
    frenteInt,
    floorMesh,
    applyCutaway,
    box,
    floorY: 0,
    boxTopY: H,
    boxCX: 0,
    boxW: W,
    boxH: H,
    boxL: L,
    boxX0: -halfL,
    boxX1: halfL,
  };
}
