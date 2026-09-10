// =========================================================
// utils.js
// Funciones puras de cálculo/formato + pequeños helpers de UI
// compartidos por todas las páginas.
// =========================================================

/* ---------------------------------------------------------
   Fechas
   --------------------------------------------------------- */

/** Convierte un Timestamp de Firestore o Date a un objeto Date. */
export function aFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor.toDate === "function") return valor.toDate();
  return new Date(valor);
}

/** Formatea fecha y hora legibles en español (dd/mm/aaaa hh:mm). */
export function formatearFechaHora(valor) {
  const fecha = aFecha(valor);
  if (!fecha) return "—";
  return fecha.toLocaleString("es-GT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formatea solo la fecha (dd/mm/aaaa). */
export function formatearFecha(valor) {
  const fecha = aFecha(valor);
  if (!fecha) return "—";
  return fecha.toLocaleDateString("es-GT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * "2026-07-24" -> "24/07/2026", sin pasar por Date.
 * Úsala para fechas guardadas como texto plano (p. ej. `fechaInspeccion`,
 * que viene de un <input type="date">) — a diferencia de un Timestamp de
 * Firestore, ese string no lleva hora, y new Date("2026-07-24") lo
 * interpreta como medianoche UTC: en cualquier zona horaria detrás de UTC
 * (Guatemala, UTC-6) eso cae en el día anterior al mostrarlo en local.
 */
export function formatearFechaISOCorta(iso) {
  if (!iso) return "—";
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}

/** Devuelve la fecha actual en formato yyyy-mm-dd, útil para inputs type="date". */
export function fechaHoyISO() {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

/* ---------------------------------------------------------
   Identificadores
   --------------------------------------------------------- */

/** Genera un id corto único para usar en elementos del editor antes de guardarlos. */
export function generarId(prefijo = "id") {
  const azar = Math.random().toString(36).slice(2, 9);
  return `${prefijo}-${Date.now().toString(36)}-${azar}`;
}

/* ---------------------------------------------------------
   Aplicabilidad por área
   No todos los procesos evalúan lo mismo: cada sección declara en qué
   áreas aplica, y un aspecto puede acotarse aún más dentro de su sección.
   --------------------------------------------------------- */

/**
 * ¿Este elemento (sección o aspecto) se evalúa en el área indicada?
 * Sin lista `areas` definida, se asume que aplica a todas — así una
 * sección nueva creada por el admin es visible mientras no la restrinja.
 */
export function aplicaAlArea(elemento, areaId) {
  const areas = elemento?.areas;
  if (!Array.isArray(areas) || areas.length === 0) return true;
  return areas.includes(areaId);
}

/**
 * Devuelve solo las secciones y aspectos que corresponden a un área.
 * Función pura: no modifica la estructura original.
 * Se usa tanto para dibujar el checklist como para calcular el resultado,
 * de modo que el puntaje jamás incluya aspectos que no se le mostraron
 * al inspector.
 */
export function filtrarEstructuraPorArea(secciones, areaId) {
  return (secciones || [])
    .filter((seccion) => aplicaAlArea(seccion, areaId))
    .map((seccion) => ({
      ...seccion,
      aspectos: (seccion.aspectos || []).filter((a) => aplicaAlArea(a, areaId)),
    }))
    .filter((seccion) => seccion.aspectos.length > 0);
}

/* ---------------------------------------------------------
   Cálculo de resultados de una inspección
   --------------------------------------------------------- */

/**
 * Calcula el resultado de una inspección a partir de las respuestas dadas
 * y la estructura de secciones/aspectos de la versión del checklist usada.
 *
 * @param {Object} respuestas - mapa aspectoId -> { valor: 'cumple'|'no_cumple'|'na', observacion }
 * @param {Array} secciones - secciones[].aspectos[] de la versión del checklist
 * @param {Array} criterios - criterios[] con { valor, puntua }
 * @returns {{ totalEvaluados:number, cumple:number, noCumple:number, na:number,
 *             puntajePonderado:number, porcentajeCumplimiento:number, pendientes:number }}
 */
export function calcularResultado(respuestas, secciones, criterios) {
  const puntuables = new Set(
    criterios.filter((c) => c.puntua).map((c) => c.valor)
  );

  let cumple = 0;
  let noCumple = 0;
  let na = 0;
  let pendientes = 0;
  let pesoEvaluado = 0;
  let pesoCumplido = 0;

  for (const seccion of secciones) {
    for (const aspecto of seccion.aspectos) {
      const respuesta = respuestas[aspecto.id];
      const peso = typeof aspecto.peso === "number" ? aspecto.peso : 1;

      if (!respuesta || !respuesta.valor) {
        pendientes += 1;
        continue;
      }
      if (respuesta.valor === "na") {
        na += 1;
        continue;
      }
      if (respuesta.valor === "cumple") {
        cumple += 1;
      } else if (respuesta.valor === "no_cumple") {
        noCumple += 1;
      }

      if (puntuables.has(respuesta.valor)) {
        pesoEvaluado += peso;
        if (respuesta.valor === "cumple") {
          pesoCumplido += peso;
        }
      }
    }
  }

  const totalEvaluados = cumple + noCumple;
  const porcentajeCumplimiento =
    pesoEvaluado > 0 ? Math.round((pesoCumplido / pesoEvaluado) * 1000) / 10 : 0;

  return {
    totalEvaluados,
    cumple,
    noCumple,
    na,
    pendientes,
    puntajePonderado: porcentajeCumplimiento,
    porcentajeCumplimiento,
  };
}

/**
 * Clasifica un porcentaje de cumplimiento en un estado.
 * Devuelve la clave técnica, la etiqueta visible y el icono, porque
 * un estado nunca debe comunicarse solo con color.
 */
export function clasificarCumplimiento(porcentaje) {
  if (porcentaje >= 90) {
    return { estado: "bien", etiqueta: "Conforme", icono: ICONOS.check };
  }
  if (porcentaje >= 75) {
    return { estado: "alerta", etiqueta: "Observado", icono: ICONOS.alerta };
  }
  return { estado: "critico", etiqueta: "Crítico", icono: ICONOS.critico };
}

/** Iconos en línea (trazo de 2px) usados junto a los colores de estado. */
export const ICONOS = {
  check: '<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m20 6-11 11-5-5"/></svg>',
  cruz: '<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  alerta:
    '<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  critico:
    '<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
  menos:
    '<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  carpeta:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>',
};

/**
 * Construye el anillo medidor de cumplimiento como SVG.
 * El relleno lleva la severidad; la pista es un paso más claro del mismo tono.
 * Siempre se acompaña de una etiqueta de texto (nunca color solo).
 *
 * @param {number} porcentaje - 0 a 100
 * @param {Object} [opciones]
 * @param {number} [opciones.tam=52] - diámetro en píxeles
 * @param {number} [opciones.grosor=5]
 * @param {string} [opciones.clase=""] - clase extra (p. ej. "medidor--lg")
 */
export function medidorCumplimiento(porcentaje, opciones = {}) {
  const { tam = 52, grosor = 5, clase = "" } = opciones;
  const valor = Math.max(0, Math.min(100, Number(porcentaje) || 0));
  const { estado, etiqueta } = clasificarCumplimiento(valor);

  const radio = (tam - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const avance = circunferencia * (1 - valor / 100);
  const centro = tam / 2;

  return `
    <div class="medidor ${clase}" data-estado="${estado}"
         role="img" aria-label="Cumplimiento ${valor} por ciento — ${etiqueta}">
      <svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" aria-hidden="true">
        <circle class="medidor__pista" cx="${centro}" cy="${centro}" r="${radio}"
                fill="none" stroke-width="${grosor}" />
        <circle class="medidor__valor" cx="${centro}" cy="${centro}" r="${radio}"
                fill="none" stroke-width="${grosor}"
                stroke-dasharray="${circunferencia.toFixed(2)}"
                stroke-dashoffset="${avance.toFixed(2)}" />
      </svg>
      <span class="medidor__texto" aria-hidden="true">${valor}%</span>
    </div>
  `;
}

/** Iniciales de un nombre, para los avatares (máximo 2 letras). */
export function iniciales(nombre) {
  const partes = (nombre || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (partes.length === 0) return "?";
  return partes.map((p) => p[0].toUpperCase()).join("");
}

/** Cuenta cuántos aspectos totales tiene un arreglo de secciones. */
export function contarAspectos(secciones) {
  return secciones.reduce((total, s) => total + s.aspectos.length, 0);
}

/* ---------------------------------------------------------
   Helpers de UI (estados de carga / error / vacío)
   --------------------------------------------------------- */

/** Inserta un indicador de carga dentro de un contenedor. */
export function mostrarCarga(contenedor, mensaje = "Cargando…") {
  contenedor.innerHTML = `
    <div class="estado-carga">
      <div class="spinner" role="status" aria-label="Cargando"></div>
      <p>${escaparHtml(mensaje)}</p>
    </div>
  `;
}

/**
 * Esqueletos de carga para listas: comunican la forma del contenido
 * que está por llegar, en vez de una rueda genérica.
 */
export function mostrarEsqueleto(contenedor, filas = 4) {
  contenedor.innerHTML =
    `<span class="solo-lectores" role="status">Cargando…</span>` +
    Array.from({ length: filas }, () => '<div class="esqueleto esqueleto-fila"></div>').join("");
}

/** Inserta un mensaje de error dentro de un contenedor. */
export function mostrarErrorEn(contenedor, mensaje) {
  contenedor.innerHTML = `
    <div class="alerta alerta-error" role="alert">
      ${ICONOS.critico}<span>${escaparHtml(mensaje)}</span>
    </div>`;
}

/** Inserta un mensaje de estado vacío, con icono, dentro de un contenedor. */
export function mostrarVacio(contenedor, mensaje) {
  contenedor.innerHTML = `
    <div class="estado-vacio">
      <span class="estado-vacio__icono">${ICONOS.carpeta}</span>
      <p class="mb-0">${escaparHtml(mensaje)}</p>
    </div>
  `;
}

/**
 * Contenedor único de toasts, creado la primera vez que hace falta y
 * reutilizado después. Vive fuera del flujo normal de la página (por
 * eso no está en ningún HTML): un aviso flotante no debe depender de
 * qué tan abajo haya scrolleado el usuario.
 */
let contenedorToasts = null;

function obtenerContenedorToasts() {
  if (contenedorToasts && document.body.contains(contenedorToasts)) return contenedorToasts;
  contenedorToasts = document.createElement("div");
  contenedorToasts.className = "toast-contenedor";
  contenedorToasts.setAttribute("aria-live", "polite");
  document.body.appendChild(contenedorToasts);
  return contenedorToasts;
}

/**
 * Muestra un aviso flotante (toast) que se retira solo a los pocos
 * segundos, o al tocarlo. Reemplaza al viejo banner fijo en la parte de
 * arriba de la página: con botones de acción fijos al pie (Guardar,
 * Enviar…) ese banner quedaba fuera de vista justo cuando más importaba.
 */
export function mostrarToast(mensaje, tipo = "info") {
  const icono =
    tipo === "error" ? ICONOS.critico : tipo === "exito" ? ICONOS.check : ICONOS.alerta;

  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  toast.setAttribute("role", tipo === "error" ? "alert" : "status");
  toast.innerHTML = `${icono}<span>${escaparHtml(mensaje)}</span>`;

  obtenerContenedorToasts().appendChild(toast);

  // Un frame en blanco antes de animar la entrada, si no la transición no se ve.
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("toast--visible")));

  const cerrar = () => {
    toast.classList.remove("toast--visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  };
  const temporizador = setTimeout(cerrar, tipo === "error" ? 6000 : 4000);
  toast.addEventListener("click", () => {
    clearTimeout(temporizador);
    cerrar();
  });
}

// ---------------------------------------------------------------------------
// ENTRADA DE DATOS EN MAYÚSCULAS
// Los registros de transporte se llenan siempre en mayúsculas para que el
// mismo piloto, placa o proveedor no quede guardado de tres formas distintas
// ("Herber Hurtado", "HERBER HURTADO", "herber hurtado") y los listados y
// búsquedas los reconozcan como uno solo.
// ---------------------------------------------------------------------------

/** Pasa el campo a mayúsculas mientras se escribe, sin mover el cursor. */
export function forzarMayusculas(inputEl) {
  if (!inputEl) return;
  inputEl.addEventListener("input", () => {
    const enMayusculas = inputEl.value.toUpperCase();
    if (enMayusculas === inputEl.value) return;
    // Cambiar a mayúsculas no altera el largo del texto, así que la posición
    // del cursor se puede restituir tal cual: sin esto saltaría al final y
    // sería imposible corregir en medio de la palabra.
    const inicio = inputEl.selectionStart;
    const fin = inputEl.selectionEnd;
    inputEl.value = enMayusculas;
    inputEl.setSelectionRange(inicio, fin);
  });
}

/**
 * Da forma de placa: "C-" seguido de números y letras en mayúscula.
 * Acepta que la escriban con o sin el prefijo ("570bxs" y "c570bxs" quedan
 * igual: C-570BXS) y descarta guiones o espacios de más.
 */
export function formatearPlaca(texto) {
  const limpio = String(texto ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const sinPrefijo = limpio.startsWith("C") ? limpio.slice(1) : limpio;
  return sinPrefijo ? "C-" + sinPrefijo : "";
}

/** Aplica el formato de placa a un campo mientras se escribe. */
export function forzarFormatoPlaca(inputEl) {
  if (!inputEl) return;
  const aplicar = () => {
    const conFormato = formatearPlaca(inputEl.value);
    if (conFormato !== inputEl.value) inputEl.value = conFormato;
  };
  inputEl.addEventListener("input", aplicar);
  inputEl.addEventListener("blur", aplicar);
}

/** Evita inyección de HTML al insertar texto proveniente de datos del usuario. */
export function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}

/** Traduce los códigos de error más comunes de Firebase Auth a mensajes en español. */
export function traducirErrorAuth(error) {
  const codigo = error?.code || "";
  const mapa = {
    "auth/invalid-email": "El correo electrónico no es válido.",
    "auth/user-disabled": "Esta cuenta ha sido deshabilitada.",
    "auth/user-not-found": "No existe una cuenta con ese correo.",
    "auth/wrong-password": "La contraseña es incorrecta.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/too-many-requests": "Demasiados intentos. Intenta de nuevo más tarde.",
    "auth/network-request-failed": "Sin conexión a internet. Verifica tu red.",
    // Códigos propios del alta de cuentas (invitar usuario)
    "auth/email-already-in-use": "Ya existe una cuenta con ese correo electrónico.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/operation-not-allowed":
      "El acceso con correo y contraseña no está habilitado en Firebase Authentication.",
  };
  return mapa[codigo] || "Ocurrió un error. Intenta de nuevo.";
}
