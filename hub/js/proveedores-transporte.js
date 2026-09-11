// =========================================================
// proveedores-transporte.js
// Catálogo, normalización de mayúsculas/minúsculas y buscador/autocompletado
// en tiempo real para proveedores y empresas de transporte (LOG-FO-101).
//
// El desplegable de sugerencias + badge "Registrado"/"Nuevo" es genérico
// (ver autocompletado.js) — el mismo widget lo usa supervisores.js para
// los supervisores de hisopado. Aquí solo se le pasan las funciones de
// este catálogo en particular.
// =========================================================

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { configurarAutocompletado } from "./autocompletado.js";

export const COLEC_PROVEEDORES = "proveedores_transporte";

// Proveedores base conocidos detectados en la operación
export const PROVEEDORES_INICIALES = [
  "ROY",
  "CAMPECHE",
  "OLIVA",
  "UDS",
  "LOCATERSA"
];

let cacheCatalogo = null;

/**
 * Genera una clave canónica en minúsculas y sin espacios sobrantes para comparación estricta.
 */
export function normalizarClaveProveedor(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // elimina tildes/acentos
    .replace(/\s+/g, " ");
}

/**
 * Carga o refresca el catálogo de proveedores de transporte desde Firestore.
 * Si la colección está vacía, la pre-siembra automáticamente con los proveedores iniciales.
 */
export async function obtenerCatalogoProveedores(forzarRefresco = false) {
  if (cacheCatalogo && !forzarRefresco) {
    return cacheCatalogo;
  }

  const mapa = new Map(); // claveNormalizada -> NombreCanónico

  // Registrar primero los iniciales
  PROVEEDORES_INICIALES.forEach((p) => {
    const can = p.trim().toUpperCase();
    const c = normalizarClaveProveedor(can);
    mapa.set(c, can);
  });

  try {
    const snap = await getDocs(collection(db, COLEC_PROVEEDORES));
    if (!snap.empty) {
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const nom = (data.nombre || "").trim();
        if (nom) {
          const c = normalizarClaveProveedor(nom);
          const can = nom.toUpperCase();
          mapa.set(c, can);
        }
      });
    } else {
      // Colección vacía: sembrar iniciales en segundo plano sin bloquear
      seederInicialProveedores().catch((e) => console.warn("Aviso seeder proveedores:", e));
    }
  } catch (err) {
    console.warn("No se pudo leer proveedores_transporte en Firestore (usando iniciales):", err);
  }

  // Generar lista única ordenada alfabéticamente
  const valoresUnicos = Array.from(new Set(mapa.values())).sort((a, b) => a.localeCompare(b));
  cacheCatalogo = { mapa, lista: valoresUnicos };
  return cacheCatalogo;
}

/**
 * Siembra los proveedores base en Firestore si no existen
 */
async function seederInicialProveedores() {
  try {
    for (const nom of PROVEEDORES_INICIALES) {
      await addDoc(collection(db, COLEC_PROVEEDORES), {
        nombre: nom.toUpperCase(),
        nombreNormalizado: normalizarClaveProveedor(nom),
        fechaCreacion: serverTimestamp(),
        origen: "sistema_inicial",
      });
    }
  } catch (e) {
    console.warn("Error al sembrar proveedores iniciales:", e);
  }
}

/**
 * Retorna el nombre del proveedor normalizado al estándar canónico.
 * Si ya existe registrado (sin importar mayúsculas/minúsculas), devuelve la versión oficial registrada.
 * Si es nuevo, devuelve una versión limpia en MAYÚSCULAS para evitar discrepancias futuras.
 */
export function normalizarNombreProveedor(nombreRaw, catalogo = cacheCatalogo) {
  if (!nombreRaw) return "";
  const raw = String(nombreRaw).trim();
  if (!raw) return "";

  const clave = normalizarClaveProveedor(raw);
  if (catalogo && catalogo.mapa && catalogo.mapa.has(clave)) {
    return catalogo.mapa.get(clave);
  }

  return raw.toUpperCase();
}

/**
 * Registra un nuevo proveedor en la colección si aún no existía (case-insensitive).
 */
export async function registrarProveedorSiNoExiste(nombreRaw, usuarioUid = "") {
  const nombreLimpio = String(nombreRaw || "").trim();
  if (!nombreLimpio) return "";

  const catalogo = await obtenerCatalogoProveedores();
  const clave = normalizarClaveProveedor(nombreLimpio);

  if (catalogo.mapa.has(clave)) {
    return catalogo.mapa.get(clave);
  }

  const nombreCanonico = nombreLimpio.toUpperCase();

  try {
    await addDoc(collection(db, COLEC_PROVEEDORES), {
      nombre: nombreCanonico,
      nombreNormalizado: clave,
      creadoPor: usuarioUid,
      fechaCreacion: serverTimestamp(),
    });
    // Actualizar cache local
    catalogo.mapa.set(clave, nombreCanonico);
    if (!catalogo.lista.includes(nombreCanonico)) {
      catalogo.lista.push(nombreCanonico);
      catalogo.lista.sort((a, b) => a.localeCompare(b));
    }
  } catch (err) {
    console.warn("Error al registrar nuevo proveedor en Firestore:", err);
  }

  return nombreCanonico;
}

/**
 * Configura el buscador con autocompletado en tiempo real en el input de Empresa/Transporte.
 */
export function configurarAutocompletadoProveedor({ inputEl, dropdownEl, badgeEl, onSeleccion }) {
  configurarAutocompletado({
    inputEl,
    dropdownEl,
    badgeEl,
    onSeleccion,
    obtenerCatalogo: obtenerCatalogoProveedores,
    normalizarClave: normalizarClaveProveedor,
    normalizarNombre: normalizarNombreProveedor,
    nombreEntidad: "proveedor",
    etiquetaRegistrado: (nombre) => `Registrado: ${nombre}`,
    etiquetaNuevo: "Nuevo proveedor",
    catalogoInicial: { mapa: new Map(), lista: [...PROVEEDORES_INICIALES] },
    // Este formulario (inspeccion-furgon-3d/index.html) no usa el tema-hub
    // compartido: trae su propio CSS local con estas clases exactas.
    claseBadgeBase: "badge-proveedor",
    claseBadgeRegistrado: "badge-proveedor badge-proveedor--existente",
    claseBadgeNuevo: "badge-proveedor badge-proveedor--nuevo",
  });
}
