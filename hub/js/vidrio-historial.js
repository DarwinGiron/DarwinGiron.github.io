// =========================================================
// vidrio-historial.js
// Controlador de vidrio-plastico/historial.html — inspecciones del
// SIG-FO-111 ya registradas.
//
// Alcance: un gestor ve todas; el inspector solo las suyas. El filtro por
// inspectorUid no es cosmético — las reglas de Firestore rechazan la
// consulta completa si un inspector lo omite.
// =========================================================

import { protegerPagina, cerrarSesion, esRolDeGestion, etiquetaRol } from "./auth.js";
import { listarRegistrosVidrio, eliminarRegistroVidrio } from "./firestore.js";
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
const lista = document.getElementById("lista-registros");

const estado = { registros: [], puedeEliminar: false };

protegerPagina({}, async ({ user, perfil }) => {
  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);
  estado.puedeEliminar = esRolDeGestion(perfil.rol);

  mostrarCarga(lista, "Cargando inspecciones…");

  try {
    estado.registros = await listarRegistrosVidrio(
      esRolDeGestion(perfil.rol) ? {} : { inspectorUid: user.uid }
    );
    renderizar();
  } catch (error) {
    console.error("No se pudieron cargar las inspecciones:", error);
    lista.innerHTML = "";
    mostrarToast("No se pudo cargar el historial. Verifica tu conexión.", "error");
  }
});

btnSalir.addEventListener("click", () => cerrarSesion());
filtroBusqueda.addEventListener("input", renderizar);

function textoBuscable(registro) {
  const puntos = (registro.puntos || [])
    .map((p) => `${p.localizacion} ${p.material} ${p.tipo} ${p.accion}`)
    .join(" ");
  return `${registro.inspeccionadoPor || ""} ${registro.inspectorNombre || ""} ${puntos}`.toLowerCase();
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
          ${termino ? "Ninguna inspección coincide con la búsqueda." : "Todavía no hay inspecciones registradas."}
        </p>
      </div>
    `;
    return;
  }

  lista.innerHTML = visibles.map(tarjetaDe).join("");
}

function tarjetaDe(registro) {
  const puntos = registro.puntos || [];
  const urgentes = puntos.filter((p) => p.riesgo === 3);

  // Solo se listan los puntos que ameritan lectura: un riesgo 1 en cien
  // puntos no aporta nada y volvería la tarjeta ilegible.
  const relevantes = puntos.filter((p) => p.riesgo >= 2);
  const filas = relevantes
    .map(
      (p) => `
      <div class="editor-item" style="margin-bottom: var(--e2);">
        <div class="flex-entre mb-1">
          <strong class="texto-sm">${escaparHtml(p.material || "—")}</strong>
          <span class="badge riesgo-badge riesgo-${p.riesgo}">Riesgo ${p.riesgo}</span>
        </div>
        <div class="texto-suave texto-sm">${escaparHtml(p.proceso || "")} · ${escaparHtml(
        p.localizacion || "—"
      )}</div>
        ${p.accion ? `<div class="texto-suave texto-sm">Acción: ${escaparHtml(p.accion)}</div>` : ""}
      </div>
    `
    )
    .join("");

  const comentarios = registro.comentarios
    ? `<div class="alerta alerta-info" style="margin-top: var(--e2);">
         <strong>Acción correctiva:</strong> ${escaparHtml(registro.comentarios)}
       </div>`
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
        <span class="badge ${urgentes.length ? "badge-dorado" : "badge-exito"}">
          ${urgentes.length ? `${urgentes.length} urgente(s)` : "Sin urgencias"}
        </span>
      </div>
      <p class="texto-suave texto-sm">
        ${escaparHtml(registro.inspeccionadoPor || registro.inspectorNombre || "—")} ·
        ${puntos.length} de ${registro.totalPuntos ?? puntos.length} puntos evaluados
        ${registro.revisadoPor ? ` · Revisó: ${escaparHtml(registro.revisadoPor)}` : ""}
      </p>
      ${filas || '<p class="texto-suave texto-sm">Todos los puntos evaluados quedaron en riesgo ligero.</p>'}
      ${comentarios}
      ${botonEliminar}
    </section>
  `;
}

lista.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-eliminar]");
  if (!boton) return;

  if (!confirm("¿Eliminar esta inspección? No se puede deshacer.")) return;

  boton.disabled = true;
  try {
    await eliminarRegistroVidrio(boton.dataset.eliminar);
    estado.registros = estado.registros.filter((r) => r.id !== boton.dataset.eliminar);
    renderizar();
    mostrarToast("Inspección eliminada.", "exito");
  } catch (error) {
    console.error("No se pudo eliminar la inspección:", error);
    mostrarToast("No se pudo eliminar la inspección.", "error");
    boton.disabled = false;
  }
});
