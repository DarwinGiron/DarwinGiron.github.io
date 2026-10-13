// =========================================================
// hisopado-codigos.js
// Numeración de los registros de hisopado que ya existían cuando se creó el
// código de registro ("aaaa-mm-dd-NN", número corrido que reinicia cada mes).
// Solo calcula; guardar lo hace firestore.js. Es una función pura para poder
// probarla aparte.
//
// Reglas:
//  - Los registros que ya tienen código no se tocan; la cuenta de cada mes
//    sigue después del número más alto que ya exista en ese mes.
//  - Los importados del Excel (fechaAproximada) solo conocen el mes: su código
//    usa el día 01 y van primero, en el orden de la tabla (superficie y, dentro
//    de ella, turno).
//  - Después van los registros con fecha real, en orden cronológico.
// =========================================================

import { codigoHisopado } from "./hisopado-datos.js";

/**
 * @param {Array} registros todos los hisopados (con id, fecha, turno, zonaId…)
 * @param {Array} zonas superficies de la tabla de muestreo, en su orden
 * @returns {{asignaciones: Array<{id: string, codigo: string}>, contadores: Object}}
 */
export function planificarCodigos(registros, zonas = []) {
  const ordenZona = new Map(zonas.map((z, i) => [z.id, i]));
  const posicion = (r) => (ordenZona.has(r.zonaId) ? ordenZona.get(r.zonaId) : zonas.length);
  const segundos = (r) => Number(r.creadoEn?.seconds) || (r.creadoEn?.toMillis ? r.creadoEn.toMillis() / 1000 : 0);

  // Número más alto ya usado en cada mes (por los que ya tienen código).
  const ultimoPorMes = {};
  registros.forEach((r) => {
    if (!r.codigo || !r.fecha) return;
    const mes = r.fecha.slice(0, 7);
    const numero = Number(String(r.codigo).split("-").pop()) || 0;
    ultimoPorMes[mes] = Math.max(ultimoPorMes[mes] || 0, numero);
  });

  const pendientes = registros.filter((r) => !r.codigo && r.fecha);
  const porMes = new Map();
  pendientes.forEach((r) => {
    const mes = r.fecha.slice(0, 7);
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push(r);
  });

  const asignaciones = [];
  const contadores = {};
  [...porMes.keys()].sort().forEach((mes) => {
    const lista = porMes.get(mes).sort((a, b) => {
      const impA = a.fechaAproximada ? 0 : 1;
      const impB = b.fechaAproximada ? 0 : 1;
      if (impA !== impB) return impA - impB; // importados primero
      if (impA === 0) return posicion(a) - posicion(b) || Number(a.turno) - Number(b.turno) || a.id.localeCompare(b.id);
      return a.fecha.localeCompare(b.fecha) || segundos(a) - segundos(b) || Number(a.turno) - Number(b.turno) || a.id.localeCompare(b.id);
    });
    let numero = ultimoPorMes[mes] || 0;
    lista.forEach((r) => {
      numero++;
      const fechaCodigo = r.fechaAproximada ? `${mes}-01` : r.fecha;
      asignaciones.push({ id: r.id, codigo: codigoHisopado(fechaCodigo, numero) });
    });
    contadores[mes] = numero;
  });

  return { asignaciones, contadores };
}
