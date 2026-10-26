// Formulario de cambio de turno: fecha, con quién y qué horario hace cada uno. Cada persona
// conserva su letra (de ella salen sus horas ordinarias); el horario propuesto alcanza esas
// horas: D (8 h) de tarde 13:00–21:00, E (7 h) de mañana 06:00–13:00, noche 21:00–06:00.
// Lo usan el trabajador (crea una solicitud) y el coordinador (registra el cambio directo).

import { listarTurnos, listarFeriados, guardarTurnosManuales, obtenerConfig, listarPersonal } from '../firebase.js';
import { letraBaseDelDia } from '../rotacion.js';
import {
  HORARIOS_CAMBIO, horarioDeTurno, opcionDeHorario, armarTurnoManual, describirHorario,
  franjaDeHorario, horarioSugerido, revisarHorasOrdinarias, letraBaseDe,
} from '../ajustes-turno.js';
import { fechaCorta, isoALocal } from '../utilidades/fechas.js';

const escapar = (texto) => String(texto ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const primerNombre = (nombre) => {
  const p = String(nombre ?? '').split(' ')[0];
  return p.charAt(0) + p.slice(1).toLowerCase();
};

let promesaConfig = null;

/** Letra de la semana de una persona (por su grupo), para quien ese día está libre o sin turno. */
async function letraDeSemana(fecha, persona) {
  if (!persona?.grupo) return null;
  promesaConfig ??= obtenerConfig().catch(() => null);
  const config = await promesaConfig;
  if (!config) return null;
  const referencia = { semanaReferenciaLunes: isoALocal(config.semana_referencia_lunes), grupoEnD: config.grupo_en_d };
  return letraBaseDelDia(isoALocal(fecha), referencia)[persona.grupo] ?? null;
}

function selectorHorario(clase, etiqueta, idp) {
  return `
    <div class="campo">
      <label for="${idp}-${clase}" class="${clase}-etiqueta">${etiqueta}</label>
      <select id="${idp}-${clase}" class="${clase}">
        ${HORARIOS_CAMBIO.map((h) => `<option value="${h.valor}">${h.texto}</option>`).join('')}
        <option value="manual">Otro horario (escribir entrada y salida)</option>
        <option value="libre">No trabaja (libre)</option>
      </select>
      <div class="${clase}-nota cambio-nota" hidden></div>
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
  const [hora_ini, hora_fin] = valor.split('-');
  return { tipo: 'manual', hora_ini, hora_fin };
}

function ponerHorario(raiz, clase, horario) {
  const select = raiz.querySelector(`.${clase}`);
  const clave = horario.tipo === 'manual' ? `${horario.hora_ini}-${horario.hora_fin}` : horario.tipo;
  if ([...select.options].some((o) => o.value === clave)) {
    select.value = clave;
  } else {
    select.value = 'manual';
    raiz.querySelector(`.${clase}-ini`).value = horario.hora_ini;
    raiz.querySelector(`.${clase}-fin`).value = horario.hora_fin;
  }
  raiz.querySelector(`.${clase}-manual`).hidden = select.value !== 'manual';
}

/** Muestra la letra de la persona y avisa si el horario no alcanza sus horas ordinarias. */
function pintarNota(raiz, clase, letra) {
  const nota = raiz.querySelector(`.${clase}-nota`);
  if (!letra || letra === 'L') { nota.hidden = true; return true; }
  const horario = leerHorario(raiz, clase);
  const { ordinarias, horas, cumple } = revisarHorasOrdinarias(letra, horario);
  const base = `Conserva su letra ${letra} (${ordinarias} h ordinarias).`;
  nota.textContent = horario?.tipo === 'manual' && !cumple ? `${base} Este horario da ${horas} h: no completa sus horas.` : base;
  nota.classList.toggle('cambio-nota-alerta', horario?.tipo === 'manual' && !cumple);
  nota.hidden = false;
  return cumple || horario?.tipo !== 'manual';
}

/** Conecta el formulario: muestra la hora a mano cuando hace falta y propone el intercambio. */
export function enlazarFormularioCambio(raiz, { personal, solicitante = null }) {
  const porId = new Map(personal.map((p) => [p.id, p]));
  const personaA = () => solicitante ?? porId.get(raiz.querySelector('.c-a')?.value);
  const personaB = () => porId.get(raiz.querySelector('.c-b').value);

  // Letra planificada de cada uno ese día (se conserva en el cambio).
  const letras = { 'c-ha': null, 'c-hb': null };
  const refrescarNotas = () => ['c-ha', 'c-hb'].every((clase) => pintarNota(raiz, clase, letras[clase]));

  for (const clase of ['c-ha', 'c-hb']) {
    raiz.querySelector(`.${clase}`).addEventListener('change', (e) => {
      raiz.querySelector(`.${clase}-manual`).hidden = e.target.value !== 'manual';
      refrescarNotas();
    });
    raiz.querySelector(`.${clase}-ini`).addEventListener('change', refrescarNotas);
    raiz.querySelector(`.${clase}-fin`).addEventListener('change', refrescarNotas);
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
      letras['c-ha'] = letraBaseDe(ta) ?? await letraDeSemana(fecha, a);
      letras['c-hb'] = letraBaseDe(tb) ?? await letraDeSemana(fecha, b);
      const esDomingo = isoALocal(fecha).getDay() === 0;
      const etiqueta = (t, h) => (t?.letra_reportada && h.tipo === 'manual' ? `${t.letra_reportada} ${describirHorario(h)}` : describirHorario(h));
      const explicacion = esDomingo
        ? 'Domingo: se propone que intercambien el 6 a 6 (06:00–18:00 / 18:00–06:00) o, si uno estaba libre, que lo cubra; cada uno conserva su letra.'
        : 'Se propone que intercambien el turno conservando cada uno su letra.';
      actual.textContent = `Lo planificado el ${fechaCorta(fecha)}: ${primerNombre(a.nombre)} ${etiqueta(ta, ha)} · ${primerNombre(b.nombre)} ${etiqueta(tb, hb)}. ${explicacion} Puedes cambiar cualquiera.`;
      actual.hidden = false;
      // Cada uno pasa a la franja del otro, con el horario que completa SUS horas ordinarias.
      // Un 6 a 6 o un doble se intercambia tal cual.
      const propuesta = (horarioDelOtro, turnoDelOtro, letraPropia) => {
        if (horarioDelOtro.tipo !== 'manual') return horarioDelOtro;
        if (turnoDelOtro?.tipo_cobertura && turnoDelOtro.tipo_cobertura !== 'normal') return horarioDelOtro;
        return horarioSugerido(franjaDeHorario(horarioDelOtro), letraPropia) ?? horarioDelOtro;
      };
      ponerHorario(raiz, 'c-ha', propuesta(hb, tb, letras['c-ha']));
      ponerHorario(raiz, 'c-hb', propuesta(ha, ta, letras['c-hb']));
      refrescarNotas();
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
    if (!refrescarNotas()) return { error: 'Algún horario no completa las horas ordinarias de su letra. Ajústalo antes de enviar.' };
    return { fecha, a, b, horarioA, horarioB };
  };
}

/** Escribe en el horario los turnos de las dos personas para esa fecha. */
export async function aplicarCambio({ fecha, a, b, horarioA, horarioB, origen = 'manual', solicitudId = null }) {
  const [turnos, feriados, personal] = await Promise.all([listarTurnos(fecha, fecha), listarFeriados(fecha, fecha), listarPersonal()]);
  const actual = new Map(turnos.map((t) => [t.usuario_id, t]));
  const grupoDe = new Map(personal.map((p) => [p.id, p]));
  const esFeriado = feriados.length > 0;
  const nuevos = [];
  for (const [persona, horario] of [[a, horarioA], [b, horarioB]]) {
    const letraSemana = await letraDeSemana(fecha, grupoDe.get(persona.id) ?? persona);
    nuevos.push(armarTurnoManual({
      persona, fecha, opcion: opcionDeHorario(horario), turnoActual: actual.get(persona.id) ?? null, esFeriado, letraSemana,
    }));
  }
  await guardarTurnosManuales(nuevos, { origen, solicitudId });
}

/** Texto corto del cambio para listas e historial. */
export function textoCambio(detalle, nombreSolicitante) {
  return `${primerNombre(nombreSolicitante)} ${describirHorario(detalle.horario_solicitante)} · ${primerNombre(detalle.companero_nombre)} ${describirHorario(detalle.horario_companero)}`;
}
