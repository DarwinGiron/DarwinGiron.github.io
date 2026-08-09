// =========================================================
// login.js
// Controlador de login.html.
// =========================================================

import { auth } from "./firebase-config.js";
import { mostrarToast, traducirErrorAuth } from "./utils.js";

const formLogin = document.getElementById("form-login");
const campoEmail = document.getElementById("campo-email");
const campoPassword = document.getElementById("campo-password");
const btnEntrar = document.getElementById("btn-entrar");

// Si ya hay sesión activa, no tiene sentido quedarse en el login.
auth.onAuthStateChanged((user) => {
  if (user) window.location.href = "index.html";
});

formLogin.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  btnEntrar.disabled = true;
  const etiquetaOriginal = btnEntrar.textContent;
  btnEntrar.textContent = "Entrando…";

  try {
    await auth.signInWithEmailAndPassword(campoEmail.value.trim(), campoPassword.value);
    window.location.href = "index.html";
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    mostrarToast(traducirErrorAuth(error), "error");
    btnEntrar.disabled = false;
    btnEntrar.textContent = etiquetaOriginal;
  }
});
