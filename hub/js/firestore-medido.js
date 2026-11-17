// ============================================================================
// firestore-medido.js — el mismo Firestore 10.13.0 que usa el hub, pero
// getDocs, getDoc y onSnapshot además cuentan cuántos documentos traen
// (medidor de lecturas: js/medidor-lecturas.js). El resto de funciones se
// re-exportan tal cual. Los módulos del hub importan de aquí en lugar de
// la URL de gstatic.
// ============================================================================
import * as fs from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { medir } from "/js/medidor-modular.js";

export * from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const medido = medir(fs);
export const getDocs = medido.getDocs;
export const getDoc = medido.getDoc;
export const onSnapshot = medido.onSnapshot;
