/**
 * usuarios-admin.js — Gestión de usuarios del SGI (hub/usuarios.html).
 *
 * Estaba como una pestaña dentro del panel de SIG-FO-115, pero no tiene nada
 * que ver con ese checklist: son las cuentas de toda la aplicación. Se movió a
 * su propia pantalla, a la que se entra desde una tarjeta del inicio del hub.
 *
 * Solo entran los roles de gestión (administrador y coordinador de SGIA); a un
 * inspector protegerPagina lo devuelve al inicio.
 */
import {
  protegerPagina,
  cerrarSesion,
  ROLES,
  ROLES_GESTION,
  etiquetaRol,
} from "./auth.js";
import { listarUsuarios, guardarUsuario } from "./firestore.js";
import { invitarUsuario, generarContrasenaTemporal } from "./usuarios.js";
import { crearModalFormulario } from "./modal-formulario.js";
import { iniciales, mostrarToast, escaparHtml, traducirErrorAuth } from "./utils.js";

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");

const btnInvitarUsuario = document.getElementById("btn-invitar-usuario");
const chkMostrarInactivos = document.getElementById("chk-mostrar-inactivos");
const listaUsuarios = document.getElementById("lista-usuarios");

const { abrirModal } = crearModalFormulario({
  modalFondo: document.getElementById("modal-fondo"),
  modalTitulo: document.getElementById("modal-titulo"),
  formModal: document.getElementById("form-modal"),
  btnCerrarModal: document.getElementById("btn-cerrar-modal"),
});

const estado = {
  usuario: null,
  usuarios: [], // perfiles de /usuarios
};

protegerPagina({ rolesPermitidos: ROLES_GESTION }, async ({ user, perfil }) => {
  estado.usuario = user;

  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);

  await cargarUsuarios();
});

btnSalir.addEventListener("click", () => cerrarSesion());

/** Opciones de rol para los formularios (derivadas de la definición única en auth.js). */
const OPCIONES_ROL = Object.entries(ROLES).map(([value, def]) => ({
  value,
  label: def.etiqueta,
}));

async function cargarUsuarios() {
  try {
    estado.usuarios = await listarUsuarios();
    renderUsuarios();
  } catch (error) {
    console.error("Error al cargar usuarios:", error);
    listaUsuarios.innerHTML =
      '<p class="texto-suave texto-sm">No se pudieron cargar los usuarios.</p>';
  }
}

function renderUsuarios() {
  const mostrarInactivos = chkMostrarInactivos.checked;
  const visibles = estado.usuarios
    .filter((u) => mostrarInactivos || u.activo !== false)
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

  listaUsuarios.innerHTML = "";

  if (visibles.length === 0) {
    listaUsuarios.innerHTML = `<p class="texto-suave texto-sm">${
      mostrarInactivos
        ? "Todavía no hay usuarios registrados."
        : "No hay usuarios activos. Marca la casilla de arriba para ver los inactivos."
    }</p>`;
    return;
  }

  for (const u of visibles) {
    const esYoMismo = u.uid === estado.usuario.uid;

    const item = document.createElement("div");
    item.className = "editor-item";
    item.innerHTML = `
      <div class="editor-item__cabecera">
        <span class="avatar" aria-hidden="true" style="margin-top:2px;">${escaparHtml(
          iniciales(u.nombre || u.email)
        )}</span>
        <span class="editor-item__titulo" style="flex-direction:column; align-items:flex-start; gap:var(--e1);">
          <span style="display:flex; align-items:center; flex-wrap:wrap; gap:var(--e2);">
            ${escaparHtml(u.nombre || u.email || u.uid)}
            <span class="badge ${
              ROLES[u.rol]?.gestion ? "badge-dorado" : "badge-marino"
            }">${escaparHtml(etiquetaRol(u.rol))}</span>
            ${u.activo === false ? '<span class="badge badge-neutro">Inactivo</span>' : ""}
            ${esYoMismo ? '<span class="badge badge-exito">Tú</span>' : ""}
          </span>
          <span class="texto-suave texto-xs" style="font-weight:400;">
            ${escaparHtml(u.email || "")}
          </span>
        </span>
        <div class="editor-item__acciones">
          <button class="btn btn-secundario btn-sm" data-accion="editar-usuario">Editar</button>
        </div>
      </div>
    `;

    item
      .querySelector("[data-accion='editar-usuario']")
      .addEventListener("click", () => abrirModalEditarUsuario(u));

    listaUsuarios.appendChild(item);
  }
}

chkMostrarInactivos.addEventListener("change", renderUsuarios);

/* ---- Invitar (alta de cuenta + perfil, sin pedir el UID) ---- */

btnInvitarUsuario.addEventListener("click", () => {
  abrirModal({
    titulo: "Invitar usuario",
    campos: [
      { name: "nombre", label: "Nombre completo", required: true, placeholder: "Ej: María López" },
      {
        name: "email",
        label: "Correo electrónico",
        type: "email",
        required: true,
        placeholder: "nombre@empresasgalindo.com",
        ayuda: "Será su usuario para iniciar sesión.",
      },
      {
        name: "rol",
        label: "Rol",
        type: "select",
        opciones: OPCIONES_ROL,
        ayuda:
          "Administrador y Coordinador de SGIA tienen el mismo acceso: gestionan el checklist, los usuarios y ven todas las inspecciones.",
      },
      {
        name: "contrasenaTemporal",
        label: "Contraseña temporal",
        required: true,
        ayuda: "Compártela con la persona; podrá cambiarla después.",
      },
      {
        name: "enviarCorreo",
        label: "Enviar correo para que defina su propia contraseña",
        type: "checkbox",
      },
    ],
    valores: {
      rol: "inspector",
      contrasenaTemporal: generarContrasenaTemporal(),
      enviarCorreo: true,
    },
    alGuardar: async ({ nombre, email, rol, contrasenaTemporal, enviarCorreo }) => {
      if (contrasenaTemporal.length < 6) {
        mostrarToast("La contraseña temporal debe tener al menos 6 caracteres.", "error");
        throw new Error("Contraseña demasiado corta");
      }

      try {
        const { correoEnviado } = await invitarUsuario({
          nombre,
          email,
          rol,
          contrasenaTemporal,
          enviarCorreo,
        });

        mostrarToast(`Usuario "${nombre}" creado como ${etiquetaRol(rol)}. Contraseña temporal: ${contrasenaTemporal}.` +
            (correoEnviado
              ? " Se le envió además un correo para definir su propia contraseña."
              : enviarCorreo
              ? " (No se pudo enviar el correo; comparte la contraseña temporal.)"
              : ""),
          "exito"
        );
        await cargarUsuarios();
      } catch (error) {
        console.error("Error al invitar usuario:", error);
        mostrarToast(traducirErrorAuth(error), "error");
        throw error;
      }
    },
  });
});

/* ---- Editar perfil existente ---- */

function abrirModalEditarUsuario(u) {
  const esYoMismo = u.uid === estado.usuario.uid;

  abrirModal({
    titulo: "Editar usuario",
    campos: [
      { name: "nombre", label: "Nombre completo", required: true },
      {
        name: "email",
        label: "Correo electrónico",
        type: "email",
        disabled: true,
        ayuda:
          "El correo de acceso solo puede cambiarse desde Firebase Authentication en la consola.",
      },
      {
        name: "rol",
        label: "Rol",
        type: "select",
        opciones: OPCIONES_ROL,
      },
      {
        name: "activo",
        label: "Cuenta activa",
        type: "checkbox",
        ayuda: esYoMismo
          ? "Es tu propia cuenta: si la desactivas o la pasas a Inspector, perderás el acceso a este panel."
          : "Una cuenta inactiva no puede iniciar sesión ni registrar inspecciones.",
      },
    ],
    valores: {
      nombre: u.nombre || "",
      email: u.email || "",
      rol: u.rol || "inspector",
      activo: u.activo !== false,
    },
    alGuardar: async ({ nombre, rol, activo }) => {
      // Evita que un gestor se quede sin acceso sin darse cuenta.
      if (esYoMismo && (!ROLES[rol]?.gestion || !activo)) {
        const aviso = !ROLES[rol]?.gestion
          ? "Estás quitándote a ti mismo los permisos de gestión."
          : "Estás desactivando tu propia cuenta.";
        if (!confirm(`${aviso} Perderás el acceso a este panel. ¿Continuar?`)) {
          throw new Error("Cancelado por el usuario");
        }
      }

      try {
        await guardarUsuario(u.uid, { nombre, rol, activo });
        mostrarToast("Usuario actualizado correctamente.", "exito");
        await cargarUsuarios();
      } catch (error) {
        console.error("Error al guardar usuario:", error);
        mostrarToast("No se pudo guardar el usuario.", "error");
        throw error;
      }
    },
  });
}
