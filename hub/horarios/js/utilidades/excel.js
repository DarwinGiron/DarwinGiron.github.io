// Parser del Excel institucional (02-ESPECIFICACION.md sección 7). Recibe las filas ya leídas
// con SheetJS (sheet_to_json con header:1) y devuelve el personal detectado con su grupo sugerido.
//
// Nota sobre el archivo de muestra real: la especificación dice "toma el bloque del primer
// lunes", pero en muestras/reporte-institucional-ejemplo.xlsx una persona (Irma) no aparece
// el primer día — aparece hasta el segundo. Por eso se recorren los primeros bloques de fecha
// en orden y se toma la PRIMERA vez que cada código aparece con una letra D/E/F válida, en vez
// de limitarse estrictamente a un único día. En la práctica sigue siendo "la semana del primer
// lunes", solo que tolera que alguien falte el lunes exacto.

const LETRAS_VALIDAS = ['D', 'E', 'F', 'D1', 'E1', 'F1'];
const GRUPO_POR_LETRA_BASE = { D: 1, E: 2, F: 3 };

function letraBase(letra) {
  return (letra ?? '').replace(/1$/, '');
}

/** true si la fila es el marcador "Fecha: dd/mm/aaaa" de inicio de bloque. */
function esFilaFecha(fila) {
  return typeof fila?.[0] === 'string' && fila[0].trim().startsWith('Fecha:');
}

/**
 * `filas`: matriz cruda de sheet_to_json(hoja, {header:1}), incluyendo la fila de encabezados.
 * `maxBloques`: cuántos bloques de fecha recorrer buscando personal (por si alguien falta el
 * primer día, como pasa en la muestra real).
 */
export function parsePersonalInstitucional(filas, { maxBloques = 7 } = {}) {
  const vistos = new Map(); // codigo -> { codigo, nombre, letra, grupo }
  let bloquesVistos = 0;
  let semanaLunes = null;

  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i];
    if (esFilaFecha(fila)) {
      bloquesVistos++;
      if (bloquesVistos === 1) {
        semanaLunes = fila[0].replace('Fecha:', '').trim();
      }
      if (bloquesVistos > maxBloques) break;
      continue;
    }
    if (bloquesVistos === 0) continue; // filas antes del primer marcador (no debería haber)

    const [codigo, nombre, , , , , letra, autorizado, , , comentario] = fila;
    if (!codigo || vistos.has(codigo)) continue;
    if (autorizado !== 'Autorizado') continue; // ej. Oscar: "Sin Autorizar" + "Renunció"
    if (comentario && /renunci/i.test(comentario)) continue;

    const base = letraBase(letra);
    if (!LETRAS_VALIDAS.includes(letra) && !['D', 'E', 'F'].includes(base)) continue;
    if (!(base in GRUPO_POR_LETRA_BASE)) continue;

    vistos.set(codigo, {
      codigo: String(codigo),
      nombre: String(nombre).trim(),
      letra,
      grupo: GRUPO_POR_LETRA_BASE[base],
    });
  }

  return {
    semanaLunes,
    personas: Array.from(vistos.values()).sort((a, b) => a.grupo - b.grupo || a.nombre.localeCompare(b.nombre)),
  };
}
