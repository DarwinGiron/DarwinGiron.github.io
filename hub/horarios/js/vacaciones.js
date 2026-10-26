// Vacaciones: máximo 3 semanas seguidas, y una propuesta de cómo cubren los demás.
//
// Cada turno lleva normalmente un inspector y un encargado. Si uno se va de vacaciones, quedan
// dos compañeros de su mismo puesto para los tres turnos del día:
//   - el que tiene D (o, si falta D, el de F) hace doble: 06:00–14:00 y 21:00–06:00;
//   - el que tiene E se queda 14:00–21:00 (si falta E, el de F pasa a 14:00–21:00).
// El domingo de 6 a 6, el compañero de su puesto que estaba libre cubre su 6 a 6.
// Nadie cambia de letra: de ella salen sus horas ordinarias.

import { listarPersonal, listarTurnos, listarFeriados } from './firebase.js';
import { armarTurnoManual, trabaja, letraBaseDe, describirOpcion } from './ajustes-turno.js';
import { letraDeSemana } from './paginas/cambio-turno.js';
import { isoALocal, localAIso, fechaCorta } from './utilidades/fechas.js';

export const MAX_DIAS_VACACIONES = 21;

export function diasEntre(desde, hasta) {
  const dias = [];
  const cursor = isoALocal(desde);
  const fin = isoALocal(hasta || desde);
  while (cursor <= fin && dias.length < 400) {
    dias.push(localAIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

/** Error de validación del rango, o null si es válido. */
export function validarRangoVacaciones(desde, hasta) {
  if (!desde || !hasta) return 'Elige la fecha en que empiezan y la fecha en que terminan las vacaciones.';
  if (hasta < desde) return 'La fecha final no puede ser antes de la inicial.';
  if (diasEntre(desde, hasta).length > MAX_DIAS_VACACIONES) return 'Las vacaciones pueden ser de máximo 3 semanas seguidas (21 días).';
  return null;
}

const primerNombre = (nombre) => {
  const p = String(nombre ?? '').split(' ')[0];
  return p.charAt(0) + p.slice(1).toLowerCase();
};

/**
 * Propuesta de cobertura. Devuelve { cambios: [{ persona, fecha, opcion, turnoActual, letraSemana }],
 * resumen: [texto por tramo de días], sinHorario: n días sin turnos generados, pendientes: [fechas a revisar] }.
 */
export async function planDeCobertura({ personaId, desde, hasta }) {
  const dias = diasEntre(desde, hasta);
  const [personal, turnos] = await Promise.all([listarPersonal({ soloActivos: true }), listarTurnos(desde, hasta)]);
  const persona = personal.find((p) => p.id === personaId);
  if (!persona) return { cambios: [], resumen: [], sinHorario: 0, pendientes: [] };

  const turnoDe = new Map(turnos.map((t) => [`${t.usuario_id}_${t.fecha}`, t]));
  const delPuesto = personal.filter((p) => p.id !== persona.id && p.puesto === persona.puesto);
  const cambios = [];
  const porDia = []; // { fecha, texto }
  const pendientes = [];
  let sinHorario = 0;

  for (const fecha of dias) {
    const propio = turnoDe.get(`${persona.id}_${fecha}`);
    if (!propio) { sinHorario += 1; continue; }
    if (!trabaja(propio)) continue; // ese día no le tocaba trabajar: no hay nada que cubrir

    const turnoCompa = (p) => turnoDe.get(`${p.id}_${fecha}`) ?? null;
    const agregar = (p, opcion) => cambios.push({ persona: p, fecha, opcion, turnoActual: turnoCompa(p) });
    const domingo = isoALocal(fecha).getDay() === 0;

    if (propio.tipo_cobertura === '6a6dia' || propio.tipo_cobertura === '6a6noche') {
      const libre = delPuesto.find((p) => !trabaja(turnoCompa(p)) && turnoCompa(p)?.tipo_cobertura !== 'ausencia');
      if (!libre) { pendientes.push(fecha); continue; }
      const opcion = propio.tipo_cobertura === '6a6dia' ? 'horario:06:00-18:00' : 'horario:18:00-06:00';
      agregar(libre, opcion);
      porDia.push({ fecha, texto: `${primerNombre(libre.nombre)} cubre ${describirOpcion(opcion).replace('horario ', '')}` });
      continue;
    }

    const companeros = delPuesto.filter((p) => trabaja(turnoCompa(p)) && turnoCompa(p).tipo_cobertura === 'normal');
    const porLetra = Object.fromEntries(companeros.map((p) => [letraBaseDe(turnoCompa(p)), p]));
    const tarde = porLetra.E ?? porLetra.F;
    const doble = porLetra.D ?? porLetra.F;
    if (companeros.length !== 2 || !tarde || !doble || tarde === doble || domingo) { pendientes.push(fecha); continue; }

    agregar(doble, 'doble:D+F');
    const partes = [`${primerNombre(doble.nombre)} doble 06–14 y 21–06`];
    if (letraBaseDe(turnoCompa(tarde)) !== 'E') {
      agregar(tarde, 'horario:14:00-21:00');
      partes.push(`${primerNombre(tarde.nombre)} 14:00–21:00`);
    } else {
      partes.push(`${primerNombre(tarde.nombre)} sigue 14:00–21:00`);
    }
    porDia.push({ fecha, texto: partes.join(' · ') });
  }

  // Une los días seguidos con la misma propuesta: "lun 2 – sáb 7 nov: ...".
  const resumen = [];
  for (const d of porDia) {
    const ultimo = resumen[resumen.length - 1];
    const ayer = ultimo ? localAIso(new Date(isoALocal(ultimo.hasta).getTime() + 86400000)) : null;
    if (ultimo && ultimo.texto === d.texto && ayer === d.fecha) ultimo.hasta = d.fecha;
    else resumen.push({ desde: d.fecha, hasta: d.fecha, texto: d.texto });
  }
  return {
    persona,
    cambios,
    resumen: resumen.map((r) => `${r.desde === r.hasta ? fechaCorta(r.desde) : `${fechaCorta(r.desde)} – ${fechaCorta(r.hasta)}`}: ${r.texto}`),
    sinHorario,
    pendientes,
  };
}

/** Arma los turnos de la cobertura propuesta (para guardarlos junto con las vacaciones). */
export async function turnosDeCobertura(plan) {
  if (plan.cambios.length === 0) return [];
  const fechas = plan.cambios.map((c) => c.fecha).sort();
  const feriados = new Set((await listarFeriados(fechas[0], fechas[fechas.length - 1])).map((f) => f.fecha));
  const nuevos = [];
  for (const c of plan.cambios) {
    nuevos.push(armarTurnoManual({
      persona: c.persona, fecha: c.fecha, opcion: c.opcion, turnoActual: c.turnoActual,
      esFeriado: feriados.has(c.fecha), letraSemana: await letraDeSemana(c.fecha, c.persona),
    }));
  }
  return nuevos;
}

/** Texto para mostrar la propuesta (HTML simple, ya escapado por quien llama si hace falta). */
export function textoPlan(plan) {
  const lineas = [...plan.resumen];
  if (plan.pendientes.length) lineas.push(`Revisar a mano en Planificar: ${plan.pendientes.map(fechaCorta).join(', ')}.`);
  if (plan.sinHorario) lineas.push(`${plan.sinHorario} día(s) todavía sin horario generado: genera ese mes en Planificar.`);
  if (lineas.length === 0) lineas.push('Esos días no le tocaba trabajar: no hace falta cubrir a nadie.');
  return lineas;
}
