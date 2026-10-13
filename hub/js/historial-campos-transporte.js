// =========================================================
// historial-campos-transporte.js
// Autocompletado "tipo historial" para Piloto, Placa y TC de la liberación
// de contenedores: se alimenta de las inspecciones ya guardadas
// (verificaciones_transporte), así que no hay catálogo nuevo que mantener.
//
// Lecturas: la consulta NO se hace al abrir el formulario, sino la primera
// vez que se escribe lo suficiente para sugerir (3 caracteres en placa y TC;
// nombre + espacio en piloto). Trae como máximo LIMITE inspecciones, solo del
// mes anterior y el actual, y se guarda 24 h en localStorage. Al guardar una
// inspección con datos nuevos, esa copia se actualiza sin volver a leer.
// Si falla, los campos siguen siendo texto libre.
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
  where,
  limit,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { configurarAutocompletado } from "./autocompletado.js";
import { formatearPlaca } from "./utils.js";

const LIMITE = 200;
const CLAVE_CACHE = "historialCamposTransporte.v2";
const VIGENCIA_MS = 24 * 60 * 60 * 1000;

const sinTildes = (t) =>
  String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const soloAlfanumerico = (t) => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

let promesa = null;

/** Primer día del mes anterior en ISO (aaaa-mm-dd): lo anterior no se consulta. */
function desdeMesAnterior() {
  const hoy = new Date();
  const d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function leerCache() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_CACHE) || "null");
    // Vale si es de hoy-24h y del mismo rango de meses (al cambiar de mes se renueva).
    if (g && Date.now() - g.en < VIGENCIA_MS && g.desde === desdeMesAnterior()) return g;
  } catch (_) { /* sin caché */ }
  return null;
}

function guardarCache(datos) {
  try {
    localStorage.setItem(CLAVE_CACHE, JSON.stringify({ en: Date.now(), desde: desdeMesAnterior(), datos }));
  } catch (_) { /* sin caché */ }
}

/** Lee las inspecciones recientes y arma { pilotos, placas, tcs, porPlaca }. */
function cargarHistorial() {
  if (promesa) return promesa;
  promesa = (async () => {
    const guardado = leerCache();
    if (guardado) return guardado.datos;

    const datos = { pilotos: [], placas: [], tcs: [], porPlaca: {} };
    try {
      // Ordenadas de la más reciente a la más antigua: la primera vez que
      // aparece una placa es su dato más actual.
      const snap = await getDocs(query(collection(db, "verificaciones_transporte"), where("fecha", ">=", desdeMesAnterior()), orderBy("fecha", "desc"), limit(LIMITE)));
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
      guardarCache(datos);
    } catch (error) {
      console.warn("No se pudo cargar el historial de piloto/placa/TC:", error);
    }
    return datos;
  })();
  return promesa;
}

/**
 * Tras guardar una inspección: suma piloto/placa/TC nuevos a la copia local
 * para que aparezcan en la próxima apertura sin volver a consultar. Si la
 * copia aún no existe no hace nada (crearla con un solo dato bloquearía la
 * consulta real por 24 h).
 */
export async function registrarEnHistorial({ piloto, placa, tc }) {
  const cache = leerCache();
  const datos = cache ? cache.datos : null;
  if (!datos) return;
  const p = String(piloto || "").trim().toUpperCase();
  const pl = formatearPlaca(placa);
  const t = String(tc || "").trim().toUpperCase();
  const agregar = (lista, valor, clave) => {
    if (valor && !lista.some((v) => clave(v) === clave(valor))) {
      lista.push(valor);
      lista.sort((a, b) => a.localeCompare(b));
    }
  };
  agregar(datos.pilotos, p, sinTildes);
  agregar(datos.placas, pl, soloAlfanumerico);
  agregar(datos.tcs, t, soloAlfanumerico);
  if (pl) datos.porPlaca[pl] = { piloto: p, tc: t };
  guardarCache(datos);
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
  // Placa y TC: desde 3 letras o números. Piloto: al terminar el primer nombre (hay un espacio).
  const tresCaracteres = (t) => soloAlfanumerico(t).length >= 3;
  const nombreYEspacio = (t) => /\S\s+/.test(String(t || "").trimStart());
  const sugerencias = (el, campo, clave, normalizar, minimo, extra) =>
    configurarAutocompletado({
      inputEl: el.input,
      dropdownEl: el.lista,
      obtenerCatalogo: async () => catalogoDe((await cargarHistorial())[campo], clave),
      normalizarClave: clave,
      normalizarNombre: normalizar,
      nombreEntidad: "registro",
      minimoParaSugerir: minimo,
      cargaDiferida: true,
      fraseSeRegistrara: () => "Se guardará como nuevo al finalizar la inspección",
      fraseSinRegistros: "Aún no hay registros anteriores.",
      onSeleccion: extra,
    });

  sugerencias(piloto, "pilotos", sinTildes, (v) => String(v || "").trim().toUpperCase(), nombreYEspacio, (v) => alCambiar("piloto", v));
  sugerencias(tc, "tcs", soloAlfanumerico, (v) => String(v || "").trim().toUpperCase(), tresCaracteres, (v) => alCambiar("tc", v));
  sugerencias(placa, "placas", soloAlfanumerico, formatearPlaca, tresCaracteres, async (v) => {
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
