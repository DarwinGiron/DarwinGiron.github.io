// Carga una librería de un CDN solo cuando hace falta (al tocar "Descargar"), una sola vez.

const promesas = new Map();

export function cargarScript(url, listo) {
  if (listo()) return Promise.resolve();
  if (!promesas.has(url)) {
    promesas.set(url, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => { promesas.delete(url); script.remove(); reject(new Error(`No se pudo cargar ${url}`)); };
      document.head.appendChild(script);
    }));
  }
  return promesas.get(url);
}

export const URL_EXCELJS = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
export const URL_JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

export async function cargarExcelJS() {
  await cargarScript(URL_EXCELJS, () => Boolean(window.ExcelJS));
  return window.ExcelJS;
}

export async function cargarJsPDF() {
  await cargarScript(URL_JSPDF, () => Boolean(window.jspdf?.jsPDF));
  return window.jspdf.jsPDF;
}

/** Descarga un Blob con el nombre dado. */
export function descargarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
