// =========================================================
// tarimas-historial.js
// Controlador de sig-fo-118/historial.html — registros de tarimas ya
// guardados, filtrables por período, con el indicador del mes.
//
// Alcance: un gestor ve todos; el inspector solo los suyos (las reglas de
// Firestore rechazan la consulta si un inspector omite el filtro).
// =========================================================

import { protegerPagina, cerrarSesion, esRolDeGestion, etiquetaRol } from "./auth.js";
import { listarRegistrosTarimas, eliminarRegistroTarimas } from "./firestore.js";
import { escaparHtml, formatearFechaISOCorta, iniciales, mostrarCarga, mostrarToast } from "./utils.js";

const $ = (id) => document.getElementById(id);
const filtroPeriodo = $("filtro-periodo");
const filtroBusqueda = $("filtro-busqueda");
const lista = $("lista-registros");
const resumen = $("resumen-periodo");

const estado = { registros: [], puedeEliminar: false };

protegerPagina({}, async ({ user, perfil }) => {
  const nombreVisible = perfil.nombre || user.email;
  $("texto-usuario").textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  $("avatar-usuario").textContent = iniciales(nombreVisible);
  estado.puedeEliminar = esRolDeGestion(perfil.rol);
  filtroPeriodo.value = new Date().toISOString().slice(0, 7);

  mostrarCarga(lista, "Cargando registros…");
  try {
    estado.registros = await listarRegistrosTarimas(
      esRolDeGestion(perfil.rol) ? {} : { inspectorUid: user.uid }
    );
    renderizar();
  } catch (error) {
    console.error("No se pudieron cargar los registros de tarimas:", error);
    lista.innerHTML = "";
    mostrarToast("No se pudo cargar el historial. Verifica tu conexión.", "error");
  }
});

$("btn-salir").addEventListener("click", () => cerrarSesion());
filtroPeriodo.addEventListener("input", renderizar);
filtroBusqueda.addEventListener("input", renderizar);

function nivel(pct) {
  return pct > 15 ? "badge-error" : pct > 5 ? "badge-dorado" : "badge-exito";
}

function renderizar() {
  const periodo = filtroPeriodo.value;
  const termino = filtroBusqueda.value.trim().toLowerCase();
  const visibles = estado.registros.filter((r) => {
    if (periodo && r.periodo !== periodo) return false;
    if (!termino) return true;
    return `${r.bodega} ${r.callejon} ${r.evaluador} ${r.inspectorNombre} ${(r.hallazgos || []).join(" ")}`
      .toLowerCase()
      .includes(termino);
  });

  const insp = visibles.reduce((a, r) => a + (r.totalInspeccionadas || 0), 0);
  const dan = visibles.reduce((a, r) => a + (r.danadas || 0), 0);
  const madera = visibles.reduce((a, r) => a + (r.cntMadera || 0), 0);
  const plastica = visibles.reduce((a, r) => a + (r.cntPlastica || 0), 0);
  const pct = insp > 0 ? (dan / insp) * 100 : 0;
  resumen.innerHTML = `
    <div class="flex-entre mb-1">
      <h2 class="tarjeta__titulo mb-0">Indicador del período</h2>
      <span class="badge ${nivel(pct)}">${pct.toFixed(2)}%</span>
    </div>
    <p class="texto-suave texto-sm mb-0">
      ${visibles.length} callejón(es) · ${insp.toLocaleString()} inspeccionadas ·
      ${dan.toLocaleString()} dañadas (🪵 ${madera} · 🔵 ${plastica})
    </p>`;

  if (visibles.length === 0) {
    lista.innerHTML = `<div class="tarjeta"><p class="texto-suave texto-sm mb-0">No hay registros para este filtro.</p></div>`;
    return;
  }
  lista.innerHTML = visibles.map(tarjetaDe).join("");
}

function tarjetaDe(r) {
  const hallazgos = (r.hallazgos || [])
    .map((h) => `<span class="badge badge-neutro">${escaparHtml(h)}</span>`)
    .join(" ");
  const eliminar = estado.puedeEliminar
    ? `<button type="button" class="btn btn-peligro btn-sm btn-ancho-auto" data-eliminar="${escaparHtml(r.id)}">Eliminar</button>`
    : "";
  return `
    <section class="tarjeta">
      <div class="flex-entre mb-1">
        <h2 class="tarjeta__titulo mb-0">${escaparHtml(r.callejon)} · ${escaparHtml(r.bodega)}</h2>
        <span class="badge ${nivel(r.porcentajeDano || 0)}">${(r.porcentajeDano || 0).toFixed(1)}%</span>
      </div>
      <p class="texto-suave texto-sm">
        ${formatearFechaISOCorta(r.fecha)} · ${escaparHtml(r.evaluador || r.inspectorNombre || "—")}<br />
        ${r.totalInspeccionadas} inspeccionadas · ${r.danadas} dañadas
        (🪵 ${r.cntMadera || 0} · 🔵 ${r.cntPlastica || 0})
      </p>
      ${hallazgos ? `<div style="margin-bottom: var(--e2);">${hallazgos}</div>` : ""}
      ${eliminar}
    </section>`;
}

lista.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-eliminar]");
  if (!boton) return;
  if (!confirm("¿Eliminar este registro? No se puede deshacer.")) return;

  boton.disabled = true;
  try {
    await eliminarRegistroTarimas(boton.dataset.eliminar);
    estado.registros = estado.registros.filter((r) => r.id !== boton.dataset.eliminar);
    renderizar();
    mostrarToast("Registro eliminado.", "exito");
  } catch (error) {
    console.error("No se pudo eliminar el registro:", error);
    mostrarToast("No se pudo eliminar el registro.", "error");
    boton.disabled = false;
  }
});
