// =========================================================
// furgon-visor-detalle.js
// Visor 3D estático / resumen de inspección para vista-detalle
//
// Muestra el modelo del contenedor con el resumen visual de lo
// evaluado. Si existen desviaciones, las remarca en rojo vivo
// directamente en el modelo 3D y enfoca automáticamente la vista
// correspondiente:
// - Vista Interna: idéntica a la captura del usuario (puertas
//   abiertas, perspectiva túnel recta hacia el interior, piso,
//   paredes y techo).
// - Vista Externa: perspectiva isométrica general completa.
// =========================================================

import { buildTruck, DIMS } from '../inspeccion-furgon-3d/FurgonModel.js';

export const PART_DEFS = {
  cabina: { label: 'Cabina, Camión y Piloto', mode: 'exterior', items: [
    { id: 'cabina_limpia', label: 'Cabina limpia' },
    { id: 'quinta_rueda', label: 'Quinta rueda y acople en buen estado' },
    { id: 'piloto_apto', label: 'Piloto en condiciones aptas (uniforme, EPP)' },
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
    { id: 'barras', label: 'Barras y manibelas de apertura/cierre' },
    { id: 'hermeticidad', label: 'Hermeticidad al cerrar' },
  ]},
  generales: { label: 'Generales (chasis, llantas, seguros)', mode: 'exterior', items: [
    { id: 'llantas', label: 'Llantas y rines limpios' },
    { id: 'seguros', label: 'Seguros giratorios (twist locks)' },
    { id: 'conos', label: 'Conos de seguridad presentes' },
    { id: 'alarma', label: 'Alarma de retroceso funcional' },
    { id: 'fumigacion', label: 'Certificado de fumigación vigente' },
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
    { id: 'filtracion', label: 'Sin filtraciones de agua' },
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

/**
 * Extrae las desviaciones de cualquier registro (sea 3D nuevo o formato previo).
 */
export function obtenerDesviaciones(data) {
  const desviaciones = [];
  const fallasPorPartId = new Set();

  if (!data) return { desviaciones, fallasPorPartId };

  // 1. Detección en inspecciones 3D con objeto answers
  if (data.answers && typeof data.answers === 'object') {
    Object.entries(data.answers).forEach(([partId, itemsObj]) => {
      if (!itemsObj || typeof itemsObj !== 'object') return;
      const def = PART_DEFS[partId];
      if (!def) return;
      const itemsMalos = [];
      Object.entries(itemsObj).forEach(([itemId, val]) => {
        if (val === 'no') {
          const itDef = def.items.find((i) => i.id === itemId);
          itemsMalos.push(itDef ? itDef.label : itemId);
        }
      });
      if (itemsMalos.length > 0) {
        fallasPorPartId.add(partId);
        desviaciones.push({
          partId,
          nombre: def.label,
          mode: def.mode,
          itemsMalos,
        });
      }
    });
  }

  // 2. Soporte para registros previos con respuestasPorZona / respuestasCabina
  if (desviaciones.length === 0 && data.respuestasPorZona && typeof data.respuestasPorZona === 'object') {
    const mapaZonas = {
      'pared-izquierda': { ext: 'ext_pared_izquierda', int: 'int_pared_izquierda' },
      'pared-derecha':   { ext: 'ext_pared_derecha', int: 'int_pared_derecha' },
      'techo':           { ext: 'ext_techo', int: 'int_techo' },
      'piso':            { int: 'int_piso' },
      'puertas':         { ext: 'ext_puertas', int: 'int_puertas' },
      'frente':          { int: 'int_frente' },
      'generales':       { ext: 'generales' },
    };

    Object.entries(data.respuestasPorZona).forEach(([zonaKey, z]) => {
      const mapping = mapaZonas[zonaKey] || {};
      ['externa', 'interna'].forEach((modo) => {
        const arr = z[modo];
        if (Array.isArray(arr)) {
          const malos = arr.filter((it) => it.valor === 'no').map((it) => it.texto);
          if (malos.length > 0) {
            const pId = modo === 'externa' ? (mapping.ext || 'generales') : (mapping.int || 'int_piso');
            if (!fallasPorPartId.has(pId)) {
              fallasPorPartId.add(pId);
              desviaciones.push({
                partId: pId,
                nombre: (PART_DEFS[pId] && PART_DEFS[pId].label) || `${z.nombre || zonaKey} (${modo})`,
                mode: modo === 'externa' ? 'exterior' : 'interior',
                itemsMalos: malos,
              });
            }
          }
        }
      });
    });

    if (Array.isArray(data.respuestasCabina)) {
      const malosCabina = data.respuestasCabina.filter((it) => it.valor === 'no').map((it) => it.texto);
      if (malosCabina.length > 0 && !fallasPorPartId.has('cabina')) {
        fallasPorPartId.add('cabina');
        desviaciones.push({
          partId: 'cabina',
          nombre: 'Cabina, Camión y Piloto',
          mode: 'exterior',
          itemsMalos: malosCabina,
        });
      }
    }
  }

  return { desviaciones, fallasPorPartId };
}

let stageActivo = null;
let animacionFrame = null;

export function limpiarVisor3DDetalle() {
  if (animacionFrame) {
    cancelAnimationFrame(animacionFrame);
    animacionFrame = null;
  }
  stageActivo = null;
}

/**
 * Monta el visualizador 3D estático en la vista de detalle
 */
export async function montarVisor3DDetalle(contenedorEl, data) {
  limpiarVisor3DDetalle();
  if (!contenedorEl) return;

  const { desviaciones, fallasPorPartId } = obtenerDesviaciones(data);
  const tieneFallas = desviaciones.length > 0;
  const aprobado = typeof data.aprobado === 'boolean'
    ? data.aprobado
    : (data.resultado === 'aprobado' || data.cumplimientoPorcentaje === 100);

  contenedorEl.innerHTML = `
    <section class="tarjeta mb-4" style="padding: var(--e3) var(--e4);">
      <div class="flex-entre mb-3" style="flex-wrap:wrap; gap:10px; align-items:center;">
        <div>
          <h2 class="tarjeta__titulo mb-0" style="font-size: var(--txt-md); display:flex; align-items:center; gap:8px;">
            <svg style="width:20px;height:20px;color:var(--primario);flex:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            Resumen Visual 3D del Contenedor
          </h2>
          <p class="texto-suave texto-xs mb-0">Inspección tridimensional del furgón. Las áreas con desviación se muestran remarcadas en rojo.</p>
        </div>

        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button type="button" id="btn-visor-ext" class="btn btn-sm btn-primario" style="font-size:12px; padding:5px 12px;">
            🚚 Vista Externa General
          </button>
          <button type="button" id="btn-visor-int" class="btn btn-sm btn-secundario" style="font-size:12px; padding:5px 12px;">
            🚪 Vista Interna (Interior)
          </button>
        </div>
      </div>

      <!-- Contenedor del Stage 3D -->
      <div style="width:100%; height:390px; border-radius:var(--r-md); overflow:hidden; position:relative; border:1px solid var(--borde); background:#f0eee6; box-shadow:inset 0 1px 3px rgba(0,0,0,0.05);">
        <three-d-stage id="stage-detalle-3d" background="#f0eee6"></three-d-stage>
        <div id="badge-modo-3d" style="position:absolute; top:12px; left:12px; background:rgba(15,42,74,0.88); color:#fff; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:700; pointer-events:none; z-index:2; backdrop-filter:blur(4px); letter-spacing:0.02em;">
          Vista Externa General
        </div>
        <div style="position:absolute; bottom:10px; right:12px; background:rgba(255,255,255,0.9); color:var(--tinta-suave); padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600; pointer-events:none; z-index:2; border:1px solid var(--borde);">
          Arrastra para rotar · Rueda para zoom
        </div>
      </div>

      <!-- Resumen descriptivo de la inspección -->
      <div id="panel-resumen-3d" class="mt-3">
        ${!tieneFallas && aprobado
          ? `<div style="background:#ecfdf5; border:1.5px solid #86efac; border-radius:8px; padding:12px 16px; display:flex; align-items:center; gap:12px; color:#065f46;">
              <svg style="width:22px;height:22px;flex:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <div>
                <strong style="font-size:13.5px;">✓ Inspección Conforme (100% de cumplimiento)</strong>
                <div style="font-size:12px; opacity:0.9; margin-top:2px;">Todas las secciones evaluadas cumplen con los criterios de inocuidad y hermeticidad. Sin desviaciones.</div>
              </div>
            </div>`
          : `<div style="background:#fef2f2; border:1.5px solid #fca5a5; border-radius:8px; padding:12px 16px; color:#991b1b;">
              <div style="font-weight:800; font-size:13.5px; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
                <svg style="width:20px;height:20px;flex:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Desviaciones Detectadas (${desviaciones.length} sección${desviaciones.length === 1 ? '' : 'es'} no conforme${desviaciones.length === 1 ? '' : 's'}):
              </div>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${desviaciones.map((d) => `
                  <div style="background:#ffffff; border:1px solid #fecaca; border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                    <div style="flex:1; min-width:200px;">
                      <span class="badge-rechazado" style="font-size:11px; padding:2px 8px; margin-bottom:4px;">${d.nombre}</span>
                      <div style="font-size:12px; color:#7f1d1d; margin-top:3px; font-weight:600;">
                        ${d.itemsMalos.join(' · ')}
                      </div>
                    </div>
                    <button type="button" class="btn btn-sm btn-secundario btn-enfocar-desviacion" data-part="${d.partId}" style="font-size:11.5px; padding:4px 10px; gap:4px; white-space:nowrap;">
                      🔍 Enfocar en 3D
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>`
        }
      </div>
    </section>
  `;

  const stage = contenedorEl.querySelector('#stage-detalle-3d');
  const btnExt = contenedorEl.querySelector('#btn-visor-ext');
  const btnInt = contenedorEl.querySelector('#btn-visor-int');
  const badgeModo = contenedorEl.querySelector('#badge-modo-3d');

  stageActivo = stage;

  try {
    await customElements.whenDefined('three-d-stage');
    const ready = await stage.ready;
    const THREE = ready.THREE;
    const model = await buildTruck(THREE);
    stage.setObject(model.group);

    const camera = stage._camera;
    const controls = stage._controls;

    const { L, W, H } = DIMS;
    const halfL = L / 2;
    const halfW = W / 2;

    // Coordenadas para la vista externa isométrica general (Capturas 2 y 3)
    const camExterior = {
      pos: new THREE.Vector3(halfL * 1.3, H * 1.6, W * 2.8),
      target: new THREE.Vector3(0, H * 0.45, 0),
    };

    // Coordenadas para la vista interna túnel recta con puertas abiertas (Captura 1)
    const camInterior = {
      pos: new THREE.Vector3(halfL + 2.6, H * 0.58, 0.001),
      target: new THREE.Vector3(-halfL * 0.2, H * 0.45, 0),
    };

    // Aplicar remarcado rojo a las piezas que salieron malas
    Object.keys(PART_DEFS).forEach((partId) => {
      const isFalla = fallasPorPartId.has(partId);
      (model.meshesByPart[partId] || []).forEach((m) => {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => {
          if (!mat || !mat.emissive) return;
          if (isFalla) {
            // Remarcado en rojo vivo para resaltar el lugar que salió malo
            mat.emissive.setHex(0xDC2626);
            mat.emissiveIntensity = 0.85;
          } else if (!tieneFallas && aprobado) {
            // Aprobado: sutil tinte verde
            mat.emissive.setHex(0x16A34A);
            mat.emissiveIntensity = 0.12;
          } else {
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0.0;
          }
        });
      });
    });

    function animarCamara(toPos, toTarget, duracion = 700) {
      if (!camera || !controls) return;
      const fromPos = camera.position.clone();
      const fromTarget = controls.target.clone();
      const start = performance.now();
      controls.enabled = false;

      const step = (now) => {
        const t = Math.min((now - start) / duracion, 1);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        camera.position.lerpVectors(fromPos, toPos, e);
        controls.target.lerpVectors(fromTarget, toTarget, e);
        controls.update();
        if (t < 1) {
          animacionFrame = requestAnimationFrame(step);
        } else {
          controls.enabled = true;
          animacionFrame = null;
        }
      };
      if (animacionFrame) cancelAnimationFrame(animacionFrame);
      animacionFrame = requestAnimationFrame(step);
    }

    function ponerPuertas(abiertas) {
      if (model.doorPivotL && model.doorPivotR) {
        model.doorPivotL.rotation.y = abiertas ? -Math.PI / 2 : 0;
        model.doorPivotR.rotation.y = abiertas ? Math.PI / 2 : 0;
      }
    }

    function activarVistaExterna() {
      ponerPuertas(false);
      model.applyCutaway('exterior');
      animarCamara(camExterior.pos, camExterior.target);
      btnExt.className = 'btn btn-sm btn-primario';
      btnInt.className = 'btn btn-sm btn-secundario';
      if (badgeModo) badgeModo.textContent = 'Vista Externa General';
    }

    function activarVistaInterna() {
      // Puertas abiertas y todas las paredes visibles para vista túnel completa (Captura 1)
      ponerPuertas(true);
      model.applyCutaway('interior', null, 1);
      animarCamara(camInterior.pos, camInterior.target);
      btnExt.className = 'btn btn-sm btn-secundario';
      btnInt.className = 'btn btn-sm btn-primario';
      if (badgeModo) badgeModo.textContent = 'Vista Interna (Interior)';
    }

    btnExt.addEventListener('click', activarVistaExterna);
    btnInt.addEventListener('click', activarVistaInterna);

    // Conectar botones de cada desviación
    contenedorEl.querySelectorAll('.btn-enfocar-desviacion').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pId = btn.dataset.part;
        const def = PART_DEFS[pId];
        if (!def) return;

        if (def.mode === 'interior') {
          ponerPuertas(true);
          model.applyCutaway('interior', pId, 1);
          if (pId === 'int_piso') {
            // Enfoque hacia el piso y rampa
            animarCamara(new THREE.Vector3(0.5, H * 2.2, W * 1.3), new THREE.Vector3(0.5, 0.1, 0));
          } else if (pId === 'int_pared_izquierda') {
            animarCamara(new THREE.Vector3(0, H * 0.55, -W * 2.2), new THREE.Vector3(0, H * 0.5, halfW - 0.1));
          } else if (pId === 'int_pared_derecha') {
            animarCamara(new THREE.Vector3(0, H * 0.55, W * 2.2), new THREE.Vector3(0, H * 0.5, -halfW + 0.1));
          } else if (pId === 'int_frente') {
            animarCamara(new THREE.Vector3(halfL * 0.5, H * 0.55, 0.001), new THREE.Vector3(-halfL + 0.1, H * 0.5, 0));
          } else {
            animarCamara(camInterior.pos, camInterior.target);
          }
          btnExt.className = 'btn btn-sm btn-secundario';
          btnInt.className = 'btn btn-sm btn-primario';
          if (badgeModo) badgeModo.textContent = `Desviación: ${def.label}`;
        } else {
          ponerPuertas(false);
          model.applyCutaway('exterior');
          if (pId === 'ext_pared_izquierda') {
            animarCamara(new THREE.Vector3(0, H * 0.55, W * 2.6), new THREE.Vector3(0, H * 0.5, 0));
          } else if (pId === 'ext_pared_derecha') {
            animarCamara(new THREE.Vector3(0, H * 0.55, -W * 2.6), new THREE.Vector3(0, H * 0.5, 0));
          } else if (pId === 'ext_techo') {
            animarCamara(new THREE.Vector3(0, H * 2.5, W * 1.2), new THREE.Vector3(0, H, 0));
          } else if (pId === 'ext_puertas') {
            animarCamara(new THREE.Vector3(halfL + 3.0, H * 0.55, 0.001), new THREE.Vector3(halfL, H * 0.5, 0));
          } else {
            animarCamara(camExterior.pos, camExterior.target);
          }
          btnExt.className = 'btn btn-sm btn-primario';
          btnInt.className = 'btn btn-sm btn-secundario';
          if (badgeModo) badgeModo.textContent = `Desviación: ${def.label}`;
        }
      });
    });

    // SELECCIÓN INICIAL AUTOMÁTICA:
    // "que de una vez muestre el lugar donde esta malo, y en la vista interna que salga asi como la captura. pero remarcado donde salio malo."
    const tieneFallaInterna = desviaciones.some((d) => d.mode === 'interior');
    if (tieneFallaInterna) {
      // Iniciar de una vez en Vista Interna (Captura 1) con la parte defectuosa en rojo
      activarVistaInterna();
    } else {
      // Iniciar en Vista Externa General (Captura 2/3)
      activarVistaExterna();
    }
  } catch (err) {
    console.error('Error al inicializar visualizador 3D en detalle:', err);
    contenedorEl.innerHTML = `
      <section class="tarjeta mb-4">
        <p class="texto-suave texto-sm mb-0">No se pudo cargar el modelo 3D para este registro.</p>
      </section>
    `;
  }
}
