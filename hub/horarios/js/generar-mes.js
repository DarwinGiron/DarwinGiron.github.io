// "Generar mes": aplica rotacion.js + horas.js y guarda los turnos en Firestore
// (nunca pisa un turno puesto a mano o por solicitud: ver guardarTurnosAuto en firebase.js).

import { obtenerConfig, listarPersonal, listarFeriados, guardarTurnosAuto } from './firebase.js';
import { letraBaseDelDia, coberturaDomingo, esDomingo } from './rotacion.js';
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

  const porGrupo = { 1: [], 2: [], 3: [] };
  for (const u of usuarios) {
    if (u.grupo) porGrupo[u.grupo].push(u);
  }

  const primerDia = primerDiaDelMes(mesIso);
  const baseDate = isoALocal(primerDia);
  const totalDias = diasEnElMes(primerDia);
  const ultimoDiaIso = localAIso(new Date(baseDate.getFullYear(), baseDate.getMonth(), totalDias));

  const feriados = await listarFeriados(primerDia, ultimoDiaIso);
  const feriadosSet = new Set((feriados ?? []).map((f) => f.fecha));

  const turnosGenerados = [];

  for (let dia = 1; dia <= totalDias; dia++) {
    const fecha = new Date(baseDate.getFullYear(), baseDate.getMonth(), dia);
    const fechaIso = localAIso(fecha);
    const esFeriado = feriadosSet.has(fechaIso);

    if (esDomingo(fecha)) {
      const { grupoDia, grupoNoche } = coberturaDomingo(fecha, referencia);
      for (const grupo of [1, 2, 3]) {
        for (const persona of porGrupo[grupo]) {
          if (grupo === grupoDia || grupo === grupoNoche) {
            const esNoche = grupo === grupoNoche;
            const [horaIni, horaFin] = esNoche ? ['18:00', '06:00'] : ['06:00', '18:00'];
            const tipoCobertura = esNoche ? '6a6noche' : '6a6dia';
            const letraBase = esNoche ? 'D' : 'E';
            const { horasReales, horasOrdinarias, horasExtra } = calcularHoras({
              tipoCobertura, letraBase, horaIni, horaFin, esFeriado,
            });
            turnosGenerados.push(armarTurno({
              fecha: fechaIso, usuarioId: persona.id, letraBase,
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
      }
      continue;
    }

    // lunes a sábado: los 6 trabajan con la letra de su grupo
    const letras = letraBaseDelDia(fecha, referencia);
    for (const grupo of [1, 2, 3]) {
      const letraBase = letras[grupo];
      const [horaIni, horaFin] = HORAS_LETRA[letraBase];
      const { horasReales, horasOrdinarias, horasExtra } = calcularHoras({
        tipoCobertura: 'normal', letraBase, horaIni, horaFin, esFeriado,
      });
      for (const persona of porGrupo[grupo]) {
        turnosGenerados.push(armarTurno({
          fecha: fechaIso, usuarioId: persona.id, letraBase,
          letraReportada: letraBase, tipoCobertura: 'normal',
          horaIni, horaFin, horasReales, horasOrdinarias, horasExtra, esFeriado,
        }));
      }
    }
  }

  const creados = await guardarTurnosAuto(turnosGenerados, primerDia, ultimoDiaIso);
  return { creados };
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
