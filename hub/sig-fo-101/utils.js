// =========================================================
// utils.js
// Helpers puros compartidos por las tres páginas de SIG-FO-101.
// =========================================================

let contenedorToasts = null;

function obtenerContenedorToasts() {
  if (contenedorToasts && document.body.contains(contenedorToasts)) return contenedorToasts;
  contenedorToasts = document.createElement("div");
  contenedorToasts.className = "toast-contenedor";
  contenedorToasts.setAttribute("aria-live", "polite");
  document.body.appendChild(contenedorToasts);
  return contenedorToasts;
}

/** Notificación flotante y auto-descartable. tipo: "info" | "exito" | "error". */
export function mostrarToast(mensaje, tipo = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  toast.setAttribute("role", tipo === "error" ? "alert" : "status");
  toast.textContent = mensaje;
  obtenerContenedorToasts().appendChild(toast);

  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("toast--visible")));

  const cerrar = () => {
    toast.classList.remove("toast--visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  };
  const temporizador = setTimeout(cerrar, tipo === "error" ? 6000 : 3500);
  toast.addEventListener("click", () => {
    clearTimeout(temporizador);
    cerrar();
  });
}

/** Vibración háptica breve, si el dispositivo la soporta (no falla si no). */
export function vibrar(patron = 30) {
  if (navigator.vibrate) navigator.vibrate(patron);
}

/** Escapa texto para insertarlo seguro dentro de innerHTML. */
export function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}

/** Iniciales (hasta 2 letras) de un nombre, para avatares. */
export function iniciales(nombre = "") {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "—";
  return (partes[0][0] + (partes[1]?.[0] || "")).toUpperCase();
}

/** Formatea un Timestamp de Firestore (o Date) a "dd/mm/aaaa hh:mm". */
export function formatearFechaHora(valor) {
  if (!valor) return "—";
  const fecha = valor.toDate ? valor.toDate() : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleString("es-GT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formatea una fecha ISO "YYYY-MM-DD" a "dd/mm/aaaa" sin desfases de huso horario. */
export function formatearFechaCorta(iso) {
  if (!iso) return "—";
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}

/** Traduce los códigos de error más comunes de Firebase Auth a español llano. */
export function traducirErrorAuth(error) {
  const mapa = {
    "auth/invalid-email": "El correo no tiene un formato válido.",
    "auth/user-disabled": "Esta cuenta está deshabilitada.",
    "auth/user-not-found": "No existe una cuenta con ese correo.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos e intenta de nuevo.",
    "auth/network-request-failed": "No hay conexión a internet.",
  };
  return mapa[error?.code] || error?.message || "No se pudo iniciar sesión.";
}
