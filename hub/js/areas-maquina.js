// =========================================================
// areas-maquina.js
// Catálogo del área o máquina donde se tomó la muestra de hisopado —
// distinto de la "Superficie" (el punto puntual de la tabla de muestreo
// SIG-TA-102, ej. "Manos Alimentadores"): esto es el contexto más amplio
// de dónde ocurrió (ej. "Línea 3", "Envasadora 2", "Bodega A"). Es una
// instancia de crearCatalogoAutocompletable() — mismo trato que
// supervisores.js: se busca, se autocompleta, y si es nuevo se da de
// alta solo al guardar.
// =========================================================

import { crearCatalogoAutocompletable } from "./catalogo-autocompletable.js";

export const COLEC_AREAS_MAQUINA = "areas_maquina_hisopado";

const catalogo = crearCatalogoAutocompletable({
  coleccion: COLEC_AREAS_MAQUINA,
  nombreEntidad: "área o máquina",
  etiquetaNuevo: "Nueva área/máquina",
  fraseNueva: "nueva área o máquina",
  fraseSinRegistros: "Todavía no hay áreas o máquinas registradas.",
});

/** Clave canónica para comparar dos nombres sin importar tildes ni mayúsculas. */
export const normalizarClaveAreaMaquina = catalogo.normalizarClave;

/** Carga el catálogo (una vez por sesión) como { mapa, lista }. */
export const obtenerCatalogoAreasMaquina = catalogo.obtenerCatalogo;

/** Devuelve el nombre ya registrado que corresponde, o el escrito en mayúsculas. */
export const normalizarNombreAreaMaquina = catalogo.normalizarNombre;

/** Da de alta el área/máquina si es nueva. Devuelve el nombre canónico. */
export const registrarAreaMaquinaSiNoExiste = catalogo.registrarSiNoExiste;

/**
 * Buscador con autocompletado en tiempo real para el campo Área/Máquina:
 * desplegable de coincidencias + badge "Registrado: X" / "Nueva
 * área/máquina" (ver autocompletado.js).
 */
export const configurarAutocompletadoAreaMaquina = catalogo.configurarBuscador;
