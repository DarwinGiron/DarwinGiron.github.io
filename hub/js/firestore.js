// =========================================================
// firestore.js
// Única capa que lee/escribe Firestore. Ningún otro módulo
// debe importar funciones de "firebase-firestore.js" directamente.
//
// Colecciones:
//   usuarios/{uid}
//   checklists/{checklistId}                 (borrador de trabajo del admin)
//   checklists/{checklistId}/versiones/{n}    (snapshots publicados e inmutables)
//   inspecciones/{fecha_turno_uid}             (un recorrido completo por turno)
//   auditoriasBpm/{aaaa-mm}                    (auditoría de BPM, SIG-FO-116)
//   hisopados/{autoId}                         (registro de hisopado)
//   hisopadoConfig/tabla                       (tabla de muestreo SIG-TA-102)
//   sigfo111Config/formato                     (puntos y riesgos del SIG-FO-111)
//   registrosVidrio/{autoId}                   (registro SIG-FO-111)
// =========================================================

import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit as limitarA,
  Timestamp,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

/* ---------------------------------------------------------
   Usuarios
   --------------------------------------------------------- */

/** Lista todos los perfiles de usuario (uso exclusivo del admin, según reglas). */
export async function listarUsuarios() {
  const snap = await getDocs(collection(db, "usuarios"));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/**
 * Actualiza el perfil de un usuario existente en /usuarios/{uid}
 * (nombre, rol, estado activo…).
 */
export async function guardarUsuario(uid, datos) {
  const referencia = doc(db, "usuarios", uid);
  await setDoc(referencia, datos, { merge: true });
}

/**
 * Crea el perfil de un usuario recién dado de alta en Firebase Authentication.
 * Queda activo por defecto; el estado se puede cambiar después desde el editor.
 */
export async function crearPerfilUsuario(uid, datos) {
  const referencia = doc(db, "usuarios", uid);
  await setDoc(referencia, {
    ...datos,
    activo: true,
    creadoEn: serverTimestamp(),
  });
}

/* ---------------------------------------------------------
   Checklist — borrador de trabajo (editor del admin)
   --------------------------------------------------------- */

/** Obtiene el documento maestro del checklist (borrador actual + puntero a versión vigente). */
export async function obtenerChecklist(checklistId) {
  const referencia = doc(db, "checklists", checklistId);
  const snap = await getDoc(referencia);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Guarda cambios parciales en el borrador del checklist (secciones, áreas o criterios).
 * Marca borradorModificado = true para indicar que hay cambios sin publicar.
 */
export async function guardarBorradorChecklist(checklistId, cambios, uid) {
  const referencia = doc(db, "checklists", checklistId);
  await updateDoc(referencia, {
    ...cambios,
    borradorModificado: true,
    actualizadoEn: serverTimestamp(),
    actualizadoPor: uid,
  });
}

/**
 * Publica el borrador actual como una nueva versión inmutable en
 * checklists/{id}/versiones/{n}. Las inspecciones futuras usarán este número;
 * las inspecciones ya guardadas conservan la versión con la que se ejecutaron.
 */
export async function publicarVersionChecklist(checklistId, uid) {
  const checklist = await obtenerChecklist(checklistId);
  if (!checklist) throw new Error("El checklist no existe.");

  const nuevaVersion = (checklist.versionVigente || 0) + 1;
  const referenciaVersion = doc(
    db,
    "checklists",
    checklistId,
    "versiones",
    String(nuevaVersion)
  );

  await setDoc(referenciaVersion, {
    numero: nuevaVersion,
    areas: checklist.areas || [],
    secciones: checklist.secciones || [],
    criterios: checklist.criterios || [],
    publicadaEn: serverTimestamp(),
    publicadaPor: uid,
  });

  const referenciaChecklist = doc(db, "checklists", checklistId);
  await updateDoc(referenciaChecklist, {
    versionVigente: nuevaVersion,
    borradorModificado: false,
    actualizadoEn: serverTimestamp(),
    actualizadoPor: uid,
  });

  return nuevaVersion;
}

/**
 * Crea el documento inicial de un checklist si todavía no existe.
 * Se usa una sola vez al cargar los datos semilla (ver seed.js).
 */
export async function crearChecklistSiNoExiste(checklistId, datosIniciales) {
  const existente = await obtenerChecklist(checklistId);
  if (existente) return existente;

  const referencia = doc(db, "checklists", checklistId);
  await setDoc(referencia, {
    ...datosIniciales,
    versionVigente: 0,
    borradorModificado: true,
  });
  return obtenerChecklist(checklistId);
}

/* ---------------------------------------------------------
   Checklist — versiones publicadas (consumo de inspectores)
   --------------------------------------------------------- */

/** Obtiene una versión específica y congelada del checklist. */
export async function obtenerVersionChecklist(checklistId, numero) {
  const referencia = doc(db, "checklists", checklistId, "versiones", String(numero));
  const snap = await getDoc(referencia);
  return snap.exists() ? snap.data() : null;
}

/**
 * Obtiene la versión vigente del checklist (la que deben usar los inspectores
 * para llenar una inspección nueva). Devuelve también el número de versión.
 */
export async function obtenerVersionVigente(checklistId) {
  const checklist = await obtenerChecklist(checklistId);
  if (!checklist || !checklist.versionVigente) {
    throw new Error(
      "Todavía no hay una versión publicada del checklist. Contacta al administrador."
    );
  }
  const version = await obtenerVersionChecklist(checklistId, checklist.versionVigente);
  if (!version) {
    throw new Error(
      "No se encontró la versión publicada del checklist. Contacta al administrador."
    );
  }

  // Las secciones, aspectos y criterios quedan congelados en la versión
  // publicada, pero la lista de PROCESOS (áreas) se lee siempre del
  // documento maestro: es lo que el administrador acaba de dejar en
  // Configuración, así que un proceso agregado, renombrado, reordenado,
  // desactivado o eliminado se refleja de inmediato en el recorrido sin
  // tener que publicar una versión nueva.
  const areas = Array.isArray(checklist.areas) && checklist.areas.length
    ? checklist.areas
    : version.areas || [];

  return { numero: checklist.versionVigente, ...version, areas };
}

/* ---------------------------------------------------------
   Inspecciones (recorridos)
   Un recorrido cubre TODAS las áreas activas de un turno, y vive como
   UN SOLO documento en /inspecciones — no uno por área. Su id es
   determinístico (fecha_turno_inspectorUid): retomarlo es un getDoc()
   directo por id, sin consultas ni preguntas al reingresar.
   Mientras "estado" es "borrador" el inspector lo sigue editando; al
   pasar a "enviada" las reglas de seguridad lo vuelven inmutable para
   actualizar (aunque un gestor sí puede eliminarlo, ver más abajo).
   --------------------------------------------------------- */

/** Id determinístico de un recorrido: una combinación fecha+turno+inspector es un solo documento. */
export function idRecorrido(fechaInspeccion, turno, inspectorUid) {
  return `${fechaInspeccion}_${turno}_${inspectorUid}`;
}

/** Obtiene un recorrido por su id determinístico, o null si nunca se guardó. */
export async function obtenerRecorrido(id) {
  const snap = await getDoc(doc(db, "inspecciones", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Guarda el avance de un recorrido en curso (estado "borrador"). Se puede
 * llamar muchas veces: la primera crea el documento (con su id determinístico
 * ya elegido de antemano), las siguientes lo actualizan por completo.
 */
export async function guardarRecorrido(id, datos, esNuevo = false) {
  const cuerpo = { ...datos, estado: "borrador", actualizadaEn: serverTimestamp() };
  if (esNuevo) cuerpo.iniciadaEn = serverTimestamp();
  await setDoc(doc(db, "inspecciones", id), cuerpo, { merge: true });
}

/**
 * Finaliza un recorrido completo: lo deja como registro definitivo. Las
 * reglas de seguridad impiden cualquier "update" posterior (aunque si
 * necesitas corregirlo, un gestor puede eliminarlo con eliminarInspeccion()
 * y el inspector vuelve a levantarlo desde cero).
 */
export async function finalizarRecorrido(id, datos, esNuevo = false) {
  const cuerpo = {
    ...datos,
    estado: "enviada",
    actualizadaEn: serverTimestamp(),
    enviadaEn: serverTimestamp(),
  };
  if (esNuevo) cuerpo.iniciadaEn = serverTimestamp();
  await setDoc(doc(db, "inspecciones", id), cuerpo, { merge: true });
}

/**
 * Elimina un recorrido completo (borrador o ya enviado). El propio inspector
 * solo puede borrar sus borradores; un gestor puede borrar cualquier
 * registro, incluidos los ya enviados — reforzado por firestore.rules.
 */
export async function eliminarInspeccion(idInspeccion) {
  await deleteDoc(doc(db, "inspecciones", idInspeccion));
}

/** Obtiene el detalle completo de un recorrido por id. */
export async function obtenerInspeccion(id) {
  return obtenerRecorrido(id);
}

/**
 * Lista recorridos (borrador o enviado, mezclados) aplicando filtros
 * opcionales, ordenados por actualización más reciente. Al ser un solo
 * documento por recorrido con "actualizadaEn" siempre presente (se
 * actualiza tanto al guardar borrador como al finalizar), una sola
 * consulta cubre ambos estados — ya no hacen falta dos índices distintos.
 *
 * @param {Object} filtros
 * @param {string} [filtros.estado] - "borrador" o "enviada"; si se omite trae ambos.
 * @param {string} [filtros.inspectorUid] - restringe a un inspector (obligatorio para el rol inspector).
 * @param {Date} [filtros.desde]
 * @param {Date} [filtros.hasta]
 * @param {number} [filtros.max]
 */
export async function listarRecorridos(filtros = {}) {
  const condiciones = [];

  if (filtros.estado) {
    condiciones.push(where("estado", "==", filtros.estado));
  }
  if (filtros.inspectorUid) {
    condiciones.push(where("inspectorUid", "==", filtros.inspectorUid));
  }
  if (filtros.desde) {
    condiciones.push(where("actualizadaEn", ">=", Timestamp.fromDate(filtros.desde)));
  }
  if (filtros.hasta) {
    condiciones.push(where("actualizadaEn", "<=", Timestamp.fromDate(filtros.hasta)));
  }

  const consulta = query(
    collection(db, "inspecciones"),
    ...condiciones,
    orderBy("actualizadaEn", "desc"),
    limitarA(filtros.max || 200)
  );

  const snap = await getDocs(consulta);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ---------------------------------------------------------
   Auditoría de BPM (SIG-FO-116)
   A diferencia de "inspecciones" (que cubre TODAS las áreas de un
   turno), aquí un documento cubre TODA la auditoría de un mes — la
   lista de preguntas es fija (no versionada como el checklist de
   SIG-FO-115), así que no hace falta esa capa. El id del documento es
   determinístico ("aaaa-mm"): igual que un recorrido, retomarlo es un
   getDoc() directo por id, sin consultas.
   --------------------------------------------------------- */

/** Obtiene la auditoría de BPM de un mes ("aaaa-mm"), o null si no existe. */
export async function obtenerAuditoriaBpm(claveMes) {
  const snap = await getDoc(doc(db, "auditoriasBpm", claveMes));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Guarda (crea o actualiza) la auditoría de BPM de un mes. Se llama en
 * cada respuesta, igual que el borrador de un recorrido: no hay un botón
 * de "enviar" separado, es autoguardado continuo.
 */
export async function guardarAuditoriaBpm(claveMes, datos, uid) {
  await setDoc(
    doc(db, "auditoriasBpm", claveMes),
    { ...datos, actualizadaEn: serverTimestamp(), actualizadaPor: uid },
    { merge: true }
  );
}

/**
 * Lista las auditorías de BPM guardadas, más recientes primero. Como el
 * id del documento ES la clave "aaaa-mm", ordenar por nombre de
 * documento basta — no hace falta mantener un índice aparte.
 */
export async function listarAuditoriasBpm(max = 24) {
  const consulta = query(
    collection(db, "auditoriasBpm"),
    orderBy("__name__", "desc"),
    limitarA(max)
  );
  const snap = await getDocs(consulta);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ---------------------------------------------------------
   Registro de hisopado
   Antes vivía como una sección eventual dentro de cada proceso del
   recorrido SIG-FO-115. Se separó a su propio formato porque el
   hisopado no sigue el ritmo del recorrido: se toma cuando toca
   muestrear, lo firma un supervisor y el resultado del laboratorio
   puede llegar después. Cada documento es UNA toma de muestras: la
   fecha, quién la tomó, sus muestras y —si alguna se desvió del
   límite— las correcciones inmediatas que se aplicaron.
   --------------------------------------------------------- */

/** Guarda un registro de hisopado nuevo. Devuelve el id generado. */
export async function crearHisopado(datos) {
  const referencia = await addDoc(collection(db, "hisopados"), {
    ...datos,
    creadoEn: serverTimestamp(),
  });
  return referencia.id;
}

/** Obtiene un registro de hisopado por id, o null si no existe. */
export async function obtenerHisopado(id) {
  const snap = await getDoc(doc(db, "hisopados", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Lista registros de hisopado, del más reciente al más antiguo.
 * El inspector solo puede consultar los suyos (ver firestore.rules), así
 * que en ese caso el filtro por inspectorUid no es opcional.
 */
export async function listarHisopados(filtros = {}) {
  const condiciones = [];
  if (filtros.inspectorUid) {
    condiciones.push(where("inspectorUid", "==", filtros.inspectorUid));
  }

  const consulta = query(
    collection(db, "hisopados"),
    ...condiciones,
    orderBy("fecha", "desc"),
    limitarA(filtros.max || 200)
  );
  const snap = await getDocs(consulta);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Elimina un registro de hisopado (solo gestión, ver firestore.rules). */
export async function eliminarHisopado(id) {
  await deleteDoc(doc(db, "hisopados", id));
}

/* ---------------------------------------------------------
   Tabla de muestreo de hisopados (SIG-TA-102)
   Un solo documento: la tabla completa (tipos de muestra con su rango
   límite y las zonas de cada uno). Vive aparte de los registros porque
   es catálogo, no historial — cambiarla no reescribe lo ya muestreado.
   --------------------------------------------------------- */

/** Obtiene la tabla de muestreo, o null si todavía no se ha cargado. */
export async function obtenerTablaHisopado() {
  const snap = await getDoc(doc(db, "hisopadoConfig", "tabla"));
  return snap.exists() ? snap.data() : null;
}

/** Guarda la tabla de muestreo completa (solo gestión, ver firestore.rules). */
export async function guardarTablaHisopado(tabla, uid) {
  await setDoc(
    doc(db, "hisopadoConfig", "tabla"),
    { ...tabla, actualizadaEn: serverTimestamp(), actualizadaPor: uid },
    { merge: true }
  );
}

/* ---------------------------------------------------------
   SIG-FO-111 — Vidrio y plástico quebradizo
   Mismo reparto que el hisopado: un documento de catálogo con los puntos
   a inspeccionar y la escala de riesgo, y una colección aparte con los
   recorridos ya hechos.
   --------------------------------------------------------- */

/** Obtiene el formato configurado (puntos + escala de riesgo), o null. */
export async function obtenerFormatoVidrio() {
  const snap = await getDoc(doc(db, "sigfo111Config", "formato"));
  return snap.exists() ? snap.data() : null;
}

/** Guarda el formato configurado (solo gestión, ver firestore.rules). */
export async function guardarFormatoVidrio(formato, uid) {
  await setDoc(
    doc(db, "sigfo111Config", "formato"),
    { ...formato, actualizadoEn: serverTimestamp(), actualizadoPor: uid },
    { merge: true }
  );
}

/** Guarda un registro de vidrio y plástico quebradizo. Devuelve su id. */
export async function crearRegistroVidrio(datos) {
  const referencia = await addDoc(collection(db, "registrosVidrio"), {
    ...datos,
    creadoEn: serverTimestamp(),
  });
  return referencia.id;
}

/**
 * Lista registros del SIG-FO-111, del más reciente al más antiguo.
 * Igual que los hisopados: el inspector solo puede consultar los suyos.
 */
export async function listarRegistrosVidrio(filtros = {}) {
  const condiciones = [];
  if (filtros.inspectorUid) {
    condiciones.push(where("inspectorUid", "==", filtros.inspectorUid));
  }

  const consulta = query(
    collection(db, "registrosVidrio"),
    ...condiciones,
    orderBy("fecha", "desc"),
    limitarA(filtros.max || 200)
  );
  const snap = await getDocs(consulta);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Elimina un registro del SIG-FO-111 (solo gestión, ver firestore.rules). */
export async function eliminarRegistroVidrio(id) {
  await deleteDoc(doc(db, "registrosVidrio", id));
}
