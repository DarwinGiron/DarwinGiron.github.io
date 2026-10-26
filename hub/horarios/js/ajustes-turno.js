// Cambios a mano sobre lo que generó la rotación: cambiar la letra de alguien, cubrir un 6 a 6,
// marcarlo libre ("no trabaja este día") o ausente ("no se presentó", vacaciones, permiso...).
// Todo se guarda con origen "manual", así que "Generar mes" ya no lo pisa.

import { calcularHoras } from './horas.js';
import { textos } from './textos.js';

const HORAS_LETRA = { D: ['06:00', '14:00'], E: ['14:00', '21:00'], F: ['21:00', '06:00'] };
const AUSENCIAS = ['falta', 'vacaciones', 'enfermedad', 'permiso', 'capacitacion'];

export const trabaja = (turno) => Boolean(turno) && turno.tipo_cobertura !== 'libre' && turno.tipo_cobertura !== 'ausencia';

/** Opciones para el día de una persona. */
export function opcionesPersona(turno) {
  const opciones = [
    { valor: 'D', texto: 'D · Día', detalle: '06:00 – 14:00' },
    { valor: 'E', texto: 'E · Tarde', detalle: '14:00 – 21:00' },
    { valor: 'F', texto: 'F · Noche', detalle: '21:00 – 06:00' },
    { valor: '6a6dia', texto: '6 a 6 día', detalle: '06:00 – 18:00' },
    { valor: '6a6noche', texto: '6 a 6 noche', detalle: '18:00 – 06:00' },
    { valor: 'libre', texto: 'No trabaja este día', detalle: 'Se quita del día y queda libre' },
    ...AUSENCIAS.map((tipo) => ({ valor: `ausencia:${tipo}`, texto: textos.ausencias[tipo], detalle: tipo === 'falta' ? 'Estaba programado y no llegó' : 'Ausencia justificada' })),
  ];
  if (turno?.origen === 'manual' || turno?.origen === 'solicitud') {
    opciones.push({ valor: 'restaurar', texto: 'Volver a lo planificado', detalle: 'Deshace el cambio hecho a mano', peligro: true });
  }
  return opciones;
}

/** Opciones para todo el equipo en un día. */
export const OPCIONES_DIA = [
  { valor: 'libre:inspector', texto: 'Los inspectores no trabajan este día' },
  { valor: 'libre:encargado', texto: 'Los monitores de salud (encargados) no trabajan este día' },
  { valor: 'libre:todos', texto: 'Nadie trabaja este día' },
  { valor: 'ausencia-falta:inspector', texto: 'No se presentaron los inspectores' },
  { valor: 'ausencia-falta:encargado', texto: 'No se presentaron los monitores de salud' },
  { valor: 'ausencia-falta:todos', texto: 'No se presentó nadie' },
  { valor: 'restaurar', texto: 'Volver a lo planificado este día', detalle: 'Deshace los cambios a mano de este día', peligro: true },
];

/** Texto corto de lo que hace una opción, para el historial y las confirmaciones. */
export function describirOpcion(opcion) {
  if (opcion === 'libre') return 'no trabaja';
  if (opcion.startsWith('ausencia:')) return textos.ausencias[opcion.split(':')[1]].toLowerCase();
  if (opcion === '6a6dia') return '6 a 6 día';
  if (opcion === '6a6noche') return '6 a 6 noche';
  return `turno ${opcion}`;
}

/** Arma el turno manual de `persona` en `fecha` según `opcion` (ver opcionesPersona). */
export function armarTurnoManual({ persona, fecha, opcion, turnoActual, esFeriado }) {
  const baseActual = ['D', 'E', 'F'].includes(turnoActual?.letra_base) ? turnoActual.letra_base : null;
  const planificado = turnoActual?.origen === 'manual'
    ? (turnoActual.letra_planificada ?? null)
    : (turnoActual?.letra_reportada ?? null);
  const comun = { fecha, usuario_id: persona.id, letra_planificada: planificado, es_feriado: Boolean(esFeriado), ausencia_tipo: null, split_ini: null, split_fin: null };

  if (opcion === 'libre' || opcion.startsWith('ausencia:')) {
    const ausencia = opcion.startsWith('ausencia:') ? opcion.split(':')[1] : null;
    return {
      ...comun,
      letra_base: baseActual ?? 'L',
      letra_reportada: ausencia ? (turnoActual?.letra_reportada ?? 'L') : 'L',
      tipo_cobertura: ausencia ? 'ausencia' : 'libre',
      ausencia_tipo: ausencia,
      hora_ini: null, hora_fin: null, horas_reales: 0, horas_ordinarias: 0, horas_extra: 0,
    };
  }

  let letraBase; let letraReportada; let tipoCobertura; let horaIni; let horaFin;
  if (opcion === '6a6dia') {
    letraBase = baseActual ?? 'E'; letraReportada = `${letraBase}1`; tipoCobertura = '6a6dia'; [horaIni, horaFin] = ['06:00', '18:00'];
  } else if (opcion === '6a6noche') {
    letraBase = baseActual ?? 'D'; letraReportada = letraBase; tipoCobertura = '6a6noche'; [horaIni, horaFin] = ['18:00', '06:00'];
  } else {
    letraBase = opcion; letraReportada = opcion; tipoCobertura = 'normal'; [horaIni, horaFin] = HORAS_LETRA[opcion];
  }
  const { horasReales, horasOrdinarias, horasExtra } = calcularHoras({ tipoCobertura, letraBase, horaIni, horaFin, esFeriado });
  return {
    ...comun,
    letra_base: letraBase,
    letra_reportada: letraReportada,
    tipo_cobertura: tipoCobertura,
    hora_ini: horaIni,
    hora_fin: horaFin,
    horas_reales: horasReales,
    horas_ordinarias: horasOrdinarias,
    horas_extra: horasExtra,
  };
}
