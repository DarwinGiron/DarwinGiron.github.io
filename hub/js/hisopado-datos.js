// =========================================================
// hisopado-datos.js
// Tabla de muestreo de hisopados (SIG-TA-102), transcrita del Excel Rev. 00.
//
// El límite NO es por zona suelta: viene del TIPO DE MUESTRA. En el formato
// original el rango está escrito una sola vez por bloque ("MANOS
// RANGOS = 0 a 600 URL") y aplica a todas las zonas de ese bloque, así que
// aquí se modela igual — el rango vive en el tipo y las zonas lo heredan.
// Eso es lo que permite que al elegir la zona en el registro el límite se
// aplique solo.
//
// "meses" es la programación anual del formato: en qué meses toca muestrear
// esa zona (índice 0 = enero). En el Excel la cuadrícula venía vacía, así
// que la semilla no programa nada; se marca desde Configuración.
//
// Esto es solo la SEMILLA: se carga una vez y a partir de ahí todo se
// edita desde Configuración, no en este archivo.
// =========================================================

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const TABLA_SEMILLA = {
  codigo: "SIG-TA-102",
  revision: "Rev. 00",
  unidad: "URL",
  tipos: [
    {
      id: "MANOS",
      nombre: "Manos",
      limiteMin: 0,
      limiteMax: 600,
      orden: 1,
      zonas: [
        { id: "man-alim", nombre: "Manos Alimentadores", cantidad: 3, analisis: "ATP/HISOPADO", meses: [] },
        { id: "man-esti", nombre: "Manos Estibadores", cantidad: 3, analisis: "ATP/HISOPADO", meses: [] },
        { id: "man-carg", nombre: "Manos Cargadores", cantidad: 3, analisis: "ATP/HISOPADO", meses: [] },
      ],
    },
    {
      id: "SUPERFICIES",
      nombre: "Superficies",
      limiteMin: 0,
      limiteMax: 500,
      orden: 2,
      zonas: [
        { id: "sup-mesas", nombre: "Mesas de Alimentación", cantidad: 2, analisis: "ATP/HISOPADO", meses: [] },
        { id: "sup-rodillos", nombre: "Rodillos", cantidad: 2, analisis: "ATP/HISOPADO", meses: [] },
        { id: "sup-bandas", nombre: "Bandas Transportadoras", cantidad: 2, analisis: "ATP/HISOPADO", meses: [] },
      ],
    },
    {
      id: "PRODUCTO",
      nombre: "Producto en proceso y terminado",
      limiteMin: 0,
      limiteMax: 700,
      orden: 3,
      zonas: [
        { id: "pro-papel", nombre: "Papel y Láminas corrugadas", cantidad: 2, analisis: "ATP/HISOPADO", meses: [] },
        { id: "pro-cajas", nombre: "Cajas y Láminas pad", cantidad: 3, analisis: "ATP/HISOPADO", meses: [] },
      ],
    },
  ],
};

/**
 * Aplana la tabla a una lista de zonas con el límite ya resuelto desde su
 * tipo. Es lo que consume el formulario de registro: ahí no interesa la
 * jerarquía, interesa "esta zona tiene este rango".
 */
export function zonasConLimite(tabla) {
  const tipos = [...(tabla?.tipos || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  return tipos.flatMap((tipo) =>
    (tipo.zonas || []).map((zona) => ({
      ...zona,
      tipoId: tipo.id,
      tipoNombre: tipo.nombre,
      limiteMin: Number(tipo.limiteMin ?? 0),
      limiteMax: Number(tipo.limiteMax ?? 0),
      unidad: tabla?.unidad || "URL",
    }))
  );
}

/** Texto del rango tal como se muestra al inspector ("0 a 600 URL"). */
export function textoLimite(zona) {
  if (!zona) return "—";
  return `${zona.limiteMin} a ${zona.limiteMax} ${zona.unidad || "URL"}`;
}

/**
 * ¿El resultado se salió del rango? Devuelve null cuando todavía no hay un
 * número que comparar, para poder distinguir "conforme" de "sin capturar".
 */
export function evaluarResultado(zona, resultado) {
  if (!zona) return null;
  const valor = Number(String(resultado).replace(",", "."));
  if (resultado === "" || resultado === null || Number.isNaN(valor)) return null;
  return valor < zona.limiteMin || valor > zona.limiteMax;
}
