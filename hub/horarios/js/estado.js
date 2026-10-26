// Estado en memoria compartido entre páginas (sin framework: un objeto simple).
import { hoyIso, primerDiaDelMes } from './utilidades/fechas.js';

export const estado = {
  mesVisible: primerDiaDelMes(hoyIso()), // 'YYYY-MM-01'
};
