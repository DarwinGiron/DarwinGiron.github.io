// =========================================================
// auth.js
// Sesión, resolución de rol y "guardas" de página.
// =========================================================

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

// Rutas absolutas: el hub vive siempre en /hub/ dentro de este sitio.
//
// Antes se calculaba la profundidad contando carpetas de la URL, algo que
// funcionaba cuando el hub ERA la raíz del sitio. Al quedar montado bajo
// /hub/, ese cálculo se corrió un nivel: desde /hub/index.html devolvía
// "../login.html" -> /login.html, que es el login del OTRO sistema
// (Reportes), no el del hub. Con rutas absolutas no hay nada que calcular
// y da igual si el servidor recorta la extensión o la barra final.
export function obtenerRutaLogin() {
  return "/hub/login.html";
}

export function obtenerRutaHub() {
  return "/hub/index.html";
}

export const ROLES = {
  admin: { etiqueta: "Administrador", gestion: true },
  coordinador: { etiqueta: "Coordinador de SGIA", gestion: true },
  inspector: { etiqueta: "Inspector", gestion: false },
};

export const ROLES_GESTION = Object.keys(ROLES).filter((r) => ROLES[r].gestion);

export function esRolDeGestion(rol) {
  return Boolean(ROLES[rol]?.gestion);
}

export function etiquetaRol(rol) {
  return ROLES[rol]?.etiqueta || rol || "—";
}

export async function iniciarSesion(email, password) {
  const credencial = await signInWithEmailAndPassword(auth, email, password);
  return credencial.user;
}

export async function cerrarSesion() {
  await signOut(auth);
  window.location.href = obtenerRutaLogin();
}

export async function obtenerPerfil(uid) {
  const referencia = doc(db, "usuarios", uid);
  const snap = await getDoc(referencia);
  if (!snap.exists()) return null;
  return { uid, ...snap.data() };
}

export function paginaPorRol(rol) {
  return obtenerRutaHub();
}

export function protegerPagina({ rolesPermitidos } = {}, alListo) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = obtenerRutaLogin();
      return;
    }

    let perfil;
    try {
      perfil = await obtenerPerfil(user.uid);
    } catch (error) {
      console.error("No se pudo cargar el perfil de usuario:", error);
      window.location.href = obtenerRutaLogin();
      return;
    }

    if (!perfil || perfil.activo === false) {
      await signOut(auth);
      window.location.href = obtenerRutaLogin();
      return;
    }

    if (rolesPermitidos && !rolesPermitidos.includes(perfil.rol)) {
      window.location.href = paginaPorRol(perfil.rol);
      return;
    }

    alListo({ user, perfil });
  });
}

export function redirigirSiYaHaySesion() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    try {
      const perfil = await obtenerPerfil(user.uid);
      if (perfil && perfil.activo !== false) {
        window.location.href = paginaPorRol(perfil.rol);
      }
    } catch (error) {
      console.error("No se pudo verificar la sesión existente:", error);
    }
  });
}
