// Exporta el calendario de un mes (personas × días) a Excel y a PDF, con los mismos colores
// de la app. Cada celda lleva la letra que se reporta (D, E1, D+F...), o la ausencia.

import { listarPersonal, listarTurnos, listarFeriados } from '../firebase.js';
import { textos } from '../textos.js';
import { isoALocal, localAIso, diasEnElMes, nombreMes } from './fechas.js';
import { etiquetaTurno, trabaja, horarioCorto, claveOrdenHora } from '../ajustes-turno.js';
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

// ---------- PDF: el calendario tal como se ve en pantalla ----------

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const hex = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const capital = (texto) => texto.charAt(0) + texto.slice(1).toLowerCase();

/**
 * Nombre corto de cada persona: el primer nombre, como en pantalla. Si dos se llaman igual,
 * se agrega la segunda palabra para distinguirlas.
 */
function nombresCortos(personal) {
  const primero = (p) => capital(String(p.nombre).split(' ')[0]);
  const conteo = new Map();
  personal.forEach((p) => conteo.set(primero(p), (conteo.get(primero(p)) ?? 0) + 1));
  return new Map(personal.map((p) => {
    const palabras = String(p.nombre).split(' ');
    const nombre = conteo.get(primero(p)) > 1 && palabras[1] ? `${primero(p)} ${capital(palabras[1])}` : primero(p);
    return [p.id, nombre];
  }));
}

/** Renglones de un día: letra, nombre y horario de quien trabaja o falta (los libres no van). */
function renglonesDelDia(dia, personal, turnoDe, nombres) {
  return personal
    .map((p) => {
      const turno = turnoDe.get(`${p.id}_${dia.iso}`);
      if (!turno || turno.tipo_cobertura === 'libre') return null;
      if (turno.tipo_cobertura === 'ausencia') {
        return {
          orden: `Z${nombres.get(p.id)}`, letra: ABREV_AUSENCIA[turno.ausencia_tipo] ?? 'AUS', nombre: nombres.get(p.id),
          horario: textos.ausencias[turno.ausencia_tipo] ?? 'Ausente', color: COLORES.ausencia, puesto: p.puesto,
        };
      }
      const letra = etiquetaTurno(turno);
      return {
        orden: claveOrdenHora(turno), letra, nombre: nombres.get(p.id), horario: horarioCorto(turno), horarioCompacto: horarioCorto(turno, { compacto: true }),
        color: COLORES[letra[0]] ?? COLORES.L, puesto: p.puesto,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.orden.localeCompare(b.orden) || a.nombre.localeCompare(b.nombre));
}

/** Marca del puesto: círculo = inspector, cuadrado = encargado (se distinguen en blanco y negro). */
function marcaPuesto(pdf, puesto, x, y, tam) {
  pdf.setFillColor(60, 60, 60);
  if (puesto === 'inspector') pdf.circle(x + tam / 2, y, tam / 2, 'F');
  else pdf.rect(x, y - tam / 2, tam, tam, 'F');
}

export async function exportarMesPdf(mesIso) {
  const [JsPDF, datos] = await Promise.all([cargarJsPDF(), datosDelMes(mesIso)]);
  const { dias, personal, turnoDe, feriados, titulo } = datos;
  const nombres = nombresCortos(personal);

  const pdf = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const anchoHoja = pdf.internal.pageSize.getWidth();
  const altoHoja = pdf.internal.pageSize.getHeight();
  const margen = 8;

  // Encabezado
  pdf.setTextColor(34, 34, 34);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text(`Horarios · ${titulo}`, margen, margen + 5);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(94, 94, 94);
  pdf.text(`Generado el ${new Date().toLocaleString('es-GT')}`, anchoHoja - margen, margen + 5, { align: 'right' });
  const leyenda = 'D 06:00–14:00 · E 14:00–21:00 · F 21:00–06:00 · E1 6 a 6 día 06:00–18:00 · D domingo 6 a 6 noche 18:00–06:00 · '
    + `${leyendaAusencias()}`;
  const lineasLeyenda = pdf.splitTextToSize(leyenda, anchoHoja - 2 * margen);
  pdf.text(lineasLeyenda, margen, margen + 10);
  const yMarcas = margen + 10 + lineasLeyenda.length * 3 + 0.6;
  marcaPuesto(pdf, 'inspector', margen, yMarcas - 0.8, 1.8);
  pdf.text('Inspector', margen + 2.8, yMarcas);
  marcaPuesto(pdf, 'encargado', margen + 17, yMarcas - 0.8, 1.8);
  pdf.text('Encargado', margen + 19.8, yMarcas);

  // Semanas de lunes a domingo; los días de otros meses quedan en blanco.
  const primerDia = isoALocal(dias[0].iso).getDay(); // 0 = domingo
  const desfase = (primerDia + 6) % 7; // columnas vacías antes del día 1
  const semanas = Math.ceil((desfase + dias.length) / 7);

  const xTabla = margen;
  const yCabecera = yMarcas + 3;
  const altoCabecera = 6;
  const anchoCelda = (anchoHoja - 2 * margen) / 7;
  const yCuerpo = yCabecera + altoCabecera;
  const altoCelda = (altoHoja - margen - yCuerpo) / semanas;

  const renglones = dias.map((d) => renglonesDelDia(d, personal, turnoDe, nombres));
  const maxRenglones = Math.max(1, ...renglones.map((r) => r.length));
  const altoRenglon = Math.min(4.8, (altoCelda - 5.5) / maxRenglones);
  const tamLetra = Math.max(5.2, Math.min(7.2, altoRenglon * 1.55));

  // Cabecera de días
  DIAS_SEMANA.forEach((nombre, i) => {
    const x = xTabla + i * anchoCelda;
    const domingo = i === 6;
    pdf.setFillColor(...(domingo ? hex('FFE4DE') : hex('222222')));
    pdf.rect(x, yCabecera, anchoCelda, altoCabecera, 'F');
    pdf.setTextColor(...(domingo ? hex('C13515') : [255, 255, 255]));
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.text(nombre.toUpperCase(), x + anchoCelda / 2, yCabecera + 4.1, { align: 'center' });
  });

  // Celdas
  for (let s = 0; s < semanas; s++) {
    for (let c = 0; c < 7; c++) {
      const x = xTabla + c * anchoCelda;
      const y = yCuerpo + s * altoCelda;
      const indice = s * 7 + c - desfase;
      const dia = dias[indice];

      if (dia && (dia.domingo || feriados.has(dia.iso))) {
        pdf.setFillColor(...hex(COLORES.domingo.fondo));
        pdf.rect(x, y, anchoCelda, altoCelda, 'F');
      }
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.rect(x, y, anchoCelda, altoCelda, 'S');
      if (!dia) continue;

      pdf.setTextColor(34, 34, 34);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text(String(dia.numero) + (feriados.has(dia.iso) ? '  feriado' : ''), x + 1.5, y + 3.6);

      renglones[indice].forEach((r, i) => {
        const yR = y + 5 + i * altoRenglon;
        const altoPastilla = altoRenglon - 0.6;
        pdf.setFillColor(...hex(r.color.fondo));
        pdf.roundedRect(x + 1, yR, anchoCelda - 2, altoPastilla, 0.8, 0.8, 'F');
        const base = yR + altoPastilla / 2 + tamLetra * 0.12;
        marcaPuesto(pdf, r.puesto, x + 1.8, yR + altoPastilla / 2, Math.min(1.6, altoPastilla * 0.4));
        pdf.setTextColor(...hex(r.color.texto));
        pdf.setFontSize(tamLetra);

        // Letra, nombre y horario en el mismo renglón: si no cabe el horario largo se usa el
        // compacto ("06–14 y 21–06") y, si aún no cabe, se recorta el nombre.
        pdf.setFont('helvetica', 'bold');
        const xLetra = x + 4;
        pdf.text(r.letra, xLetra, base);
        const xNombre = xLetra + pdf.getTextWidth(r.letra) + 1.3;
        const xFin = x + anchoCelda - 1.8;
        pdf.setFont('helvetica', 'normal');
        let horario = r.horario ?? '';
        const espacioNombre = (h) => xFin - xNombre - pdf.getTextWidth(h) - 1.2;
        pdf.setFont('helvetica', 'bold');
        const anchoNombre = pdf.getTextWidth(r.nombre);
        pdf.setFont('helvetica', 'normal');
        if (anchoNombre > espacioNombre(horario) && r.horarioCompacto) horario = r.horarioCompacto;
        const disponible = espacioNombre(horario);
        pdf.setFont('helvetica', 'bold');
        let nombre = r.nombre;
        while (nombre.length > 2 && pdf.getTextWidth(nombre) > disponible) nombre = `${nombre.slice(0, -2)}…`;
        pdf.text(nombre, xNombre, base);
        pdf.setFont('helvetica', 'normal');
        pdf.text(horario, xFin, base, { align: 'right' });
      });
    }
  }

  pdf.save(`Horarios_${titulo.replace(/\s+/g, '_')}.pdf`);
}
