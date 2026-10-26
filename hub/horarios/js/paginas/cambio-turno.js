// Formulario de cambio de turno: fecha, con quién y qué horario hace cada uno (06–14, 14–21,
// 21–06, a mano o libre). Lo usan el trabajador (crea una solicitud) y el coordinador (registra
// el cambio directo). Al elegir fecha y compañero se propone el intercambio de sus turnos.

import { listarTurnos, listarFeriados, guardarTurnosManuales } from '../firebase.js';
import { HORARIOS_PREDEFINIDOS, horarioDeTurno, opcionDeHorario, armarTurnoManual, describirHorario } from '../ajustes-turno.js';
import { fechaCorta } from '../utilidades/fechas.js';

const escapar = (texto) => String(texto ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const primerNombre = (nombre) => {
  const p = String(nombre ?? '').split(' ')[0];
  return p.charAt(0) + p.slice(1).toLowerCase();
};

function selectorHorario(clase, etiqueta, idp) {
  return `
    <div class="campo">
      <label for="${idp}-${clase}" class="${clase}-etiqueta">${etiqueta}</label>
      <select id="${idp}-${clase}" class="${clase}">
        ${HORARIOS_PREDEFINIDOS.map((h) => `<option value="${h.valor}">${h.texto}</option>`).join('')}
        <option value="manual">Otro horario (escribir entrada y salida)</option>
        <option value="libre">No trabaja (libre)</option>
      </select>
      <div class="${clase}-manual cambio-manual" hidden>
        <label>Entrada <input type="time" class="${clase}-ini" value="06:00"></label>
        <label>Salida <input type="time" class="${clase}-fin" value="14:00"></label>
      </div>
    </div>`;
}

/**
 * HTML del formulario. Con `solicitante` fijo (el trabajador que pide), solo se elige el
 * compañero; sin él (coordinador), se eligen las dos personas.
 */
export function formularioCambioHtml({ idp, personal, solicitante = null }) {
  const opcionesPersonas = (excluir) => personal
    .filter((p) => p.id !== excluir)
    .map((p) => `<option value="${p.id}">${escapar(p.nombre)} · ${escapar(p.puesto)}</option>`).join('');
  return `
    <div class="campo">
      <label for="${idp}-fecha">Fecha del cambio</label>
      <input id="${idp}-fecha" class="c-fecha" type="date">
    </div>
    ${solicitante ? '' : `
    <div class="campo">
      <label for="${idp}-a">Persona</label>
      <select id="${idp}-a" class="c-a"><option value="">Elige a la persona...</option>${opcionesPersonas(null)}</select>
    </div>`}
    <div class="campo">
      <label for="${idp}-b">${solicitante ? '¿Con quién cambias?' : 'Cambia con'}</label>
      <select id="${idp}-b" class="c-b"><option value="">Elige al compañero...</option>${opcionesPersonas(solicitante?.id)}</select>
    </div>
    <div class="c-actual tarjeta-ayuda" hidden></div>
    ${selectorHorario('c-ha', solicitante ? 'Tu horario ese día' : 'Horario de la persona', idp)}
    ${selectorHorario('c-hb', 'Horario del compañero', idp)}
  `;
}

function leerHorario(raiz, clase) {
  const valor = raiz.querySelector(`.${clase}`).value;
  if (valor === 'libre') return { tipo: 'libre' };
  if (valor === 'manual') {
    const hora_ini = raiz.querySelector(`.${clase}-ini`).value;
    const hora_fin = raiz.querySelector(`.${clase}-fin`).value;
    if (!hora_ini || !hora_fin || hora_ini === hora_fin) return null;
    return { tipo: 'manual', hora_ini, hora_fin };
  }
  return { tipo: 'letra', letra: valor };
}

function ponerHorario(raiz, clase, horario) {
  const select = raiz.querySelector(`.${clase}`);
  select.value = horario.tipo === 'letra' ? horario.letra : horario.tipo;
  if (horario.tipo === 'manual') {
    raiz.querySelector(`.${clase}-ini`).value = horario.hora_ini;
    raiz.querySelector(`.${clase}-fin`).value = horario.hora_fin;
  }
  raiz.querySelector(`.${clase}-manual`).hidden = select.value !== 'manual';
}

/** Conecta el formulario: muestra la hora a mano cuando hace falta y propone el intercambio. */
export function enlazarFormularioCambio(raiz, { personal, solicitante = null }) {
  const porId = new Map(personal.map((p) => [p.id, p]));
  const personaA = () => solicitante ?? porId.get(raiz.querySelector('.c-a')?.value);
  const personaB = () => porId.get(raiz.querySelector('.c-b').value);

  for (const clase of ['c-ha', 'c-hb']) {
    raiz.querySelector(`.${clase}`).addEventListener('change', (e) => {
      raiz.querySelector(`.${clase}-manual`).hidden = e.target.value !== 'manual';
    });
  }

  async function proponer() {
    const a = personaA(); const b = personaB();
    const fecha = raiz.querySelector('.c-fecha').value;
    const etiquetaB = raiz.querySelector('.c-hb-etiqueta');
    etiquetaB.textContent = b ? `Horario de ${primerNombre(b.nombre)}` : 'Horario del compañero';
    if (!solicitante) raiz.querySelector('.c-ha-etiqueta').textContent = a ? `Horario de ${primerNombre(a.nombre)}` : 'Horario de la persona';
    const actual = raiz.querySelector('.c-actual');
    if (!a || !b || !fecha) { actual.hidden = true; return; }

    try {
      const turnos = await listarTurnos(fecha, fecha);
      const ta = turnos.find((t) => t.usuario_id === a.id) ?? null;
      const tb = turnos.find((t) => t.usuario_id === b.id) ?? null;
      const ha = horarioDeTurno(ta); const hb = horarioDeTurno(tb);
      actual.textContent = `Lo planificado el ${fechaCorta(fecha)}: ${primerNombre(a.nombre)} ${describirHorario(ha)} · ${primerNombre(b.nombre)} ${describirHorario(hb)}. Se propone intercambiarlos; puedes cambiar cualquiera.`;
      actual.hidden = false;
      ponerHorario(raiz, 'c-ha', hb);
      ponerHorario(raiz, 'c-hb', ha);
    } catch (error) {
      console.error(error);
    }
  }

  raiz.querySelector('.c-fecha').addEventListener('change', proponer);
  raiz.querySelector('.c-b').addEventListener('change', proponer);
  raiz.querySelector('.c-a')?.addEventListener('change', proponer);

  /** Devuelve { fecha, a, b, horarioA, horarioB } o { error }. */
  return function leer() {
    const fecha = raiz.querySelector('.c-fecha').value;
    const a = personaA(); const b = personaB();
    if (!fecha) return { error: 'Elige la fecha del cambio.' };
    if (!a) return { error: 'Elige a la persona.' };
    if (!b) return { error: 'Elige con quién es el cambio.' };
    const horarioA = leerHorario(raiz, 'c-ha');
    const horarioB = leerHorario(raiz, 'c-hb');
    if (!horarioA || !horarioB) return { error: 'Revisa el horario escrito a mano: falta la entrada o la salida.' };
    return { fecha, a, b, horarioA, horarioB };
  };
}

/** Escribe en el horario los turnos de las dos personas para esa fecha. */
export async function aplicarCambio({ fecha, a, b, horarioA, horarioB, origen = 'manual', solicitudId = null }) {
  const [turnos, feriados] = await Promise.all([listarTurnos(fecha, fecha), listarFeriados(fecha, fecha)]);
  const actual = new Map(turnos.map((t) => [t.usuario_id, t]));
  const esFeriado = feriados.length > 0;
  const nuevos = [[a, horarioA], [b, horarioB]].map(([persona, horario]) => armarTurnoManual({
    persona, fecha, opcion: opcionDeHorario(horario), turnoActual: actual.get(persona.id) ?? null, esFeriado,
  }));
  await guardarTurnosManuales(nuevos, { origen, solicitudId });
}

/** Texto corto del cambio para listas e historial. */
export function textoCambio(detalle, nombreSolicitante) {
  return `${primerNombre(nombreSolicitante)} ${describirHorario(detalle.horario_solicitante)} · ${primerNombre(detalle.companero_nombre)} ${describirHorario(detalle.horario_companero)}`;
}
