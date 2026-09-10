// =========================================================
// supervisores.js
// Catálogo de supervisores del hisopado: lista editable que se va
// alimentando sola, igual que el de proveedores de transporte.
//
// El campo del formulario no es un desplegable cerrado: se escribe y se
// busca sobre lo ya registrado (un <datalist> nativo, que en tablet abre
// el teclado y filtra a la vez). Un nombre nuevo se guarda al enviar la
// toma, así que la lista crece con el uso y nadie tiene que darla de alta
// en una pantalla aparte.
//
// La clave normalizada (sin tildes, sin dobles espacios, en minúsculas)
// evita que "Ana López", "ANA LOPEZ" y "ana  lopez" terminen como tres
// supervisores distintos.
// =========================================================

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const COLEC_SUPERVISORES = "supervisores_hisopado";

let cache = null;

/** Clave canónica para comparar dos nombres sin importar tildes ni mayúsculas. */
export function normalizarClaveSupervisor(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Carga el catálogo (una vez por sesión) como { mapa, lista }. */
export async function obtenerCatalogoSupervisores(forzar = false) {
  if (cache && !forzar) return cache;

  const mapa = new Map();
  try {
    const snap = await getDocs(collection(db, COLEC_SUPERVISORES));
    snap.forEach((documento) => {
      const nombre = (documento.data().nombre || "").trim();
      if (nombre) mapa.set(normalizarClaveSupervisor(nombre), nombre);
    });
  } catch (error) {
    // Sin catálogo el campo sigue siendo texto libre: se puede registrar
    // la toma igual, solo se pierde el autocompletado.
    console.warn("No se pudo cargar el catálogo de supervisores:", error);
  }

  cache = { mapa, lista: [...mapa.values()].sort((a, b) => a.localeCompare(b)) };
  return cache;
}

/** Devuelve el nombre ya registrado que corresponde, o el escrito en mayúsculas. */
export function normalizarNombreSupervisor(nombre, catalogo = cache) {
  const limpio = String(nombre || "").trim();
  if (!limpio) return "";
  const clave = normalizarClaveSupervisor(limpio);
  return catalogo?.mapa?.get(clave) || limpio.toUpperCase();
}

/** Da de alta al supervisor si es nuevo. Devuelve el nombre canónico. */
export async function registrarSupervisorSiNoExiste(nombre, uid = "") {
  const limpio = String(nombre || "").trim();
  if (!limpio) return "";

  const catalogo = await obtenerCatalogoSupervisores();
  const clave = normalizarClaveSupervisor(limpio);
  if (catalogo.mapa.has(clave)) return catalogo.mapa.get(clave);

  const canonico = limpio.toUpperCase();
  try {
    await addDoc(collection(db, COLEC_SUPERVISORES), {
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
    // el nombre ya quedó guardado dentro de la toma.
    console.warn("No se pudo registrar el supervisor:", error);
  }
  return canonico;
}

/** Vuelca la lista en un <datalist> para que el input la ofrezca al escribir. */
export function llenarDatalistSupervisores(datalistEl, catalogo) {
  if (!datalistEl) return;
  datalistEl.innerHTML = (catalogo?.lista || [])
    .map((nombre) => `<option value="${nombre.replace(/"/g, "&quot;")}"></option>`)
    .join("");
}
