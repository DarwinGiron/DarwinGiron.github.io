// Estrategia offline (02-ESPECIFICACION.md sección 6.3 y 04-DISENO-SISTEMA.md sección 11).
// Lectura: el mes en curso, el personal y la configuración se copian a IndexedDB cuando hay
// señal, para poder dibujar la app sin conexión. Escritura: cada cambio sin poder enviarse se
// guarda en una cola con su fecha y hora; al reconectar se envían en orden y se vacía la cola.
// Conflictos: gana el último cambio enviado al servidor (last-write-wins).

const NOMBRE_DB = 'horarios-cogusa-db';
const VERSION_DB = 1;
const ALMACENES = ['turnos', 'usuarios', 'config', 'feriados', 'meta', 'cola_escritura'];

let dbPromesa = null;

function abrirDB() {
  if (dbPromesa) return dbPromesa;
  dbPromesa = new Promise((resolve, reject) => {
    const peticion = indexedDB.open(NOMBRE_DB, VERSION_DB);
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      if (!db.objectStoreNames.contains('turnos')) db.createObjectStore('turnos', { keyPath: 'clave' });
      if (!db.objectStoreNames.contains('usuarios')) db.createObjectStore('usuarios', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('feriados')) db.createObjectStore('feriados', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'clave' });
      if (!db.objectStoreNames.contains('cola_escritura')) db.createObjectStore('cola_escritura', { keyPath: 'id' });
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
  return dbPromesa;
}

function transaccion(nombres, modo) {
  return abrirDB().then((db) => db.transaction(nombres, modo));
}

function pedir(peticionIDB) {
  return new Promise((resolve, reject) => {
    peticionIDB.onsuccess = () => resolve(peticionIDB.result);
    peticionIDB.onerror = () => reject(peticionIDB.error);
  });
}

async function vaciarYescribir(almacen, filas) {
  const tx = await transaccion([almacen], 'readwrite');
  const store = tx.objectStore(almacen);
  await pedir(store.clear());
  for (const fila of filas) store.put(fila);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function leerTodo(almacen) {
  const tx = await transaccion([almacen], 'readonly');
  return pedir(tx.objectStore(almacen).getAll());
}

// ---------- caché de lectura: mes en curso, personal, configuración ----------

/** Guarda en IndexedDB lo que se acaba de traer con conexión, para poder verlo sin señal. */
export async function guardarCacheLectura({ mesIso, turnos, usuarios, config, feriados }) {
  await vaciarYescribir('turnos', (turnos ?? []).map((t) => ({ clave: `${t.usuario_id}_${t.fecha}`, ...t })));
  if (usuarios) await vaciarYescribir('usuarios', usuarios);
  if (feriados) await vaciarYescribir('feriados', feriados.map((f, i) => ({ id: f.id ?? `local_${i}`, ...f })));
  if (config) {
    const tx = await transaccion(['config'], 'readwrite');
    // IndexedDB no acepta booleanos como clave: se usa 'actual' en vez del id:true de Supabase.
    tx.objectStore('config').put({ id: 'actual', ...config });
  }
  const tx = await transaccion(['meta'], 'readwrite');
  tx.objectStore('meta').put({ clave: 'sincronizado', mesIso, en: new Date().toISOString() });
}

/** Lee lo último guardado. Devuelve null si nunca se guardó nada todavía. */
export async function leerCacheLectura() {
  const tx = await transaccion(['meta'], 'readonly');
  const meta = await pedir(tx.objectStore('meta').get('sincronizado'));
  if (!meta) return null;

  const [turnos, usuarios, feriados, configTx] = await Promise.all([
    leerTodo('turnos'),
    leerTodo('usuarios'),
    leerTodo('feriados'),
    transaccion(['config'], 'readonly').then((t) => pedir(t.objectStore('config').get('actual'))),
  ]);

  return {
    mesIso: meta.mesIso,
    sincronizadoEn: meta.en,
    turnos,
    usuarios,
    feriados,
    config: configTx ?? null,
  };
}

// ---------- cola de escritura ----------

/**
 * Encola una operación pendiente. `operacion` = { tabla, tipo: 'insert'|'update'|'delete',
 * payload, filtro? (para update/delete: { columna, valor }) }.
 * Devuelve el id con el que quedó guardada en la cola.
 */
export async function encolarEscritura(operacion) {
  const item = {
    id: crypto.randomUUID(),
    creadoEn: new Date().toISOString(),
    intentos: 0,
    estado: 'pendiente', // 'pendiente' | 'error'
    error: null,
    ...operacion,
  };
  const tx = await transaccion(['cola_escritura'], 'readwrite');
  tx.objectStore('cola_escritura').put(item);
  return item.id;
}

export async function listarColaEscritura() {
  const items = await leerTodo('cola_escritura');
  return items.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

export async function listarColaPorTabla(tabla) {
  return (await listarColaEscritura()).filter((i) => i.tabla === tabla);
}

async function quitarDeCola(id) {
  const tx = await transaccion(['cola_escritura'], 'readwrite');
  tx.objectStore('cola_escritura').delete(id);
}

async function actualizarItemCola(item) {
  const tx = await transaccion(['cola_escritura'], 'readwrite');
  tx.objectStore('cola_escritura').put(item);
}

/**
 * Intenta enviar `operacion` directo contra Supabase. Si no hay señal o falla por red,
 * la encola en vez de perderla. Devuelve { enviado: true } o { enviado: false, idCola }.
 * Un error de datos (ej. viola una restricción) SÍ se reporta al que llamó (no se encola,
 * porque reintentarlo tal cual volvería a fallar).
 */
export async function guardarConCola(supabase, operacion) {
  if (navigator.onLine) {
    try {
      await ejecutarOperacion(supabase, operacion);
      return { enviado: true };
    } catch (e) {
      if (esErrorDeRed(e)) {
        const idCola = await encolarEscritura(operacion);
        return { enviado: false, idCola };
      }
      throw e; // error de datos: que lo maneje quien llamó (ej. mostrar mensaje)
    }
  }
  const idCola = await encolarEscritura(operacion);
  return { enviado: false, idCola };
}

function esErrorDeRed(e) {
  // supabase-js envuelve fetch: sin conexión llega como TypeError "Failed to fetch" (o similar).
  return e instanceof TypeError || e?.message?.toLowerCase().includes('fetch');
}

async function ejecutarOperacion(supabase, operacion) {
  const { tabla, tipo, payload, filtro } = operacion;
  if (tipo === 'insert') {
    const { error } = await supabase.from(tabla).insert(payload);
    if (error) throw error;
    return;
  }
  if (tipo === 'update') {
    const { error } = await supabase.from(tabla).update(payload).eq(filtro.columna, filtro.valor);
    if (error) throw error;
    return;
  }
  if (tipo === 'delete') {
    const { error } = await supabase.from(tabla).delete().eq(filtro.columna, filtro.valor);
    if (error) throw error;
    return;
  }
  throw new Error(`Tipo de operación desconocido: ${tipo}`);
}

let procesandoCola = false;

/** Envía la cola en orden al reconectar. Se detiene ante el primer error de red (se reintentará luego). */
export async function procesarColaEscritura(supabase) {
  if (procesandoCola || !navigator.onLine) return;
  procesandoCola = true;
  try {
    const pendientes = (await listarColaEscritura()).filter((i) => i.estado === 'pendiente');
    for (const item of pendientes) {
      try {
        await ejecutarOperacion(supabase, item);
        await quitarDeCola(item.id);
        document.dispatchEvent(new CustomEvent('cola:item-enviado', { detail: { item } }));
      } catch (e) {
        if (esErrorDeRed(e)) {
          break; // se perdió la conexión otra vez a media cola: se reintenta en el próximo "online"
        }
        item.estado = 'error';
        item.error = e.message ?? String(e);
        item.intentos += 1;
        await actualizarItemCola(item);
        document.dispatchEvent(new CustomEvent('cola:item-error', { detail: { item } }));
      }
    }
  } finally {
    procesandoCola = false;
    document.dispatchEvent(new CustomEvent('cola:actualizada'));
  }
}

// ---------- conexión ----------

export function estaEnLinea() {
  return navigator.onLine;
}
