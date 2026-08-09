// =========================================================
// auth.js
// Sesión, perfil y control de acceso por rol para SIG-FO-101.
//
// Roles compartidos con SIG-FO-115 (misma colección "usuarios"): los
// valores reales que existen en Firestore son "inspector", "admin" y
// "coordinador" — este formato no distingue entre "admin" y "coordinador",
// ambos cuentan como el rol "administrador" que pide la especificación
// (el mismo criterio que ya usa SIG-FO-115 para su "esGestor()").
// =========================================================

import { auth, db } from "./firebase-config.js";

/** ¿Este valor de rol tiene permisos de administrador (editar/eliminar todo)? */
export function esAdministrador(rol) {
  return rol === "admin" || rol === "administrador" || rol === "coordinador";
}

/**
 * Exige sesión iniciada y perfil activo antes de mostrar la página.
 * Si no hay sesión, redirige a login.html. Si el perfil no existe o está
 * inactivo, cierra la sesión y redirige con un aviso.
 *
 * @param {{soloAdmin?: boolean}|((ctx: {user, perfil}) => void)} opcionesOCallback -
 *   por compatibilidad hacia atrás también acepta pasar el callback directo,
 *   sin opciones, como se usaba antes de existir "soloAdmin".
 * @param {(ctx: {user, perfil}) => void} [callback]
 */
export function protegerPagina(opcionesOCallback, callback) {
  const opciones = typeof opcionesOCallback === "function" ? {} : opcionesOCallback || {};
  const alListo = typeof opcionesOCallback === "function" ? opcionesOCallback : callback;

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    try {
      const snap = await db.collection("usuarios").doc(user.uid).get();
      if (!snap.exists) {
        throw new Error("Tu cuenta no tiene un perfil asignado. Contacta al administrador.");
      }
      const perfil = snap.data();
      if (perfil.activo === false) {
        throw new Error("Tu cuenta está inactiva. Contacta al administrador.");
      }
      if (opciones.soloAdmin && !esAdministrador(perfil.rol)) {
        throw new Error("Solo un administrador puede ver esta página.");
      }
      alListo({ user, perfil });
    } catch (error) {
      console.error("No se pudo verificar la sesión:", error);
      const esPermiso = opciones.soloAdmin && (error.message || "").includes("administrador");
      alert(error.message || "No se pudo verificar tu sesión.");
      if (esPermiso) {
        window.location.href = "index.html";
      } else {
        await auth.signOut();
        window.location.href = "login.html";
      }
    }
  });
}

export function cerrarSesion() {
  auth.signOut().then(() => {
    window.location.href = "login.html";
  });
}
