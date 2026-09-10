// =========================================================
// hub.js
// Controlador de index.html (Hub Principal de Formatos)
// =========================================================

import { protegerPagina, cerrarSesion, esRolDeGestion, etiquetaRol } from "./auth.js";
import { iniciales } from "./utils.js";

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");
const linkAdminSuperior = document.getElementById("link-admin-superior");

const perfilMenu = document.getElementById("perfil-menu");
const perfilMenuPanel = document.getElementById("perfil-menu-panel");
const perfilMenuNombre = document.getElementById("perfil-menu-nombre");

const seccionGestionSgi = document.getElementById("seccion-gestion-sgi");
const seccionAdministracion = document.getElementById("seccion-administracion");

const modalAccion = document.getElementById("modal-accion-formato");
const modalTitulo = document.getElementById("modal-formato-titulo");
const btnCerrarModalAccion = document.getElementById("btn-cerrar-modal-accion");

const btnModalNuevo = document.getElementById("btn-modal-nuevo");
const btnModalHistorial = document.getElementById("btn-modal-historial-completo");

protegerPagina({}, ({ user, perfil }) => {
  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);
  perfilMenuNombre.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;

  if (!esRolDeGestion(perfil.rol) && linkAdminSuperior) {
    linkAdminSuperior.classList.add("oculto");
  }

  // El bloque "Gestión SGI" (validación de hallazgos e indicadores, que
  // viven en la app de Reportes) arranca oculto en el HTML y solo se
  // descubre para admin/coordinador: el inspector no valida nada, él
  // levanta reportes desde el botón dentro del checklist.
  if (esRolDeGestion(perfil.rol) && seccionGestionSgi) {
    seccionGestionSgi.classList.remove("oculto");
  }

  // "Administración" (gestión de usuarios) sigue el mismo criterio: solo los
  // roles de gestión administran cuentas.
  if (esRolDeGestion(perfil.rol) && seccionAdministracion) {
    seccionAdministracion.classList.remove("oculto");
  }

  inicializarTarjetas();
});

btnSalir.addEventListener("click", () => cerrarSesion());

/* ---------------------------------------------------------
   Menú de perfil: el avatar es el disparador; Configuraciones y Salir
   viven adentro, en vez de sueltos en la cabecera.
   --------------------------------------------------------- */

avatarUsuario.addEventListener("click", (evento) => {
  evento.stopPropagation();
  const abierto = !perfilMenuPanel.classList.toggle("oculto");
  avatarUsuario.setAttribute("aria-expanded", String(abierto));
});

document.addEventListener("click", (evento) => {
  if (!perfilMenu.contains(evento.target)) {
    perfilMenuPanel.classList.add("oculto");
    avatarUsuario.setAttribute("aria-expanded", "false");
  }
});

function cerrarModal() {
  modalAccion.classList.add("oculto");
}

btnCerrarModalAccion.addEventListener("click", cerrarModal);
modalAccion.addEventListener("click", (e) => {
  if (e.target === modalAccion) cerrarModal();
});

function inicializarTarjetas() {
  document.querySelectorAll("[data-formato-tarjeta]").forEach((tarjeta) => {
    tarjeta.addEventListener("click", (e) => {
      e.preventDefault();
      const formatName = tarjeta.dataset.formatName;
      const formatNew = tarjeta.dataset.formatNew;
      const formatHistory = tarjeta.dataset.formatHistory;

      modalTitulo.textContent = formatName;
      btnModalNuevo.href = formatNew;
      btnModalHistorial.href = formatHistory;

      modalAccion.classList.remove("oculto");
    });
  });
}
