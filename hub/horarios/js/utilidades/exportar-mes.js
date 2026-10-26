// Exporta el calendario de un mes (personas × días) a Excel y a PDF, con los mismos colores
// de la app. Cada celda lleva la letra que se reporta (D, E1, D+F...), o la ausencia.

import { listarPersonal, listarTurnos, listarFeriados } from '../firebase.js';
import { textos } from '../textos.js';
import { isoALocal, localAIso, diasEnElMes, nombreMes } from './fechas.js';
import { etiquetaTurno, trabaja } from '../ajustes-turno.js';
import { cargarExcelJS, cargarJsPDF, descargarArchivo } from './cargar-script.js';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const COLORES = {
  D: { fondo: 'FFF1C2', texto: '6B5200' },
  E: { fondo: 'FFE0CC', texto: '8A3B12' },
  F: { fondo: 'EDE4FF', texto: '5B3FA8' },
  L: { fondo: 'F0F0F0', texto: '6A6A6A' },
  ausencia: { fondo: 'FFF0ED', texto: 'C13515' },
  domingo: { fondo: 'FFF6F4', texto: 'C13515' },
};
const ABREV_AUSENCIA = { vacaciones: 'VAC', enfermedad: 'ENF', permiso: 'PER', capacitacion: 'CAP', falta: 'NSP', otro: 'AUS' };

async function datosDelMes(mesIso) {
  const base = isoALocal(mesIso);
  const total = diasEnElMes(mesIso);
  const dias = Array.from({ length: total }, (_, i) => {
    const f = new Date(base.getFullYear(), base.getMonth(), i + 1);
    return { iso: localAIso(f), numero: i + 1, semana: DIAS[f.getDay()], domingo: f.getDay() === 0 };
  });
  const [personal, turnos, feriados] = await Promise.all([
    listarPersonal({ soloActivos: true }),
    listarTurnos(dias[0].iso, dias[total - 1].iso),
    listarFeriados(dias[0].iso, dias[total - 1].iso),
  ]);
  const turnoDe = new Map(turnos.map((t) => [`${t.usuario_id}_${t.fecha}`, t]));
  return { dias, personal, turnoDe, feriados: new Set(feriados.map((f) => f.fecha)), titulo: nombreMes(mesIso) };
}

/** Texto y color de una celda. */
function celda(turno) {
  if (!turno) return { texto: '', color: null };
  if (turno.tipo_cobertura === 'ausencia') return { texto: ABREV_AUSENCIA[turno.ausencia_tipo] ?? 'AUS', color: COLORES.ausencia };
  if (turno.tipo_cobertura === 'libre') return { texto: 'L', color: COLORES.L };
  const texto = etiquetaTurno(turno);
  return { texto, color: COLORES[texto[0]] ?? COLORES.L };
}

const horasDe = (personaId, dias, turnoDe) => dias.reduce((s, d) => s + (Number(turnoDe.get(`${personaId}_${d.iso}`)?.horas_reales) || 0), 0);
const diasTrabajados = (personaId, dias, turnoDe) => dias.filter((d) => trabaja(turnoDe.get(`${personaId}_${d.iso}`))).length;
const leyendaAusencias = () => Object.entries(ABREV_AUSENCIA).map(([k, a]) => `${a} = ${textos.ausencias[k] ?? k}`).join(' · ');

export async function exportarMesExcel(mesIso) {
  const [ExcelJS, datos] = await Promise.all([cargarExcelJS(), datosDelMes(mesIso)]);
  const { dias, personal, turnoDe, feriados, titulo } = datos;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Calendario', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 1 },
  });

  hoja.getCell('A1').value = `Horarios · ${titulo}`;
  hoja.getCell('A1').font = { bold: true, size: 14 };
  hoja.getCell('A2').value = `D 06–14 · E 14–21 · F 21–06 · E1 6 a 6 día · L libre · ${leyendaAusencias()}`;
  hoja.getCell('A2').font = { size: 9, color: { argb: 'FF6A6A6A' } };

  const encabezadoDias = ['Persona', 'Puesto', ...dias.map((d) => `${d.semana}\n${d.numero}`), 'Días', 'Horas'];
  const filaEnc = hoja.getRow(4);
  filaEnc.values = encabezadoDias;
  filaEnc.height = 30;
  filaEnc.eachCell((c, col) => {
    const dia = dias[col - 3];
    c.font = { bold: true, color: { argb: dia?.domingo ? 'FFC13515' : 'FFFFFFFF' }, size: 9 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: dia?.domingo ? 'FFFFE4DE' : 'FF222222' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  personal.forEach((p, i) => {
    const fila = hoja.getRow(5 + i);
    const celdas = dias.map((d) => celda(turnoDe.get(`${p.id}_${d.iso}`)));
    fila.values = [p.nombre, p.puesto, ...celdas.map((c) => c.texto), diasTrabajados(p.id, dias, turnoDe), Math.round(horasDe(p.id, dias, turnoDe) * 10) / 10];
    fila.eachCell({ includeEmpty: true }, (c, col) => {
      c.border = { top: { style: 'thin', color: { argb: 'FFDDDDDD' } }, bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } }, left: { style: 'thin', color: { argb: 'FFDDDDDD' } }, right: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
      const info = celdas[col - 3];
      if (info) {
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.font = { bold: true, size: 9, color: { argb: `FF${info.color?.texto ?? '222222'}` } };
        const fondo = info.color?.fondo ?? (dias[col - 3].domingo || feriados.has(dias[col - 3].iso) ? COLORES.domingo.fondo : null);
        if (fondo) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fondo}` } };
      }
    });
  });

  hoja.getColumn(1).width = 30;
  hoja.getColumn(2).width = 11;
  dias.forEach((_, i) => { hoja.getColumn(3 + i).width = 5.2; });
  hoja.getColumn(3 + dias.length).width = 6;
  hoja.getColumn(4 + dias.length).width = 7;

  const datosExcel = await libro.xlsx.writeBuffer();
  descargarArchivo(new Blob([datosExcel], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Horarios_${titulo.replace(/\s+/g, '_')}.xlsx`);
}

export async function exportarMesPdf(mesIso) {
  const [JsPDF, datos] = await Promise.all([cargarJsPDF(), datosDelMes(mesIso)]);
  const { dias, personal, turnoDe, feriados, titulo } = datos;
  const pdf = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const ancho = pdf.internal.pageSize.getWidth();

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text(`Horarios · ${titulo}`, 10, 13);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(106, 106, 106);
  pdf.text(`D 06–14 · E 14–21 · F 21–06 · E1 6 a 6 día · L libre · ${leyendaAusencias()}`, 10, 18.5);
  pdf.text(`Generado el ${new Date().toLocaleString('es-GT')}`, ancho - 10, 13, { align: 'right' });

  const hex = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  const cuerpo = personal.map((p) => [
    `${p.nombre}\n${p.puesto}${p.grupo ? ` · Turno ${p.grupo}` : ''}`,
    ...dias.map((d) => celda(turnoDe.get(`${p.id}_${d.iso}`)).texto),
    String(Math.round(horasDe(p.id, dias, turnoDe) * 10) / 10),
  ]);
  const anchoNombre = 42;
  const anchoHoras = 10;
  const anchoDia = (ancho - 20 - anchoNombre - anchoHoras) / dias.length;

  pdf.autoTable({
    startY: 22,
    margin: { left: 10, right: 10 },
    head: [['Persona', ...dias.map((d) => `${d.semana.slice(0, 2)}\n${d.numero}`), 'Horas']],
    body: cuerpo,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.5, cellPadding: 1, halign: 'center', valign: 'middle', lineColor: [221, 221, 221], lineWidth: 0.1, textColor: [34, 34, 34] },
    headStyles: { fillColor: [34, 34, 34], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5 },
    columnStyles: {
      0: { halign: 'left', cellWidth: anchoNombre, fontSize: 7 },
      [dias.length + 1]: { cellWidth: anchoHoras, fontStyle: 'bold' },
      ...Object.fromEntries(dias.map((_, i) => [i + 1, { cellWidth: anchoDia, fontStyle: 'bold' }])),
    },
    didParseCell(dato) {
      const i = dato.column.index - 1;
      const dia = dias[i];
      if (!dia) return;
      if (dato.section === 'head' && (dia.domingo || feriados.has(dia.iso))) {
        dato.cell.styles.fillColor = hex('FFE4DE');
        dato.cell.styles.textColor = hex('C13515');
      }
      if (dato.section === 'body') {
        const info = celda(turnoDe.get(`${personal[dato.row.index].id}_${dia.iso}`));
        const fondo = info.color?.fondo ?? (dia.domingo || feriados.has(dia.iso) ? COLORES.domingo.fondo : null);
        if (fondo) dato.cell.styles.fillColor = hex(fondo);
        if (info.color) dato.cell.styles.textColor = hex(info.color.texto);
      }
    },
  });

  pdf.save(`Horarios_${titulo.replace(/\s+/g, '_')}.pdf`);
}
