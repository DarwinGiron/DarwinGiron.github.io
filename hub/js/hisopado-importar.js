// =========================================================
// hisopado-importar.js
// Controlador de hisopado/importar.html — sube a la plataforma los resultados
// históricos del Excel SIG-TA-102 (una hoja por año).
//
// Solo gestión. El archivo se lee en el navegador; se revisa contra la tabla
// de muestreo configurada y contra lo que ya está en la plataforma, se muestra
// un resumen y solo al pulsar "Importar" se escribe. Importar dos veces el mismo
// archivo no duplica nada: lo que ya existe (misma superficie, mes y turno) se
// omite.
// =========================================================

import { protegerPagina, cerrarSesion, etiquetaRol, ROLES_GESTION } from "./auth.js";
import { obtenerTablaHisopado, listarHisopados, importarHisopadosLote } from "./firestore.js";
import { zonasConLimite } from "./hisopado-datos.js";
import { leerLibroHisopados, normalizarTexto } from "./hisopado-excel.js";
import { escaparHtml, iniciales, mostrarToast } from "./utils.js";

const URL_SHEETJS = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";

const $ = (id) => document.getElementById(id);
const zonaEstado = $("zona-estado");
const zonaResumen = $("zona-resumen");
const btnImportar = $("btn-importar");
const textoProgreso = $("texto-progreso");

const estado = { usuario: null, perfil: null, listos: [] };

protegerPagina({ rolesPermitidos: ROLES_GESTION }, ({ user, perfil }) => {
  estado.usuario = user;
  estado.perfil = perfil;
  const nombreVisible = perfil.nombre || user.email;
  $("texto-usuario").textContent = `${nombreVisible} · ${etiquetaRol(perfil.rol)}`;
  $("avatar-usuario").textContent = iniciales(nombreVisible);
});

$("btn-salir").addEventListener("click", () => cerrarSesion());

function cargarSheetJS() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = URL_SHEETJS;
    s.onload = resolve;
    s.onerror = () => reject(new Error("No se pudo cargar la librería para leer Excel. Revisa tu conexión a internet."));
    document.head.appendChild(s);
  });
}

function mostrarEstado(html) {
  zonaEstado.classList.remove("oculto");
  zonaEstado.innerHTML = html;
}

$("campo-archivo").addEventListener("change", async (evento) => {
  const archivo = evento.target.files[0];
  zonaResumen.classList.add("oculto");
  btnImportar.disabled = true;
  textoProgreso.textContent = "";
  if (!archivo) return;

  mostrarEstado('<p class="texto-suave texto-sm mb-0">Leyendo el archivo y comparándolo con la plataforma…</p>');
  try {
    await cargarSheetJS();
    const { registros, anomalias, hojas } = leerLibroHisopados(window.XLSX, await archivo.arrayBuffer());
    if (registros.length === 0) {
      mostrarEstado('<p class="texto-suave texto-sm mb-0">No se encontraron resultados en el archivo. ¿Es el Excel de la tabla de muestreo de hisopados?</p>');
      return;
    }

    // Superficies de la tabla de muestreo configurada, por nombre sin tildes.
    const zonas = zonasConLimite(await obtenerTablaHisopado());
    const porNombre = new Map(zonas.map((z) => [normalizarTexto(z.nombre), z]));

    // Lo que ya está en la plataforma en esos años (una sola consulta).
    const anios = registros.map((r) => r.anio);
    const existentes = await listarHisopados({
      desde: `${Math.min(...anios)}-01-01`,
      hasta: `${Math.max(...anios)}-12-31`,
      max: 5000,
    });
    const yaEstan = new Set(
      existentes.filter((r) => r.zonaId && r.fecha).map((r) => `${r.zonaId}|${r.fecha.slice(0, 7)}|${r.turno}`)
    );

    const resumen = new Map(); // año -> contadores
    const cuenta = (anio) => {
      if (!resumen.has(anio)) resumen.set(anio, { leidos: 0, nuevos: 0, existentes: 0, sinSuperficie: 0 });
      return resumen.get(anio);
    };
    const sinCoincidencia = new Set();
    const nombreImportador = `Importado de Excel (${estado.perfil.nombre || estado.usuario.email})`;
    estado.listos = [];

    registros.forEach((r) => {
      const c = cuenta(r.anio);
      c.leidos++;
      const zona = porNombre.get(normalizarTexto(r.zonaExcel));
      if (!zona) { c.sinSuperficie++; sinCoincidencia.add(r.zonaExcel); return; }
      const mes = String(r.mes + 1).padStart(2, "0");
      if (yaEstan.has(`${zona.id}|${r.anio}-${mes}|${r.turno}`)) { c.existentes++; return; }
      c.nuevos++;
      estado.listos.push({
        fecha: `${r.anio}-${mes}-15`,
        turno: r.turno,
        areaMaquina: "",
        zonaId: zona.id,
        zonaNombre: zona.nombre,
        tipoNombre: zona.tipoNombre,
        supervisor: "",
        resultado: r.valor,
        limiteMin: zona.limiteMin,
        limiteMax: zona.limiteMax,
        unidad: zona.unidad || "RLU",
        desviacion: r.valor < zona.limiteMin || r.valor > zona.limiteMax,
        observaciones: "",
        fechaAproximada: true,
        importadoDe: `${r.hoja}!${r.celda}`,
        inspectorUid: estado.usuario.uid,
        inspectorNombre: nombreImportador,
      });
    });

    pintarResumen({ resumen, anomalias, sinCoincidencia, hojas });
  } catch (error) {
    console.error("No se pudo leer el Excel:", error);
    mostrarEstado(`<p class="texto-suave texto-sm mb-0" style="color: var(--estado-critico-ink);">No se pudo leer el archivo: ${escaparHtml(error.message || String(error))}</p>`);
  }
});

function pintarResumen({ resumen, anomalias, sinCoincidencia, hojas }) {
  zonaEstado.classList.add("oculto");
  zonaResumen.classList.remove("oculto");

  const anios = [...resumen.keys()].sort();
  const total = (campo) => anios.reduce((a, y) => a + resumen.get(y)[campo], 0);
  const fila = (etiqueta, c, fuerte) => `<tr${fuerte ? ' style="font-weight:800;"' : ""}>
      <td>${etiqueta}</td><td>${c.leidos}</td><td>${c.nuevos}</td><td>${c.existentes}</td><td>${c.sinSuperficie}</td></tr>`;

  $("tabla-resumen").classList.remove("tabla-papel");
  $("tabla-resumen").innerHTML = `
    <thead><tr><th>Hoja / año</th><th>Resultados leídos</th><th>Se importarán</th><th>Ya estaban</th><th>Superficie no encontrada</th></tr></thead>
    <tbody>
      ${anios.map((y) => fila(y, resumen.get(y))).join("")}
      ${fila("Total", { leidos: total("leidos"), nuevos: total("nuevos"), existentes: total("existentes"), sinSuperficie: total("sinSuperficie") }, true)}
    </tbody>`;

  const avisos = [];
  if (sinCoincidencia.size) {
    avisos.push(`<div class="alerta alerta-error"><div><strong>Superficies del Excel que no existen en la tabla de muestreo:</strong> ${[...sinCoincidencia].map(escaparHtml).join(", ")}. Sus resultados no se importarán; corrige el nombre en Configuraciones o en el Excel.</div></div>`);
  }
  if (anomalias.length) {
    avisos.push(`<div class="alerta alerta-info"><div><strong>Celdas que no se importan:</strong><br>${anomalias
      .map((a) => escaparHtml(`${a.hoja}${a.celda ? " · " + a.celda : ""}${a.zona ? " · " + a.zona : ""}: ${a.motivo}`))
      .join("<br>")}</div></div>`);
  }
  const desviaciones = estado.listos.filter((r) => r.desviacion).length;
  avisos.push(`<div class="alerta alerta-info"><div>De los ${estado.listos.length} resultados nuevos, <strong>${desviaciones}</strong> están fuera del límite de su tipo de muestra y <strong>${estado.listos.length - desviaciones}</strong> dentro.</div></div>`);
  $("zona-avisos").innerHTML = avisos.join("");

  btnImportar.disabled = estado.listos.length === 0;
  btnImportar.textContent = estado.listos.length ? `Importar ${estado.listos.length} resultados` : "No hay resultados nuevos que importar";
}

btnImportar.addEventListener("click", async () => {
  if (!estado.listos.length) return;
  if (!confirm(`Se guardarán ${estado.listos.length} resultados en la plataforma. ¿Continuar?`)) return;

  btnImportar.disabled = true;
  textoProgreso.textContent = "Importando… no cierres esta página.";
  try {
    const escritos = await importarHisopadosLote(estado.listos);
    textoProgreso.textContent = `Listo: se importaron ${escritos} resultados. Ya puedes verlos en la tabla del historial.`;
    mostrarToast(`Se importaron ${escritos} resultados.`, "exito");
    estado.listos = [];
    btnImportar.textContent = "Importación terminada";
  } catch (error) {
    console.error("Falló la importación:", error);
    textoProgreso.textContent = "La importación se interrumpió. Vuelve a elegir el archivo: lo que ya se guardó se omitirá y solo se subirá lo que falta.";
    mostrarToast("No se pudo completar la importación.", "error");
    btnImportar.disabled = false;
  }
});
