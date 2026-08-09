// =========================================================
// configuraciones.js
// Controlador de configuraciones.html: solo verifica sesión y rol —
// las dos tarjetas son enlaces normales a admin.html (SIG-FO-115) y
// sig-fo-101/admin.html, cada uno con su propio editor.
// =========================================================

import { protegerPagina, cerrarSesion, ROLES_GESTION, etiquetaRol } from "./auth.js";
import { iniciales } from "./utils.js";

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");

protegerPagina({ rolesPermitidos: ROLES_GESTION }, ({ user, perfil }) => {
  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);
});

btnSalir.addEventListener("click", () => cerrarSesion());
