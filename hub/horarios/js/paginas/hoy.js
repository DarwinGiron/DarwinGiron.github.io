// "Hoy": quién cubre cada letra en el día elegido y la hoja de reporte con las mismas columnas
// del sistema institucional, para copiarla sin pensar. Flechas para cambiar de día.

import { textos } from '../textos.js';
import { LETRAS, listarPersonal, listarTurnos } from '../firebase.js';
import { hoyIso, fechaConDiaLargo, isoALocal, localAIso } from '../utilidades/fechas.js';
import { trabaja, franjasDe } from '../ajustes-turno.js';

// Franjas que se muestran como tarjetas. Entre semana: D, E, F. Domingo 6 a 6: día y noche.
const FRANJAS = {
  D: { badge: 'D', color: 'd', titulo: () => { const l = LETRAS.find((x) => x.codigo === 'D'); return `${l.nombre} · ${l.hora_ini}–${l.hora_fin}`; } },
  E: { badge: 'E', color: 'e', titulo: () => { const l = LETRAS.find((x) => x.codigo === 'E'); return `${l.nombre} · ${l.hora_ini}–${l.hora_fin}`; } },
  F: { badge: 'F', color: 'f', titulo: () => { const l = LETRAS.find((x) => x.codigo === 'F'); return `${l.nombre} · ${l.hora_ini}–${l.hora_fin}`; } },
  '6a6dia': { badge: 'E1', color: 'e', titulo: () => '6 a 6 día · 06:00–18:00' },
  '6a6noche': { badge: 'D', color: 'd', titulo: () => '6 a 6 noche · 18:00–06:00' },
};
const PUESTOS = { inspector: 'inspector', encargado: 'encargado' };
let diaVisible = null;

function sumarDias(iso, dias) {
  const f = isoALocal(iso);
  f.setDate(f.getDate() + dias);
  return localAIso(f);
}

const hora = (valor) => (valor ? String(valor).slice(0, 5) : '');
const escapar = (texto) => String(texto ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const primerNombre = (nombre) => {
  const p = String(nombre).split(' ')[0];
  return p.charAt(0) + p.slice(1).toLowerCase();
};

export async function render(contenedor) {
  const t = textos.paginas.hoy;
  if (!diaVisible) diaVisible = hoyIso();

  contenedor.innerHTML = `
    <div class="pagina">
      <div class="encabezado">
        <div class="encabezado-titulo">${t.titulo}</div>
      </div>
      <div class="selector-mes">
        <button id="dia-anterior" class="boton-icono" aria-label="Día anterior">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
        </button>
        <div id="dia-nombre" class="selector-mes-nombre"></div>
        <button id="dia-siguiente" class="boton-icono" aria-label="Día siguiente">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
        </button>
      </div>
      <div id="hoy-cobertura" class="lista-columna"><div class="mensaje-cargando">Cargando...</div></div>
      <div id="hoy-tabla" class="tarjeta" hidden></div>
    </div>
  `;

  document.getElementById('dia-anterior').addEventListener('click', () => { diaVisible = sumarDias(diaVisible, -1); render(contenedor); });
  document.getElementById('dia-siguiente').addEventListener('click', () => { diaVisible = sumarDias(diaVisible, 1); render(contenedor); });
  document.getElementById('dia-nombre').textContent = fechaConDiaLargo(diaVisible) + (diaVisible === hoyIso() ? ' · hoy' : '');

  let personal; let turnos;
  try {
    [personal, turnos] = await Promise.all([listarPersonal({ soloActivos: true }), listarTurnos(diaVisible, diaVisible)]);
  } catch (error) {
    console.error(error);
    document.getElementById('hoy-cobertura').innerHTML = `<div class="mensaje-cargando">${textos.errores.genericoAlGuardar}</div>`;
    return;
  }

  if (personal.length === 0) {
    document.getElementById('hoy-cobertura').innerHTML = '<div class="estado-vacio">Todavía no hay personal cargado. Ve a Personal para agregarlo.</div>';
    return;
  }

  const turnoDe = new Map(turnos.map((x) => [x.usuario_id, x]));
  const esDomingo = isoALocal(diaVisible).getDay() === 0;

  pintarCobertura(personal, turnoDe, esDomingo, t);
  pintarTabla(personal, turnoDe, t);
}

function pintarCobertura(personal, turnoDe, esDomingo, t) {
  const presentes = new Map(); // franja -> personas que la cubren
  const ausentes = new Map(); // franja -> personas que la tenían y faltan
  for (const p of personal) {
    const turno = turnoDe.get(p.id);
    const destino = trabaja(turno) ? presentes : turno?.tipo_cobertura === 'ausencia' ? ausentes : null;
    if (!destino) continue;
    for (const franja of franjasDe(turno)) {
      if (!destino.has(franja)) destino.set(franja, []);
      destino.get(franja).push(p);
    }
  }

  // Qué tarjetas mostrar: las de siempre (D/E/F entre semana; 6 a 6 día/noche si el domingo
  // va así) más cualquier otra franja que alguien esté cubriendo ese día.
  const hayTresTurnos = ['D', 'E', 'F'].some((f) => presentes.has(f) || ausentes.has(f));
  const base = esDomingo && !hayTresTurnos ? ['6a6dia', '6a6noche'] : ['D', 'E', 'F'];
  const franjas = [...base, ...Object.keys(FRANJAS).filter((f) => !base.includes(f) && (presentes.has(f) || ausentes.has(f)))];

  const tarjetas = franjas.map((franja) => {
    const info = FRANJAS[franja];
    const quienes = presentes.get(franja) ?? [];
    const faltan = ausentes.get(franja) ?? [];
    const hueco = quienes.length === 0;

    const detalle = quienes.length
      ? quienes.map((p) => {
        const x = turnoDe.get(p.id);
        const doble = x.tipo_cobertura === 'doblar' ? ` · doble ${hora(x.hora_ini)}–${hora(x.hora_fin)} y ${hora(x.split_ini)}–${hora(x.split_fin)}` : '';
        const puesto = p.puesto ? p.puesto.charAt(0).toUpperCase() + p.puesto.slice(1) : '';
        return `<div class="hoy-persona">${escapar(primerNombre(p.nombre))}<span class="hoy-persona-rol">${escapar(puesto)}${doble}</span></div>`;
      }).join('')
      : `<div class="hoy-persona hoy-persona-vacio">${t.textoHueco(info.badge)}</div>`;
    const lineaAusentes = faltan.map((p) => `<div class="hoy-persona hoy-persona-ausente">${escapar(primerNombre(p.nombre))}<span class="hoy-persona-rol">${escapar(textos.ausencias[turnoDe.get(p.id).ausencia_tipo] ?? 'Ausente')}</span></div>`).join('');

    // Lo normal es una pareja por turno: avisa si falta el inspector o el encargado.
    const sinPuesto = quienes.length ? Object.keys(PUESTOS).filter((puesto) => !quienes.some((p) => p.puesto === puesto)) : [];
    const avisoPareja = sinPuesto.length ? `<div class="hoy-aviso-pareja">Sin ${sinPuesto.join(' ni ')} en este turno</div>` : '';

    return `
      <div class="tarjeta-persona hoy-tarjeta ${hueco ? 'hoy-tarjeta-hueco' : ''}">
        <div class="fila-letra-badge" style="background:var(--color-${info.color}-bg);color:var(--color-${info.color}-texto)">${info.badge}</div>
        <div class="tarjeta-persona-info">
          <div class="tarjeta-persona-nombre">${escapar(info.titulo())}</div>
          ${detalle}
          ${lineaAusentes}
          ${avisoPareja}
        </div>
        ${hueco ? `<span class="badge badge-roja">${t.badgeHueco}</span>` : ''}
      </div>`;
  }).join('');

  document.getElementById('hoy-cobertura').innerHTML = tarjetas;
}

function filasDeLaTabla(personal, turnoDe) {
  return personal.map((p) => {
    const x = turnoDe.get(p.id);
    return [
      p.codigo_empleado ?? '',
      p.nombre,
      x?.letra_reportada ?? '',
      hora(x?.hora_ini),
      hora(x?.hora_fin),
      hora(x?.split_ini),
      hora(x?.split_fin),
      x?.ausencia_tipo ? (textos.ausencias[x.ausencia_tipo] ?? x.ausencia_tipo) : '',
      x?.comentario ?? '',
    ];
  });
}

function pintarTabla(personal, turnoDe, t) {
  const filas = filasDeLaTabla(personal, turnoDe);
  const tabla = document.getElementById('hoy-tabla');
  tabla.hidden = false;
  tabla.innerHTML = `
    <div class="tarjeta-titulo-fila">
      <div class="tarjeta-titulo">${t.encabezadoTabla}</div>
      <button id="hoy-copiar" class="boton-chip">${t.botonCopiar}</button>
    </div>
    <div id="hoy-copiado" class="mensaje-info" hidden>${t.toastCopiado}</div>
    <div class="tabla-desplazable">
      <table class="tabla-hoy">
        <thead><tr>${t.columnas.map((c) => `<th scope="col">${escapar(c)}</th>`).join('')}</tr></thead>
        <tbody>${filas.map((fila) => `<tr>${fila.map((celda) => `<td>${escapar(celda)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;

  document.getElementById('hoy-copiar').addEventListener('click', async () => {
    const texto = filas.map((fila) => fila.join('\t')).join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      document.getElementById('hoy-copiado').hidden = false;
    } catch (error) {
      console.error(error);
    }
  });
}
