// =========================================================
// accesos-usuarios.js
// Pestaña "Accesos" de Gestión de usuarios (hub/usuarios.html).
//
//  1. Permisos del rol Inspector (casillas). Es el mismo documento que usa la
//     pestaña Permisos de Configuraciones en Reportes; solo un admin puede
//     guardarlo (reglas de Firestore), un coordinador lo ve sin editarlo.
//  2. Acceso por persona: se calcula a partir del rol, si la cuenta está activa
//     y esas casillas. No consulta nada por persona.
//  3. Tabla fija de qué hace cada rol en cada formato. Refleja firestore.rules:
//     si se cambian las reglas, hay que actualizarla.
// =========================================================

import {
  obtenerPermisosInspector,
  guardarPermisosInspector,
  CLAVES_PERMISOS_INSPECTOR,
} from "./firestore.js";
import { ROLES, etiquetaRol } from "./auth.js";
import { escaparHtml, iniciales, mostrarToast } from "./utils.js";

const tarjetaPermisos = document.getElementById("tarjeta-permisos");
const listaAccesos = document.getElementById("lista-accesos");
const tarjetaRoles = document.getElementById("tarjeta-roles");

const ctx = { obtenerUsuarios: () => [], esAdmin: false, permisos: null, cargando: false };

const CASILLAS = [
  { clave: "dashboard", etiqueta: "Dashboard" },
  { clave: "validacion", etiqueta: "Validación de reportes" },
  { clave: "informes", etiqueta: "Informes" },
  { clave: "configuraciones", etiqueta: "Configuraciones" },
];
const SECCIONES = [
  { clave: "configSeccionZonas", etiqueta: "Zonas" },
  { clave: "configSeccionProcesos", etiqueta: "Procesos" },
  { clave: "configSeccionCategorias", etiqueta: "Categorías" },
  { clave: "configSeccionUbicacionPlanta", etiqueta: "Ubicación de planta" },
  { clave: "configSeccionPlanoReporte", etiqueta: "Plano del reporte" },
];

export function iniciarAccesos({ obtenerUsuarios, esAdmin }) {
  ctx.obtenerUsuarios = obtenerUsuarios;
  ctx.esAdmin = esAdmin;
}

/** Lee los permisos (una vez) y pinta la pestaña. */
export async function refrescarAccesos() {
  if (ctx.permisos === null && !ctx.cargando) {
    ctx.cargando = true;
    tarjetaPermisos.innerHTML = '<p class="texto-suave texto-sm mb-0">Cargando permisos…</p>';
    try {
      ctx.permisos = await obtenerPermisosInspector();
    } catch (error) {
      console.error("No se pudieron leer los permisos:", error);
      tarjetaPermisos.innerHTML =
        '<p class="texto-suave texto-sm mb-0">No se pudieron cargar los permisos. Verifica tu conexión.</p>';
      ctx.cargando = false;
      return;
    }
    ctx.cargando = false;
  }
  if (ctx.permisos === null) return;
  pintarPermisos();
  pintarPersonas();
  pintarRoles();
}

/* ---------- 1. Permisos del rol Inspector ---------- */

function casilla(clave, etiqueta) {
  const marcada = ctx.permisos[clave] === true ? "checked" : "";
  const bloqueada = ctx.esAdmin ? "" : "disabled";
  return `<label class="check-linea"><input type="checkbox" data-permiso="${clave}" ${marcada} ${bloqueada} /> ${escaparHtml(etiqueta)}</label>`;
}

function pintarPermisos() {
  const mostrarSecciones = ctx.permisos.configuraciones === true;
  tarjetaPermisos.innerHTML = `
    <h2 class="tarjeta__titulo">Permisos del rol Inspector</h2>
    <p class="texto-suave texto-sm">
      Valen para <strong>todos</strong> los inspectores: no hay permisos por persona.
      Todo inspector activo siempre puede crear reportes y registrar en los formatos.
    </p>
    ${CASILLAS.map((c) => casilla(c.clave, c.etiqueta)).join("")}
    ${
      mostrarSecciones
        ? `<div style="margin: var(--e2) 0 var(--e2) var(--e5);">
             <div class="texto-suave texto-sm" style="margin-bottom: var(--e1);">Secciones de Configuraciones</div>
             ${SECCIONES.map((c) => casilla(c.clave, c.etiqueta)).join("")}
           </div>`
        : ""
    }
    ${
      ctx.esAdmin
        ? `<button type="button" id="btn-guardar-permisos" class="btn btn-dorado btn-sm btn-ancho-auto" style="margin-top: var(--e3);">Guardar permisos</button>`
        : `<p class="texto-suave texto-sm" style="margin: var(--e3) 0 0;">Solo un administrador puede cambiar estos permisos.</p>`
    }
  `;

  tarjetaPermisos.querySelectorAll("[data-permiso]").forEach((chk) => {
    chk.addEventListener("change", () => {
      ctx.permisos[chk.dataset.permiso] = chk.checked;
      // Al activar/desactivar "Configuraciones" aparecen o se esconden sus secciones.
      if (chk.dataset.permiso === "configuraciones") pintarPermisos();
      pintarPersonas();
    });
  });

  const btn = document.getElementById("btn-guardar-permisos");
  if (btn) {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const sinSecciones = { ...ctx.permisos };
        // Sin acceso a Configuraciones no tiene sentido dejar marcadas sus secciones.
        if (sinSecciones.configuraciones !== true) {
          SECCIONES.forEach((s) => { sinSecciones[s.clave] = false; });
        }
        ctx.permisos = await guardarPermisosInspector(sinSecciones);
        mostrarToast("Permisos guardados.", "exito");
        pintarPermisos();
        pintarPersonas();
      } catch (error) {
        console.error("No se pudieron guardar los permisos:", error);
        mostrarToast("No se pudieron guardar los permisos. ¿Tu cuenta es de administrador?", "error");
        btn.disabled = false;
      }
    });
  }
}

/* ---------- 2. Acceso por persona ---------- */

const FORMATOS_REGISTRO = "SIG-FO-115, 101, 111, 116, 118, Hisopado y Contenedores";

/** Calcula las líneas de acceso de una persona. Cada línea: { ok, texto }. */
export function accesoDe(usuario, permisos) {
  if (usuario.activo === false) {
    return [{ ok: false, texto: "Cuenta inactiva: no puede iniciar sesión." }];
  }

  const rol = usuario.rol;
  const esGestor = Boolean(ROLES[rol]?.gestion);
  const esAdmin = rol === "admin";
  const p = (clave) => esAdmin || permisos[clave] === true;
  const lineas = [];

  lineas.push({ ok: true, texto: `Registrar en: ${FORMATOS_REGISTRO}.` });
  lineas.push({ ok: true, texto: "Crear reportes de hallazgos y ver los propios." });

  if (esGestor) {
    lineas.push({ ok: true, texto: "Ver y corregir los registros de todos los formatos." });
    lineas.push({ ok: true, texto: "Eliminar registros." });
    lineas.push({ ok: true, texto: "Gestionar usuarios y configurar los formatos del hub." });
  } else {
    lineas.push({ ok: true, texto: "Ve solo lo suyo en PPRs (115), Vidrio (111) y Tarimas (118)." });
    lineas.push({ ok: true, texto: "Ve lo de todo el equipo en Imprentas (101), Contenedores, BPM (116) y Hisopado." });
    lineas.push({ ok: false, texto: "No elimina registros ni gestiona usuarios." });
  }

  lineas.push({ ok: p("dashboard"), texto: "Dashboard" + (!esGestor && p("dashboard") ? " (las pestañas PPRs, Vidrio y Tarimas no cargan para este rol)" : "") });
  lineas.push({ ok: p("validacion"), texto: "Validación de reportes" + (!esAdmin && p("validacion") ? " (lee todos los reportes y edita cualquiera)" : "") });
  lineas.push({ ok: p("informes"), texto: "Informes" });
  lineas.push({ ok: p("configuraciones"), texto: "Configuraciones" });
  if (!esAdmin && permisos.configuraciones === true) {
    const secciones = SECCIONES.filter((s) => permisos[s.clave] === true).map((s) => s.etiqueta);
    lineas.push({ ok: secciones.length > 0, texto: `Secciones de Configuraciones: ${secciones.length ? secciones.join(", ") : "ninguna"}.` });
  }
  lineas.push({ ok: esAdmin, texto: "Eliminar reportes y cambiar estos permisos (solo administrador)." });

  if (rol === "coordinador") {
    lineas.push({
      ok: false,
      texto: "Nota: en el sistema de Reportes el coordinador se trata como inspector; solo tiene lo que marquen las casillas.",
    });
  }
  return lineas;
}

function pintarPersonas() {
  const usuarios = [...ctx.obtenerUsuarios()].sort((a, b) =>
    (a.nombre || a.email || "").localeCompare(b.nombre || b.email || "")
  );
  if (usuarios.length === 0) {
    listaAccesos.innerHTML = '<p class="texto-suave texto-sm">No hay usuarios.</p>';
    return;
  }
  listaAccesos.innerHTML = usuarios
    .map((u) => {
      const lineas = accesoDe(u, ctx.permisos)
        .map(
          (l) => `<li style="display:flex; gap: var(--e2); align-items:flex-start; margin-bottom: var(--e1);">
            <span aria-hidden="true" style="flex:none; font-weight:800; color: var(--${l.ok ? "estado-bien-ink" : "tinta-3"});">${l.ok ? "✔" : "✖"}</span>
            <span class="texto-sm" style="${l.ok ? "" : "color: var(--tinta-3);"}">${escaparHtml(l.texto)}</span>
          </li>`
        )
        .join("");
      return `
        <details class="editor-item">
          <summary style="cursor:pointer; display:flex; align-items:center; flex-wrap:wrap; gap: var(--e2);">
            <span class="avatar" aria-hidden="true">${escaparHtml(iniciales(u.nombre || u.email))}</span>
            <strong>${escaparHtml(u.nombre || u.email || u.uid)}</strong>
            <span class="badge ${ROLES[u.rol]?.gestion ? "badge-dorado" : "badge-marino"}">${escaparHtml(etiquetaRol(u.rol))}</span>
            ${u.activo === false ? '<span class="badge badge-neutro">Inactivo</span>' : ""}
          </summary>
          <ul style="list-style:none; padding: var(--e3) 0 0; margin:0;">${lineas}</ul>
        </details>`;
    })
    .join("");
}

/* ---------- 3. Qué hace cada rol en cada formato ---------- */

const FILAS_ROLES = [
  // formato, inspector, admin/coordinador
  ["SIG-FO-115 PPRs", "Ve lo suyo · crea · edita su borrador", "Ve todo · elimina"],
  ["SIG-FO-101 Imprentas", "Ve todo · crea · edita lo suyo", "Ve todo · edita todo · elimina"],
  ["Contenedores", "Ve todo · crea · edita lo suyo", "Ve todo · edita todo · elimina"],
  ["SIG-FO-116 BPM", "Ve todo · crea · edita cualquier mes", "Ve todo · edita todo · elimina"],
  ["SIG-FO-111 Vidrio", "Ve lo suyo · crea · edita lo suyo", "Ve todo · edita todo · elimina"],
  ["SIG-FO-118 Tarimas", "Ve lo suyo · crea · edita lo suyo", "Ve todo · edita todo · elimina"],
  ["Hisopado", "Ve todo · crea · edita lo suyo", "Ve todo · edita todo · elimina"],
  ["Usuarios y configuración de formatos", "Sin acceso", "Acceso completo"],
];

function pintarRoles() {
  tarjetaRoles.innerHTML = `
    <h2 class="tarjeta__titulo">Qué puede hacer cada rol en los formatos</h2>
    <p class="texto-suave texto-sm">Refleja las reglas de seguridad de Firestore. Reportes y Dashboard dependen de las casillas de arriba.</p>
    <div class="tabla-scroll">
      <table style="width:100%; border-collapse: collapse; font-size: var(--txt-sm);">
        <thead><tr style="text-align:left;">
          <th style="padding: var(--e2);">Formato</th>
          <th style="padding: var(--e2);">Inspector</th>
          <th style="padding: var(--e2);">Admin / Coordinador</th>
        </tr></thead>
        <tbody>
          ${FILAS_ROLES.map(
            ([f, i, a]) => `<tr style="border-top: 1px solid var(--borde);">
              <td style="padding: var(--e2); font-weight:650;">${escaparHtml(f)}</td>
              <td style="padding: var(--e2);">${escaparHtml(i)}</td>
              <td style="padding: var(--e2);">${escaparHtml(a)}</td></tr>`
          ).join("")}
        </tbody>
      </table>
    </div>`;
}
