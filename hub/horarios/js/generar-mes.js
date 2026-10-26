// "Generar mes": aplica rotacion.js + horas.js y sube cada turno con generar_turno_auto()
// (upsert que nunca pisa origen manual o de solicitud — ver sección 8 de 04-DISENO-SISTEMA.md).

import { supabase } from './supabase.js';
import { letraBaseDelDia, coberturaDomingo, esDomingo } from './rotacion.js';
import { calcularHoras } from './horas.js';
import { isoALocal, localAIso, primerDiaDelMes, diasEnElMes } from './utilidades/fechas.js';

const HORAS_LETRA = { D: ['06:00', '14:00'], E: ['14:00', '21:00'], F: ['21:00', '06:00'] };

export async function generarMes(mesIso) {
  const { data: config, error: errConfig } = await supabase.from('config').select('*').maybeSingle();
  if (errConfig) throw errConfig;
  if (!config) throw new Error('Configura primero la semana de referencia en Configuración.');

  const referencia = {
    semanaReferenciaLunes: isoALocal(config.semana_referencia_lunes),
    grupoEnD: config.grupo_en_d,
  };

  const { data: usuarios, error: errUsuarios } = await supabase
    .from('usuarios')
    .select('id, nombre, puesto, grupo')
    .eq('activo', true)
    .neq('puesto', 'coordinador');
  if (errUsuarios) throw errUsuarios;

  const porGrupo = { 1: [], 2: [], 3: [] };
  for (const u of usuarios) {
    if (u.grupo) porGrupo[u.grupo].push(u);
  }

  const primerDia = primerDiaDelMes(mesIso);
  const baseDate = isoALocal(primerDia);
  const totalDias = diasEnElMes(primerDia);
  const ultimoDiaIso = localAIso(new Date(baseDate.getFullYear(), baseDate.getMonth(), totalDias));

  const { data: feriados, error: errFeriados } = await supabase
    .from('feriados')
    .select('fecha')
    .gte('fecha', primerDia)
    .lte('fecha', ultimoDiaIso);
  if (errFeriados) throw errFeriados;
  const feriadosSet = new Set((feriados ?? []).map((f) => f.fecha));

  let alternancia = {
    ultimoPuestoDomingoDia: config.ultimo_puesto_domingo_dia ?? 'encargado',
    ultimoPuestoDomingoNoche: config.ultimo_puesto_domingo_noche ?? 'encargado',
  };

  let creados = 0;

  for (let dia = 1; dia <= totalDias; dia++) {
    const fecha = new Date(baseDate.getFullYear(), baseDate.getMonth(), dia);
    const fechaIso = localAIso(fecha);
    const esFeriado = feriadosSet.has(fechaIso);

    if (esDomingo(fecha)) {
      const coberturas = coberturaDomingo(fecha, referencia, alternancia);
      const cubrePorGrupo = {};
      for (const c of coberturas) cubrePorGrupo[c.grupo] = c;

      for (const grupo of [1, 2, 3]) {
        const personas = porGrupo[grupo];
        const cobertura = cubrePorGrupo[grupo];
        const personaElegida = cobertura
          ? (personas.find((p) => p.puesto === cobertura.puesto) ?? personas[0])
          : null;

        for (const persona of personas) {
          if (cobertura && persona === personaElegida) {
            const esNoche = cobertura.letraReportada === 'D';
            const [horaIni, horaFin] = esNoche ? ['18:00', '06:00'] : ['06:00', '18:00'];
            const tipoCobertura = esNoche ? '6a6noche' : '6a6dia';
            const letraBase = esNoche ? 'D' : 'E';
            const { horasReales, horasOrdinarias, horasExtra } = calcularHoras({
              tipoCobertura, letraBase, horaIni, horaFin, esFeriado,
            });
            await llamarGenerarTurno({
              fecha: fechaIso, usuarioId: persona.id, letraBase,
              letraReportada: cobertura.letraReportada, tipoCobertura,
              horaIni, horaFin, horasReales, horasOrdinarias, horasExtra, esFeriado,
            });
          } else {
            await llamarGenerarTurno({
              fecha: fechaIso, usuarioId: persona.id, letraBase: 'L',
              letraReportada: 'L', tipoCobertura: 'libre',
              horaIni: null, horaFin: null, horasReales: 0, horasOrdinarias: 0, horasExtra: 0, esFeriado: false,
            });
          }
          creados++;
        }
      }

      const grupoEnE = coberturas.find((c) => c.letraReportada === 'E1')?.grupo;
      const grupoEnD = coberturas.find((c) => c.letraReportada === 'D')?.grupo;
      const elegidoDia = grupoEnE != null
        ? (porGrupo[grupoEnE].find((p) => p.puesto === cubrePorGrupo[grupoEnE].puesto) ?? porGrupo[grupoEnE][0])
        : null;
      const elegidoNoche = grupoEnD != null
        ? (porGrupo[grupoEnD].find((p) => p.puesto === cubrePorGrupo[grupoEnD].puesto) ?? porGrupo[grupoEnD][0])
        : null;
      alternancia = {
        ultimoPuestoDomingoDia: elegidoDia?.puesto ?? alternancia.ultimoPuestoDomingoDia,
        ultimoPuestoDomingoNoche: elegidoNoche?.puesto ?? alternancia.ultimoPuestoDomingoNoche,
      };
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
        await llamarGenerarTurno({
          fecha: fechaIso, usuarioId: persona.id, letraBase,
          letraReportada: letraBase, tipoCobertura: 'normal',
          horaIni, horaFin, horasReales, horasOrdinarias, horasExtra, esFeriado,
        });
        creados++;
      }
    }
  }

  const { error: errConfigUpdate } = await supabase.from('config').update({
    ultimo_puesto_domingo_dia: alternancia.ultimoPuestoDomingoDia,
    ultimo_puesto_domingo_noche: alternancia.ultimoPuestoDomingoNoche,
  }).eq('id', true);
  if (errConfigUpdate) throw errConfigUpdate;

  return { creados };
}

async function llamarGenerarTurno({
  fecha, usuarioId, letraBase, letraReportada, tipoCobertura,
  horaIni, horaFin, horasReales, horasOrdinarias, horasExtra, esFeriado,
}) {
  const { error } = await supabase.rpc('generar_turno_auto', {
    p_fecha: fecha,
    p_usuario_id: usuarioId,
    p_letra_base: letraBase,
    p_letra_reportada: letraReportada,
    p_tipo_cobertura: tipoCobertura,
    p_hora_ini: horaIni,
    p_hora_fin: horaFin,
    p_horas_reales: horasReales,
    p_horas_ordinarias: horasOrdinarias,
    p_horas_extra: horasExtra,
    p_es_feriado: esFeriado,
  });
  if (error) throw error;
}
