// "Generar mes": aplica rotacion.js + horas.js y guarda los turnos en Firestore
// (nunca pisa un turno puesto a mano o por solicitud: ver guardarTurnosAuto en firebase.js).
//
// La rotación arranca de lo que realmente quedó guardado en la última semana antes del día 1
// (con sus cambios a mano), no solo de la semana de referencia de Configuración:
//   - si el mes empieza a media semana (o en domingo), esos días siguen la letra que cada quien
//     traía esa semana, y el domingo se arma con esas letras (E de día, D de noche, F descansa);
//   - si el mes empieza en lunes, cada quien pasa a la letra siguiente (D → F → E) de la que
//     tuvo la semana anterior.
// Si de alguien no hay turnos guardados esa semana, se usa la semana de referencia.

import { obtenerConfig, listarPersonal, listarFeriados, listarTurnos, guardarTurnosAuto } from './firebase.js';
import { letraBaseDelDia, esDomingo, lunesDeLaSemana, semanasEntre, letraTrasSemanas } from './rotacion.js';
import { letraBaseDe } from './ajustes-turno.js';
import { calcularHoras } from './horas.js';
import { isoALocal, localAIso, primerDiaDelMes, diasEnElMes } from './utilidades/fechas.js';

const HORAS_LETRA = { D: ['06:00', '14:00'], E: ['14:00', '21:00'], F: ['21:00', '06:00'] };

export async function generarMes(mesIso) {
  const config = await obtenerConfig();
  if (!config) throw new Error('Configura primero la semana de referencia en Configuración.');

  const referencia = {
    semanaReferenciaLunes: isoALocal(config.semana_referencia_lunes),
    grupoEnD: config.grupo_en_d,
  };

  const usuarios = await listarPersonal({ soloActivos: true });

  const primerDia = primerDiaDelMes(mesIso);
  const baseDate = isoALocal(primerDia);
  const totalDias = diasEnElMes(primerDia);
  const ultimoDiaIso = localAIso(new Date(baseDate.getFullYear(), baseDate.getMonth(), totalDias));

  const arranque = await letrasDeArranque(baseDate, usuarios);
  const personas = usuarios.filter((u) => u.grupo || arranque.letras.has(u.id));

  /** Letra de la semana de `persona` en `fecha`: rota desde lo guardado, o por la referencia. */
  const letraDe = (persona, fecha) => {
    const guardada = arranque.letras.get(persona.id);
    if (guardada) return letraTrasSemanas(guardada, semanasEntre(arranque.lunes, fecha));
    return letraBaseDelDia(fecha, referencia)[persona.grupo] ?? null;
  };

  const feriados = await listarFeriados(primerDia, ultimoDiaIso);
  const feriadosSet = new Set((feriados ?? []).map((f) => f.fecha));

  const turnosGenerados = [];

  for (let dia = 1; dia <= totalDias; dia++) {
    const fecha = new Date(baseDate.getFullYear(), baseDate.getMonth(), dia);
    const fechaIso = localAIso(fecha);
    const esFeriado = feriadosSet.has(fechaIso);

    if (esDomingo(fecha)) {
      // 6 a 6: quien va en E esa semana cubre de día (E1), quien va en D de noche; F descansa.
      for (const persona of personas) {
        const letra = letraDe(persona, fecha);
        if (letra === 'E' || letra === 'D') {
          const esNoche = letra === 'D';
          const [horaIni, horaFin] = esNoche ? ['18:00', '06:00'] : ['06:00', '18:00'];
          const tipoCobertura = esNoche ? '6a6noche' : '6a6dia';
          const { horasReales, horasOrdinarias, horasExtra } = calcularHoras({
            tipoCobertura, letraBase: letra, horaIni, horaFin, esFeriado,
          });
          turnosGenerados.push(armarTurno({
            fecha: fechaIso, usuarioId: persona.id, letraBase: letra,
            letraReportada: esNoche ? 'D' : 'E1', tipoCobertura,
            horaIni, horaFin, horasReales, horasOrdinarias, horasExtra, esFeriado,
          }));
        } else {
          turnosGenerados.push(armarTurno({
            fecha: fechaIso, usuarioId: persona.id, letraBase: 'L',
            letraReportada: 'L', tipoCobertura: 'libre',
            horaIni: null, horaFin: null, horasReales: 0, horasOrdinarias: 0, horasExtra: 0, esFeriado: false,
          }));
        }
      }
      continue;
    }

    // lunes a sábado: los 6 trabajan con la letra de su semana
    for (const persona of personas) {
      const letraBase = letraDe(persona, fecha);
      if (!letraBase) continue;
      const [horaIni, horaFin] = HORAS_LETRA[letraBase];
      const { horasReales, horasOrdinarias, horasExtra } = calcularHoras({
        tipoCobertura: 'normal', letraBase, horaIni, horaFin, esFeriado,
      });
      turnosGenerados.push(armarTurno({
        fecha: fechaIso, usuarioId: persona.id, letraBase,
        letraReportada: letraBase, tipoCobertura: 'normal',
        horaIni, horaFin, horasReales, horasOrdinarias, horasExtra, esFeriado,
      }));
    }
  }

  const creados = await guardarTurnosAuto(turnosGenerados, primerDia, ultimoDiaIso);
  return { creados };
}

/**
 * Letra de cada persona en la última semana antes del día 1 del mes (la semana del día anterior),
 * leída de los turnos guardados de lunes a sábado. Si en esa semana alguien tuvo días con otra
 * letra (un cambio a mano), cuenta la que más se repite; en empate, la del día más reciente.
 * Devuelve { lunes: Date de esa semana, letras: Map(usuarioId → 'D'|'E'|'F') }.
 */
export async function letrasDeArranque(primerDiaDate, usuarios) {
  const diaAnterior = new Date(primerDiaDate.getFullYear(), primerDiaDate.getMonth(), primerDiaDate.getDate() - 1);
  const lunes = lunesDeLaSemana(diaAnterior);
  const sabado = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 5);
  const hasta = sabado < diaAnterior ? sabado : diaAnterior;

  const letras = new Map();
  const turnos = (await listarTurnos(localAIso(lunes), localAIso(hasta)))
    .filter((t) => !esDomingo(isoALocal(t.fecha)))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  for (const u of usuarios) {
    const conteo = {};
    let ultima = null;
    for (const t of turnos) {
      if (t.usuario_id !== u.id) continue;
      const letra = letraBaseDe(t) ?? (['D', 'E', 'F'].includes(t.letra_base) ? t.letra_base : null);
      if (!letra) continue;
      conteo[letra] = (conteo[letra] ?? 0) + 1;
      ultima = letra;
    }
    if (!ultima) continue;
    const maximo = Math.max(...Object.values(conteo));
    letras.set(u.id, conteo[ultima] === maximo ? ultima : Object.keys(conteo).find((l) => conteo[l] === maximo));
  }
  return { lunes, letras };
}

function armarTurno({
  fecha, usuarioId, letraBase, letraReportada, tipoCobertura,
  horaIni, horaFin, horasReales, horasOrdinarias, horasExtra, esFeriado,
}) {
  return {
    fecha,
    usuario_id: usuarioId,
    letra_base: letraBase,
    letra_reportada: letraReportada,
    tipo_cobertura: tipoCobertura,
    hora_ini: horaIni,
    hora_fin: horaFin,
    horas_reales: horasReales,
    horas_ordinarias: horasOrdinarias,
    horas_extra: horasExtra,
    es_feriado: esFeriado,
  };
}
