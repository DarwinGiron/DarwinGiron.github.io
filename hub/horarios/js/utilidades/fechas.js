// Utilidades de fecha — zona horaria fija America/Guatemala, formato español.

export const ZONA_HORARIA = 'America/Guatemala';

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** 'YYYY-MM-DD' -> Date en horario local (evita el corrimiento de un día de `new Date(iso)`). */
export function isoALocal(iso) {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

/** Date -> 'YYYY-MM-DD' en horario local. */
export function localAIso(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** "lun 8 sep" */
export function fechaCorta(iso) {
  const f = isoALocal(iso);
  return `${DIAS_CORTOS[f.getDay()]} ${f.getDate()} ${MESES_CORTOS[f.getMonth()]}`;
}

/** "8 de septiembre de 2026" */
export function fechaLarga(iso) {
  const f = isoALocal(iso);
  return `${f.getDate()} de ${MESES_LARGOS[f.getMonth()]} de ${f.getFullYear()}`;
}

/** "Lunes 8 de septiembre" */
export function fechaConDiaLargo(iso) {
  const f = isoALocal(iso);
  const dia = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][f.getDay()];
  return `${dia} ${f.getDate()} de ${MESES_LARGOS[f.getMonth()]}`;
}

/** "Septiembre 2026" a partir de 'YYYY-MM-01' o cualquier fecha ISO del mes. */
export function nombreMes(iso) {
  const f = isoALocal(iso);
  const nombre = MESES_LARGOS[f.getMonth()];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${f.getFullYear()}`;
}

/** Primer día ('YYYY-MM-01') del mes que contiene `iso`. */
export function primerDiaDelMes(iso) {
  const f = isoALocal(iso);
  return localAIso(new Date(f.getFullYear(), f.getMonth(), 1));
}

/** Cantidad de días del mes que contiene `iso`. */
export function diasEnElMes(iso) {
  const f = isoALocal(iso);
  return new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
}

/** Suma (o resta) `n` meses a `iso` (fecha 'YYYY-MM-01'). */
export function sumarMeses(iso, n) {
  const f = isoALocal(iso);
  return localAIso(new Date(f.getFullYear(), f.getMonth() + n, 1));
}

/** Lista de las 7 fechas ISO (lunes a domingo) de la semana que contiene `iso`. */
export function semanaDe(iso) {
  const f = isoALocal(iso);
  const diaSemana = f.getDay();
  const offsetLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
  const lunes = new Date(f.getFullYear(), f.getMonth(), f.getDate() + offsetLunes);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    return localAIso(d);
  });
}

/** Fecha ISO de "hoy" en la zona America/Guatemala. */
export function hoyIso() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const obj = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}
