// =========================================================
// aviso-carga.js
// Bloque de error visible cuando una pantalla de administración no logra
// leer su configuración.
//
// Antes estas pantallas solo dejaban un toast y se quedaban en blanco:
// el toast se va solo, y lo que queda es una página vacía sin nada que
// explique qué pasó ni qué hacer. Ahora el error se queda escrito en la
// página, con el motivo probable y un botón para reintentar.
// =========================================================

import { escaparHtml } from "./utils.js";

/**
 * El caso más común en este proyecto no es una caída de red sino reglas
 * de Firestore sin publicar: la colección es nueva y el navegador recibe
 * "permission-denied". Decirlo con esas palabras ahorra el rato de
 * buscar el problema en el lugar equivocado.
 */
function motivoDe(error) {
  if (error?.code === "permission-denied") {
    return {
      titulo: "Sin permiso para leer esta configuración",
      detalle:
        "Es la causa más común cuando la colección es nueva: faltan publicar las reglas de Firestore (firebase deploy --only firestore:rules). También puede ser que tu cuenta ya no tenga rol de administrador o coordinador.",
    };
  }
  // "failed-precondition" en una consulta de Firestore casi siempre es un
  // índice que falta, no un problema de red: el mensaje del error trae el
  // enlace de la consola para crearlo, así que se muestra tal cual.
  if (error?.code === "failed-precondition") {
    return {
      titulo: "Falta un índice en Firestore",
      detalle:
        "Publica los índices del repositorio (firebase deploy --only firestore:indexes) o abre el enlace que trae este error: " +
        (error.message || ""),
    };
  }
  if (error?.code === "unavailable") {
    return {
      titulo: "No se pudo conectar con la base de datos",
      detalle: "Revisa tu conexión e inténtalo de nuevo.",
    };
  }
  return {
    titulo: "No se pudo cargar la configuración",
    detalle: error?.message || "Error desconocido.",
  };
}

/**
 * Escribe el error dentro del contenedor indicado y lo hace visible.
 *
 * @param {HTMLElement} contenedor - dónde se pinta (se le quita "oculto").
 * @param {Object} opciones
 * @param {Error} opciones.error
 * @param {Function} opciones.alReintentar - se llama al pulsar "Reintentar".
 */
export function mostrarBloqueError(contenedor, { error, alReintentar }) {
  if (!contenedor) return;

  const { titulo, detalle } = motivoDe(error);
  const codigo = error?.code ? ` (${escaparHtml(error.code)})` : "";

  contenedor.classList.remove("oculto");
  contenedor.innerHTML = `
    <div class="alerta alerta-error">
      <div>
        <strong>${escaparHtml(titulo)}${codigo}</strong>
        <p class="texto-sm" style="margin: 6px 0 0;">${escaparHtml(detalle)}</p>
        <button type="button" class="btn btn-secundario btn-sm btn-ancho-auto" style="margin-top:10px;">
          Reintentar
        </button>
      </div>
    </div>
  `;

  contenedor.querySelector("button").addEventListener("click", () => {
    contenedor.classList.add("oculto");
    contenedor.innerHTML = "";
    alReintentar();
  });
}
