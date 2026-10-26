// Sesión y datos de Horarios sobre Firebase (el mismo inicio de sesión y la misma base que el hub).
//
// Colecciones de Firestore (todas con prefijo "horarios_"):
//   horarios_personal/{id}      persona del rol: nombre, correo, puesto, grupo, activo, codigo_empleado
//   horarios_turnos/{fecha}_{personaId}   un turno por persona y día (la regla "una sola letra por día")
//   horarios_config/principal   semana de referencia de la rotación
//   horarios_feriados/{fecha}   feriados (el id es la fecha)
//   horarios_solicitudes/{id}   solicitudes de cambio, permiso, etc.
//   horarios_historial/{id}     cada cambio hecho en la app (quién, qué y cuándo)
// Los campos conservan los nombres originales (snake_case) para no tocar las páginas.

import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, query, where, writeBatch,
  orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { auth, db } from '../../js/firebase-config.js';
import { obtenerPerfil, esRolDeGestion, cerrarSesion as cerrarSesionHub, obtenerRutaLogin } from '../../js/auth.js';

export const LETRAS = [
  { codigo: 'D', nombre: 'Día', hora_ini: '06:00', hora_fin: '14:00', horas_ordinarias: 8 },
  { codigo: 'E', nombre: 'Tarde', hora_ini: '14:00', hora_fin: '21:00', horas_ordinarias: 7 },
  { codigo: 'F', nombre: 'Noche', hora_ini: '21:00', hora_fin: '06:00', horas_ordinarias: 9 },
  { codigo: 'L', nombre: 'Libre', hora_ini: null, hora_fin: null, horas_ordinarias: 0 },
];

// ---------- sesión ----------

let usuarioActual = null; // { id (persona), uid, correo, nombre, puesto, grupo }

export function getUsuarioActual() {
  return usuarioActual;
}

export function esCoordinador() {
  return usuarioActual?.puesto === 'coordinador';
}

export async function cerrarSesion() {
  usuarioActual = null;
  await cerrarSesionHub();
}

const normalizarCorreo = (correo) => String(correo ?? '').trim().toLowerCase();

/**
 * Espera la sesión del hub y arma el usuario de Horarios. Quien no ha iniciado sesión en el hub
 * va a su pantalla de acceso. Los roles de gestión del hub (admin / coordinador) son coordinadores
 * aquí; el resto toma su puesto de la ficha de personal que coincide con su correo.
 */
export function iniciarSesionHorarios() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = obtenerRutaLogin();
        return;
      }
      try {
        const perfil = await obtenerPerfil(user.uid);
        const correo = normalizarCorreo(user.email);
        const { docs } = await getDocs(query(collection(db, 'horarios_personal'), where('correo', '==', correo)));
        const persona = docs[0] ? { id: docs[0].id, ...docs[0].data() } : null;

        usuarioActual = {
          id: persona?.id ?? null,
          uid: user.uid,
          correo,
          nombre: persona?.nombre ?? perfil?.nombre ?? user.email,
          puesto: esRolDeGestion(perfil?.rol) ? 'coordinador' : (persona?.puesto ?? 'inspector'),
          grupo: persona?.grupo ?? null,
        };
      } catch (error) {
        console.error('No se pudo cargar la sesión de Horarios:', error);
        usuarioActual = null;
      }
      resolve(usuarioActual);
    });
  });
}

// ---------- personal ----------

const porGrupoYNombre = (a, b) => (a.grupo ?? 9) - (b.grupo ?? 9) || String(a.nombre).localeCompare(b.nombre);

/** Personal de la rotación (sin coordinadores). `soloActivos` omite a los dados de baja. */
export async function listarPersonal({ soloActivos = false } = {}) {
  const { docs } = await getDocs(collection(db, 'horarios_personal'));
  return docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.puesto !== 'coordinador' && (!soloActivos || p.activo !== false))
    .sort(porGrupoYNombre);
}

export async function guardarPersona(id, datos) {
  const limpio = { ...datos, correo: normalizarCorreo(datos.correo) };
  if (id) {
    await updateDoc(doc(db, 'horarios_personal', id), limpio);
    return id;
  }
  const referencia = await addDoc(collection(db, 'horarios_personal'), { ...limpio, creado_en: new Date().toISOString() });
  return referencia.id;
}

export async function crearPersonas(lista) {
  const lote = writeBatch(db);
  for (const persona of lista) {
    lote.set(doc(collection(db, 'horarios_personal')), {
      ...persona, correo: normalizarCorreo(persona.correo), creado_en: new Date().toISOString(),
    });
  }
  await lote.commit();
}

// ---------- turnos ----------

export const idTurno = (fecha, personaId) => `${fecha}_${personaId}`;

/** Turnos entre dos fechas ISO (inclusive). Un solo rango sobre `fecha`: no requiere índice compuesto. */
export async function listarTurnos(desde, hasta) {
  const { docs } = await getDocs(query(collection(db, 'horarios_turnos'), where('fecha', '>=', desde), where('fecha', '<=', hasta)));
  return docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Guarda los turnos que genera la rotación. Nunca pisa uno puesto a mano o por solicitud
 * (origen manual / solicitud); los demás se reescriben. Devuelve cuántos escribió.
 */
export async function guardarTurnosAuto(turnos, desde, hasta) {
  const existentes = new Map((await listarTurnos(desde, hasta)).map((t) => [t.id, t]));
  const porEscribir = turnos.filter((t) => {
    const actual = existentes.get(idTurno(t.fecha, t.usuario_id));
    return !actual || actual.origen === 'auto';
  });

  for (let i = 0; i < porEscribir.length; i += 400) {
    const lote = writeBatch(db);
    for (const t of porEscribir.slice(i, i + 400)) {
      lote.set(doc(db, 'horarios_turnos', idTurno(t.fecha, t.usuario_id)), { ...t, origen: 'auto', actualizado_en: new Date().toISOString() });
    }
    await lote.commit();
  }
  return porEscribir.length;
}

/**
 * Guarda turnos puestos a mano (origen "manual") o por una solicitud aprobada (origen "solicitud").
 * "Generar mes" no pisa ninguno de los dos.
 */
export async function guardarTurnosManuales(turnos, { origen = 'manual', solicitudId = null } = {}) {
  const lote = writeBatch(db);
  for (const t of turnos) {
    lote.set(doc(db, 'horarios_turnos', idTurno(t.fecha, t.usuario_id)), {
      ...t, origen, solicitud_id: solicitudId, actualizado_en: new Date().toISOString(), actualizado_por: usuarioActual?.correo ?? null,
    });
  }
  await lote.commit();
}

/** Borra turnos (para volver a lo planificado: después se regenera el mes). */
export async function eliminarTurnos(ids) {
  const lote = writeBatch(db);
  for (const id of ids) lote.delete(doc(db, 'horarios_turnos', id));
  await lote.commit();
}

// ---------- historial ----------

/**
 * Registra un movimiento. `entrada` = { accion, texto, persona? ({ id, nombre, correo }), fecha? }.
 * Si falla (p. ej. reglas sin publicar) no interrumpe la acción que ya se hizo.
 */
export async function registrarHistorial({ accion, texto, persona = null, fecha = null }) {
  try {
    await addDoc(collection(db, 'horarios_historial'), {
      accion,
      texto,
      fecha,
      persona_id: persona?.id ?? null,
      persona_nombre: persona?.nombre ?? null,
      persona_correo: persona?.correo ? normalizarCorreo(persona.correo) : null,
      actor_correo: usuarioActual?.correo ?? null,
      actor_nombre: usuarioActual?.nombre ?? null,
      creado_en: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('No se pudo registrar en el historial:', error);
  }
}

/** Coordinador: los últimos movimientos de todos. Trabajador: solo los que lo involucran. */
export async function listarHistorial() {
  const consulta = esCoordinador()
    ? query(collection(db, 'horarios_historial'), orderBy('creado_en', 'desc'), limit(300))
    : query(collection(db, 'horarios_historial'), where('persona_correo', '==', usuarioActual.correo));
  const { docs } = await getDocs(consulta);
  return docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.creado_en.localeCompare(a.creado_en));
}

// ---------- configuración y feriados ----------

export async function obtenerConfig() {
  const snap = await getDoc(doc(db, 'horarios_config', 'principal'));
  return snap.exists() ? snap.data() : null;
}

export async function guardarConfig(cambios) {
  await setDoc(doc(db, 'horarios_config', 'principal'), { ...cambios, actualizado_en: new Date().toISOString() }, { merge: true });
}

export async function listarFeriados(desde, hasta) {
  const restricciones = [];
  if (desde) restricciones.push(where('fecha', '>=', desde));
  if (hasta) restricciones.push(where('fecha', '<=', hasta));
  const { docs } = await getDocs(query(collection(db, 'horarios_feriados'), ...restricciones));
  return docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export async function agregarFeriado(fecha, nombre) {
  await setDoc(doc(db, 'horarios_feriados', fecha), { fecha, nombre });
}

export async function eliminarFeriado(id) {
  await deleteDoc(doc(db, 'horarios_feriados', id));
}

// ---------- solicitudes ----------

export async function crearSolicitud(datos) {
  await addDoc(collection(db, 'horarios_solicitudes'), {
    ...datos,
    solicitante_correo: usuarioActual.correo,
    estado: 'pendiente',
    creado_en: new Date().toISOString(),
  });
}

/** Todas las solicitudes (solo coordinador): pendientes primero, luego las más recientes. */
export async function listarSolicitudes() {
  const { docs } = await getDocs(collection(db, 'horarios_solicitudes'));
  const orden = { pendiente: 0, aprobada: 1, rechazada: 1 };
  return docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (orden[a.estado] ?? 1) - (orden[b.estado] ?? 1) || b.creado_en.localeCompare(a.creado_en));
}

export async function resolverSolicitud(id, estado, comentario) {
  await updateDoc(doc(db, 'horarios_solicitudes', id), {
    estado,
    comentario_resolucion: comentario || null,
    resuelto_en: new Date().toISOString(),
    resuelto_por: usuarioActual?.correo ?? null,
    resuelto_por_nombre: usuarioActual?.nombre ?? null,
  });
}

export async function listarMisSolicitudes() {
  const { docs } = await getDocs(query(collection(db, 'horarios_solicitudes'), where('solicitante_correo', '==', usuarioActual.correo)));
  return docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.creado_en.localeCompare(a.creado_en));
}
