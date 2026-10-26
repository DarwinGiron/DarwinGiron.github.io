// Reportes: resumen del mes por persona (horas, ausencias, faltas, cambios, turnos F, domingos)
// y descarga en Excel con el resumen y el detalle día por día.

import { textos } from '../textos.js';
import { estado } from '../estado.js';
import { listarPersonal, listarTurnos } from '../firebase.js';
import { nombreMes, sumarMeses, isoALocal, localAIso, diasEnElMes, fechaCorta } from '../utilidades/fechas.js';
import { trabaja } from '../ajustes-turno.js';
import { cargarExcelJS, descargarArchivo } from '../utilidades/cargar-script.js';


const COLUMNAS = [
  'Persona', 'Puesto', 'Grupo', 'Días trabajados', 'Horas ordinarias', 'Horas extra',
  'Ausencias', 'Permisos', 'No se presentó', 'Cambios a mano', 'Turnos F', 'Domingos',
];

const escapar = (texto) => String(texto ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const redondear = (n) => Math.round(n * 100) / 100;
const capitalizar = (texto) => (texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '');

function rangoDelMes(mesIso) {
  const base = isoALocal(mesIso);
  return [mesIso, localAIso(new Date(base.getFullYear(), base.getMonth(), diasEnElMes(mesIso)))];
}

/** Resumen por persona a partir de los turnos del mes. */
export function resumirMes(personal, turnos) {
  return personal.map((p) => {
    const propios = turnos.filter((t) => t.usuario_id === p.id);
    const ausencias = propios.filter((t) => t.tipo_cobertura === 'ausencia');
    return {
      persona: p,
      diasTrabajados: propios.filter(trabaja).length,
      horasOrdinarias: redondear(propios.reduce((s, t) => s + (Number(t.horas_ordinarias) || 0), 0)),
      horasExtra: redondear(propios.reduce((s, t) => s + (Number(t.horas_extra) || 0), 0)),
      ausencias: ausencias.filter((t) => !['permiso', 'falta'].includes(t.ausencia_tipo)).length,
      permisos: ausencias.filter((t) => t.ausencia_tipo === 'permiso').length,
      faltas: ausencias.filter((t) => t.ausencia_tipo === 'falta').length,
      cambios: propios.filter((t) => t.origen === 'manual' || t.origen === 'solicitud').length,
      turnosF: propios.filter((t) => trabaja(t) && t.letra_reportada?.[0] === 'F').length,
      domingos: propios.filter((t) => trabaja(t) && isoALocal(t.fecha).getDay() === 0).length,
    };
  });
}

const filaResumen = (r) => [
  r.persona.nombre, capitalizar(r.persona.puesto), r.persona.grupo ? `Turno ${r.persona.grupo}` : '',
  r.diasTrabajados, r.horasOrdinarias, r.horasExtra, r.ausencias, r.permisos, r.faltas, r.cambios, r.turnosF, r.domingos,
];

export async function render(contenedor) {
  const t = textos.paginas.reportes;

  contenedor.innerHTML = `
    <div class="pagina">
      <div class="encabezado">
        <div class="encabezado-titulo">${t.titulo}</div>
        <button id="reporte-descargar" class="boton-chip" disabled>Descargar Excel</button>
      </div>
      <div class="selector-mes">
        <button id="mes-anterior" class="boton-icono" aria-label="Mes anterior">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
        </button>
        <div id="mes-nombre" class="selector-mes-nombre"></div>
        <button id="mes-siguiente" class="boton-icono" aria-label="Mes siguiente">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
        </button>
      </div>
      <div id="reporte-mensaje" class="mensaje-error" hidden style="margin:12px 20px 0;"></div>
      <div id="reporte-contenido" class="tarjeta"><div class="mensaje-cargando">Cargando...</div></div>
    </div>
  `;

  document.getElementById('mes-anterior').addEventListener('click', () => { estado.mesVisible = sumarMeses(estado.mesVisible, -1); render(contenedor); });
  document.getElementById('mes-siguiente').addEventListener('click', () => { estado.mesVisible = sumarMeses(estado.mesVisible, 1); render(contenedor); });
  const nombre = nombreMes(estado.mesVisible);
  document.getElementById('mes-nombre').textContent = nombre;

  const zona = document.getElementById('reporte-contenido');
  const [desde, hasta] = rangoDelMes(estado.mesVisible);
  let personal; let turnos;
  try {
    [personal, turnos] = await Promise.all([listarPersonal(), listarTurnos(desde, hasta)]);
  } catch (error) {
    console.error(error);
    zona.innerHTML = `<div class="mensaje-cargando">${textos.errores.genericoAlGuardar}</div>`;
    return;
  }

  if (turnos.length === 0) {
    zona.innerHTML = `<div class="estado-vacio">${t.estadoVacio(nombre)}</div>`;
    return;
  }

  const resumen = resumirMes(personal, turnos);
  zona.innerHTML = `
    <div class="tarjeta-titulo">Resumen de ${escapar(nombre)}</div>
    <div class="tabla-desplazable">
      <table class="tabla-hoy">
        <thead><tr>${COLUMNAS.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead>
        <tbody>${resumen.map((r) => `<tr>${filaResumen(r).map((v) => `<td>${escapar(v)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;

  const boton = document.getElementById('reporte-descargar');
  boton.disabled = false;
  boton.addEventListener('click', async () => {
    boton.disabled = true;
    boton.textContent = 'Preparando...';
    try {
      await descargarExcel(nombre, resumen, personal, turnos);
    } catch (error) {
      console.error(error);
      const aviso = document.getElementById('reporte-mensaje');
      aviso.textContent = 'No se pudo generar el Excel. Revisa tu conexión e intenta de nuevo.';
      aviso.hidden = false;
    } finally {
      boton.disabled = false;
      boton.textContent = 'Descargar Excel';
    }
  });
}

function hojaConTabla(libro, nombreHoja, titulo, encabezados, filas, anchos) {
  const hoja = libro.addWorksheet(nombreHoja, { views: [{ state: 'frozen', ySplit: 3 }] });
  hoja.getCell('A1').value = titulo;
  hoja.getCell('A1').font = { bold: true, size: 14 };
  hoja.addRow([]);
  const encabezado = hoja.addRow(encabezados);
  encabezado.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF222222' } };
  });
  filas.forEach((fila) => hoja.addRow(fila));
  anchos.forEach((ancho, i) => { hoja.getColumn(i + 1).width = ancho; });
  hoja.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + filas.length, column: encabezados.length } };
}

async function descargarExcel(nombreMesTexto, resumen, personal, turnos) {
  const ExcelJS = await cargarExcelJS();
  const libro = new ExcelJS.Workbook();

  hojaConTabla(libro, 'Resumen', `Horarios · ${nombreMesTexto}`, COLUMNAS, resumen.map(filaResumen),
    [32, 12, 10, 10, 12, 10, 10, 10, 12, 12, 10, 10]);

  const nombrePorId = new Map(personal.map((p) => [p.id, p]));
  const detalle = [...turnos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(nombrePorId.get(a.usuario_id)?.nombre).localeCompare(nombrePorId.get(b.usuario_id)?.nombre))
    .map((x) => {
      const p = nombrePorId.get(x.usuario_id);
      return [
        fechaCorta(x.fecha), x.fecha, p?.codigo_empleado ?? '', p?.nombre ?? x.usuario_id, x.letra_reportada ?? '',
        x.hora_ini ?? '', x.hora_fin ?? '', textos.coberturas[x.tipo_cobertura]?.texto ?? x.tipo_cobertura ?? '',
        x.ausencia_tipo ? (textos.ausencias[x.ausencia_tipo] ?? x.ausencia_tipo) : '',
        Number(x.horas_reales) || 0, Number(x.horas_ordinarias) || 0, Number(x.horas_extra) || 0,
        x.origen === 'manual' ? 'Cambio a mano' : x.origen === 'solicitud' ? 'Solicitud' : 'Rotación',
        x.letra_planificada && x.letra_planificada !== x.letra_reportada ? x.letra_planificada : '',
      ];
    });
  hojaConTabla(libro, 'Detalle', `Detalle día por día · ${nombreMesTexto}`,
    ['Día', 'Fecha', 'Código', 'Nombre', 'Letra', 'Entrada', 'Salida', 'Cobertura', 'Ausencia', 'Horas reales', 'Horas ordinarias', 'Horas extra', 'Origen', 'Letra planificada'],
    detalle, [12, 12, 10, 32, 8, 9, 9, 14, 22, 11, 13, 10, 14, 14]);

  const datos = await libro.xlsx.writeBuffer();
  descargarArchivo(new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Horarios_${nombreMesTexto.replace(/\s+/g, '_')}.xlsx`);
}
