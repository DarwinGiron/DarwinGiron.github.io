// Cálculo de horas — función pura, sin dependencias de Supabase.
// Ver sección 7 de 04-DISENO-SISTEMA.md.

const HORAS_ORDINARIAS_LETRA = { D: 8, E: 7, F: 9, L: 0 };

export function horasEntre(horaIni, horaFin) {
  // horaIni/horaFin: 'HH:MM'. Si horaFin <= horaIni, cruza medianoche.
  const [hI, mI] = horaIni.split(':').map(Number);
  const [hF, mF] = horaFin.split(':').map(Number);
  let minutos = (hF * 60 + mF) - (hI * 60 + mI);
  if (minutos <= 0) minutos += 24 * 60;
  return minutos / 60;
}

/**
 * turno = {
 *   tipoCobertura: 'normal'|'6a6dia'|'6a6noche'|'doblar'|'libre'|'ausencia',
 *   letraBase: 'D'|'E'|'F'|'L',
 *   horaIni, horaFin,           // franja principal, 'HH:MM' o null
 *   splitIni, splitFin,         // segunda franja de "doblar", 'HH:MM' o null
 *   esFeriado: boolean,
 * }
 * Devuelve { horasReales, horasOrdinarias, horasExtra }
 */
export function calcularHoras(turno) {
  if (turno.tipoCobertura === 'ausencia' || turno.tipoCobertura === 'libre') {
    return { horasReales: 0, horasOrdinarias: 0, horasExtra: 0 };
  }

  const ordinariasLetra = HORAS_ORDINARIAS_LETRA[turno.letraBase] ?? 0;

  let horasReales;
  switch (turno.tipoCobertura) {
    case '6a6dia':
      horasReales = 11; // 12 h reales - 1 h de almuerzo
      break;
    case '6a6noche':
      horasReales = 12; // sin descuento de almuerzo
      break;
    case 'doblar': {
      const franja1 = horasEntre(turno.horaIni, turno.horaFin);
      const franja2 = turno.splitIni && turno.splitFin
        ? horasEntre(turno.splitIni, turno.splitFin)
        : 0;
      horasReales = franja1 + franja2;
      break;
    }
    case 'normal':
    default:
      horasReales = turno.horaIni && turno.horaFin
        ? horasEntre(turno.horaIni, turno.horaFin)
        : ordinariasLetra;
      break;
  }

  if (turno.esFeriado) {
    return { horasReales, horasOrdinarias: 0, horasExtra: horasReales };
  }

  const horasOrdinarias = Math.min(horasReales, ordinariasLetra);
  const horasExtra = Math.max(horasReales - ordinariasLetra, 0);
  return { horasReales, horasOrdinarias, horasExtra };
}

/** Eventos fuera de horario: 100% de las horas cuentan como extra. */
export function calcularHorasEvento(evento) {
  const horasReales = horasEntre(evento.horaIni, evento.horaFin);
  return { horasReales, horasOrdinarias: 0, horasExtra: horasReales };
}
