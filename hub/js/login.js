// =========================================================
// login.js
// Controlador de la página index.html (login).
// =========================================================

import { iniciarSesion, redirigirSiYaHaySesion } from "./auth.js";
import { mostrarToast, traducirErrorAuth } from "./utils.js";

const formulario = document.getElementById("form-login");
const campoEmail = document.getElementById("campo-email");
const campoPassword = document.getElementById("campo-password");
const botonEntrar = document.getElementById("btn-entrar");

// Si el usuario ya tiene una sesión activa, se le redirige de inmediato.
redirigirSiYaHaySesion();

formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const email = campoEmail.value.trim();
  const password = campoPassword.value;

  if (!email || !password) {
    mostrarToast("Ingresa tu correo y contraseña.", "error");
    return;
  }

  botonEntrar.disabled = true;
  botonEntrar.textContent = "Ingresando…";

  try {
    await iniciarSesion(email, password);
    // La redirección según rol la maneja redirigirSiYaHaySesion() al
    // disparar automáticamente el observador de sesión de Firebase Auth.
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    mostrarToast(traducirErrorAuth(error), "error");
    botonEntrar.disabled = false;
    botonEntrar.textContent = "Entrar";
    campoPassword.focus();
    campoPassword.select();
  }
});
