// =========================================================
// lecturas.js
// Controlador de hub/lecturas.html: muestra lo que anota el medidor de
// lecturas (js/medidor-lecturas.js) en la colección lecturas/{aaaa-mm-dd}.
// Solo gestión (ver firestore.rules).
// =========================================================

import { protegerPagina, cerrarSesion, ROLES_GESTION, etiquetaRol } from "./auth.js";
import { iniciales, escaparHtml, mostrarToast } from "./utils.js";
import { db } from "./firebase-config.js";
import { collection, query, where, getDocs, documentId } from "./firestore-medido.js";

const $ = (id) => document.getElementById(id);

/* Nombres legibles de las pantallas (la ruta queda debajo, por si acaso). */
const NOMBRES = {
  "/": "Reportes · inicio",
  "/reportes.html": "Reportes · lista",
  "/inspector.html": "Reportes · inspector",
  "/admin/dashboard.html": "Dashboard",
  "/admin/validacion.html": "Validación de reportes",
  "/admin/informes.html": "Informes",
  "/admin/catalogos.html": "Configuraciones (Reportes)",
  "/hub/": "Hub · inicio",
  "/hub/sig-fo-101/": "SIG-FO-101 · Liberación",
  "/hub/sig-fo-101/historial.html": "SIG-FO-101 · Historial",
  "/hub/sig-fo-101/admin.html": "SIG-FO-101 · Administración",
  "/hub/sig-fo-115/inspecciones.html": "SIG-FO-115 · Inspecciones",
  "/hub/sig-fo-118/": "SIG-FO-118 · Tarimas (captura)",
  "/hub/sig-fo-118/historial.html": "SIG-FO-118 · Historial",
  "/hub/horarios/": "Horarios",
  "/tareas/": "Control de tareas",
  "/hub/lecturas.html": "Consumo de lecturas (esta pantalla)",
};
const nombrePagina = (ruta) => NOMBRES[ruta] || ruta;

const fmt = (n) => Number(n || 0).toLocaleString("es-GT");
const pad = (n) => (n < 10 ? "0" : "") + n;
const isoLocal = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const corta = (iso) => { const [a, m, d] = iso.split("-"); return `${d}/${m}`; };

protegerPagina({ rolesPermitidos: ROLES_GESTION }, ({ user, perfil }) => {
  const nombre = perfil.nombre || user.email;
  $("texto-usuario").textContent = `${nombre} · ${etiquetaRol(perfil.rol)}`;
  $("avatar-usuario").textContent = iniciales(nombre);
  cargar();
});
$("btn-salir").addEventListener("click", () => cerrarSesion());
document.querySelectorAll('input[name="periodo"]').forEach((r) => r.addEventListener("change", cargar));

async function cargar() {
  const dias = Number(document.querySelector('input[name="periodo"]:checked').value);
  const hasta = new Date(), desde = new Date();
  desde.setDate(desde.getDate() - (dias - 1));
  const desdeISO = isoLocal(desde), hastaISO = isoLocal(hasta);
  $("tabla").innerHTML = `<tr><td colspan="6" class="texto-suave">Cargando…</td></tr>`;
  try {
    const snap = await getDocs(query(collection(db, "lecturas"), where(documentId(), ">=", desdeISO), where(documentId(), "<=", hastaISO)));
    pintar(snap.docs.map((d) => ({ dia: d.id, ...d.data() })), desdeISO, hastaISO);
  } catch (error) {
    console.error("No se pudieron cargar las lecturas:", error);
    $("tabla").innerHTML = "";
    mostrarToast("No se pudo cargar. ¿Ya se publicaron las reglas de la colección lecturas?", "error");
  }
}

function pintar(docs, desdeISO, hastaISO) {
  // Totales por día (los días sin datos se muestran en 0).
  const porDia = new Map();
  for (let d = new Date(desdeISO + "T00:00:00"); isoLocal(d) <= hastaISO; d.setDate(d.getDate() + 1)) porDia.set(isoLocal(d), 0);
  const filas = new Map(); // "pagina|coleccion" -> { pagina, coleccion, consultas, documentos, grandes }
  let consultas = 0, documentos = 0, grandes = 0;

  docs.forEach((doc) => {
    porDia.set(doc.dia, Number(doc.total?.documentos) || 0);
    Object.entries(doc.paginas || {}).forEach(([pagina, cols]) => {
      Object.entries(cols || {}).forEach(([coleccion, c]) => {
        const k = pagina + "|" + coleccion;
        const f = filas.get(k) || { pagina, coleccion, consultas: 0, documentos: 0, grandes: 0 };
        f.consultas += Number(c.consultas) || 0;
        f.documentos += Number(c.documentos) || 0;
        f.grandes += Number(c.grandes) || 0;
        filas.set(k, f);
        consultas += Number(c.consultas) || 0;
        documentos += Number(c.documentos) || 0;
        grandes += Number(c.grandes) || 0;
      });
    });
  });

  const nDias = porDia.size;
  $("fichas").innerHTML = `
    <div class="ficha"><div class="ficha__valor">${fmt(documentos)}</div><div class="ficha__etiqueta">Documentos leídos</div></div>
    <div class="ficha"><div class="ficha__valor">${fmt(Math.round(documentos / nDias))}</div><div class="ficha__etiqueta">Promedio por día</div></div>
    <div class="ficha"><div class="ficha__valor">${fmt(consultas)}</div><div class="ficha__etiqueta">Consultas</div></div>
    <div class="ficha ${grandes ? "ficha--critico" : "ficha--exito"}"><div class="ficha__valor">${fmt(grandes)}</div><div class="ficha__etiqueta">Consultas de 100+ documentos</div></div>`;

  const maxDia = Math.max(1, ...porDia.values());
  $("por-dia").innerHTML = [...porDia.entries()].reverse().map(([dia, n]) => `
    <div class="barra-dia"><span>${corta(dia)}</span>
      <div class="barra-dia__pista"><div class="barra-dia__valor" style="width:${(n / maxDia) * 100}%"></div></div>
      <b>${fmt(n)}</b></div>`).join("");

  const lista = [...filas.values()].sort((a, b) => b.documentos - a.documentos);
  $("tabla").innerHTML = lista.length
    ? lista.map((f) => `
      <tr class="${f.grandes ? "fila-grande" : ""}">
        <td class="pagina">${escaparHtml(nombrePagina(f.pagina))}<small>${escaparHtml(f.pagina)}</small></td>
        <td>${escaparHtml(f.coleccion)}</td>
        <td class="num">${fmt(f.consultas)}</td>
        <td class="num"><b>${fmt(f.documentos)}</b></td>
        <td class="num">${fmt(Math.round(f.documentos / Math.max(1, f.consultas)))}</td>
        <td class="num">${f.grandes ? `<span class="badge badge-alerta">${fmt(f.grandes)}</span>` : "—"}</td>
      </tr>`).join("")
    : `<tr><td colspan="6" class="texto-suave">Aún no hay datos en este período. Se empiezan a juntar en cuanto se usa la plataforma con esta versión.</td></tr>`;
}
