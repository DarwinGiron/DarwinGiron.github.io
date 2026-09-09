// =========================================================
// proveedores-transporte.js
// Catálogo, normalización de mayúsculas/minúsculas y buscador/autocompletado
// en tiempo real para proveedores y empresas de transporte (LOG-FO-101).
// =========================================================

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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
export function configurarAutocompletadoProveedor({
  inputEl,
  dropdownEl,
  badgeEl,
  onSeleccion,
}) {
  if (!inputEl || !dropdownEl) return;

  let catalogo = { mapa: new Map(), lista: [...PROVEEDORES_INICIALES] };
  let itemActivoIndex = -1;

  // Cargar catálogo asíncrono
  obtenerCatalogoProveedores().then((cat) => {
    catalogo = cat;
    if (inputEl.value) {
      inputEl.value = normalizarNombreProveedor(inputEl.value, catalogo);
      actualizarBadge();
    }
  });

  function actualizarBadge() {
    if (!badgeEl) return;
    const val = inputEl.value.trim();
    if (!val) {
      badgeEl.className = "badge-proveedor oculto";
      badgeEl.textContent = "";
      return;
    }

    const clave = normalizarClaveProveedor(val);
    if (catalogo.mapa.has(clave)) {
      const canonico = catalogo.mapa.get(clave);
      badgeEl.className = "badge-proveedor badge-proveedor--existente";
      badgeEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;"><path d="M20 6 9 17l-5-5"/></svg> Registrado: ${canonico}`;
    } else {
      badgeEl.className = "badge-proveedor badge-proveedor--nuevo";
      badgeEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Nuevo proveedor`;
    }
  }

  function renderSugerencias(filtro = "") {
    const terminoClave = normalizarClaveProveedor(filtro);
    const coincidencias = catalogo.lista.filter((p) => {
      if (!terminoClave) return true;
      return normalizarClaveProveedor(p).includes(terminoClave);
    });

    dropdownEl.innerHTML = "";
    itemActivoIndex = -1;

    if (coincidencias.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sugerencia-item sugerencia-item--aviso";
      empty.innerHTML = `<span>No existe aún <strong>"${filtro.toUpperCase()}"</strong> · Se registrará como nuevo proveedor</span>`;
      dropdownEl.appendChild(empty);
      dropdownEl.classList.remove("oculto");
      return;
    }

    const header = document.createElement("div");
    header.className = "sugerencias-header";
    header.textContent = `Proveedores registrados (${coincidencias.length})`;
    dropdownEl.appendChild(header);

    coincidencias.forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = "sugerencia-item";
      row.setAttribute("role", "option");
      row.dataset.index = idx;
      row.dataset.value = p;

      if (terminoClave) {
        const regex = new RegExp(`(${terminoClave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
        const html = p.replace(regex, "<mark class='mark-resaltado'>$1</mark>");
        row.innerHTML = `<span class="sugerencia-nombre">${html}</span><span class="sugerencia-icono">↵</span>`;
      } else {
        row.innerHTML = `<span class="sugerencia-nombre">${p}</span>`;
      }

      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        seleccionarProveedor(p);
      });

      dropdownEl.appendChild(row);
    });

    dropdownEl.classList.remove("oculto");
  }

  function seleccionarProveedor(nombre) {
    const canonico = normalizarNombreProveedor(nombre, catalogo);
    inputEl.value = canonico;
    cerrarDropdown();
    actualizarBadge();
    if (typeof onSeleccion === "function") {
      onSeleccion(canonico);
    }
  }

  function cerrarDropdown() {
    dropdownEl.classList.add("oculto");
    dropdownEl.innerHTML = "";
    itemActivoIndex = -1;
  }

  inputEl.addEventListener("input", (e) => {
    const val = e.target.value;
    actualizarBadge();
    renderSugerencias(val);
  });

  inputEl.addEventListener("focus", () => {
    renderSugerencias(inputEl.value);
  });

  inputEl.addEventListener("blur", () => {
    setTimeout(() => {
      cerrarDropdown();
      if (inputEl.value.trim()) {
        const canonico = normalizarNombreProveedor(inputEl.value, catalogo);
        inputEl.value = canonico;
        actualizarBadge();
        if (typeof onSeleccion === "function") {
          onSeleccion(canonico);
        }
      } else {
        actualizarBadge();
      }
    }, 150);
  });

  inputEl.addEventListener("keydown", (e) => {
    const items = dropdownEl.querySelectorAll(".sugerencia-item:not(.sugerencia-item--aviso)");
    if (!items.length || dropdownEl.classList.contains("oculto")) {
      if (e.key === "Enter") {
        e.preventDefault();
        inputEl.blur();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      itemActivoIndex = (itemActivoIndex + 1) % items.length;
      resaltarItem(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      itemActivoIndex = (itemActivoIndex - 1 + items.length) % items.length;
      resaltarItem(items);
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (itemActivoIndex >= 0 && items[itemActivoIndex]) {
        e.preventDefault();
        seleccionarProveedor(items[itemActivoIndex].dataset.value);
      } else if (items.length > 0) {
        e.preventDefault();
        seleccionarProveedor(items[0].dataset.value);
      }
    } else if (e.key === "Escape") {
      cerrarDropdown();
    }
  });

  function resaltarItem(items) {
    items.forEach((it, idx) => {
      it.classList.toggle("sugerencia-item--seleccionado", idx === itemActivoIndex);
      if (idx === itemActivoIndex) {
        it.scrollIntoView({ block: "nearest" });
      }
    });
  }
}
