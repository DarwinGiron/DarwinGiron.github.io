// ============================================================================
// medidor-modular.js — adaptador del medidor de lecturas para el SDK modular.
// ============================================================================
// medir(fs) recibe el módulo de Firestore de la MISMA versión que usa la
// página (import * as fs from ".../firebase-firestore.js") y devuelve
// getDocs, getDoc y onSnapshot equivalentes que, además, anotan cuántos
// documentos trajo cada consulta (ver js/medidor-lecturas.js).
// ============================================================================
import "/js/medidor-lecturas.js";

export function medir(fs) {
  const M = window.MedidorLecturas;
  let db = null;

  function escribir(dia, porPagina, armar) {
    const datos = armar(porPagina, (n) => fs.increment(n), fs.serverTimestamp());
    return fs.setDoc(fs.doc(db, "lecturas", dia), datos, { merge: true });
  }
  // La base de datos se toma de la primera consulta (así no hace falta pasarla).
  function recordar(ref) {
    if (!db && ref && ref.firestore) { db = ref.firestore; M.usarEscritor(escribir); }
  }

  return {
    async getDocs(q) {
      recordar(q);
      const s = await fs.getDocs(q);
      M.contar(M.coleccionDe(q), Math.max(1, s.size), s.metadata && s.metadata.fromCache);
      return s;
    },
    async getDoc(ref) {
      recordar(ref);
      const s = await fs.getDoc(ref);
      M.contar(M.coleccionDe(ref), 1, s.metadata && s.metadata.fromCache);
      return s;
    },
    onSnapshot(ref, ...resto) {
      recordar(ref);
      return fs.onSnapshot(ref, ...M.envolverArgumentos(resto, M.coleccionDe(ref), ref && ref.type === "document"));
    },
  };
}
