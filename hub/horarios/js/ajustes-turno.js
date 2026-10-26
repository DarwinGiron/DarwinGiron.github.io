// Cambios a mano sobre lo que generó la rotación: cambiar la letra de alguien, cubrir un 6 a 6,
// marcarlo libre ("no trabaja este día") o ausente ("no se presentó", vacaciones, permiso...).
// Todo se guarda con origen "manual", así que "Generar mes" ya no lo pisa.

import { calcularHoras, horasEntre, HORAS_ORDINARIAS_LETRA } from './horas.js';
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
    { valor: 'doble:D+F', texto: 'Doble (mañana y noche)', detalle: '06:00 – 14:00 y 21:00 – 06:00, con su letra' },
    { valor: 'horario-manual', texto: 'Horario a mano', detalle: 'Escribes la entrada y la salida' },
    { valor: 'libre', texto: 'No trabaja este día', detalle: 'Se quita del día y queda libre' },
    ...AUSENCIAS.map((tipo) => ({ valor: `ausencia:${tipo}`, texto: textos.ausencias[tipo], detalle: tipo === 'falta' ? 'Estaba programado y no llegó' : 'Ausencia justificada' })),
  ];
  if (turno?.origen === 'manual' || turno?.origen === 'solicitud') {
    opciones.push({ valor: 'restaurar', texto: 'Volver a lo planificado', detalle: 'Deshace el cambio hecho a mano', peligro: true });
  }
  return opciones;
}

/** Opciones para todo el equipo en un día. */
export const OPCION_DOMINGO_3_TURNOS = {
  valor: 'domingo:3turnos', texto: 'Domingo de 3 turnos (D, E y F)', detalle: 'Cada grupo con su letra de la semana: 6 espacios',
};

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
  if (opcion === 'doble:D+F') return 'doble 06–14 y 21–06';
  if (opcion.startsWith('horario:')) return `horario ${opcion.slice(8).replace('-', '–')}`;
  return `turno ${opcion}`;
}

/** Arma el turno manual de `persona` en `fecha` según `opcion` (ver opcionesPersona). */
/**
 * `letraSemana` (opcional) es la letra de la semana de la persona; se usa cuando ese día no
 * tenía turno o estaba libre, para que conserve su letra igual.
 */
export function armarTurnoManual({ persona, fecha, opcion, turnoActual, esFeriado, letraSemana = null }) {
  const baseActual = ['D', 'E', 'F'].includes(turnoActual?.letra_base) ? turnoActual.letra_base : null;
  const planificado = turnoActual?.origen === 'manual'
    ? (turnoActual.letra_planificada ?? null)
    : (turnoActual?.letra_reportada ?? null);
  const tipoPlanificado = turnoActual?.origen === 'manual' || turnoActual?.origen === 'solicitud'
    ? (turnoActual.tipo_planificado ?? null)
    : (turnoActual?.tipo_cobertura ?? null);
  const comun = {
    fecha, usuario_id: persona.id, letra_planificada: planificado, tipo_planificado: tipoPlanificado,
    es_feriado: Boolean(esFeriado), ausencia_tipo: null, split_ini: null, split_fin: null,
  };

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

  if (opcion === 'doble:D+F') {
    // Cubre 06–14 y 21–06 conservando SU letra (de ella salen sus horas ordinarias).
    const letra = baseActual ?? letraSemana ?? 'D';
    const tramo = { tipoCobertura: 'doblar', letraBase: letra, horaIni: '06:00', horaFin: '14:00', splitIni: '21:00', splitFin: '06:00', esFeriado };
    const { horasReales, horasOrdinarias, horasExtra } = calcularHoras(tramo);
    return {
      ...comun,
      letra_base: letra, letra_reportada: letra, tipo_cobertura: 'doblar',
      hora_ini: '06:00', hora_fin: '14:00', split_ini: '21:00', split_fin: '06:00',
      horas_reales: horasReales, horas_ordinarias: horasOrdinarias, horas_extra: horasExtra,
    };
  }

  let letraBase; let letraReportada; let tipoCobertura; let horaIni; let horaFin;
  if (opcion.startsWith('horario:')) {
    // Cambio de horario (a mano o por cambio de turno): la letra NO se mueve, porque de ella
    // salen las horas ordinarias. Solo si no tenía turno se toma la del horario en que entra.
    [horaIni, horaFin] = opcion.slice(8).split('-');
    letraBase = baseActual ?? letraSemana ?? letraDeHora(horaIni);
    if (horaIni === '06:00' && horaFin === '18:00') {
      // 6 a 6 de día: se reporta la letra con "1" (E1, D1...) y descuenta 1 h de almuerzo.
      letraReportada = `${letraBase}1`; tipoCobertura = '6a6dia';
    } else if (horaIni === '18:00' && horaFin === '06:00') {
      letraReportada = letraBase; tipoCobertura = '6a6noche';
    } else {
      letraReportada = trabaja(turnoActual) && turnoActual.tipo_cobertura === 'normal' ? turnoActual.letra_reportada : letraBase;
      tipoCobertura = 'normal';
    }
  } else if (opcion === '6a6dia') {
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

/** Letra del turno en que empieza una hora 'HH:MM' (06–14 D, 14–21 E, 21–06 F). */
export function letraDeHora(horaTexto) {
  const h = Number(String(horaTexto).slice(0, 2));
  if (h >= 6 && h < 14) return 'D';
  if (h >= 14 && h < 21) return 'E';
  return 'F';
}

/**
 * Franjas que cubre un turno: 'D' | 'E' | 'F' | '6a6dia' | '6a6noche'. Un doble cubre dos
 * (p. ej. D y F). Para una ausencia devuelve la franja que tenía planificada.
 */
export function franjasDe(turno) {
  if (!turno || turno.tipo_cobertura === 'libre') return [];
  const tipo = turno.tipo_cobertura === 'ausencia' ? turno.tipo_planificado : turno.tipo_cobertura;
  if (tipo === '6a6dia' || tipo === '6a6noche') return [tipo];
  const base = turno.letra_reportada?.[0];
  if (!['D', 'E', 'F'].includes(base)) return [];
  if (turno.tipo_cobertura === 'doblar' && turno.split_ini) {
    // Un doble cubre las franjas de sus dos tramos, sea cual sea la letra que conserva.
    const tramos = [letraDeHora(turno.hora_ini ?? '06:00'), letraDeHora(turno.split_ini)];
    return tramos[0] === tramos[1] ? [tramos[0]] : tramos;
  }
  return [base];
}

/**
 * Letra que se muestra y se reporta: siempre la de la persona ("D", "E1"...). Un doble no
 * lleva "D+F": la persona aparece dos veces en el día, con la misma letra y cada horario.
 */
export function etiquetaTurno(turno) {
  return turno?.letra_reportada ?? '';
}

/**
 * Tramos de un turno para mostrarlo en el calendario: uno normalmente, dos en un doble
 * (cada uno como un turno con su propio horario, para ordenarlo y pintarlo por separado).
 */
export function tramosDe(turno) {
  if (turno?.tipo_cobertura === 'doblar' && turno.split_ini && turno.split_fin) {
    const comun = { ...turno, tipo_cobertura: 'normal', split_ini: null, split_fin: null };
    return [
      { ...comun, hora_ini: turno.hora_ini, hora_fin: turno.hora_fin },
      { ...comun, hora_ini: turno.split_ini, hora_fin: turno.split_fin },
    ];
  }
  return [turno];
}

// ---------- horarios de un cambio de turno ----------
// En un cambio cada persona conserva su letra (y con ella sus horas ordinarias); lo que cambia
// es el horario, que debe alcanzar esas horas: D (8 h) de tarde entra 13:00–21:00, E (7 h) de
// mañana va 06:00–13:00. La noche siempre es 21:00–06:00.
// Un horario es { tipo: 'manual', hora_ini, hora_fin } | { tipo: 'libre' }.

export const HORARIOS_CAMBIO = [
  { valor: '06:00-13:00', texto: '06:00 – 13:00 (mañana, 7 h)' },
  { valor: '06:00-14:00', texto: '06:00 – 14:00 (mañana, 8 h)' },
  { valor: '13:00-21:00', texto: '13:00 – 21:00 (tarde, 8 h)' },
  { valor: '14:00-21:00', texto: '14:00 – 21:00 (tarde, 7 h)' },
  { valor: '21:00-06:00', texto: '21:00 – 06:00 (noche)' },
  { valor: '06:00-18:00', texto: '06:00 – 18:00 (6 a 6 día, domingo)' },
  { valor: '18:00-06:00', texto: '18:00 – 06:00 (6 a 6 noche, domingo)' },
];

/** Franja de un horario por su hora de entrada: 'manana' | 'tarde' | 'noche'. */
export function franjaDeHorario(horario) {
  if (horario?.tipo !== 'manual') return null;
  const h = Number(horario.hora_ini.slice(0, 2));
  if (h >= 6 && h < 13) return 'manana';
  if (h >= 13 && h < 21) return 'tarde';
  return 'noche';
}

/** Horario que le corresponde a quien tiene `letra` si pasa a `franja`, para cumplir sus horas. */
export function horarioSugerido(franja, letra) {
  if (franja === 'noche') return { tipo: 'manual', hora_ini: '21:00', hora_fin: '06:00' };
  const ocho = letra === 'D'; // D: 8 h ordinarias; E: 7 h; F: 6 h, cabe en cualquiera
  if (franja === 'manana') return { tipo: 'manual', hora_ini: '06:00', hora_fin: ocho ? '14:00' : '13:00' };
  if (franja === 'tarde') return { tipo: 'manual', hora_ini: ocho ? '13:00' : '14:00', hora_fin: '21:00' };
  return null;
}

export function opcionDeHorario(horario) {
  if (horario?.tipo === 'manual') return `horario:${horario.hora_ini}-${horario.hora_fin}`;
  if (horario?.tipo === 'letra') return horario.letra; // solicitudes guardadas con el formato anterior
  return 'libre';
}

export function describirHorario(horario) {
  if (!horario) return '—';
  if (horario.tipo === 'libre') return 'libre';
  if (horario.tipo === 'manual') return `${horario.hora_ini}–${horario.hora_fin}`;
  if (horario.tipo === 'letra') return `turno ${horario.letra}`;
  return '—';
}

/** Horario que tiene alguien en un turno guardado. */
export function horarioDeTurno(turno) {
  if (!trabaja(turno)) return { tipo: 'libre' };
  if (turno.hora_ini && turno.hora_fin) {
    return { tipo: 'manual', hora_ini: String(turno.hora_ini).slice(0, 5), hora_fin: String(turno.hora_fin).slice(0, 5) };
  }
  // Turno sin horas guardadas: se usa el horario normal de su letra.
  const [hora_ini, hora_fin] = HORAS_LETRA[turno.letra_reportada?.[0]] ?? [];
  return hora_ini ? { tipo: 'manual', hora_ini, hora_fin } : { tipo: 'libre' };
}

/** Letra base de un turno (la que fija sus horas ordinarias). */
export function letraBaseDe(turno) {
  if (!trabaja(turno)) return null;
  return ['D', 'E', 'F'].includes(turno.letra_base) ? turno.letra_base : (turno.letra_reportada?.[0] ?? null);
}

/** Horas ordinarias de una letra y si un horario las alcanza. */
export function revisarHorasOrdinarias(letra, horario) {
  const ordinarias = HORAS_ORDINARIAS_LETRA[letra] ?? 0;
  if (!ordinarias || horario?.tipo !== 'manual') return { ordinarias, horas: 0, cumple: true };
  const horas = horasEntre(horario.hora_ini, horario.hora_fin);
  return { ordinarias, horas, cumple: horas >= ordinarias };
}

/**
 * Horario de entrada y salida para mostrar ("06:00–14:00"; un doble lleva sus dos tramos).
 * Con `compacto` quita los ":00" ("06–14"), para las celdas angostas del celular.
 */
export function horarioCorto(turno, { compacto = false } = {}) {
  if (!trabaja(turno) || !turno.hora_ini || !turno.hora_fin) return '';
  const h = (valor) => (compacto ? String(valor).slice(0, 5).replace(/:00$/, '') : String(valor).slice(0, 5));
  let texto = `${h(turno.hora_ini)}–${h(turno.hora_fin)}`;
  if (turno.tipo_cobertura === 'doblar' && turno.split_ini && turno.split_fin) texto += ` y ${h(turno.split_ini)}–${h(turno.split_fin)}`;
  return texto;
}

/**
 * Clave para ordenar a la gente de un día por hora de entrada (el día empieza a las 06:00):
 * un domingo va primero quien entra a las 06:00 aunque su letra sea E1, y después la noche.
 * La letra no cambia: solo el orden en que se muestra.
 */
export function claveOrdenHora(turno) {
  const [h, m] = String(turno?.hora_ini ?? '99:99').slice(0, 5).split(':').map(Number);
  const minutos = Number.isFinite(h) ? ((h < 6 ? h + 24 : h) * 60 + (m || 0)) : 9999;
  return `${String(minutos).padStart(4, '0')}_${turno?.letra_reportada ?? ''}`;
}
