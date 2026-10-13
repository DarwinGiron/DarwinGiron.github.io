// =========================================================
// historial-campos-transporte.js
// Autocompletado "tipo historial" para Piloto, Placa y TC de la liberación
// de contenedores: se alimenta de las inspecciones ya guardadas
// (verificaciones_transporte), así que no hay catálogo nuevo que mantener.
//
// Lecturas: UNA consulta por sesión (las últimas LIMITE inspecciones) y el
// resultado se guarda en localStorage por 12 h; abrir el formulario varias
// veces al día no vuelve a leer nada. Si falla, los campos siguen siendo
// texto libre.
//
// Al elegir una placa se completan el piloto y la TC de su última
// inspección (solo si esos campos están vacíos).
// =========================================================

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { configurarAutocompletado } from "./autocompletado.js";
import { formatearPlaca } from "./utils.js";

const LIMITE = 400;
const CLAVE_CACHE = "historialCamposTransporte.v1";
const VIGENCIA_MS = 12 * 60 * 60 * 1000;

const sinTildes = (t) =>
  String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const soloAlfanumerico = (t) => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

let promesa = null;

/** Lee las inspecciones recientes y arma { pilotos, placas, tcs, porPlaca }. */
function cargarHistorial() {
  if (promesa) return promesa;
  promesa = (async () => {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE_CACHE) || "null");
      if (guardado && Date.now() - guardado.en < VIGENCIA_MS) return guardado.datos;
    } catch (_) { /* sin caché: se consulta */ }

    const datos = { pilotos: [], placas: [], tcs: [], porPlaca: {} };
    try {
      // Ordenadas de la más reciente a la más antigua: la primera vez que
      // aparece una placa es su dato más actual.
      const snap = await getDocs(query(collection(db, "verificaciones_transporte"), orderBy("fecha", "desc"), limit(LIMITE)));
      const pilotos = new Map();
      const placas = new Map();
      const tcs = new Map();
      snap.forEach((d) => {
        const r = d.data();
        const piloto = String(r.nombrePiloto || "").trim().toUpperCase();
        const placa = formatearPlaca(r.placaCamion);
        const tc = String(r.tc || "").trim().toUpperCase();
        if (piloto && !pilotos.has(sinTildes(piloto))) pilotos.set(sinTildes(piloto), piloto);
        if (placa && !placas.has(soloAlfanumerico(placa))) {
          placas.set(soloAlfanumerico(placa), placa);
          datos.porPlaca[placa] = { piloto, tc };
        }
        if (tc && !tcs.has(soloAlfanumerico(tc))) tcs.set(soloAlfanumerico(tc), tc);
      });
      datos.pilotos = [...pilotos.values()].sort((a, b) => a.localeCompare(b));
      datos.placas = [...placas.values()].sort((a, b) => a.localeCompare(b));
      datos.tcs = [...tcs.values()].sort((a, b) => a.localeCompare(b));
      try { localStorage.setItem(CLAVE_CACHE, JSON.stringify({ en: Date.now(), datos })); } catch (_) { /* sin caché */ }
    } catch (error) {
      console.warn("No se pudo cargar el historial de piloto/placa/TC:", error);
    }
    return datos;
  })();
  return promesa;
}

function catalogoDe(lista, clave) {
  return { mapa: new Map(lista.map((v) => [clave(v), v])), lista };
}

/**
 * @param {Object} o
 * @param {{input: HTMLInputElement, lista: HTMLElement}} o.piloto
 * @param {{input: HTMLInputElement, lista: HTMLElement}} o.placa
 * @param {{input: HTMLInputElement, lista: HTMLElement}} o.tc
 * @param {(campo: "piloto"|"placa"|"tc", valor: string) => void} o.alCambiar - para guardar en el estado de la página.
 */
export function configurarHistorialTransporte({ piloto, placa, tc, alCambiar }) {
  const sugerencias = (el, campo, clave, normalizar, extra) =>
    configurarAutocompletado({
      inputEl: el.input,
      dropdownEl: el.lista,
      obtenerCatalogo: async () => catalogoDe((await cargarHistorial())[campo], clave),
      normalizarClave: clave,
      normalizarNombre: normalizar,
      nombreEntidad: "registro",
      fraseSeRegistrara: () => "Se guardará como nuevo al finalizar la inspección",
      fraseSinRegistros: "Aún no hay registros anteriores.",
      onSeleccion: extra,
    });

  sugerencias(piloto, "pilotos", sinTildes, (v) => String(v || "").trim().toUpperCase(), (v) => alCambiar("piloto", v));
  sugerencias(tc, "tcs", soloAlfanumerico, (v) => String(v || "").trim().toUpperCase(), (v) => alCambiar("tc", v));
  sugerencias(placa, "placas", soloAlfanumerico, formatearPlaca, async (v) => {
    alCambiar("placa", v);
    // Completar piloto y TC de la última vez que vino esta placa.
    const previo = (await cargarHistorial()).porPlaca[v];
    if (!previo) return;
    if (!piloto.input.value.trim() && previo.piloto) {
      piloto.input.value = previo.piloto;
      alCambiar("piloto", previo.piloto);
    }
    if (!tc.input.value.trim() && previo.tc) {
      tc.input.value = previo.tc;
      alCambiar("tc", previo.tc);
    }
  });
}
