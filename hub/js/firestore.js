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
//   hisopados/{fecha_turno_zona}               (registro de hisopado)
//   hisopadoConfig/tabla                       (tabla de muestreo SIG-TA-102)
//   sigfo111Config/formato                     (puntos y riesgos del SIG-FO-111)
//   registrosVidrio/{autoId}                   (registro SIG-FO-111)
//   registrosTarimas/{autoId}                  (registro SIG-FO-118, un callejón)
// =========================================================

import {
  addDoc,
  arrayUnion,
  runTransaction,
  writeBatch,
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
  startAfter,
  Timestamp,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { codigoHisopado } from "./hisopado-datos.js";

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

/** Elimina la auditoría de BPM de un mes (solo gestión, ver firestore.rules). */
export async function eliminarAuditoriaBpm(claveMes) {
  await deleteDoc(doc(db, "auditoriasBpm", claveMes));
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

/**
 * Id determinístico de un análisis: una misma superficie no se muestrea
 * dos veces en el mismo turno del mismo día, así que esa combinación ES
 * la identidad del documento. Con esto el duplicado no depende de que el
 * cliente se acuerde de revisar: la segunda toma caería en el mismo id.
 */
export function idHisopado(fecha, turno, zonaId) {
  return `${fecha}_T${turno}_${zonaId}`;
}

/**
 * Guarda un análisis de hisopado. Falla si ese turno ya registró esa
 * superficie ese día — la comprobación se hace aquí y no en la pantalla
 * para que valga desde cualquier punto de entrada.
 */
export async function crearHisopado(datos) {
  // El duplicado se busca por los campos (fecha + turno + superficie) y no solo
  // por el id: si a un registro se le corrigió el turno, su id conserva el turno
  // viejo y por id ya no diría la verdad.
  const repetido = await buscarHisopadoDuplicado(datos.fecha, datos.turno, datos.zonaId);
  if (repetido) {
    const error = new Error("DUPLICADO");
    error.codigo = "duplicado";
    error.registro = repetido;
    throw error;
  }

  // Id determinístico (fecha_turno_superficie). Si ya lo ocupa un registro cuyo
  // turno fue corregido, se usa un id automático para no pisarlo.
  let referencia = doc(db, "hisopados", idHisopado(datos.fecha, datos.turno, datos.zonaId));
  if ((await getDoc(referencia)).exists()) referencia = doc(collection(db, "hisopados"));

  // Código de registro: fecha del análisis + número corrido del mes (ver
  // codigoHisopado). El contador y el registro se escriben en la MISMA
  // transacción, así dos personas que guardan a la vez no reciben el mismo número.
  let codigo = null;
  try {
    codigo = await runTransaction(db, async (transaccion) => {
      const referenciaContador = doc(db, "hisopadoContadores", datos.fecha.slice(0, 7));
      const contador = await transaccion.get(referenciaContador);
      const numero = (contador.exists() ? Number(contador.data().ultimo) || 0 : 0) + 1;
      const nuevoCodigo = codigoHisopado(datos.fecha, numero);
      transaccion.set(referenciaContador, { ultimo: numero });
      transaccion.set(referencia, { ...datos, codigo: nuevoCodigo, creadoEn: serverTimestamp() });
      return nuevoCodigo;
    });
  } catch (error) {
    // Si las reglas de hisopadoContadores todavía no están publicadas, el
    // análisis se guarda igual (sin código) en vez de perderse; el botón
    // "Numerar registros anteriores" del historial le asigna su código después.
    if (error?.code !== "permission-denied") throw error;
    console.warn("Sin permiso para el contador de códigos; se guarda sin código.", error);
    await setDoc(referencia, { ...datos, creadoEn: serverTimestamp() });
  }
  return { id: referencia.id, codigo };
}

/** El registro que ya cubre esa superficie, ese día y ese turno, o null. */
export async function buscarHisopadoDuplicado(fecha, turno, zonaId) {
  const snap = await getDocs(
    query(
      collection(db, "hisopados"),
      where("fecha", "==", fecha),
      where("zonaId", "==", zonaId),
      where("turno", "==", turno),
      limitarA(1)
    )
  );
  return snap.docs.length ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
}

/** Nombres legibles de los campos que se pueden corregir (para la constancia). */
const ETIQUETAS_CORRECCION = {
  fecha: "Fecha",
  turno: "Turno",
  zonaNombre: "Superficie",
  areaMaquina: "Área/Máquina",
  supervisor: "Supervisor",
  resultado: "Resultado",
  observaciones: "Observaciones",
};

/**
 * Corrige un análisis ya guardado. `nuevos` trae los valores finales de lo
 * editable: fecha, turno, zona ({id, nombre, tipoNombre, limiteMin, limiteMax,
 * unidad}), areaMaquina, supervisor, resultado, observaciones y desviacion
 * (ya calculada contra el límite que corresponde).
 *
 * Conserva el id y la autoría (inspectorUid no se toca; las reglas lo exigen) y
 * deja constancia en `historialCorrecciones` (no confundir con `correcciones`, el texto de acciones del formato anterior): quién, cuándo y qué cambió (antes/después).
 * Si cambia la combinación fecha + turno + superficie y otro análisis ya la
 * ocupa, falla con codigo "duplicado".
 * Devuelve la lista de cambios (vacía si no cambió nada) y los campos nuevos.
 */
export async function corregirHisopado(registro, nuevos, usuario) {
  const final = {
    fecha: nuevos.fecha,
    turno: nuevos.turno,
    zonaId: nuevos.zona.id,
    zonaNombre: nuevos.zona.nombre,
    tipoNombre: nuevos.zona.tipoNombre,
    limiteMin: nuevos.zona.limiteMin,
    limiteMax: nuevos.zona.limiteMax,
    unidad: nuevos.zona.unidad || "RLU",
    areaMaquina: nuevos.areaMaquina,
    supervisor: nuevos.supervisor,
    resultado: nuevos.resultado,
    observaciones: nuevos.observaciones,
    desviacion: nuevos.desviacion,
  };

  const cambios = Object.keys(ETIQUETAS_CORRECCION)
    .filter((campo) => String(registro[campo] ?? "") !== String(final[campo] ?? ""))
    .map((campo) => ({ campo: ETIQUETAS_CORRECCION[campo], antes: registro[campo] ?? "", despues: final[campo] ?? "" }));
  if (cambios.length === 0) return { cambios, campos: {} };

  const cambioClave =
    registro.fecha !== final.fecha || Number(registro.turno) !== Number(final.turno) || registro.zonaId !== final.zonaId;
  if (cambioClave) {
    const repetido = await buscarHisopadoDuplicado(final.fecha, final.turno, final.zonaId);
    if (repetido && repetido.id !== registro.id) {
      const error = new Error("DUPLICADO");
      error.codigo = "duplicado";
      error.registro = repetido;
      throw error;
    }
  }

  const campos = { ...final };
  // Si en un registro importado (solo conocía el mes) se pone el día real, deja
  // de ser aproximado.
  if (registro.fechaAproximada && registro.fecha !== final.fecha) campos.fechaAproximada = false;

  await updateDoc(doc(db, "hisopados", registro.id), {
    ...campos,
    editadoEn: serverTimestamp(),
    historialCorrecciones: arrayUnion({
      por: usuario.uid,
      nombre: usuario.nombre || "",
      en: new Date().toISOString(),
      cambios,
    }),
  });
  return { cambios, campos };
}

/** Obtiene un registro de hisopado por id, o null si no existe. */
export async function obtenerHisopado(id) {
  const snap = await getDoc(doc(db, "hisopados", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Lista registros de hisopado, del más reciente al más antiguo. Cualquier
 * usuario activo puede consultar los de todos (ver firestore.rules): es
 * un panel de cumplimiento compartido, no una bitácora personal.
 *
 * @param {Object} [filtros]
 * @param {string} [filtros.inspectorUid] - opcional, para "mis registros".
 * @param {string} [filtros.desde] - fecha ISO mínima (inclusive), para la
 *   tabla de resultados por año (ver hisopado-resultados.js).
 * @param {string} [filtros.hasta] - fecha ISO máxima (inclusive).
 * @param {number} [filtros.max]
 */
export async function listarHisopados(filtros = {}) {
  const condiciones = [];
  if (filtros.inspectorUid) {
    condiciones.push(where("inspectorUid", "==", filtros.inspectorUid));
  }
  if (filtros.desde) {
    condiciones.push(where("fecha", ">=", filtros.desde));
  }
  if (filtros.hasta) {
    condiciones.push(where("fecha", "<=", filtros.hasta));
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

/**
 * Una página de hisopados, del más reciente al más antiguo. Trae solo `limite`
 * documentos (no todo el historial): el cursor que devuelve se pasa en
 * `despues` para pedir la página siguiente.
 * Filtros (todos en el servidor, para que la paginación siga siendo de `limite`):
 * inspectorUid (obligatorio para un inspector, ver firestore.rules), desde /
 * hasta (fecha ISO) o dia (una fecha exacta), turno (1-3) y desviacion
 * (true = fuera de límite, false = conforme).
 */
export async function listarHisopadosPagina(filtros = {}) {
  const limite = filtros.limite || 10;
  const condiciones = [];
  if (filtros.inspectorUid) condiciones.push(where("inspectorUid", "==", filtros.inspectorUid));
  if (filtros.codigo) {
    // Buscar un código exacto: es un solo registro, sin los demás filtros ni orden.
    const snapCodigo = await getDocs(query(collection(db, "hisopados"), ...condiciones, where("codigo", "==", filtros.codigo), limitarA(limite)));
    return {
      registros: snapCodigo.docs.map((d) => ({ id: d.id, ...d.data() })),
      cursor: null,
      hayMas: false,
    };
  }
  if (filtros.dia) {
    condiciones.push(where("fecha", "==", filtros.dia)); // un día exacto
  } else {
    if (filtros.desde) condiciones.push(where("fecha", ">=", filtros.desde));
    if (filtros.hasta) condiciones.push(where("fecha", "<=", filtros.hasta));
  }
  if (filtros.turno) condiciones.push(where("turno", "==", Number(filtros.turno)));
  if (filtros.desviacion === true || filtros.desviacion === false) {
    condiciones.push(where("desviacion", "==", filtros.desviacion));
  }

  const consulta = query(
    collection(db, "hisopados"),
    ...condiciones,
    orderBy("fecha", "desc"),
    ...(filtros.despues ? [startAfter(filtros.despues)] : []),
    limitarA(limite)
  );
  const snap = await getDocs(consulta);
  return {
    registros: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs.length ? snap.docs[snap.docs.length - 1] : filtros.despues || null,
    hayMas: snap.docs.length === limite,
  };
}

/**
 * Lee TODOS los hisopados (de 500 en 500). Solo para la numeración de los
 * registros anteriores, que se hace una vez.
 */
export async function leerTodosLosHisopados() {
  const todos = [];
  let cursor = null;
  for (;;) {
    const snap = await getDocs(
      query(collection(db, "hisopados"), orderBy("fecha"), ...(cursor ? [startAfter(cursor)] : []), limitarA(500))
    );
    snap.docs.forEach((d) => todos.push({ id: d.id, ...d.data() }));
    if (snap.docs.length < 500) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return todos;
}

/**
 * Guarda los códigos asignados a registros anteriores y deja cada contador
 * mensual en el último número usado, para que los registros nuevos sigan la
 * cuenta. asignaciones: [{id, codigo}]; contadores: { "aaaa-mm": ultimo }.
 */
export async function guardarCodigosHisopados(asignaciones, contadores) {
  const TAMANO_LOTE = 400;
  const trabajos = [
    ...Object.entries(contadores).map(([mes, ultimo]) => ({ ref: doc(db, "hisopadoContadores", mes), datos: { ultimo }, fusionar: false })),
    ...asignaciones.map((a) => ({ ref: doc(db, "hisopados", a.id), datos: { codigo: a.codigo }, fusionar: true })),
  ];
  for (let i = 0; i < trabajos.length; i += TAMANO_LOTE) {
    const lote = writeBatch(db);
    trabajos.slice(i, i + TAMANO_LOTE).forEach((t) => lote.set(t.ref, t.datos, { merge: t.fusionar }));
    await lote.commit();
  }
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

/* ---------------------------------------------------------
   SIG-FO-118 — Inspección de tarimas
   Un documento por callejón inspeccionado.
   --------------------------------------------------------- */

/** Guarda el registro de un callejón. Devuelve su id. */
export async function crearRegistroTarimas(datos) {
  const referencia = await addDoc(collection(db, "registrosTarimas"), {
    ...datos,
    creadoEn: serverTimestamp(),
  });
  return referencia.id;
}

/**
 * Lista registros del SIG-FO-118, del más reciente al más antiguo.
 * El inspector solo puede consultar los suyos (ver firestore.rules).
 */
export async function listarRegistrosTarimas(filtros = {}) {
  const condiciones = [];
  if (filtros.inspectorUid) {
    condiciones.push(where("inspectorUid", "==", filtros.inspectorUid));
  }

  const consulta = query(
    collection(db, "registrosTarimas"),
    ...condiciones,
    orderBy("fecha", "desc"),
    limitarA(filtros.max || 500)
  );
  const snap = await getDocs(consulta);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Elimina un registro del SIG-FO-118 (solo gestión, ver firestore.rules). */
export async function eliminarRegistroTarimas(id) {
  await deleteDoc(doc(db, "registrosTarimas", id));
}

/* ---------------------------------------------------------
   Permisos del rol Inspector (configuracion/permisosInspector)
   Es el MISMO documento que edita la pestaña Permisos de Configuraciones en
   el sistema de Reportes: se conserva su forma (solo casillas booleanas) para
   que ambas pantallas puedan leerlo y escribirlo. Escribir es solo del admin
   (ver firestore.rules); un documento ausente equivale a "sin permisos".
   --------------------------------------------------------- */

export const CLAVES_PERMISOS_INSPECTOR = [
  "dashboard",
  "validacion",
  "informes",
  "configuraciones",
  "configSeccionZonas",
  "configSeccionProcesos",
  "configSeccionCategorias",
  "configSeccionUbicacionPlanta",
  "configSeccionPlanoReporte",
];

/** Lee los permisos del rol Inspector. Devuelve {} si aún no se configuraron. */
export async function obtenerPermisosInspector() {
  const snap = await getDoc(doc(db, "configuracion", "permisosInspector"));
  return snap.exists() ? snap.data() : {};
}

/** Guarda los permisos del rol Inspector (solo admin). */
export async function guardarPermisosInspector(permisos) {
  const limpio = {};
  CLAVES_PERMISOS_INSPECTOR.forEach((k) => { limpio[k] = permisos[k] === true; });
  await setDoc(doc(db, "configuracion", "permisosInspector"), limpio);
  return limpio;
}
