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
  editarCallejonTarimas,
  moverDiaTarimas,
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

// esAdmin: editar, eliminar y cambiar la fecha de un día es solo del administrador.
const estado = { registros: [], esAdmin: false, usuario: null, perfil: null, abiertos: new Set(), editando: null };

const BODEGAS = ["Mercado Agrícola", "Mercado Nacional", "Producto en Proceso"];
const HALLAZGOS_BASE = [
  { v: "AS", d: "Astillada" },
  { v: "RO", d: "Rota" },
  { v: "HU", d: "Húmeda" },
  { v: "DE", d: "Deformada" },
  { v: "CI", d: "Clavos expuestos" },
  { v: "CO", d: "Manchada" },
];

protegerPagina({}, async ({ user, perfil }) => {
  const nombreVisible = perfil.nombre || user.email;
  $("texto-usuario").textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  $("avatar-usuario").textContent = iniciales(nombreVisible);
  estado.esAdmin = perfil.rol === "admin";
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
  if (!estado.esAdmin || antiguos.length === 0) {
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
  const abierto = estado.abiertos.has(fecha);
  const fechaSegura = escaparHtml(fecha);

  let detalle = "";
  if (abierto) {
    const filas = [...regs]
      .sort((x, y) => String(x.callejon).localeCompare(String(y.callejon), "es", { numeric: true }))
      .map(filaCallejon)
      .join("");
    // Cambiar la fecha mueve el día completo (solo si todo es del formato por día).
    const moverFecha = estado.esAdmin && regs.every((r) => !r.legado)
      ? `<div class="editor-item" style="margin-top: var(--e3);">
          <label class="texto-sm" for="mover-${fechaSegura}"><strong>Fecha del día</strong></label>
          <div class="flex-entre" style="gap: var(--e2); margin-top: 4px;">
            <div class="campo" style="flex:1; min-width:0; margin-bottom:0;"><input type="date" id="mover-${fechaSegura}" value="${fechaSegura}" /></div>
            <button type="button" class="btn btn-secundario btn-sm btn-ancho-auto" data-mover="${fechaSegura}">Cambiar fecha</button>
          </div>
          <p class="texto-suave texto-sm mb-0" style="margin-top: 4px;">Mueve todos los callejones de este día a la fecha nueva. Si esa fecha ya tiene registro, se juntan.</p>
        </div>`
      : "";
    detalle = `<div style="margin-top: var(--e3);">${filas}${moverFecha}</div>`;
  }

  // Toda la cabecera de la tarjeta (título, resumen y botón) abre o cierra el registro.
  return `
    <section class="tarjeta tarjeta-dia${abierto ? " tarjeta-dia--abierta" : ""}">
      <div class="tarjeta-dia__cabecera" data-ver="${fechaSegura}" role="button" tabindex="0" aria-expanded="${abierto}"
        aria-label="${abierto ? "Ocultar" : "Ver"} registro del ${escaparHtml(nombreDia(fecha))}">
      <div class="flex-entre mb-1">
        <h2 class="tarjeta__titulo mb-0">${escaparHtml(nombreDia(fecha))}</h2>
        <span class="badge ${nivel(pct)}">${pct.toFixed(1)}%</span>
      </div>
      <p class="texto-suave texto-sm">
        ${regs.length} callejón(es) · ${insp.toLocaleString()} inspeccionadas · ${dan.toLocaleString()} dañadas
        (🪵 ${suma(regs, "cntMadera")} · 🔵 ${suma(regs, "cntPlastica")})<br />
        ${escaparHtml(unicos((r) => r.bodega))} · ${escaparHtml(unicos((r) => r.evaluador || r.inspectorNombre))}
      </p>
      <span class="btn btn-secundario btn-sm btn-ancho-auto" aria-hidden="true">
        ${abierto ? "Ocultar registro ▴" : "Ver registro ▾"}
      </span>
      </div>
      ${detalle}
    </section>`;
}

function filaCallejon(r) {
  const hallazgos = (r.hallazgos || [])
    .map((h) => `<span class="badge badge-neutro">${escaparHtml(h)}</span>`)
    .join(" ");
  const id = escaparHtml(r.id);
  const acciones = estado.esAdmin
    ? `<div style="display:flex; gap: var(--e2); flex-wrap: wrap; margin-top: var(--e2);">
        ${r.legado ? "" : `<button type="button" class="btn btn-secundario btn-sm btn-ancho-auto" data-editar="${id}">Editar</button>`}
        <button type="button" class="btn btn-peligro btn-sm btn-ancho-auto" data-eliminar="${id}">Eliminar</button>
      </div>`
    : "";
  return `
    <div class="editor-item" style="margin-bottom: var(--e2);">
      <div class="flex-entre" style="gap: var(--e2); align-items: flex-start;">
        <div style="min-width:0;">
          <strong>${escaparHtml(r.callejon)}</strong> · <span class="texto-sm">${escaparHtml(r.bodega)}</span>
          <div class="texto-suave texto-sm">
            ${r.totalInspeccionadas} insp. · ${r.danadas} dañadas (🪵 ${r.cntMadera || 0} · 🔵 ${r.cntPlastica || 0})
            · ${escaparHtml(r.evaluador || r.inspectorNombre || "—")}
          </div>
          ${hallazgos ? `<div style="margin-top: 4px;">${hallazgos}</div>` : ""}
        </div>
        <span class="badge ${nivel(r.porcentajeDano || 0)}">${(r.porcentajeDano || 0).toFixed(1)}%</span>
      </div>
      ${acciones}
    </div>`;
}

/** "2026-11-12" -> "Jueves 12/11/2026" */
function nombreDia(iso) {
  const [a, m, d] = String(iso).split("-").map(Number);
  if (!a || !m || !d) return formatearFechaISOCorta(iso);
  const dia = new Date(a, m - 1, d).toLocaleDateString("es", { weekday: "long" });
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${formatearFechaISOCorta(iso)}`;
}

/* ---------- Acciones de la lista ---------- */

lista.addEventListener("click", async (evento) => {
  const ver = evento.target.closest("[data-ver]");
  if (ver) {
    const f = ver.dataset.ver;
    if (estado.abiertos.has(f)) estado.abiertos.delete(f); else estado.abiertos.add(f);
    renderizar();
    const misma = lista.querySelector(`[data-ver="${CSS.escape(f)}"]`);
    if (misma && ver === document.activeElement) misma.focus();
    return;
  }
  const editar = evento.target.closest("[data-editar]");
  if (editar) return abrirEdicion(estado.registros.find((r) => r.id === editar.dataset.editar));

  const mover = evento.target.closest("[data-mover]");
  if (mover) return moverDia(mover);

  const boton = evento.target.closest("[data-eliminar]");
  if (!boton) return;
  const registro = estado.registros.find((r) => r.id === boton.dataset.eliminar);
  if (!registro) return;
  if (!confirm(`¿Eliminar el callejón ${registro.callejon} del ${formatearFechaISOCorta(registro.fecha)}? No se puede deshacer.`)) return;

  boton.disabled = true;
  try {
    if (!registro.legado) await eliminarCallejonTarimas(registro.fecha, registro.clave);
    else await eliminarRegistroTarimas(registro.id);
    estado.registros = estado.registros.filter((r) => r.id !== registro.id);
    renderizar();
    mostrarToast(`Callejón ${registro.callejon} eliminado.`, "exito");
  } catch (error) {
    console.error("No se pudo eliminar el registro:", error);
    mostrarToast("No se pudo eliminar el registro.", "error");
    boton.disabled = false;
  }
});

async function moverDia(boton) {
  const desde = boton.dataset.mover;
  const hasta = document.getElementById(`mover-${desde}`).value;
  if (!hasta) return mostrarToast("Elige la fecha nueva.", "alerta");
  if (hasta === desde) return mostrarToast("Es la misma fecha.", "alerta");
  const yaHay = estado.registros.some((r) => r.fecha === hasta);
  const aviso = yaHay
    ? `El ${formatearFechaISOCorta(hasta)} ya tiene registro: los callejones se van a juntar con los de ese día. ¿Continuar?`
    : `¿Mover el registro del ${formatearFechaISOCorta(desde)} al ${formatearFechaISOCorta(hasta)}?`;
  if (!confirm(aviso)) return;

  boton.disabled = true;
  try {
    await moverDiaTarimas(desde, hasta);
    estado.registros = estado.registros.map((r) =>
      r.fecha === desde && !r.legado ? { ...r, fecha: hasta, periodo: hasta.slice(0, 7), id: `${hasta}/${r.clave}` } : r
    );
    estado.abiertos.delete(desde);
    estado.abiertos.add(hasta);
    // Si la fecha nueva cae en otro mes, se cambia el filtro para seguir viéndola.
    if (filtroPeriodo.value && filtroPeriodo.value !== hasta.slice(0, 7)) filtroPeriodo.value = hasta.slice(0, 7);
    renderizar();
    mostrarToast(`Registro movido al ${formatearFechaISOCorta(hasta)}.`, "exito");
  } catch (error) {
    console.error("No se pudo cambiar la fecha:", error);
    mostrarToast("No se pudo cambiar la fecha del registro.", "error");
    boton.disabled = false;
  }
}

/* ---------- Edición de un callejón (modal) ---------- */

const modal = $("modal-editar");
const formEditar = $("form-editar");

function abrirEdicion(r) {
  if (!r || !estado.esAdmin) return;
  estado.editando = { registro: r, hallazgos: new Set(r.hallazgos || []) };
  $("modal-editar-titulo").textContent = `Editar ${r.callejon} · ${formatearFechaISOCorta(r.fecha)}`;
  const opcionesBodega = [...new Set([...BODEGAS, r.bodega].filter(Boolean))]
    .map((b) => `<option ${b === r.bodega ? "selected" : ""}>${escaparHtml(b)}</option>`)
    .join("");
  formEditar.innerHTML = `
    <div class="campos-fila">
      <div class="campo"><label for="ed-callejon">Callejón</label>
        <input id="ed-callejon" type="text" value="${escaparHtml(r.callejon)}" autocomplete="off" /></div>
      <div class="campo"><label for="ed-bodega">Bodega</label>
        <select id="ed-bodega">${opcionesBodega}</select></div>
    </div>
    <div class="campo"><label for="ed-evaluador">Evaluador</label>
      <input id="ed-evaluador" type="text" value="${escaparHtml(r.evaluador || r.inspectorNombre || "")}" /></div>
    <div class="campos-fila">
      <div class="campo"><label for="ed-total">Total inspeccionadas</label>
        <input id="ed-total" type="number" inputmode="numeric" min="1" value="${r.totalInspeccionadas || 0}" /></div>
      <div class="campo"><label for="ed-madera">🪵 Madera dañada</label>
        <input id="ed-madera" type="number" inputmode="numeric" min="0" value="${r.cntMadera || 0}" /></div>
    </div>
    <div class="campo"><label for="ed-plastica">🔵 Plástica dañada</label>
      <input id="ed-plastica" type="number" inputmode="numeric" min="0" value="${r.cntPlastica || 0}" /></div>
    <div class="campo"><label>Hallazgos</label><div id="ed-hallazgos" style="display:flex; flex-wrap:wrap; gap: var(--e2);"></div></div>
    <p class="texto-suave texto-sm" id="ed-resumen"></p>
    <div style="display:flex; gap: var(--e2); justify-content:flex-end;">
      <button type="button" class="btn btn-secundario btn-ancho-auto" data-cerrar-modal>Cancelar</button>
      <button type="submit" class="btn btn-dorado btn-ancho-auto" id="ed-guardar">Guardar cambios</button>
    </div>`;
  pintarHallazgosEdicion();
  actualizarResumenEdicion();
  ["ed-total", "ed-madera", "ed-plastica"].forEach((id) => $(id).addEventListener("input", actualizarResumenEdicion));
  $("ed-callejon").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase(); });
  modal.classList.remove("oculto");
}

function cerrarEdicion() {
  modal.classList.add("oculto");
  estado.editando = null;
}

function pintarHallazgosEdicion() {
  const sel = estado.editando.hallazgos;
  const extras = [...sel].filter((h) => !HALLAZGOS_BASE.some((b) => b.v === h));
  const boton = (valor, texto) =>
    `<button type="button" class="btn btn-sm btn-ancho-auto ${sel.has(valor) ? "btn-dorado" : "btn-secundario"}" data-hallazgo="${escaparHtml(valor)}">${texto}</button>`;
  $("ed-hallazgos").innerHTML = [
    ...HALLAZGOS_BASE.map((h) => boton(h.v, `${h.v} · ${h.d}`)),
    ...extras.map((h) => boton(h, escaparHtml(h))),
    `<button type="button" class="btn btn-sm btn-ancho-auto btn-secundario" data-hallazgo-otro>+ Otro</button>`,
  ].join("");
}

function leerNumero(id) {
  const n = parseInt($(id).value, 10);
  return Number.isNaN(n) ? NaN : n;
}

function actualizarResumenEdicion() {
  const total = leerNumero("ed-total");
  const dan = (leerNumero("ed-madera") || 0) + (leerNumero("ed-plastica") || 0);
  $("ed-resumen").textContent = total > 0
    ? `${dan} dañadas de ${total} · ${((dan / total) * 100).toFixed(1)}%`
    : `${dan} dañadas`;
}

modal.addEventListener("click", (e) => {
  if (e.target === modal || e.target.closest("[data-cerrar-modal]")) return cerrarEdicion();
  if (e.target.closest("[data-hallazgo-otro]")) {
    const nombre = (prompt("Nuevo tipo de hallazgo:") || "").trim().slice(0, 30);
    if (nombre) { estado.editando.hallazgos.add(nombre); pintarHallazgosEdicion(); }
    return;
  }
  const h = e.target.closest("[data-hallazgo]");
  if (h) {
    const sel = estado.editando.hallazgos;
    const v = h.dataset.hallazgo;
    if (sel.has(v)) sel.delete(v); else sel.add(v);
    pintarHallazgosEdicion();
  }
});
// Teclado: Enter o espacio sobre la cabecera de un día la abre o cierra.
lista.addEventListener("keydown", (e) => {
  const ver = e.target.closest("[data-ver]");
  if (!ver || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault();
  ver.click();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("oculto")) cerrarEdicion();
});

formEditar.addEventListener("submit", async (e) => {
  e.preventDefault();
  const { registro, hallazgos } = estado.editando;
  const callejon = $("ed-callejon").value.trim().toUpperCase();
  const bodega = $("ed-bodega").value;
  const evaluador = $("ed-evaluador").value.trim();
  const total = leerNumero("ed-total");
  const madera = leerNumero("ed-madera");
  const plastica = leerNumero("ed-plastica");

  if (!callejon) return mostrarToast("Falta el callejón.", "alerta");
  if (!(total > 0)) return mostrarToast("El total inspeccionado debe ser mayor que 0.", "alerta");
  if (!(madera >= 0) || !(plastica >= 0)) return mostrarToast("Las dañadas no pueden quedar vacías ni ser negativas.", "alerta");
  const danadas = madera + plastica;
  if (danadas > total) return mostrarToast(`Las dañadas (${danadas}) superan el total inspeccionado (${total}).`, "alerta");

  const cambios = {
    callejon,
    bodega,
    evaluador,
    totalInspeccionadas: total,
    cntMadera: madera,
    cntPlastica: plastica,
    danadas,
    porcentajeDano: Number(((danadas / total) * 100).toFixed(2)),
    tipo: madera && plastica ? "Madera + Plástica" : madera ? "Madera" : plastica ? "Plástica" : "—",
    hallazgos: [...hallazgos],
  };

  const guardar = $("ed-guardar");
  guardar.disabled = true;
  try {
    await editarCallejonTarimas(registro.fecha, registro.clave, cambios);
    estado.registros = estado.registros.map((r) => (r.id === registro.id ? { ...r, ...cambios } : r));
    cerrarEdicion();
    renderizar();
    mostrarToast(`Callejón ${callejon} actualizado.`, "exito");
  } catch (error) {
    console.error("No se pudo guardar la edición:", error);
    mostrarToast("No se pudieron guardar los cambios.", "error");
    guardar.disabled = false;
  }
});
