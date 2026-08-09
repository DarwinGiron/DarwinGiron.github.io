// =========================================================
// datos.js
// Configuración editable de SIG-FO-101 (catálogo de máquinas y lista de
// preguntas SI/NO), guardada en un único documento de Firestore para que
// el admin la edite sin tocar código. Un solo documento (no una versión
// por checklist, a diferencia de SIG-FO-115) porque este formato no tiene
// secciones ni áreas: es una lista plana de máquinas y otra de preguntas.
// =========================================================

import { db, FieldValue } from "./firebase-config.js";
import { MAQUINAS_SEMILLA, PREGUNTAS_SEMILLA } from "./config.js";

const REF_CONFIG = () => db.collection("sigfo101Config").doc("general");

/**
 * Obtiene la configuración vigente (máquinas + preguntas). Si el documento
 * todavía no existe (primera vez que se usa la app), devuelve la semilla
 * de config.js sin escribir nada — se guarda recién cuando el admin la
 * edite y presione "Guardar" por primera vez.
 */
export async function obtenerConfig() {
  const snap = await REF_CONFIG().get();
  if (!snap.exists) {
    return { maquinas: [...MAQUINAS_SEMILLA], preguntas: [...PREGUNTAS_SEMILLA] };
  }
  const datos = snap.data();
  return {
    maquinas: datos.maquinas || [],
    preguntas: datos.preguntas || [],
  };
}

/**
 * Guarda la configuración completa (reemplaza máquinas y preguntas por
 * las listas recibidas). Solo lo puede hacer un gestor — reforzado en
 * firestore.rules, no solo aquí.
 */
export async function guardarConfig({ maquinas, preguntas }, uid) {
  await REF_CONFIG().set(
    {
      maquinas,
      preguntas,
      actualizadoEn: FieldValue.serverTimestamp(),
      actualizadoPor: uid,
    },
    { merge: true }
  );
}
