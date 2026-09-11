// =========================================================
// supervisores.js
// Catálogo de supervisores del hisopado: lista editable que se va
// alimentando sola. Es una instancia de crearCatalogoAutocompletable() —
// ver ese archivo para la lógica compartida con áreas/máquinas y
// proveedores de transporte.
//
// El campo del formulario busca en tiempo real sobre lo ya registrado y
// muestra un desplegable con las coincidencias más un badge "Registrado"
// o "Nuevo supervisor" — no un <datalist> nativo, que en tablet no
// distingue "ya existe" de "se va a crear". Un nombre nuevo se guarda al
// enviar la toma, así que la lista crece con el uso y nadie tiene que
// darla de alta en una pantalla aparte.
// =========================================================

import { crearCatalogoAutocompletable } from "./catalogo-autocompletable.js";

export const COLEC_SUPERVISORES = "supervisores_hisopado";

const catalogo = crearCatalogoAutocompletable({
  coleccion: COLEC_SUPERVISORES,
  nombreEntidad: "supervisor",
  etiquetaNuevo: "Nuevo supervisor",
});

/** Clave canónica para comparar dos nombres sin importar tildes ni mayúsculas. */
export const normalizarClaveSupervisor = catalogo.normalizarClave;

/** Carga el catálogo (una vez por sesión) como { mapa, lista }. */
export const obtenerCatalogoSupervisores = catalogo.obtenerCatalogo;

/** Devuelve el nombre ya registrado que corresponde, o el escrito en mayúsculas. */
export const normalizarNombreSupervisor = catalogo.normalizarNombre;

/** Da de alta al supervisor si es nuevo. Devuelve el nombre canónico. */
export const registrarSupervisorSiNoExiste = catalogo.registrarSiNoExiste;

/**
 * Buscador con autocompletado en tiempo real para el campo Supervisor:
 * desplegable de coincidencias + badge "Registrado: X" / "Nuevo
 * supervisor" (ver autocompletado.js).
 */
export const configurarAutocompletadoSupervisor = catalogo.configurarBuscador;
