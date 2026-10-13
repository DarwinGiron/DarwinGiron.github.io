// ============================================================================
// EXPORT.JS - Exportación de informes en PDF (pdfmake), Word (.docx) y
// Excel (.xlsx). Incluye TODOS los reportes del período elegido (pendientes
// + validados).
//
// El PDF y el Word usan un diseño de TARJETAS tipo Airbnb (una por hallazgo,
// 4 por página en cuadrícula 2x2): fotografía de esquinas redondeadas con la
// gravedad como insignia sobre la foto, y debajo, sin marco, el título
// "Zona — Proceso", la categoría, la descripción completa y los metadatos
// (autor, fecha/hora, turno, revisado por). Antes de las tarjetas va una hoja
// de resumen con el período, los totales y el detalle por proceso. El
// encabezado oficial (logo, código SIG-FO-114) se mantiene en cada hoja.
// El Excel es solo tabular y no incluye imágenes.
// ============================================================================

/** Descarga una URL de imagen y la convierte a base64 (dataURL). */
async function urlAImagenBase64(url) {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result);
      lector.onerror = reject;
      lector.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("No se pudo descargar imagen para el informe:", url, e);
    return null;
  }
}

/** Ruta del logo, ajustada según la profundidad de carpetas de la página actual. */
function rutaLogoEmpresa() {
  const rutaBase = window.location.pathname.includes("/admin/") ? "../" : "";
  return rutaBase + EMPRESA_CONFIG.logo;
}

function textoEstado(r) {
  return r.estado === "validado" ? "Validado" : "Pendiente";
}

/** Color del punto de gravedad (insignia sobre la foto y fila de resumen). */
function colorPuntoGravedad(g) {
  const paleta = { "Crítico": "#C13515", "Mayor": "#E07912", "Menor": "#E8B007", "Observación": "#6A6A6A" };
  return paleta[g] || paleta["Observación"];
}

// Paleta del informe (la del Dashboard tipo Airbnb).
const INF = { tinta: "#222222", gris: "#6A6A6A", linea: "#EBEBEB", suave: "#F7F7F7", coral: "#FF385C" };

const TARJETAS_POR_PAGINA = 4; // cuadrícula 2x2
const FOTO_PX = { w: 640, h: 300 }; // proporción de la foto de cada tarjeta

/**
 * Agrupa por proceso (alfabético) y, dentro de cada proceso, ordena por
 * fecha. Cada proceso empieza SIEMPRE en una página nueva: se pagina de 4 en
 * 4 dentro del proceso, y si su última hoja queda con casillas libres, esas
 * NO se rellenan con reportes del siguiente proceso (quedan vacías) — cada
 * página del array devuelto pertenece a un solo proceso.
 *
 * Devuelve un array de páginas, cada una como { proceso, tarjetas }, para que
 * el informe pueda imprimir el nombre del proceso como título en cada hoja
 * (incluidas las hojas de continuación de un mismo proceso).
 */
function construirPaginasDeTarjetas(reportes) {
  const porProceso = new Map();
  reportes.forEach((r) => {
    const clave = r.proceso || "Sin proceso";
    if (!porProceso.has(clave)) porProceso.set(clave, []);
    porProceso.get(clave).push(r);
  });

  const procesosOrdenados = [...porProceso.keys()].sort((a, b) => a.localeCompare(b, "es"));

  const paginas = [];
  procesosOrdenados.forEach((proceso) => {
    const lista = porProceso.get(proceso).sort((a, b) => {
      const ta = a.fechaHora?.toMillis ? a.fechaHora.toMillis() : 0;
      const tb = b.fechaHora?.toMillis ? b.fechaHora.toMillis() : 0;
      return ta - tb;
    });
    for (let i = 0; i < lista.length; i += TARJETAS_POR_PAGINA) {
      paginas.push({ proceso, tarjetas: lista.slice(i, i + TARJETAS_POR_PAGINA) });
    }
  });
  return paginas;
}

/** Cantidad de reportes por gravedad (Menor, Mayor, Crítico) del período y detalle por proceso. */
function resumenInforme(reportes) {
  const porProceso = new Map();
  reportes.forEach((r) => {
    const clave = r.proceso || "Sin proceso";
    const f = porProceso.get(clave) || { proceso: clave, total: 0, menores: 0, mayores: 0, criticos: 0 };
    f.total++;
    if (r.gravedad === "Menor") f.menores++;
    if (r.gravedad === "Mayor") f.mayores++;
    if (r.gravedad === "Crítico") f.criticos++;
    porProceso.set(clave, f);
  });
  const menores = reportes.filter((r) => r.gravedad === "Menor").length;
  const mayores = reportes.filter((r) => r.gravedad === "Mayor").length;
  const criticos = reportes.filter((r) => r.gravedad === "Crítico").length;
  return {
    total: reportes.length,
    menores, mayores, criticos,
    // Reportes que no entran en las tres cantidades: Observación o sin gravedad
    // todavía (la gravedad se asigna al validar el reporte).
    sinContar: reportes.length - menores - mayores - criticos,
    procesos: [...porProceso.values()].sort((a, b) => a.proceso.localeCompare(b.proceso, "es"))
  };
}

function textoPeriodoInforme(desde, hasta) {
  if (!desde || !hasta) return "";
  const f = (d) => d.toLocaleDateString("es-GT", { day: "numeric", month: "long", year: "numeric" });
  return `Semana del ${f(desde)} al ${f(hasta)}`;
}

function textoRevisadoPor(r) {
  return (r.validadoPorNombre || "Pendiente de validación") + (r.validadoPorNombre && r.validadoPorPuesto ? ` (${r.validadoPorPuesto})` : "");
}

function cargarImagen(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Foto de la tarjeta, recortada a una proporción fija (como las fichas de
 * Airbnb), con esquinas redondeadas y la gravedad como insignia blanca sobre
 * la esquina superior izquierda. Se dibuja en un canvas y se entrega como JPEG
 * (las esquinas quedan blancas, igual que el fondo de la hoja), así el PDF y el
 * Word reciben una sola imagen ya terminada y pesan poco.
 * Sin fotografía se dibuja un recuadro gris con la leyenda.
 */
async function fotoTarjeta(urlFoto, gravedad) {
  try {
    const base64 = urlFoto ? await urlAImagenBase64(urlFoto) : null;
    const img = base64 ? await cargarImagen(base64) : null;
    const { w: W, h: H } = FOTO_PX;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);

    const trazoRedondeado = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    ctx.save();
    trazoRedondeado(0, 0, W, H, 26);
    ctx.clip();
    if (img) {
      // Recorte tipo "cover": llena el recuadro sin deformar la foto.
      const escala = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * escala, dh = img.naturalHeight * escala;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = INF.suave;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#B0B0B0";
      ctx.font = "600 26px 'Nunito Sans', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Sin fotografía", W / 2, H / 2);
    }
    ctx.restore();

    if (gravedad) {
      ctx.font = "800 24px 'Nunito Sans', Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const texto = gravedad;
      const anchoTexto = ctx.measureText(texto).width;
      const bx = 18, by = 18, bh = 46, bw = anchoTexto + 62;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.28)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = "#FFFFFF";
      trazoRedondeado(bx, by, bw, bh, bh / 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = colorPuntoGravedad(gravedad);
      ctx.beginPath();
      ctx.arc(bx + 22, by + bh / 2, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INF.tinta;
      ctx.fillText(texto, bx + 40, by + bh / 2 + 1);
    }
    return canvas.toDataURL("image/jpeg", 0.84);
  } catch (e) {
    console.warn("No se pudo preparar la foto de la tarjeta:", e);
    return null;
  }
}

/**
 * Convierte un SVG (stroke-based, con "currentColor") a un PNG pequeño en
 * base64, para poder usar el MISMO ícono que la app (usuario, reloj) tanto
 * en el PDF (pdfmake) como en el Word (ImageRun), sin depender del soporte
 * de SVG de cada librería.
 */
function svgAImagenBase64(svgTexto, colorHex, tamanoPx = 40) {
  return new Promise((resolve, reject) => {
    const svgConColor = svgTexto.replace(/currentColor/g, colorHex);
    const svgDataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgConColor)));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = tamanoPx; canvas.height = tamanoPx;
      canvas.getContext("2d").drawImage(img, 0, 0, tamanoPx, tamanoPx);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = svgDataUrl;
  });
}

// Mismos íconos que usa la tarjeta real de la app en admin/validacion.html.
const ICONO_USUARIO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const ICONO_RELOJ_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

// ---------------------------------------------------------------------------
// EXPORTACIÓN A PDF (pdfmake)
// ---------------------------------------------------------------------------
async function exportarInformePDF(reportes, desde, hasta, perfilAdmin) {
  if (!reportes.length) { mostrarAvisoGlobal("No hay reportes en el período seleccionado.", "advertencia"); return; }

  const paginas = construirPaginasDeTarjetas(reportes);
  const resumen = resumenInforme(reportes);

  // Foto terminada de cada tarjeta (recortada, redondeada y con insignia)
  const fotoPorReporte = {};
  for (const r of reportes) {
    fotoPorReporte[r.id] = await fotoTarjeta(r.fotos && r.fotos.length ? r.fotos[0] : null, r.gravedad);
  }

  // Logo para el encabezado (opcional: si falla, se muestra el nombre en texto)
  const logoB64 = await urlAImagenBase64(rutaLogoEmpresa());

  const [iconoUsuarioB64, iconoRelojB64] = await Promise.all([
    svgAImagenBase64(ICONO_USUARIO_SVG, INF.gris),
    svgAImagenBase64(ICONO_RELOJ_SVG, INF.gris)
  ]);

  // Ancho útil: 612 - 2×50 = 512pt. Dos columnas de 249pt con 14pt entre ellas.
  const ANCHO_TARJETA = 249;

  function tarjetaPDF(r) {
    const foto = fotoPorReporte[r.id];
    const contenido = [];
    if (foto) contenido.push({ image: foto, width: ANCHO_TARJETA, margin: [0, 0, 0, 8] });

    contenido.push({ text: `${r.zona} — ${r.proceso}`, bold: true, color: INF.tinta, fontSize: 10.5, margin: [0, 0, 0, 1] });
    contenido.push({ text: textoCategoria(r), color: INF.gris, fontSize: 8, margin: [0, 0, 0, 5] });
    contenido.push({ text: r.descripcion, color: INF.tinta, fontSize: 8, lineHeight: 1.25, margin: [0, 0, 0, 7] });

    contenido.push({
      columns: [{ width: 10, image: iconoUsuarioB64, height: 10 }, { width: "*", text: r.inspectorNombre + (r.inspectorPuesto ? ` (${r.inspectorPuesto})` : ""), fontSize: 7.5, color: INF.tinta, margin: [4, 1, 0, 0] }],
      margin: [0, 0, 0, 3]
    });
    contenido.push({
      columns: [{ width: 10, image: iconoRelojB64, height: 10 }, { width: "*", text: `${formatearFechaHora(r.fechaHora)}${r.turno ? " · " + r.turno : ""}`, fontSize: 7.5, color: INF.tinta, margin: [4, 1, 0, 0] }],
      margin: [0, 0, 0, 5]
    });
    contenido.push({ text: [{ text: "Revisado por ", color: INF.gris }, { text: textoRevisadoPor(r), bold: true, color: INF.tinta }], fontSize: 7 });

    return { stack: contenido };
  }

  // --- Hoja de resumen: título, período, totales y detalle por proceso -----
  const celdaKpi = (valor, etiqueta, gravedad) => ({
    stack: [
      { text: String(valor), fontSize: 26, bold: true, color: INF.tinta },
      // El punto se dibuja (la fuente del PDF no trae el carácter "●").
      {
        columns: [
          { width: 11, canvas: [{ type: "ellipse", x: 4, y: 8, r1: 3.5, r2: 3.5, color: colorPuntoGravedad(gravedad) }] },
          { width: "*", text: etiqueta, fontSize: 9, color: INF.gris, margin: [0, 3, 0, 0] }
        ],
        margin: [0, 0, 0, 0]
      }
    ],
    fillColor: INF.suave,
    margin: [12, 10, 12, 10]
  });

  const encabezadoTabla = (t, alinear) => ({ text: t.toUpperCase(), fontSize: 7, bold: true, color: INF.gris, alignment: alinear || "left", margin: [0, 2, 0, 2] });
  const filasProceso = resumen.procesos.map((p) => [
    { text: p.proceso, fontSize: 9, color: INF.tinta },
    { text: String(p.total), fontSize: 9, bold: true, alignment: "right" },
    { text: String(p.menores), fontSize: 9, alignment: "right" },
    { text: String(p.mayores), fontSize: 9, alignment: "right" },
    { text: String(p.criticos), fontSize: 9, alignment: "right", bold: p.criticos > 0, color: p.criticos > 0 ? colorPuntoGravedad("Crítico") : INF.tinta }
  ]);

  // Aclaración solo cuando algún reporte no entra en las tres cantidades.
  const notaSinContar = resumen.sinContar > 0
    ? `Total: ${resumen.total} reportes. ${resumen.sinContar} no se cuentan arriba por ser Observación o no tener gravedad asignada todavía.`
    : `Total: ${resumen.total} reportes.`;

  const hojaResumen = [
    { text: EMPRESA_CONFIG.tituloInforme, fontSize: 22, bold: true, color: INF.tinta, margin: [0, 14, 0, 4] },
    { text: textoPeriodoInforme(desde, hasta), fontSize: 12, color: INF.gris, margin: [0, 0, 0, 2] },
    { text: `Generado el ${new Date().toLocaleDateString("es-GT", { day: "numeric", month: "long", year: "numeric" })}${perfilAdmin ? " por " + (perfilAdmin.nombre || perfilAdmin.correo) : ""}`, fontSize: 8, color: INF.gris, margin: [0, 0, 0, 22] },
    {
      table: { widths: ["*", "*", "*"], body: [[celdaKpi(resumen.menores, "Menores", "Menor"), celdaKpi(resumen.mayores, "Mayores", "Mayor"), celdaKpi(resumen.criticos, "Críticos", "Crítico")]] },
      layout: { hLineWidth: () => 0, vLineWidth: (i) => (i === 0 || i === 3 ? 0 : 8), vLineColor: () => "#FFFFFF" },
      margin: [0, 0, 0, 6]
    },
    { text: notaSinContar, fontSize: 8, color: INF.gris, margin: [0, 0, 0, 22] },
    { text: "Hallazgos por proceso", fontSize: 13, bold: true, color: INF.tinta, margin: [0, 0, 0, 8] },
    {
      table: {
        headerRows: 1,
        widths: ["*", 52, 52, 52, 52],
        body: [[encabezadoTabla("Proceso"), encabezadoTabla("Reportes", "right"), encabezadoTabla("Menores", "right"), encabezadoTabla("Mayores", "right"), encabezadoTabla("Críticos", "right")], ...filasProceso]
      },
      layout: {
        hLineWidth: (i, nodo) => (i === 0 || i === nodo.table.body.length ? 0 : i === 1 ? 1 : 0.5),
        hLineColor: (i) => (i === 1 ? "#DDDDDD" : INF.linea),
        vLineWidth: () => 0,
        paddingTop: () => 6, paddingBottom: () => 6, paddingLeft: () => 2, paddingRight: () => 2
      }
    }
  ];

  // --- Cuadrícula de tarjetas, 4 por página (2x2). Cada fila de 2 tarjetas
  // es su PROPIA tabla (con dontBreakRows) para que, si alguna vez el
  // contenido no cabe completo en lo que queda de la página, la fila
  // COMPLETA pase a la siguiente en vez de partirse a la mitad. ---
  const bloquesTarjetas = [];
  paginas.forEach((pagina) => {
    const totalProceso = resumen.procesos.find((p) => p.proceso === pagina.proceso)?.total;
    // Título del proceso al inicio de cada hoja; el salto de página va AQUÍ
    // para que quede pegado a las tarjetas de esa hoja.
    bloquesTarjetas.push({
      columns: [
        { text: pagina.proceso, fontSize: 15, bold: true, color: INF.tinta, width: "*" },
        { text: totalProceso ? `${totalProceso} reporte${totalProceso === 1 ? "" : "s"}` : "", fontSize: 9, color: INF.gris, alignment: "right", width: "auto", margin: [0, 5, 0, 0] }
      ],
      pageBreak: "before",
      margin: [0, 0, 0, 4]
    });
    bloquesTarjetas.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: 512, y2: 0, lineWidth: 0.75, lineColor: INF.linea }], margin: [0, 0, 0, 14] });
    for (let i = 0; i < pagina.tarjetas.length; i += 2) {
      const izq = pagina.tarjetas[i], der = pagina.tarjetas[i + 1];
      bloquesTarjetas.push({
        table: { widths: [ANCHO_TARJETA + 7, ANCHO_TARJETA + 7], body: [[izq ? tarjetaPDF(izq) : {}, der ? tarjetaPDF(der) : {}]], dontBreakRows: true },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: (ci) => (ci === 1 ? 7 : 0), paddingRight: (ci) => (ci === 0 ? 7 : 0), paddingTop: () => 0, paddingBottom: () => 16 }
      });
    }
  });

  const docDefinicion = {
    pageSize: "LETTER",
    pageMargins: [50, 70, 50, 50],
    header: {
      margin: [50, 20, 50, 0],
      columns: [
        logoB64
          ? { image: logoB64, width: 180 }
          : { text: EMPRESA_CONFIG.nombre, bold: true, fontSize: 11 },
        {
          stack: [
            { text: EMPRESA_CONFIG.codigoFormulario, alignment: "right", fontSize: 8, color: INF.gris },
            { text: EMPRESA_CONFIG.revisionFormulario, alignment: "right", fontSize: 8, color: INF.gris }
          ]
        }
      ]
    },
    footer: (pagina, total) => ({
      margin: [50, 0, 50, 0],
      columns: [
        { text: EMPRESA_CONFIG.sistema, fontSize: 7, color: "#B0B0B0" },
        { text: `${pagina} / ${total}`, fontSize: 7, color: "#B0B0B0", alignment: "right" }
      ]
    }),
    content: [...hojaResumen, ...bloquesTarjetas],
    defaultStyle: { fontSize: 9, color: INF.tinta }
  };

  pdfMake.createPdf(docDefinicion).download(`Reporte_Semanal_Inocuidad_COGUSA_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ---------------------------------------------------------------------------
// EXPORTACIÓN A WORD (.docx) usando la librería "docx"
// ---------------------------------------------------------------------------
async function exportarInformeWord(reportes, desde, hasta, perfilAdmin) {
  if (!reportes.length) { mostrarAvisoGlobal("No hay reportes en el período seleccionado.", "advertencia"); return; }

  const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, ImageRun, WidthType, Header, Footer, PageNumber, BorderStyle, VerticalAlign, PageBreak, ShadingType } = docx;
  const sinHex = (c) => c.replace("#", "");

  // Ancho útil de página Carta con márgenes de 1": 9360 DXA
  const ANCHO_TABLA = 9360;

  // --- Logo para el encabezado (si no se puede cargar, el Word se genera sin él) ---
  let logoBytes = null;
  try {
    const resp = await fetch(rutaLogoEmpresa());
    logoBytes = new Uint8Array(await resp.arrayBuffer());
  } catch (e) {
    console.warn("No se pudo cargar el logo para el encabezado del Word:", e);
  }

  /** Convierte un dataURL a Uint8Array, para usarlo en un ImageRun. */
  function dataUrlABytes(dataUrl) {
    const base64 = dataUrl.split(",")[1];
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes;
  }

  const iconoUsuarioBytes = dataUrlABytes(await svgAImagenBase64(ICONO_USUARIO_SVG, INF.gris));
  const iconoRelojBytes = dataUrlABytes(await svgAImagenBase64(ICONO_RELOJ_SVG, INF.gris));

  const ninguno = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const sinBordes = { top: ninguno, bottom: ninguno, left: ninguno, right: ninguno, insideHorizontal: ninguno, insideVertical: ninguno };
  const sinBordeCelda = { top: ninguno, bottom: ninguno, left: ninguno, right: ninguno };

  const encabezadoDocx = new Header({
    children: [
      new Table({
        width: { size: ANCHO_TABLA, type: WidthType.DXA },
        columnWidths: [7000, 2360],
        borders: sinBordes,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 7000, type: WidthType.DXA },
                borders: sinBordeCelda,
                children: logoBytes
                  ? [new Paragraph({ children: [new ImageRun({ data: logoBytes, type: "png", transformation: { width: 220, height: 40 } })] })]
                  : [new Paragraph({ children: [new TextRun({ text: EMPRESA_CONFIG.nombre, bold: true })] })]
              }),
              new TableCell({
                width: { size: 2360, type: WidthType.DXA },
                borders: sinBordeCelda,
                children: [
                  new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: EMPRESA_CONFIG.codigoFormulario, size: 16, color: sinHex(INF.gris) })] }),
                  new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: EMPRESA_CONFIG.revisionFormulario, size: 16, color: sinHex(INF.gris) })] })
                ]
              })
            ]
          })
        ]
      })
    ]
  });

  const pieDocx = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: EMPRESA_CONFIG.sistema + "  ·  ", size: 14, color: "B0B0B0" }),
          new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "B0B0B0" })
        ]
      })
    ]
  });

  // --- Hoja de resumen --------------------------------------------------------
  const paginas = construirPaginasDeTarjetas(reportes);
  const resumen = resumenInforme(reportes);
  const blanco = { style: BorderStyle.SINGLE, size: 24, color: "FFFFFF" };
  // Aclaración solo cuando algún reporte no entra en las tres cantidades.
  const notaSinContar = resumen.sinContar > 0
    ? `Total: ${resumen.total} reportes. ${resumen.sinContar} no se cuentan arriba por ser Observación o no tener gravedad asignada todavía.`
    : `Total: ${resumen.total} reportes.`;

  const celdaKpi = (valor, etiqueta, gravedad) => new TableCell({
    width: { size: ANCHO_TABLA / 3, type: WidthType.DXA },
    borders: { top: blanco, bottom: blanco, left: blanco, right: blanco },
    shading: { type: ShadingType.CLEAR, fill: sinHex(INF.suave), color: "auto" },
    margins: { top: 140, bottom: 140, left: 200, right: 200 },
    children: [
      new Paragraph({ children: [new TextRun({ text: String(valor), bold: true, size: 52, color: sinHex(INF.tinta) })] }),
      new Paragraph({ children: [
        new TextRun({ text: "● ", size: 18, color: sinHex(colorPuntoGravedad(gravedad)) }),
        new TextRun({ text: etiqueta, size: 18, color: sinHex(INF.gris) })
      ] })
    ]
  });

  const lineaFina = { style: BorderStyle.SINGLE, size: 4, color: sinHex(INF.linea) };
  const celdaTabla = (texto, ancho, opts = {}) => new TableCell({
    width: { size: ancho, type: WidthType.DXA },
    borders: { top: ninguno, left: ninguno, right: ninguno, bottom: opts.encabezado ? { style: BorderStyle.SINGLE, size: 8, color: "DDDDDD" } : lineaFina },
    margins: { top: 90, bottom: 90, left: 40, right: 40 },
    children: [new Paragraph({
      alignment: opts.derecha ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new TextRun({
        text: opts.encabezado ? texto.toUpperCase() : texto,
        bold: !!opts.negrita || !!opts.encabezado,
        size: opts.encabezado ? 14 : 18,
        color: opts.color || (opts.encabezado ? sinHex(INF.gris) : sinHex(INF.tinta))
      })]
    })]
  });

  const ANCHOS_PROC = [4360, 1250, 1250, 1250, 1250];
  const filaEncabezadoProc = new TableRow({
    tableHeader: true,
    children: [celdaTabla("Proceso", ANCHOS_PROC[0], { encabezado: true }), celdaTabla("Reportes", ANCHOS_PROC[1], { encabezado: true, derecha: true }), celdaTabla("Menores", ANCHOS_PROC[2], { encabezado: true, derecha: true }), celdaTabla("Mayores", ANCHOS_PROC[3], { encabezado: true, derecha: true }), celdaTabla("Críticos", ANCHOS_PROC[4], { encabezado: true, derecha: true })]
  });
  const filasProc = resumen.procesos.map((p) => new TableRow({
    children: [
      celdaTabla(p.proceso, ANCHOS_PROC[0]),
      celdaTabla(String(p.total), ANCHOS_PROC[1], { derecha: true, negrita: true }),
      celdaTabla(String(p.menores), ANCHOS_PROC[2], { derecha: true }),
      celdaTabla(String(p.mayores), ANCHOS_PROC[3], { derecha: true }),
      celdaTabla(String(p.criticos), ANCHOS_PROC[4], { derecha: true, negrita: p.criticos > 0, color: p.criticos > 0 ? sinHex(colorPuntoGravedad("Crítico")) : undefined })
    ]
  }));

  const hojaResumen = [
    new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: EMPRESA_CONFIG.tituloInforme, bold: true, size: 44, color: sinHex(INF.tinta) })] }),
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: textoPeriodoInforme(desde, hasta), size: 24, color: sinHex(INF.gris) })] }),
    new Paragraph({
      spacing: { after: 400 },
      children: [new TextRun({ text: `Generado el ${new Date().toLocaleDateString("es-GT", { day: "numeric", month: "long", year: "numeric" })}${perfilAdmin ? " por " + (perfilAdmin.nombre || perfilAdmin.correo) : ""}`, size: 16, color: sinHex(INF.gris) })]
    }),
    new Table({
      width: { size: ANCHO_TABLA, type: WidthType.DXA },
      columnWidths: [3120, 3120, 3120],
      borders: sinBordes,
      rows: [new TableRow({ children: [celdaKpi(resumen.menores, "Menores", "Menor"), celdaKpi(resumen.mayores, "Mayores", "Mayor"), celdaKpi(resumen.criticos, "Críticos", "Crítico")] })]
    }),
    new Paragraph({ spacing: { before: 100, after: 0 }, children: [new TextRun({ text: notaSinContar, size: 16, color: sinHex(INF.gris) })] }),
    new Paragraph({ spacing: { before: 400, after: 160 }, children: [new TextRun({ text: "Hallazgos por proceso", bold: true, size: 26, color: sinHex(INF.tinta) })] }),
    new Table({
      width: { size: ANCHO_TABLA, type: WidthType.DXA },
      columnWidths: ANCHOS_PROC,
      borders: sinBordes,
      rows: [filaEncabezadoProc, ...filasProc]
    })
  ];

  // --- Tarjetas: dos por fila, sin marco, con un espaciador al centro --------
  const ANCHO_ESPACIADOR = 360;
  const ANCHO_TARJETA = (ANCHO_TABLA - ANCHO_ESPACIADOR) / 2; // 4500
  // Foto: 4500 DXA = 225pt = 300px de ancho útil menos márgenes de celda.
  const FOTO_WORD = { width: 292, height: Math.round(292 * FOTO_PX.h / FOTO_PX.w) };

  /** Contenido de una tarjeta: foto con insignia de gravedad, título,
   * categoría, descripción y metadatos. */
  async function contenidoTarjetaWord(r) {
    const hijos = [];
    const foto = await fotoTarjeta(r.fotos && r.fotos.length ? r.fotos[0] : null, r.gravedad);
    if (foto) {
      hijos.push(new Paragraph({
        spacing: { after: 140 },
        children: [new ImageRun({ data: dataUrlABytes(foto), type: "jpg", transformation: FOTO_WORD })]
      }));
    }

    hijos.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: `${r.zona} — ${r.proceso}`, bold: true, color: sinHex(INF.tinta), size: 22 })] }));
    hijos.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: textoCategoria(r), color: sinHex(INF.gris), size: 16 })] }));
    // Los saltos de línea de la descripción (Transporte, Piloto, Placa…) se
    // conservan como saltos reales; un "\n" dentro de un TextRun no los genera.
    const lineasDescripcion = String(r.descripcion || "").split(/\r?\n/);
    hijos.push(new Paragraph({
      spacing: { after: 140, line: 270 },
      children: lineasDescripcion.map((linea, i) => new TextRun({ text: linea, size: 17, color: sinHex(INF.tinta), break: i > 0 ? 1 : 0 }))
    }));

    hijos.push(new Paragraph({
      spacing: { after: 60 },
      children: [
        new ImageRun({ data: iconoUsuarioBytes, type: "png", transformation: { width: 11, height: 11 } }),
        new TextRun({ text: " " + r.inspectorNombre + (r.inspectorPuesto ? ` (${r.inspectorPuesto})` : ""), size: 15, color: sinHex(INF.tinta) })
      ]
    }));
    hijos.push(new Paragraph({
      spacing: { after: 100 },
      children: [
        new ImageRun({ data: iconoRelojBytes, type: "png", transformation: { width: 11, height: 11 } }),
        new TextRun({ text: ` ${formatearFechaHora(r.fechaHora)}${r.turno ? " · " + r.turno : ""}`, size: 15, color: sinHex(INF.tinta) })
      ]
    }));
    hijos.push(new Paragraph({ children: [
      new TextRun({ text: "Revisado por ", size: 14, color: sinHex(INF.gris) }),
      new TextRun({ text: textoRevisadoPor(r), bold: true, size: 14, color: sinHex(INF.tinta) })
    ] }));

    return hijos;
  }

  const bloquesTarjetas = [];
  for (const pagina of paginas) {
    const totalProceso = resumen.procesos.find((p) => p.proceso === pagina.proceso)?.total;

    // Cada proceso (y cada hoja de continuación) abre en página nueva, con su
    // título y una línea fina debajo.
    bloquesTarjetas.push(new Paragraph({ children: [new PageBreak()] }));
    bloquesTarjetas.push(new Paragraph({
      spacing: { after: 260 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: sinHex(INF.linea), space: 6 } },
      children: [
        new TextRun({ text: pagina.proceso, bold: true, color: sinHex(INF.tinta), size: 32 }),
        new TextRun({ text: totalProceso ? `    ${totalProceso} reporte${totalProceso === 1 ? "" : "s"}` : "", color: sinHex(INF.gris), size: 18 })
      ]
    }));

    // Cada fila de 2 tarjetas es su PROPIA tabla, sin bordes: las tarjetas
    // quedan separadas solo por espacio en blanco.
    for (let i = 0; i < pagina.tarjetas.length; i += 2) {
      const izq = pagina.tarjetas[i], der = pagina.tarjetas[i + 1];

      const celdaTarjeta = (contenido) => new TableCell({
        width: { size: ANCHO_TARJETA, type: WidthType.DXA },
        borders: sinBordeCelda,
        verticalAlign: VerticalAlign.TOP,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        children: contenido
      });
      const celdaVacia = (ancho) => new TableCell({
        width: { size: ancho, type: WidthType.DXA },
        borders: sinBordeCelda,
        children: [new Paragraph({ text: "" })]
      });

      bloquesTarjetas.push(new Table({
        width: { size: ANCHO_TABLA, type: WidthType.DXA },
        columnWidths: [ANCHO_TARJETA, ANCHO_ESPACIADOR, ANCHO_TARJETA],
        borders: sinBordes,
        rows: [new TableRow({
          cantSplit: true, // si la fila no cabe completa, pasa entera a la hoja siguiente
          children: [
            celdaTarjeta(await contenidoTarjetaWord(izq)),
            celdaVacia(ANCHO_ESPACIADOR),
            der ? celdaTarjeta(await contenidoTarjetaWord(der)) : celdaVacia(ANCHO_TARJETA)
          ]
        })]
      }));

      bloquesTarjetas.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    }
  }

  const documento = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 20 } } }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1200, left: 1440 }
        }
      },
      headers: { default: encabezadoDocx },
      footers: { default: pieDocx },
      children: [...hojaResumen, ...bloquesTarjetas]
    }]
  });

  const blob = await Packer.toBlob(documento);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = `Reporte_Semanal_Inocuidad_COGUSA_${new Date().toISOString().slice(0, 10)}.docx`;
  enlace.click();
}

// ---------------------------------------------------------------------------
// EXPORTACIÓN A EXCEL (.xlsx) usando SheetJS - SIN imágenes, solo datos
// tabulares de TODOS los reportes del período (pendientes + validados).
// ---------------------------------------------------------------------------
function exportarInformeExcel(reportes, desde, hasta) {
  if (!reportes.length) { mostrarAvisoGlobal("No hay reportes en el período seleccionado.", "advertencia"); return; }

  const filas = reportes.map((r) => ({
    "Fecha": formatearFechaHora(r.fechaHora),
    "Turno": r.turno || "Sin especificar",
    "Estado": textoEstado(r),
    "Inspector": r.inspectorNombre,
    "Puesto Inspector": r.inspectorPuesto || "-",
    "Zona": r.zona,
    "Proceso": r.proceso,
    "Descripción": r.descripcion,
    "Categoría": textoCategoria(r),
    "Gravedad": r.gravedad || "-",
    "Validador": r.validadoPorNombre || "-",
    "Puesto Validador": r.validadoPorPuesto || "-"
  }));

  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja["!cols"] = [
    { wch: 18 }, // Fecha
    { wch: 12 }, // Turno
    { wch: 12 }, // Estado
    { wch: 22 }, // Inspector
    { wch: 20 }, // Puesto Inspector
    { wch: 16 }, // Zona
    { wch: 18 }, // Proceso
    { wch: 50 }, // Descripción
    { wch: 32 }, // Categoría
    { wch: 12 }, // Gravedad
    { wch: 22 }, // Validador
    { wch: 20 }  // Puesto Validador
  ];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Reportes del periodo");
  XLSX.writeFile(libro, `Reporte_Semanal_Inocuidad_COGUSA_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
