// =========================================================
// liberacion-checklist.js
// Preguntas de la Liberación de Contenedores (LOG-FO-101), en un solo
// lugar para el formulario (inspeccion-furgon-3d/app.js), su editor
// (verificacion-transporte/admin.html) y el visor del historial.
//
// Las SECCIONES son fijas: cada una es una parte del modelo del
// contenedor (Cabina, Paredes, Techo, Puertas, Piso…) y un lugar fijo en
// el registro guardado. Lo que se edita son las PREGUNTAS dentro de cada
// sección, guardadas en checklists/liberacion-contenedores. Mientras ese
// documento no exista, se usan las preguntas originales de SECCIONES_BASE.
//
// Cada pregunta tiene un "id" estable: las respuestas se guardan por id
// (answers[seccion][id]), así que corregir el texto de una pregunta no
// cambia a qué respuesta corresponde, y una pregunta nueva recibe un id
// nuevo en vez de reciclar el de una borrada.
// =========================================================

import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const RUTA_CONFIG = ["checklists", "liberacion-contenedores"];

/** Preguntas originales del formato (las que estaban fijas en app.js). */
export const SECCIONES_BASE = {
  cabina: { label: 'Cabina, Camión y Piloto', mode: 'exterior', items: [
    { id: 'cabina_limpia', label: 'Cabina limpia' },
    { id: 'quinta_rueda', label: 'Quinta rueda y acople en buen estado, sin fugas' },
    { id: 'piloto_apto', label: 'Piloto en condiciones aptas (sobrio, uniforme, identificación, EPP)' },
  ]},
  ext_pared_izquierda: { label: 'Pared Izquierda (exterior)', mode: 'exterior', items: [
    { id: 'limpia', label: 'Limpia' },
    { id: 'agujeros', label: 'Sin agujeros' },
    { id: 'abolladuras', label: 'Sin abolladuras mayores' },
    { id: 'cinta', label: 'Cinta reflectiva en buen estado' },
  ]},
  ext_pared_derecha: { label: 'Pared Derecha (exterior)', mode: 'exterior', items: [
    { id: 'limpia', label: 'Limpia' },
    { id: 'agujeros', label: 'Sin agujeros' },
    { id: 'abolladuras', label: 'Sin abolladuras mayores' },
    { id: 'cinta', label: 'Cinta reflectiva en buen estado' },
  ]},
  ext_techo: { label: 'Techo (exterior)', mode: 'exterior', items: [
    { id: 'limpio', label: 'Limpio' },
    { id: 'abolladuras', label: 'Sin abolladuras' },
    { id: 'filtraciones', label: 'Sin señales de filtración' },
  ]},
  ext_puertas: { label: 'Puertas (exterior)', mode: 'exterior', items: [
    { id: 'empaques', label: 'Empaques en buen estado' },
    { id: 'barras', label: 'Barras y manibelas de apertura/cierre funcionan' },
    { id: 'hermeticidad', label: 'Hermeticidad al cerrar (sin paso de contaminantes)' },
  ]},
  generales: { label: 'Generales (chasis, llantas, seguros)', mode: 'exterior', items: [
    { id: 'llantas', label: 'Llantas y rines limpios' },
    { id: 'seguros', label: 'Seguros giratorios (twist locks) trabados correctamente' },
    { id: 'conos', label: 'Conos de seguridad presentes' },
    { id: 'alarma', label: 'Alarma de retroceso funcional' },
    { id: 'fumigacion', label: 'Certificado de fumigación vigente (10 días)' },
  ]},
  int_pared_izquierda: { label: 'Pared Izquierda (interior)', mode: 'interior', items: [
    { id: 'plywood', label: 'Plywood sin quebraduras' },
    { id: 'limpia', label: 'Limpia, sin humedad' },
  ]},
  int_pared_derecha: { label: 'Pared Derecha (interior)', mode: 'interior', items: [
    { id: 'plywood', label: 'Plywood sin quebraduras' },
    { id: 'limpia', label: 'Limpia, sin humedad' },
  ]},
  int_techo: { label: 'Techo (interior)', mode: 'interior', items: [
    { id: 'filtracion', label: 'Sin agujeros que permitan filtración de agua' },
    { id: 'plywood', label: 'Plywood sin quebraduras' },
  ]},
  int_piso: { label: 'Piso', mode: 'interior', items: [
    { id: 'deteriorado', label: 'Piso no deteriorado' },
    { id: 'limpio', label: 'Limpio, sin agentes contaminantes' },
    { id: 'insectos', label: 'Libre de insectos' },
    { id: 'olor', label: 'Sin mal olor' },
  ]},
  int_puertas: { label: 'Puertas (interior)', mode: 'interior', items: [
    { id: 'empaques', label: 'Empaques en buen estado' },
    { id: 'hermeticidad', label: 'Hermeticidad al cerrar' },
    { id: 'plywood', label: 'Plywood sin quebraduras' },
  ]},
  int_frente: { label: 'Pared Frontal (interior)', mode: 'interior', items: [
    { id: 'plywood', label: 'Plywood sin quebraduras' },
    { id: 'limpia', label: 'Limpia, sin humedad' },
  ]},
};

// Dónde cae cada sección dentro del registro guardado. Es el esquema que
// ya leen el historial, el Excel y la herramienta de corrección de
// registros, así que no cambia aunque cambien las preguntas: Cabina y la
// Pared Frontal van a "respuestasCabina"; lo demás, a su zona y lado.
const ZONAS_REGISTRO = [
  { id: 'pared-izquierda', nombre: 'Pared Izquierda' },
  { id: 'pared-derecha', nombre: 'Pared Derecha' },
  { id: 'puertas', nombre: 'Puertas' },
  { id: 'techo', nombre: 'Techo' },
  { id: 'generales', nombre: 'Generales / Piso' },
];

const DESTINO_REGISTRO = {
  cabina: { cabina: true },
  ext_pared_izquierda: { zona: 'pared-izquierda', modo: 'externa' },
  ext_pared_derecha: { zona: 'pared-derecha', modo: 'externa' },
  ext_techo: { zona: 'techo', modo: 'externa' },
  ext_puertas: { zona: 'puertas', modo: 'externa' },
  generales: { zona: 'generales', modo: 'externa' },
  int_pared_izquierda: { zona: 'pared-izquierda', modo: 'interna' },
  int_pared_derecha: { zona: 'pared-derecha', modo: 'interna' },
  int_techo: { zona: 'techo', modo: 'interna' },
  int_piso: { zona: 'generales', modo: 'interna' },
  int_puertas: { zona: 'puertas', modo: 'interna' },
  int_frente: { cabina: true, prefijo: 'Pared frontal: ' },
};

/** Preguntas originales como lista editable: { seccionId: [{ id, label, activa }] }. */
export function preguntasBase() {
  const preguntas = {};
  Object.entries(SECCIONES_BASE).forEach(([seccionId, def]) => {
    preguntas[seccionId] = def.items.map((it) => ({ ...it, activa: true }));
  });
  return preguntas;
}

/**
 * Lee las preguntas configuradas. Una sección que no esté en el documento
 * (o el documento entero, si nunca se ha guardado) toma las originales.
 * No atrapa el error: cada pantalla decide qué hacer si falla la lectura.
 *
 * @returns {Promise<{ preguntas: Object, configurado: boolean }>}
 */
export async function cargarPreguntasLiberacion() {
  const snap = await getDoc(doc(db, ...RUTA_CONFIG));
  const guardadas = snap.exists() ? snap.data().secciones || {} : {};
  const preguntas = preguntasBase();
  Object.keys(preguntas).forEach((seccionId) => {
    if (Array.isArray(guardadas[seccionId])) {
      preguntas[seccionId] = guardadas[seccionId].map((it) => ({
        id: it.id,
        label: it.label,
        activa: it.activa !== false,
      }));
    }
  });
  return { preguntas, configurado: snap.exists() };
}

/** Guarda TODAS las secciones (solo gestión, ver firestore.rules → checklists). */
export async function guardarPreguntasLiberacion(preguntas, uid) {
  await setDoc(doc(db, ...RUTA_CONFIG), {
    secciones: preguntas,
    actualizadoEn: serverTimestamp(),
    actualizadoPor: uid,
  });
}

/**
 * Convierte las preguntas en las secciones que dibuja el formulario:
 * solo las activas, y sin las secciones que se quedaron sin preguntas
 * (una sección vacía saldría "aprobada" sin haber evaluado nada).
 */
export function seccionesDelFormulario(preguntas) {
  const secciones = {};
  Object.entries(SECCIONES_BASE).forEach(([seccionId, def]) => {
    const items = (preguntas[seccionId] || [])
      .filter((it) => it.activa !== false)
      .map((it) => ({ id: it.id, label: it.label }));
    if (items.length > 0) {
      secciones[seccionId] = { label: def.label, mode: def.mode, items };
    }
  });
  return secciones;
}

/** Preguntas tal como se evaluaron, para guardarlas dentro del registro. */
export function preguntasEvaluadas(secciones) {
  const evaluadas = {};
  Object.entries(secciones).forEach(([seccionId, def]) => {
    evaluadas[seccionId] = def.items.map((it) => ({ id: it.id, label: it.label }));
  });
  return evaluadas;
}

/**
 * Arma "respuestasPorZona" y "respuestasCabina" (el esquema que lee el
 * historial) a partir de las secciones evaluadas y sus respuestas.
 */
export function construirRespuestasRegistro(secciones, answers) {
  const respuestasPorZona = {};
  ZONAS_REGISTRO.forEach((z) => {
    respuestasPorZona[z.id] = { nombre: z.nombre, externa: [], interna: [] };
  });
  const respuestasCabina = [];

  // Cabina primero y la Pared Frontal al final, como en el formato impreso.
  const orden = ['cabina', ...Object.keys(DESTINO_REGISTRO).filter((id) => id !== 'cabina')];
  orden.forEach((seccionId) => {
    const def = secciones[seccionId];
    if (!def) return;
    const destino = DESTINO_REGISTRO[seccionId];
    const respuestas = answers[seccionId] || {};
    def.items.forEach((it) => {
      // Sin respuesta queda en null (no cuenta como "si"), nunca undefined:
      // Firestore rechaza el documento entero si trae un campo undefined.
      const valor = respuestas[it.id] ?? null;
      if (destino.cabina) {
        respuestasCabina.push({ texto: (destino.prefijo || '') + it.label, valor });
      } else {
        respuestasPorZona[destino.zona][destino.modo].push({ texto: it.label, valor });
      }
    });
  });

  return { respuestasPorZona, respuestasCabina };
}
