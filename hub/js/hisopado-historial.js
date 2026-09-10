// =========================================================
// hisopado-historial.js
// Controlador de hisopado/historial.html — lista de tomas de hisopado.
//
// Alcance: un gestor ve todas las tomas; el inspector solo las suyas.
// El filtro por inspectorUid no es cosmético, las reglas de Firestore
// rechazan la consulta completa si un inspector la omite.
// =========================================================

import { protegerPagina, cerrarSesion, esRolDeGestion, etiquetaRol } from "./auth.js";
import { listarHisopados, eliminarHisopado } from "./firestore.js";
import {
  escaparHtml,
  formatearFechaISOCorta,
  iniciales,
  mostrarCarga,
  mostrarToast,
} from "./utils.js";

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");
const filtroBusqueda = document.getElementById("filtro-busqueda");
const lista = document.getElementById("lista-hisopados");

const estado = {
  registros: [],
  puedeEliminar: false,
};

protegerPagina({}, async ({ user, perfil }) => {
  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);
  estado.puedeEliminar = esRolDeGestion(perfil.rol);

  mostrarCarga(lista, "Cargando registros…");

  try {
    estado.registros = await listarHisopados(
      esRolDeGestion(perfil.rol) ? {} : { inspectorUid: user.uid }
    );
    renderizar();
  } catch (error) {
    console.error("No se pudieron cargar los hisopados:", error);
    lista.innerHTML = "";
    mostrarToast("No se pudo cargar el historial. Verifica tu conexión.", "error");
  }
});

btnSalir.addEventListener("click", () => cerrarSesion());
filtroBusqueda.addEventListener("input", renderizar);

/** Texto donde busca el filtro: todo lo que el usuario podría teclear de memoria. */
function textoBuscable(registro) {
  const muestras = (registro.muestras || [])
    .map((m) => `${m.zonaNombre || ""} ${m.tipoNombre || ""} ${m.supervisor || ""} ${m.resultado}`)
    .join(" ");
  return `${registro.proceso || ""} ${registro.inspectorNombre || ""} ${muestras}`.toLowerCase();
}

function renderizar() {
  const termino = filtroBusqueda.value.trim().toLowerCase();
  const visibles = termino
    ? estado.registros.filter((r) => textoBuscable(r).includes(termino))
    : estado.registros;

  if (visibles.length === 0) {
    lista.innerHTML = `
      <div class="tarjeta">
        <p class="texto-suave texto-sm mb-0">
          ${termino ? "Ningún registro coincide con la búsqueda." : "Todavía no hay tomas de hisopado registradas."}
        </p>
      </div>
    `;
    return;
  }

  lista.innerHTML = visibles.map(tarjetaDe).join("");
}

/**
 * El límite de una muestra. Los registros viejos lo traían como texto
 * libre ("< 10 UFC/cm²"); los nuevos lo guardan como rango numérico
 * heredado de la tabla de muestreo, así que se soportan los dos.
 */
function textoLimiteMuestra(m) {
  if (m.limiteMin !== undefined && m.limiteMin !== null) {
    return `${m.limiteMin} a ${m.limiteMax} ${m.unidad || "RLU"}`;
  }
  return m.limite || "—";
}

function tarjetaDe(registro) {
  const muestras = registro.muestras || [];
  const desviaciones = muestras.filter((m) => m.desviacion).length;

  const filas = muestras
    .map(
      (m) => `
        <div class="editor-item" style="margin-bottom: var(--e2);">
          <div class="flex-entre mb-1">
            <strong class="texto-sm">${escaparHtml(m.zonaNombre || m.areaMaquina || "—")}</strong>
            <span class="badge ${m.desviacion ? "badge-dorado" : "badge-exito"}">
              ${m.desviacion ? "Fuera del límite" : "Conforme"}
            </span>
          </div>
          <div class="texto-suave texto-sm">Tipo: ${escaparHtml(m.tipoNombre || "—")}</div>
          <div class="texto-suave texto-sm">Supervisor: ${escaparHtml(m.supervisor || "—")}</div>
          <div class="texto-suave texto-sm">Límite: ${escaparHtml(textoLimiteMuestra(m))}</div>
          <div class="texto-suave texto-sm">Resultado: ${escaparHtml(
            m.resultado === undefined || m.resultado === "" ? "—" : `${m.resultado} ${m.unidad || ""}`.trim()
          )}</div>
        </div>
      `
    )
    .join("");

  // Los registros viejos guardaban las correcciones aparte de las
  // observaciones; ahora es un solo campo, así que se muestran juntos.
  const notas = [registro.correcciones, registro.observaciones].filter(Boolean).join(" · ");
  const observaciones = notas
    ? `
      <div class="alerta alerta-info" style="margin-top: var(--e2);">
        <strong>Acciones inmediatas y observaciones:</strong> ${escaparHtml(notas)}
      </div>
    `
    : "";

  const botonEliminar = estado.puedeEliminar
    ? `<button type="button" class="btn btn-peligro btn-sm btn-ancho-auto" data-eliminar="${escaparHtml(
        registro.id
      )}">Eliminar</button>`
    : "";

  return `
    <section class="tarjeta">
      <div class="flex-entre mb-1">
        <h2 class="tarjeta__titulo mb-0">${formatearFechaISOCorta(registro.fecha)}</h2>
        <span class="badge ${desviaciones ? "badge-dorado" : "badge-exito"}">
          ${desviaciones ? `${desviaciones} desviación(es)` : "Sin desviaciones"}
        </span>
      </div>
      <p class="texto-suave texto-sm">
        ${registro.turno ? `Turno ${escaparHtml(String(registro.turno))} · ` : ""}
        ${escaparHtml(registro.inspectorNombre || "—")}
      </p>
      ${filas}
      ${observaciones}
      ${botonEliminar}
    </section>
  `;
}

lista.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-eliminar]");
  if (!boton) return;

  const id = boton.dataset.eliminar;
  if (!confirm("¿Eliminar este registro de hisopado? No se puede deshacer.")) return;

  boton.disabled = true;
  try {
    await eliminarHisopado(id);
    estado.registros = estado.registros.filter((r) => r.id !== id);
    renderizar();
    mostrarToast("Registro eliminado.", "exito");
  } catch (error) {
    console.error("No se pudo eliminar el hisopado:", error);
    mostrarToast("No se pudo eliminar el registro.", "error");
    boton.disabled = false;
  }
});
