// =========================================================
// usuarios.js
// Alta de usuarios desde el panel de administración.
//
// Problema que resuelve: con el SDK de cliente de Firebase, llamar a
// createUserWithEmailAndPassword() inicia sesión automáticamente con la
// cuenta recién creada, lo que expulsaría al administrador de su sesión.
// La solución estándar es crear una SEGUNDA instancia temporal de la app
// de Firebase: la cuenta se crea en esa instancia aislada y la sesión del
// administrador en la instancia principal queda intacta.
// =========================================================

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { auth, firebaseConfig } from "./firebase-config.js";
import { crearPerfilUsuario } from "./firestore.js";

/**
 * Genera una contraseña temporal legible para compartir con el usuario
 * invitado (cumple el mínimo de 6 caracteres que exige Firebase).
 */
export function generarContrasenaTemporal() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numeros = "23456789";
  const azar = (cadena) => cadena[Math.floor(Math.random() * cadena.length)];

  let clave = "";
  for (let i = 0; i < 4; i += 1) clave += azar(letras);
  for (let i = 0; i < 4; i += 1) clave += azar(numeros);
  return clave;
}

/**
 * Crea la cuenta de acceso y su perfil en Firestore.
 * El administrador NO pierde su sesión.
 *
 * @param {Object} datos
 * @param {string} datos.nombre
 * @param {string} datos.email
 * @param {string} datos.rol - "inspector" | "admin"
 * @param {string} datos.contrasenaTemporal
 * @param {boolean} [datos.enviarCorreo=true] - enviar correo para que fije su propia contraseña
 * @returns {Promise<{uid:string, correoEnviado:boolean}>}
 */
export async function invitarUsuario({
  nombre,
  email,
  rol,
  contrasenaTemporal,
  enviarCorreo = true,
}) {
  // Nombre único por invocación: evita chocar con una instancia previa
  // que no se haya alcanzado a liberar.
  const appTemporal = initializeApp(firebaseConfig, `alta-${Date.now()}`);
  const authTemporal = getAuth(appTemporal);

  let uid;
  try {
    const credencial = await createUserWithEmailAndPassword(
      authTemporal,
      email,
      contrasenaTemporal
    );
    uid = credencial.user.uid;
  } finally {
    // La instancia temporal se libera siempre, haya o no fallado el alta.
    try {
      await signOut(authTemporal);
    } catch (error) {
      console.warn("No se pudo cerrar la sesión temporal:", error);
    }
    await deleteApp(appTemporal);
  }

  // El perfil se escribe con la sesión del administrador (instancia principal),
  // que es la que las reglas de seguridad autorizan a escribir en /usuarios.
  await crearPerfilUsuario(uid, { nombre, email, rol });

  let correoEnviado = false;
  if (enviarCorreo) {
    try {
      await sendPasswordResetEmail(auth, email);
      correoEnviado = true;
    } catch (error) {
      // No es un fallo crítico: la cuenta ya quedó creada y utilizable
      // con la contraseña temporal.
      console.warn("No se pudo enviar el correo de contraseña:", error);
    }
  }

  return { uid, correoEnviado };
}
