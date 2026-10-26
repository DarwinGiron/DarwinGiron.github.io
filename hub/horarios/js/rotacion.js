// Algoritmo de rotación — función pura, sin dependencias de Supabase.
// Ver sección 6 de 04-DISENO-SISTEMA.md.

const ORDEN_ROTACION = ['D', 'F', 'E']; // letra en la semana 0, +1 semana, +2 semanas...
const MS_POR_SEMANA = 7 * 24 * 60 * 60 * 1000;

/** Lunes (00:00) de la semana que contiene `fecha`. `fecha` es un Date en horario local. */
export function lunesDeLaSemana(fecha) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const diaSemana = d.getDay(); // 0 = domingo .. 6 = sábado
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + offset);
  return d;
}

/**
 * Letra base del grupo `grupo` (1|2|3) en la fecha `fecha`, dada la semana de referencia.
 * `referencia` = { semanaReferenciaLunes: Date, grupoEnD: 1|2|3 }
 */
export function letraBaseSemanal(grupo, fecha, referencia) {
  const lunesFecha = lunesDeLaSemana(fecha);
  const lunesRef = lunesDeLaSemana(referencia.semanaReferenciaLunes);
  const semanasTranscurridas = Math.round((lunesFecha - lunesRef) / MS_POR_SEMANA);

  const posicionRef = 0; // grupoEnD siempre arranca en índice 0 de ORDEN_ROTACION ('D')
  // Verificado contra la exportación real (02-ESPECIFICACION.md sección 3.2): en la semana
  // del 31/08/2026, con Turno 1 en D, Turno 2 estaba en E y Turno 3 en F — el grupo *anterior*
  // a grupoEnD (en orden 1→2→3→1) es el que va un paso *adelante* en la rotación D→F→E.
  const desplazamientoGrupo = ((referencia.grupoEnD - grupo) + 3) % 3;

  const indice = (((posicionRef + desplazamientoGrupo + semanasTranscurridas) % 3) + 3) % 3;
  return ORDEN_ROTACION[indice];
}

/** Letra base de los 3 grupos para una fecha dada (lunes a sábado). */
export function letraBaseDelDia(fecha, referencia) {
  return {
    1: letraBaseSemanal(1, fecha, referencia),
    2: letraBaseSemanal(2, fecha, referencia),
    3: letraBaseSemanal(3, fecha, referencia),
  };
}

/**
 * Regla del domingo: el grupo en E cubre 06–18 (reportado E1, 11 h) y el grupo en D cubre
 * 18–06 (reportado D, 12 h). Cada domingo trabajan un inspector y un encargado: si de día va
 * el inspector, de noche va el encargado, y el domingo siguiente se intercambian.
 * Depende solo de la semana (no de lo generado antes), así que volver a generar un mes da
 * siempre el mismo resultado.
 */
export function coberturaDomingo(fecha, referencia) {
  const letras = letraBaseDelDia(fecha, referencia);
  const grupoEnD = Number(Object.keys(letras).find((g) => letras[g] === 'D'));
  const grupoEnE = Number(Object.keys(letras).find((g) => letras[g] === 'E'));

  const semanas = Math.round((lunesDeLaSemana(fecha) - lunesDeLaSemana(referencia.semanaReferenciaLunes)) / MS_POR_SEMANA);
  const puestoDia = ((semanas % 2) + 2) % 2 === 0 ? 'inspector' : 'encargado';
  const puestoNoche = puestoDia === 'inspector' ? 'encargado' : 'inspector';

  return [
    { grupo: grupoEnE, puesto: puestoDia, franja: '06:00-18:00', letraReportada: 'E1', horas: 11 },
    { grupo: grupoEnD, puesto: puestoNoche, franja: '18:00-06:00', letraReportada: 'D', horas: 12 },
  ];
}

/** true si `fecha` (Date) cae en domingo. */
export function esDomingo(fecha) {
  return fecha.getDay() === 0;
}
