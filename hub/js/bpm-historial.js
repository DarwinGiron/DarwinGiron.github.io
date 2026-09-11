// =========================================================
// bpm-historial.js
// Controlador de sig-fo-116/historial.html — lista de auditorías de BPM
// guardadas, una por mes (id del documento = "aaaa-mm").
//
// Antes esta lista solo existía como una hoja emergente dentro del propio
// formulario (sig-fo-116/index.html), sin página propia ni forma de
// llegar a "Nuevo registro" desde ahí — a diferencia de todos los demás
// formatos del hub, que sí tienen su Historial con ese botón. Esta
// página iguala ese patrón; el formulario ahora solo enlaza aquí (ver
// bpm-historial en index.html) y admite abrir un mes puntual con
// index.html?mes=aaaa-mm (ver app.js).
// =========================================================

import { protegerPagina, cerrarSesion, esRolDeGestion, etiquetaRol } from "./auth.js";
import { listarAuditoriasBpm, eliminarAuditoriaBpm } from "./firestore.js";
import { escaparHtml, iniciales, mostrarCarga, mostrarToast } from "./utils.js";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const textoUsuario = document.getElementById("texto-usuario");
const avatarUsuario = document.getElementById("avatar-usuario");
const btnSalir = document.getElementById("btn-salir");
const filtroBusqueda = document.getElementById("filtro-busqueda");
const lista = document.getElementById("lista-auditorias");

const estado = { auditorias: [], puedeEliminar: false };

protegerPagina({}, async ({ user, perfil }) => {
  const nombreVisible = perfil.nombre || user.email;
  textoUsuario.textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  avatarUsuario.textContent = iniciales(nombreVisible);
  estado.puedeEliminar = esRolDeGestion(perfil.rol);

  mostrarCarga(lista, "Cargando auditorías…");

  try {
    estado.auditorias = await listarAuditoriasBpm();
    renderizar();
  } catch (error) {
    console.error("No se pudieron cargar las auditorías de BPM:", error);
    lista.innerHTML = "";
    mostrarToast("No se pudo cargar el historial. Verifica tu conexión.", "error");
  }
});

btnSalir.addEventListener("click", () => cerrarSesion());
filtroBusqueda.addEventListener("input", renderizar);

/** "aaaa-mm" -> "Septiembre 2026". Si el id no tiene ese formato, se muestra tal cual. */
function tituloMes(claveMes) {
  const partes = /^(\d{4})-(\d{2})$/.exec(claveMes || "");
  if (!partes) return claveMes || "—";
  const numMes = parseInt(partes[2], 10);
  const nombreMes = numMes >= 1 && numMes <= 12 ? MESES[numMes - 1] : partes[2];
  return `${nombreMes} ${partes[1]}`;
}

/** Mismos umbrales que sig-fo-116/app.js (qualify), para que el % se vea igual en las dos pantallas. */
function calificar(pct) {
  if (pct === null) return { etiqueta: "Sin datos", clase: "badge-neutro" };
  if (pct <= 70) return { etiqueta: "No cumple", clase: "badge-error" };
  if (pct <= 80) return { etiqueta: "Regular", clase: "badge-alerta" };
  return { etiqueta: pct <= 92 ? "Satisfactorio" : "Excelente", clase: "badge-exito" };
}

function calcularAvance(responses) {
  let si = 0, no = 0, respondidas = 0, total = 0;
  Object.values(responses || {}).forEach((r) => {
    total++;
    if (r && r.value) {
      respondidas++;
      if (r.value === "SI") si++;
      else if (r.value === "NO") no++;
    }
  });
  const denom = si + no;
  const pct = denom > 0 ? Math.round((si / denom) * 1000) / 10 : null;
  return { pct, respondidas, total };
}

/** Texto donde busca el filtro. */
function textoBuscable(auditoria) {
  return `${tituloMes(auditoria.id)} ${auditoria.meta?.auditor || ""} ${
    auditoria.meta?.area || ""
  }`.toLowerCase();
}

function renderizar() {
  const termino = filtroBusqueda.value.trim().toLowerCase();
  const visibles = termino
    ? estado.auditorias.filter((a) => textoBuscable(a).includes(termino))
    : estado.auditorias;

  if (visibles.length === 0) {
    lista.innerHTML = `
      <div class="tarjeta">
        <p class="texto-suave texto-sm mb-0">
          ${termino ? "Ninguna auditoría coincide con la búsqueda." : "Todavía no hay auditorías de BPM guardadas."}
        </p>
      </div>
    `;
    return;
  }

  lista.innerHTML = visibles.map(tarjetaDe).join("");
}

function tarjetaDe(auditoria) {
  const { pct, respondidas, total } = calcularAvance(auditoria.responses);
  const cal = calificar(pct);

  return `
    <section class="tarjeta">
      <div class="flex-entre mb-1">
        <h2 class="tarjeta__titulo mb-0">${escaparHtml(tituloMes(auditoria.id))}</h2>
        <span class="badge ${cal.clase}">${cal.etiqueta}${pct !== null ? ` · ${pct}%` : ""}</span>
      </div>
      <p class="texto-suave texto-sm mb-0">${respondidas}/${total} preguntas respondidas</p>

      <div class="fichas" style="grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); margin-top: var(--e3);">
        ${fichaHtml("Auditor", auditoria.meta?.auditor)}
        ${fichaHtml("Área / línea", auditoria.meta?.area)}
      </div>

      <div class="flex-fin" style="gap: var(--e2); margin-top: var(--e3);">
        ${
          estado.puedeEliminar
            ? `<button type="button" class="btn btn-peligro btn-sm btn-ancho-auto" data-eliminar="${escaparHtml(auditoria.id)}">Eliminar</button>`
            : ""
        }
        <a href="index.html?mes=${encodeURIComponent(auditoria.id)}" class="btn btn-secundario btn-sm btn-ancho-auto">Abrir →</a>
      </div>
    </section>
  `;
}

function fichaHtml(etiqueta, valor) {
  return `
    <div class="ficha">
      <div class="ficha__etiqueta">${escaparHtml(etiqueta)}</div>
      <div class="ficha__valor" style="font-size: var(--txt-md);">${escaparHtml(valor || "—")}</div>
    </div>`;
}

lista.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-eliminar]");
  if (!boton) return;

  const claveMes = boton.dataset.eliminar;
  if (!confirm(`¿Eliminar la auditoría de ${tituloMes(claveMes)}? No se puede deshacer.`)) return;

  boton.disabled = true;
  try {
    await eliminarAuditoriaBpm(claveMes);
    estado.auditorias = estado.auditorias.filter((a) => a.id !== claveMes);
    renderizar();
    mostrarToast("Auditoría eliminada.", "exito");
  } catch (error) {
    console.error("No se pudo eliminar la auditoría de BPM:", error);
    mostrarToast("No se pudo eliminar. Verifica tu conexión.", "error");
    boton.disabled = false;
  }
});
