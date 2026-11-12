// =========================================================
// tarimas-historial.js
// Controlador de sig-fo-118/historial.html — registros de tarimas ya
// guardados, agrupados por día (un registro por día con sus callejones),
// filtrables por período, con el indicador del mes.
//
// Fuente: tarimasDia (un documento por día). Mientras queden registros del
// formato antiguo (registrosTarimas, uno por callejón) también se muestran, y
// un gestor puede pasarlos al formato por día con un botón.
// =========================================================

import { protegerPagina, cerrarSesion, esRolDeGestion, etiquetaRol } from "./auth.js";
import {
  listarTarimasDia,
  eliminarCallejonTarimas,
  listarRegistrosTarimas,
  eliminarRegistroTarimas,
  migrarRegistrosTarimas,
} from "./firestore.js";
import { escaparHtml, formatearFechaISOCorta, iniciales, mostrarCarga, mostrarToast } from "./utils.js";

const $ = (id) => document.getElementById(id);
const filtroPeriodo = $("filtro-periodo");
const filtroBusqueda = $("filtro-busqueda");
const lista = $("lista-registros");
const resumen = $("resumen-periodo");

const estado = { registros: [], puedeEliminar: false, usuario: null, perfil: null };

protegerPagina({}, async ({ user, perfil }) => {
  const nombreVisible = perfil.nombre || user.email;
  $("texto-usuario").textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  $("avatar-usuario").textContent = iniciales(nombreVisible);
  estado.puedeEliminar = esRolDeGestion(perfil.rol);
  filtroPeriodo.value = new Date().toISOString().slice(0, 7);

  estado.usuario = user;
  estado.perfil = perfil;
  await cargar();
});

async function cargar() {
  mostrarCarga(lista, "Cargando registros…");
  try {
    const [porDia, antiguos] = await Promise.all([
      listarTarimasDia(),
      // Los antiguos son opcionales: si fallan, el historial nuevo se ve igual.
      listarRegistrosTarimas(
        esRolDeGestion(estado.perfil.rol) ? {} : { inspectorUid: estado.usuario.uid }
      ).catch((error) => {
        console.warn("No se pudieron leer los registros antiguos de tarimas:", error);
        return [];
      }),
    ]);
    estado.registros = [...porDia, ...antiguos];
    pintarAvisoMigracion(antiguos);
    renderizar();
  } catch (error) {
    console.error("No se pudieron cargar los registros de tarimas:", error);
    lista.innerHTML = "";
    mostrarToast("No se pudo cargar el historial. Verifica tu conexión.", "error");
  }
}

/** Botón (solo gestión) para pasar los registros antiguos al formato por día. */
function pintarAvisoMigracion(antiguos) {
  const aviso = $("aviso-migracion");
  if (!esRolDeGestion(estado.perfil.rol) || antiguos.length === 0) {
    aviso.classList.add("oculto");
    return;
  }
  aviso.classList.remove("oculto");
  aviso.innerHTML = `
    <p class="texto-sm mb-1">Hay <strong>${antiguos.length}</strong> callejón(es) guardados con el formato anterior
      (un registro por callejón). Pásalos al registro por día para que queden juntos.</p>
    <button type="button" class="btn btn-dorado btn-sm btn-ancho-auto" id="btn-migrar">Pasar al registro por día</button>`;
  $("btn-migrar").addEventListener("click", async (e) => {
    if (!confirm(`¿Pasar ${antiguos.length} registro(s) antiguos al registro por día?`)) return;
    e.target.disabled = true;
    try {
      const n = await migrarRegistrosTarimas(antiguos);
      mostrarToast(`Listo: ${n} callejón(es) pasados al registro por día.`, "exito");
      await cargar();
    } catch (error) {
      console.error("No se pudo migrar:", error);
      mostrarToast("No se pudo completar. ¿Ya se publicaron las reglas nuevas de Firestore?", "error");
      e.target.disabled = false;
    }
  });
}

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
  // Un registro por día: los callejones del mismo día van juntos en una tarjeta.
  const dias = new Map();
  visibles.forEach((r) => {
    if (!dias.has(r.fecha)) dias.set(r.fecha, []);
    dias.get(r.fecha).push(r);
  });
  lista.innerHTML = [...dias.entries()]
    .sort((x, y) => (x[0] < y[0] ? 1 : -1))
    .map(([fecha, regs]) => tarjetaDia(fecha, regs))
    .join("");
}

const suma = (regs, campo) => regs.reduce((a, r) => a + (r[campo] || 0), 0);

function tarjetaDia(fecha, regs) {
  const insp = suma(regs, "totalInspeccionadas");
  const dan = suma(regs, "danadas");
  const pct = insp > 0 ? (dan / insp) * 100 : 0;
  const unicos = (campo) => [...new Set(regs.map(campo).filter(Boolean))].join(", ");
  const filas = [...regs]
    .sort((x, y) => String(x.callejon).localeCompare(String(y.callejon), "es", { numeric: true }))
    .map(filaCallejon)
    .join("");
  return `
    <section class="tarjeta">
      <div class="flex-entre mb-1">
        <h2 class="tarjeta__titulo mb-0">${escaparHtml(nombreDia(fecha))}</h2>
        <span class="badge ${nivel(pct)}">${pct.toFixed(1)}%</span>
      </div>
      <p class="texto-suave texto-sm">
        ${regs.length} callejón(es) · ${insp.toLocaleString()} inspeccionadas · ${dan.toLocaleString()} dañadas
        (🪵 ${suma(regs, "cntMadera")} · 🔵 ${suma(regs, "cntPlastica")})<br />
        ${escaparHtml(unicos((r) => r.bodega))} · ${escaparHtml(unicos((r) => r.evaluador || r.inspectorNombre))}
      </p>
      ${filas}
    </section>`;
}

function filaCallejon(r) {
  const hallazgos = (r.hallazgos || [])
    .map((h) => `<span class="badge badge-neutro">${escaparHtml(h)}</span>`)
    .join(" ");
  const eliminar = estado.puedeEliminar
    ? `<button type="button" class="btn btn-peligro btn-sm btn-ancho-auto" data-eliminar="${escaparHtml(r.id)}" title="Eliminar este callejón">Eliminar</button>`
    : "";
  return `
    <div class="editor-item flex-entre" style="margin-bottom: var(--e2); gap: var(--e2);">
      <div style="min-width:0;">
        <strong>${escaparHtml(r.callejon)}</strong> · <span class="texto-sm">${escaparHtml(r.bodega)}</span>
        <div class="texto-suave texto-sm">
          ${r.totalInspeccionadas} insp. · ${r.danadas} dañadas (🪵 ${r.cntMadera || 0} · 🔵 ${r.cntPlastica || 0})
          · ${escaparHtml(r.evaluador || r.inspectorNombre || "—")}
        </div>
        ${hallazgos ? `<div style="margin-top: 4px;">${hallazgos}</div>` : ""}
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap: var(--e1, 4px);">
        <span class="badge ${nivel(r.porcentajeDano || 0)}">${(r.porcentajeDano || 0).toFixed(1)}%</span>
        ${eliminar}
      </div>
    </div>`;
}

/** "2026-11-12" -> "Jueves 12/11/2026" */
function nombreDia(iso) {
  const [a, m, d] = String(iso).split("-").map(Number);
  if (!a || !m || !d) return formatearFechaISOCorta(iso);
  const dia = new Date(a, m - 1, d).toLocaleDateString("es", { weekday: "long" });
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${formatearFechaISOCorta(iso)}`;
}

lista.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("[data-eliminar]");
  if (!boton) return;
  if (!confirm("¿Eliminar este callejón del registro del día? No se puede deshacer.")) return;

  boton.disabled = true;
  try {
    const id = boton.dataset.eliminar;
    const registro = estado.registros.find((r) => r.id === id);
    if (registro && !registro.legado) await eliminarCallejonTarimas(registro.fecha, registro.clave);
    else await eliminarRegistroTarimas(id);
    estado.registros = estado.registros.filter((r) => r.id !== boton.dataset.eliminar);
    renderizar();
    mostrarToast("Registro eliminado.", "exito");
  } catch (error) {
    console.error("No se pudo eliminar el registro:", error);
    mostrarToast("No se pudo eliminar el registro.", "error");
    boton.disabled = false;
  }
});
