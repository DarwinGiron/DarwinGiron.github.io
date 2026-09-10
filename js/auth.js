// ============================================================================
// AUTH.JS - Autenticación y control de roles
// ============================================================================
// Modelo de datos: colección "usuarios", documento con ID = uid de Firebase Auth
// { correo: string, rol: "admin"|"inspector", activo: bool, nombre: string,
//   creadoPor: uid, fechaCreacion: timestamp }
// ============================================================================

/**
 * Devuelve el documento de usuario (rol, activo, nombre) del usuario autenticado.
 * Si no existe el documento o el usuario está inactivo, cierra la sesión.
 */
async function obtenerPerfilUsuario(uid) {
  const doc = await colUsuarios.doc(uid).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

/**
 * Lee configuracion/permisosInspector (los permisos configurables del rol
 * Inspector, editados por el admin desde Configuraciones -> Permisos).
 * Si el documento no existe todavía, devuelve un objeto vacío (sin permisos).
 */
async function obtenerPermisosInspector() {
  const doc = await colConfiguracion.doc("permisosInspector").get();
  return doc.exists ? doc.data() : {};
}

/**
 * Protege una página: exige sesión iniciada y, opcionalmente, un módulo
 * específico habilitado para el rol del usuario.
 * Redirige a login.html si no hay sesión, o a la página que le corresponde
 * si no tiene acceso al módulo pedido.
 * @param {string|null} modulo clave del módulo requerido ("dashboard",
 *   "validacion", "configuraciones", "informes") o null (cualquier usuario
 *   autenticado y activo, admin o inspector, sin importar permisos: usado
 *   por inspector.html, que siempre es de acceso obligatorio).
 * @param {function} callback recibe (user, perfil, permisos)
 */
function protegerPagina(modulo, callback) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = rutaRelativaIndex();
      return;
    }
    try {
      const perfil = await obtenerPerfilUsuario(user.uid);
      if (!perfil) {
        mostrarErrorSesion("Su cuenta no tiene un perfil asignado en el sistema. Contacte al coordinador SGI.");
        return;
      }
      if (perfil.activo === false) {
        mostrarErrorSesion("Su cuenta ha sido desactivada. Contacte al coordinador SGI.");
        return;
      }

      // El admin siempre tiene acceso a todo; nunca se le exige permiso.
      if (!modulo || perfil.rol === "admin") {
        const permisos = perfil.rol === "admin" ? null : await obtenerPermisosInspector();
        callback(user, perfil, permisos);
        return;
      }

      // Un inspector: verificar que el módulo pedido esté habilitado.
      const permisos = await obtenerPermisosInspector();
      if (permisos[modulo] !== true) {
        window.location.href = rutaInspector();
        return;
      }
      callback(user, perfil, permisos);
    } catch (e) {
      console.error("Error validando sesión:", e);
      mostrarErrorSesion("Error de conexión al validar su sesión. Verifique su internet e intente de nuevo.");
    }
  });
}

/**
 * Oculta del menú los enlaces <a data-modulo="..."> a los que el usuario
 * actual (inspector) no tiene acceso. El admin y los enlaces sin
 * data-modulo nunca se ocultan.
 *
 * data-modulo="nuevo-reporte" es un caso especial: a propósito NO tiene
 * checkbox en la pestaña Permisos (configuracion/permisosInspector nunca
 * trae esa clave), así que para cualquier inspector siempre evalúa a "sin
 * acceso" y el enlace queda oculto de forma permanente. La página
 * inspector.html sigue funcionando igual para ellos vía el botón "+ Agregar
 * reporte" de SIG-FO-115 (que abre la URL directo, sin pasar por el nav);
 * lo único que cambia es que no aparece como opción de menú para crear un
 * reporte "suelto". El admin conserva el enlace siempre (bypass de rol).
 * @param {object} perfil perfil del usuario actual
 * @param {object|null} permisos permisos del inspector (null para admin)
 */
function aplicarVisibilidadNav(perfil, permisos) {
  document.querySelectorAll("[data-modulo]").forEach((el) => {
    const clave = el.getAttribute("data-modulo");
    const tieneAcceso = perfil.rol === "admin" || (permisos && permisos[clave] === true);
    el.style.display = tieneAcceso ? "" : "none";
  });
}

// ---------------------------------------------------------------------------
// MENÚ PRINCIPAL
// Una sola lista para las 6 pantallas del sistema de Reportes. Antes el menú
// estaba escrito a mano en cada página y se había ido descuadrando: había tres
// órdenes distintos y "Nuevo reporte" aparecía en unas páginas y en otras no.
// Al generarlo desde aquí, el listado es idéntico en todas y solo cambia cuál
// queda marcada como activa.
//
// "Nuevo reporte" NO va en el menú a propósito: se crea desde el botón de la
// pantalla de Reportes. El enlace directo a inspector.html sigue funcionando
// (ej. el "+ Agregar reporte" de SIG-FO-115).
// ---------------------------------------------------------------------------
const MODULOS_NAV = [
  { etiqueta: "← Formatos", archivo: null, href: "/hub/index.html", modulo: null },
  { etiqueta: "Dashboard", archivo: "dashboard.html", enAdmin: true, modulo: "dashboard" },
  { etiqueta: "Reportes", archivo: "reportes.html", enAdmin: false, modulo: null },
  { etiqueta: "Validación", archivo: "validacion.html", enAdmin: true, modulo: "validacion" },
  { etiqueta: "Configuraciones", archivo: "catalogos.html", enAdmin: true, modulo: "configuraciones" },
  { etiqueta: "Informes", archivo: "informes.html", enAdmin: true, modulo: "informes" }
];

/** Ruta a un archivo del menú desde la página actual (las de admin viven un
 *  nivel más adentro). */
function rutaDeModulo(item) {
  if (item.href) return item.href;
  const estoyEnAdmin = window.location.pathname.includes("/admin/");
  if (item.enAdmin) return estoyEnAdmin ? item.archivo : "admin/" + item.archivo;
  return estoyEnAdmin ? "../" + item.archivo : item.archivo;
}

const ICONO_CAMPANA = '<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
const ICONO_SALIR = '<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';

/**
 * Dibuja el menú principal dentro de <nav data-nav-principal> y aplica la
 * visibilidad por permisos. Reemplaza a la llamada suelta de
 * aplicarVisibilidadNav en las páginas del sistema de Reportes.
 */
function montarNavPrincipal(perfil, permisos) {
  const nav = document.querySelector("nav[data-nav-principal]");
  if (nav) {
    const archivoActual = window.location.pathname.split("/").pop() || "index.html";
    nav.innerHTML = MODULOS_NAV.map((item) => {
      const activo = item.archivo === archivoActual ? ' class="activo"' : "";
      const modulo = item.modulo ? ` data-modulo="${item.modulo}"` : "";
      // Se ocultan de entrada los módulos con permiso: así no parpadean
      // visibles mientras se resuelve la sesión.
      const oculto = item.modulo ? ' style="display:none;"' : "";
      return `<a href="${rutaDeModulo(item)}"${activo}${modulo}${oculto}>${item.etiqueta}</a>`;
    }).join("") + `
      <div class="campana-contenedor">
        <button class="btn-campana" id="btn-campana" type="button" aria-label="Notificaciones">
          ${ICONO_CAMPANA}
          <span class="campana-badge" id="campana-badge" style="display:none;">0</span>
        </button>
        <div class="campana-panel" id="campana-panel" style="display:none;"></div>
      </div>
      <button class="btn-salir" onclick="cerrarSesionYSalir()">${ICONO_SALIR} Salir</button>`;
  }
  aplicarVisibilidadNav(perfil, permisos);
}

function rutaRelativaIndex() {
  // Calcula ruta relativa al login de Reportes según profundidad de carpetas.
  // index.html en la raíz del sitio ahora es el hub de formatos (redirige a
  // hub/index.html); el login propio de Reportes se movió a login.html
  // para no chocar con esa ruta.
  return window.location.pathname.includes("/admin/") ? "../login.html" : "login.html";
}
function rutaAdminDashboard() {
  return window.location.pathname.includes("/admin/") ? "dashboard.html" : "admin/dashboard.html";
}
function rutaInspector() {
  return window.location.pathname.includes("/admin/") ? "../inspector.html" : "inspector.html";
}

function mostrarErrorSesion(mensaje) {
  const cont = document.getElementById("app") || document.body;
  cont.innerHTML = `
    <div class="pantalla-error">
      <p>⚠️ ${mensaje}</p>
      <button onclick="cerrarSesionYSalir()" class="btn btn-primario">Cerrar sesión</button>
    </div>`;
}

function cerrarSesionYSalir() {
  auth.signOut().finally(() => (window.location.href = rutaRelativaIndex()));
}

/**
 * Inicia sesión con correo/contraseña. Usado desde login.html.
 */
async function iniciarSesion(correo, contrasena) {
  return auth.signInWithEmailAndPassword(correo, contrasena);
}

/**
 * Envía correo de restablecimiento de contraseña (usado también para que el
 * inspector recién invitado establezca su contraseña la primera vez).
 */
async function enviarRestablecimiento(correo) {
  return auth.sendPasswordResetEmail(correo);
}
