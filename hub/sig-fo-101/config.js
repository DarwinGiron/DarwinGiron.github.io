// =========================================================
// config.js
// Horarios de turno (fijos) + semillas iniciales de máquinas y preguntas
// de SIG-FO-101. El catálogo de máquinas y la lista de preguntas SI/NO
// YA NO se editan aquí: son editables desde Administración → SIG-FO-101
// (ver admin.html/admin.js) y viven en Firestore (datos.js). Estas
// constantes solo sirven de semilla la primera vez que se usa la app,
// antes de que exista ese documento de configuración.
// =========================================================

/** Semilla inicial del catálogo de máquinas — editable luego desde Administración. */
export const MAQUINAS_SEMILLA = [
  "Troqueladora 1",
  "Troqueladora 2",
  "Pegadora Automática 1",
  "Pegadora Automática 2",
  "Grapadora",
  "Slotter",
];

/**
 * Semilla inicial de preguntas SI/NO, tomadas de las "Superficies a
 * limpiar" y "Libre de material extraño" del formato SIG-FO-101 —
 * editable luego desde Administración.
 */
export const PREGUNTAS_SEMILLA = [
  { id: "preg-limpieza-general", texto: "Limpieza general", orden: 1 },
  { id: "preg-mesa-alimentacion", texto: "Mesa de alimentación", orden: 2 },
  { id: "preg-rodillos-jaladores", texto: "Rodillos jaladores", orden: 3 },
  { id: "preg-troqueles", texto: "Troqueles", orden: 4 },
  { id: "preg-fajas-transportadoras", texto: "Fajas transportadoras", orden: 5 },
  { id: "preg-rodillos-carriles", texto: "Rodillos/carriles", orden: 6 },
  {
    id: "preg-material-extrano",
    texto: "Libre de material extraño (cuchillas, pegamento, cinta adhesiva, metro, vidrio, plástico, madera, metal, entre otros)",
    orden: 7,
  },
];

/**
 * Horarios de turno, en formato "HH:MM" (24 horas), hora local del
 * dispositivo. Un turno puede cruzar medianoche (inicio > fin), como el
 * Turno 3 de ejemplo — turnoPorHora() lo maneja correctamente.
 */
export const TURNOS = [
  { numero: 1, etiqueta: "Turno 1", inicio: "06:00", fin: "14:00" },
  { numero: 2, etiqueta: "Turno 2", inicio: "14:00", fin: "22:00" },
  { numero: 3, etiqueta: "Turno 3", inicio: "22:00", fin: "06:00" },
];

/** Convierte "HH:MM" a minutos desde medianoche. */
function aMinutos(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Determina qué turno corresponde a la hora actual del dispositivo,
 * según TURNOS. Si ninguno calza (huecos en la configuración), cae al
 * primer turno de la lista en vez de fallar.
 */
export function turnoPorHora(fecha = new Date()) {
  const minutosActuales = fecha.getHours() * 60 + fecha.getMinutes();

  for (const turno of TURNOS) {
    const inicio = aMinutos(turno.inicio);
    const fin = aMinutos(turno.fin);

    const dentroDelRango =
      inicio < fin
        ? minutosActuales >= inicio && minutosActuales < fin
        : minutosActuales >= inicio || minutosActuales < fin; // cruza medianoche

    if (dentroDelRango) return turno.numero;
  }

  return TURNOS[0]?.numero ?? 1;
}

/** Fecha de hoy en formato ISO corto (YYYY-MM-DD), en hora local. */
export function fechaHoyISO() {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}
