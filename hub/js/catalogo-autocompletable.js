// =========================================================
// catalogo-autocompletable.js
// Fábrica para catálogos de texto libre que se van llenando solos:
// supervisor del hisopado, área/máquina del hisopado, proveedor de
// transporte... Todos comparten el mismo trato — se cargan una vez, se
// normalizan (sin tildes/mayúsculas para comparar), se dan de alta si son
// nuevos al guardar, y usan el mismo buscador con desplegable
// (autocompletado.js). Antes esta lógica se repetía completa en cada
// catálogo (proveedores-transporte.js y supervisores.js eran casi
// idénticos); ahora cada uno es una llamada a crearCatalogoAutocompletable().
// =========================================================

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { configurarAutocompletado } from "./autocompletado.js";

/**
 * @param {Object} opciones
 * @param {string} opciones.coleccion - nombre de la colección en Firestore.
 * @param {string} opciones.nombreEntidad - para los mensajes ("supervisor", "área o máquina"...).
 * @param {string} opciones.etiquetaNuevo - texto del badge cuando es nuevo ("Nuevo supervisor"...).
 * @param {string} [opciones.fraseNueva] - "nuevo/nueva <entidad>" en minúscula, para el mensaje del
 *   desplegable ("Se registrará como nueva área o máquina"). El género no sale solo de nombreEntidad
 *   ("el área" pero "nueva área"), así que por defecto usa "nuevo" (válido para supervisor/proveedor)
 *   y cada catálogo femenino lo pasa explícito.
 * @param {string} [opciones.fraseSinRegistros] - mensaje cuando el catálogo está vacío ("Todavía no
 *   hay <entidad>s registrados"): mismo motivo de género/plural que fraseNueva.
 * @param {string} [opciones.claseBadgeBase]
 * @param {string} [opciones.claseBadgeRegistrado]
 * @param {string} [opciones.claseBadgeNuevo]
 */
export function crearCatalogoAutocompletable({
  coleccion,
  nombreEntidad,
  etiquetaNuevo,
  fraseNueva = `nuevo ${nombreEntidad}`,
  fraseSinRegistros = `Todavía no hay ${nombreEntidad}s registrados.`,
  claseBadgeBase = "badge",
  claseBadgeRegistrado = "badge badge-exito",
  claseBadgeNuevo = "badge badge-alerta",
}) {
  let cache = null;

  /** Clave canónica para comparar dos nombres sin importar tildes ni mayúsculas. */
  function normalizarClave(texto) {
    return String(texto || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ");
  }

  /** Carga el catálogo (una vez por sesión) como { mapa, lista }. */
  async function obtenerCatalogo(forzar = false) {
    if (cache && !forzar) return cache;

    const mapa = new Map();
    try {
      const snap = await getDocs(collection(db, coleccion));
      snap.forEach((documento) => {
        const nombre = (documento.data().nombre || "").trim();
        if (nombre) mapa.set(normalizarClave(nombre), nombre);
      });
    } catch (error) {
      // Sin catálogo el campo sigue siendo texto libre: se puede guardar
      // igual, solo se pierde el autocompletado.
      console.warn(`No se pudo cargar el catálogo de ${nombreEntidad}:`, error);
    }

    cache = { mapa, lista: [...mapa.values()].sort((a, b) => a.localeCompare(b)) };
    return cache;
  }

  /** Devuelve el nombre ya registrado que corresponde, o el escrito en mayúsculas. */
  function normalizarNombre(nombre, catalogo = cache) {
    const limpio = String(nombre || "").trim();
    if (!limpio) return "";
    const clave = normalizarClave(limpio);
    return catalogo?.mapa?.get(clave) || limpio.toUpperCase();
  }

  /** Da de alta el valor si es nuevo. Devuelve el nombre canónico. */
  async function registrarSiNoExiste(nombre, uid = "") {
    const limpio = String(nombre || "").trim();
    if (!limpio) return "";

    const catalogo = await obtenerCatalogo();
    const clave = normalizarClave(limpio);
    if (catalogo.mapa.has(clave)) return catalogo.mapa.get(clave);

    const canonico = limpio.toUpperCase();
    try {
      await addDoc(collection(db, coleccion), {
        nombre: canonico,
        nombreNormalizado: clave,
        creadoPor: uid,
        creadoEn: serverTimestamp(),
      });
      catalogo.mapa.set(clave, canonico);
      catalogo.lista.push(canonico);
      catalogo.lista.sort((a, b) => a.localeCompare(b));
    } catch (error) {
      // Que no se pueda ampliar el catálogo no debe tumbar el registro:
      // el nombre ya quedó guardado dentro del documento que lo usa.
      console.warn(`No se pudo registrar en el catálogo de ${nombreEntidad}:`, error);
    }
    return canonico;
  }

  /** Buscador con desplegable + badge "Registrado" / "Nuevo" (ver autocompletado.js). */
  function configurarBuscador({ inputEl, dropdownEl, badgeEl, onSeleccion }) {
    configurarAutocompletado({
      inputEl,
      dropdownEl,
      badgeEl,
      onSeleccion,
      obtenerCatalogo,
      normalizarClave,
      normalizarNombre,
      nombreEntidad,
      etiquetaRegistrado: (nombre) => `Registrado: ${nombre}`,
      fraseSeRegistrara: () => `Se registrará como ${fraseNueva}`,
      fraseSinRegistros,
      etiquetaNuevo,
      claseBadgeBase,
      claseBadgeRegistrado,
      claseBadgeNuevo,
    });
  }

  return { normalizarClave, obtenerCatalogo, normalizarNombre, registrarSiNoExiste, configurarBuscador };
}
