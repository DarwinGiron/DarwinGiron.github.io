// Exporta el calendario de un mes (personas × días) a Excel y a PDF, con los mismos colores
// de la app. Cada celda lleva la letra que se reporta (D, E1...), o la ausencia.

import { listarPersonal, listarTurnos, listarFeriados } from '../firebase.js';
import { textos } from '../textos.js';
import { isoALocal, localAIso, diasEnElMes, nombreMes } from './fechas.js';
import { etiquetaTurno, trabaja, horarioCorto, claveOrdenHora, tramosDe } from '../ajustes-turno.js';
import { cargarExcelJS, cargarJsPDF, descargarArchivo } from './cargar-script.js';
import { resumirMes } from '../paginas/reportes.js';

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

// ---------- PDF: calendario (hoja 1) y resumen de horas con firmas (hoja 2) ----------

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const hex = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const capital = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();

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
      // Un doble va en dos renglones: misma letra, cada horario.
      return tramosDe(turno).map((tramo) => {
        const letra = etiquetaTurno(tramo);
        return {
          orden: claveOrdenHora(tramo), letra, nombre: nombres.get(p.id), horario: horarioCorto(tramo), horarioCompacto: horarioCorto(tramo, { compacto: true }),
          color: COLORES[letra[0]] ?? COLORES.L, puesto: p.puesto,
        };
      });
    })
    .flat()
    .filter(Boolean)
    .sort((a, b) => a.orden.localeCompare(b.orden) || a.nombre.localeCompare(b.nombre));
}

/**
 * Ícono del puesto, el mismo que en pantalla: lupa = inspector, cruz = encargado.
 * Se dibuja en vectores (contorno) con las proporciones del ícono de 24×24 de la app.
 * (x, y) = esquina izquierda y centro vertical; `tam` = lado del ícono en mm.
 */
function marcaPuesto(pdf, puesto, x, y, tam, color = [70, 70, 70]) {
  const e = tam / 24; // escala: 1 unidad del ícono de 24
  const ox = x;
  const oy = y - tam / 2;
  const p = (ux, uy) => [ox + ux * e, oy + uy * e];
  pdf.setDrawColor(...color);
  pdf.setLineWidth(Math.max(0.18, tam * 0.11));
  if (puesto === 'inspector') {
    const [cx, cy] = p(10, 10);
    pdf.circle(cx, cy, 6.2 * e, 'S');
    const [x1, y1] = p(14.6, 14.6);
    const [x2, y2] = p(21, 21);
    pdf.line(x1, y1, x2, y2);
    return;
  }
  // Cruz (brazo superior corto, inferior largo), como el ícono de encargado de la app.
  const puntos = [[9, 2], [15, 2], [15, 6], [20.5, 6], [20.5, 12], [15, 12], [15, 22], [9, 22], [9, 12], [3.5, 12], [3.5, 6], [9, 6]].map(([ux, uy]) => p(ux, uy));
  const segmentos = puntos.slice(1).map(([px, py], i) => [px - puntos[i][0], py - puntos[i][1]]);
  pdf.lines(segmentos, puntos[0][0], puntos[0][1], [1, 1], 'S', true);
}

// Paleta del documento: sobria, con el color de marca solo como acento.
const TINTA = [34, 34, 34];
const TINTA_SUAVE = [106, 106, 106];
const LINEA = [222, 222, 222];
const FONDO_SUAVE = [247, 247, 247];
const MARCA = [227, 28, 95];

/** Encabezado común de cada hoja: marca, título, subtítulo y fecha de generación. */
function encabezado(pdf, { titulo, subtitulo, ancho, margen, generado }) {
  // Logo: cuadro redondeado con un reloj dibujado.
  pdf.setFillColor(...MARCA);
  pdf.roundedRect(margen, margen, 11, 11, 2.2, 2.2, 'F');
  pdf.setDrawColor(255, 255, 255);
  pdf.setLineWidth(0.7);
  pdf.circle(margen + 5.5, margen + 5.5, 3.3, 'S');
  pdf.line(margen + 5.5, margen + 5.5, margen + 5.5, margen + 3.4);
  pdf.line(margen + 5.5, margen + 5.5, margen + 7.1, margen + 6.4);

  pdf.setTextColor(...TINTA);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('COGUSA · CONTROL DE HORARIOS', margen + 14, margen + 3.8);
  pdf.setFontSize(16);
  pdf.text(titulo, margen + 14, margen + 10.6);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...TINTA_SUAVE);
  pdf.text(subtitulo, ancho - margen, margen + 3.8, { align: 'right' });
  pdf.text(`Generado el ${generado}`, ancho - margen, margen + 8, { align: 'right' });

  pdf.setDrawColor(...LINEA);
  pdf.setLineWidth(0.3);
  pdf.line(margen, margen + 14.5, ancho - margen, margen + 14.5);
  return margen + 14.5;
}

/** Pie de cada hoja: leyenda corta a la izquierda y número de página a la derecha. */
function pie(pdf, { ancho, alto, margen, pagina, total, texto }) {
  pdf.setDrawColor(...LINEA);
  pdf.setLineWidth(0.3);
  pdf.line(margen, alto - margen - 3.5, ancho - margen, alto - margen - 3.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.8);
  pdf.setTextColor(...TINTA_SUAVE);
  pdf.text(texto, margen, alto - margen);
  pdf.text(`Página ${pagina} de ${total}`, ancho - margen, alto - margen, { align: 'right' });
}

/** Leyenda: una "pastilla" por letra con su horario, las marcas de puesto y las ausencias. */
function leyenda(pdf, { x, y, ancho }) {
  const items = [
    { letra: 'D', texto: '06:00–14:00', color: COLORES.D },
    { letra: 'E', texto: '14:00–21:00', color: COLORES.E },
    { letra: 'F', texto: '21:00–06:00', color: COLORES.F },
    { letra: 'E1', texto: 'Dom. día 06:00–18:00', color: COLORES.E },
    { letra: 'D', texto: 'Dom. noche 18:00–06:00', color: COLORES.D },
  ];
  pdf.setFontSize(6.8);
  let cursor = x;
  for (const item of items) {
    pdf.setFont('helvetica', 'bold');
    const anchoLetra = pdf.getTextWidth(item.letra) + 2.4;
    pdf.setFillColor(...hex(item.color.fondo));
    pdf.roundedRect(cursor, y - 2.6, anchoLetra, 3.6, 0.8, 0.8, 'F');
    pdf.setTextColor(...hex(item.color.texto));
    pdf.text(item.letra, cursor + 1.2, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...TINTA_SUAVE);
    pdf.text(item.texto, cursor + anchoLetra + 1.2, y);
    cursor += anchoLetra + 1.2 + pdf.getTextWidth(item.texto) + 4.5;
  }
  marcaPuesto(pdf, 'inspector', cursor, y - 0.9, 2.6);
  pdf.text('Inspector', cursor + 3.4, y);
  cursor += 3.4 + pdf.getTextWidth('Inspector') + 3.5;
  marcaPuesto(pdf, 'encargado', cursor, y - 0.9, 2.6);
  pdf.text('Encargado', cursor + 3.4, y);
  cursor += 3.4 + pdf.getTextWidth('Encargado') + 4.5;

  const ausencias = Object.entries(ABREV_AUSENCIA).map(([k, a]) => `${a} ${textos.ausencias[k] ?? k}`).join(' · ');
  const lineas = pdf.splitTextToSize(`Ausencias: ${ausencias}`, Math.max(40, x + ancho - cursor));
  if (lineas.length === 1) {
    pdf.text(lineas[0], cursor, y);
    return y + 3;
  }
  pdf.text(pdf.splitTextToSize(`Ausencias: ${ausencias}`, ancho), x, y + 4.2);
  return y + 7.2;
}

export async function exportarMesPdf(mesIso) {
  const [JsPDF, datos] = await Promise.all([cargarJsPDF(), datosDelMes(mesIso)]);
  const { dias, personal, turnoDe, feriados, titulo } = datos;
  const nombres = nombresCortos(personal);
  const generado = new Date().toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });

  const pdf = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  pdf.setProperties({ title: `Horarios · ${titulo}`, subject: 'Calendario de turnos', creator: 'COGUSA · Horarios' });
  const ancho = pdf.internal.pageSize.getWidth();
  const alto = pdf.internal.pageSize.getHeight();
  const margen = 9;
  const totalPaginas = 2;
  const textoPie = 'Inspección y monitoreo de salud · Letra = la que se reporta en el sistema institucional';

  // ===================== Hoja 1: calendario =====================
  const yLinea = encabezado(pdf, { titulo: `Calendario de turnos · ${titulo}`, subtitulo: `${personal.length} personas`, ancho, margen, generado });
  const yLeyenda = leyenda(pdf, { x: margen, y: yLinea + 5.2, ancho: ancho - 2 * margen });

  const primerDia = isoALocal(dias[0].iso).getDay();
  const desfase = (primerDia + 6) % 7;
  const semanas = Math.ceil((desfase + dias.length) / 7);
  const anchoCelda = (ancho - 2 * margen) / 7;
  const yCabecera = yLeyenda + 2.5;
  const altoCabecera = 6.2;
  const yCuerpo = yCabecera + altoCabecera;
  const altoCelda = (alto - margen - 6 - yCuerpo) / semanas;

  const renglones = dias.map((d) => renglonesDelDia(d, personal, turnoDe, nombres));
  const maxRenglones = Math.max(1, ...renglones.map((r) => r.length));
  const altoRenglon = Math.min(4.6, (altoCelda - 5.6) / maxRenglones);
  const tamLetra = Math.max(5, Math.min(6.9, altoRenglon * 1.5));

  // Marco redondeado de la tabla y cabecera de días
  pdf.setFillColor(...FONDO_SUAVE);
  pdf.rect(margen, yCabecera, ancho - 2 * margen, altoCabecera, 'F');
  DIAS_SEMANA.forEach((nombre, i) => {
    const x = margen + i * anchoCelda;
    if (i === 6) {
      pdf.setFillColor(...hex('FCE8EC'));
      pdf.rect(x, yCabecera, anchoCelda, altoCabecera, 'F');
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...(i === 6 ? MARCA : TINTA_SUAVE));
    pdf.text(nombre.toUpperCase(), x + anchoCelda / 2, yCabecera + 4.2, { align: 'center' });
  });

  for (let s = 0; s < semanas; s++) {
    for (let c = 0; c < 7; c++) {
      const x = margen + c * anchoCelda;
      const y = yCuerpo + s * altoCelda;
      const indice = s * 7 + c - desfase;
      const dia = dias[indice];

      if (!dia) {
        pdf.setFillColor(...FONDO_SUAVE);
        pdf.rect(x, y, anchoCelda, altoCelda, 'F');
      } else if (dia.domingo || feriados.has(dia.iso)) {
        pdf.setFillColor(...hex('FFF8F9'));
        pdf.rect(x, y, anchoCelda, altoCelda, 'F');
      }
      if (!dia) continue;

      // Número del día (y "Feriado" si aplica)
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...(dia.domingo ? MARCA : TINTA));
      pdf.text(String(dia.numero), x + 1.8, y + 4);
      if (feriados.has(dia.iso)) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6);
        pdf.setTextColor(...MARCA);
        pdf.text('Feriado', x + anchoCelda - 1.8, y + 3.8, { align: 'right' });
      }

      renglones[indice].forEach((r, i) => {
        const yR = y + 5.6 + i * altoRenglon;
        const alturaFila = altoRenglon - 0.7;
        const centro = yR + alturaFila / 2;
        const base = centro + tamLetra * 0.13;
        const xIni = x + 1.4;
        const xFin = x + anchoCelda - 1.6;

        // Fondo muy tenue y barra de color a la izquierda
        pdf.setFillColor(...hex(r.color.fondo));
        pdf.roundedRect(xIni, yR, xFin - xIni + 0.2, alturaFila, 0.7, 0.7, 'F');
        pdf.setFillColor(...hex(r.color.texto));
        pdf.rect(xIni, yR, 0.7, alturaFila, 'F');

        marcaPuesto(pdf, r.puesto, xIni + 1.4, centro, Math.min(2.3, alturaFila * 0.7), hex(r.color.texto));
        pdf.setFontSize(tamLetra);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...hex(r.color.texto));
        const xLetra = xIni + 4.1;
        pdf.text(r.letra, xLetra, base);
        const xNombre = xLetra + Math.max(pdf.getTextWidth('E1'), pdf.getTextWidth(r.letra)) + 1.4;

        pdf.setFont('helvetica', 'normal');
        let horario = r.horario ?? '';
        const espacio = (h) => xFin - xNombre - pdf.getTextWidth(h) - 1.4;
        pdf.setFont('helvetica', 'bold');
        if (pdf.getTextWidth(r.nombre) > espacio(horario) && r.horarioCompacto) horario = r.horarioCompacto;
        let nombre = r.nombre;
        while (nombre.length > 2 && pdf.getTextWidth(nombre) > espacio(horario)) nombre = `${nombre.slice(0, -2)}…`;
        pdf.setTextColor(...TINTA);
        pdf.text(nombre, xNombre, base);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...TINTA_SUAVE);
        pdf.text(horario, xFin - 0.4, base, { align: 'right' });
      });
    }
  }

  // Cuadrícula fina por encima de los fondos
  pdf.setDrawColor(...LINEA);
  pdf.setLineWidth(0.25);
  for (let c = 0; c <= 7; c++) pdf.line(margen + c * anchoCelda, yCabecera, margen + c * anchoCelda, yCuerpo + semanas * altoCelda);
  for (let s = 0; s <= semanas; s++) pdf.line(margen, yCuerpo + s * altoCelda, ancho - margen, yCuerpo + s * altoCelda);
  pdf.line(margen, yCabecera, ancho - margen, yCabecera);
  pie(pdf, { ancho, alto, margen, pagina: 1, total: totalPaginas, texto: textoPie });

  // ===================== Hoja 2: resumen por persona =====================
  pdf.addPage('letter', 'landscape');
  const y2 = encabezado(pdf, { titulo: `Resumen del mes · ${titulo}`, subtitulo: 'Horas por persona', ancho, margen, generado });
  const turnosDelMes = [...turnoDe.values()].filter((t) => t.fecha >= dias[0].iso && t.fecha <= dias[dias.length - 1].iso);
  const resumen = resumirMes(personal, turnosDelMes).map((r) => ({
    ...r,
    horasReales: Math.round(turnosDelMes.filter((t) => t.usuario_id === r.persona.id).reduce((acc, t) => acc + (Number(t.horas_reales) || 0), 0) * 10) / 10,
  }));

  const columnas = [
    { titulo: 'Persona', ancho: 58, alinear: 'left', valor: (r) => r.persona.nombre },
    { titulo: 'Puesto', ancho: 24, alinear: 'left', valor: (r) => capital(r.persona.puesto ?? '') },
    { titulo: 'Grupo', ancho: 16, valor: (r) => (r.persona.grupo ? `Turno ${r.persona.grupo}` : '—') },
    { titulo: 'Días trab.', ancho: 18, valor: (r) => r.diasTrabajados },
    { titulo: 'Horas reales', ancho: 21, valor: (r) => r.horasReales },
    { titulo: 'Ordinarias', ancho: 20, valor: (r) => r.horasOrdinarias },
    { titulo: 'Extra', ancho: 16, valor: (r) => r.horasExtra },
    { titulo: 'Turnos F', ancho: 16, valor: (r) => r.turnosF },
    { titulo: 'Domingos', ancho: 17, valor: (r) => r.domingos },
    { titulo: 'Vacac./Aus.', ancho: 20, valor: (r) => r.ausencias },
    { titulo: 'Permisos', ancho: 16, valor: (r) => r.permisos },
    { titulo: 'No se presentó', ancho: 19.4, valor: (r) => r.faltas },
  ];
  const anchoTabla = columnas.reduce((s, c) => s + c.ancho, 0);
  const xTabla = margen + (ancho - 2 * margen - anchoTabla) / 2;
  let y = y2 + 8;
  const altoFila = 8;

  // Cabecera de la tabla
  pdf.setFillColor(...TINTA);
  pdf.roundedRect(xTabla, y, anchoTabla, altoFila, 1.2, 1.2, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.2);
  pdf.setTextColor(255, 255, 255);
  let cx = xTabla;
  for (const col of columnas) {
    const tx = col.alinear === 'left' ? cx + 2.5 : cx + col.ancho / 2;
    pdf.text(col.titulo, tx, y + 5.2, { align: col.alinear === 'left' ? 'left' : 'center' });
    cx += col.ancho;
  }
  y += altoFila;

  const totales = { diasTrabajados: 0, horasReales: 0, horasOrdinarias: 0, horasExtra: 0 };
  resumen.forEach((r, i) => {
    if (i % 2 === 1) {
      pdf.setFillColor(...FONDO_SUAVE);
      pdf.rect(xTabla, y, anchoTabla, altoFila, 'F');
    }
    let x = xTabla;
    columnas.forEach((col, j) => {
      pdf.setFont('helvetica', j === 0 ? 'bold' : 'normal');
      pdf.setFontSize(7.6);
      pdf.setTextColor(...(j === 0 ? TINTA : [60, 60, 60]));
      const valor = String(col.valor(r) ?? '');
      const tx = col.alinear === 'left' ? x + 2.5 : x + col.ancho / 2;
      pdf.text(valor, tx, y + 5.2, { align: col.alinear === 'left' ? 'left' : 'center', maxWidth: col.ancho - 3 });
      x += col.ancho;
    });
    pdf.setDrawColor(...LINEA);
    pdf.setLineWidth(0.2);
    pdf.line(xTabla, y + altoFila, xTabla + anchoTabla, y + altoFila);
    totales.diasTrabajados += r.diasTrabajados;
    totales.horasReales += r.horasReales;
    totales.horasOrdinarias += r.horasOrdinarias;
    totales.horasExtra += r.horasExtra;
    y += altoFila;
  });

  // Fila de totales
  pdf.setFillColor(...hex('FCE8EC'));
  pdf.rect(xTabla, y, anchoTabla, altoFila, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.6);
  pdf.setTextColor(...TINTA);
  pdf.text('Total del equipo', xTabla + 2.5, y + 5.2);
  const redondear = (n) => Math.round(n * 10) / 10;
  const valoresTotales = { 3: totales.diasTrabajados, 4: redondear(totales.horasReales), 5: redondear(totales.horasOrdinarias), 6: redondear(totales.horasExtra) };
  let tx = xTabla;
  columnas.forEach((col, j) => {
    if (valoresTotales[j] !== undefined) pdf.text(String(valoresTotales[j]), tx + col.ancho / 2, y + 5.2, { align: 'center' });
    tx += col.ancho;
  });
  y += altoFila + 6;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(...TINTA_SUAVE);
  const notas = 'Horas ordinarias por letra: D 8 h · E 7 h · F 6 h. Lo que pasa de esas horas se cuenta como extra; en feriado todas las horas son extra. '
    + 'El domingo de 6 a 6 de día (06:00–18:00) descuenta 1 h de almuerzo.';
  pdf.text(pdf.splitTextToSize(notas, anchoTabla), xTabla, y);

  // Firmas
  const yFirmas = alto - margen - 22;
  const anchoFirma = 62;
  const separacion = (anchoTabla - 3 * anchoFirma) / 2;
  ['Elaboró', 'Revisó', 'Aprobó'].forEach((rotulo, i) => {
    const xf = xTabla + i * (anchoFirma + separacion);
    pdf.setDrawColor(...TINTA_SUAVE);
    pdf.setLineWidth(0.3);
    pdf.line(xf, yFirmas, xf + anchoFirma, yFirmas);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...TINTA);
    pdf.text(rotulo, xf + anchoFirma / 2, yFirmas + 4.2, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(...TINTA_SUAVE);
    pdf.text('Nombre, firma y fecha', xf + anchoFirma / 2, yFirmas + 7.8, { align: 'center' });
  });
  pie(pdf, { ancho, alto, margen, pagina: 2, total: totalPaginas, texto: textoPie });

  pdf.save(`Horarios_${titulo.replace(/\s+/g, '_')}.pdf`);
}
