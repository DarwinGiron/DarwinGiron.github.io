// ============================================================================
// medidor-lecturas.js — cuenta cuántos documentos trae de Firestore cada página.
// ============================================================================
// Para saber con datos qué pantalla consume más lecturas (p. ej. "el historial
// del SIG-FO-101 trajo 500 documentos"). Por cada consulta se anota:
//   página (ruta) · colección · consultas · documentos · consultas grandes (≥100)
//
// Cómo se guarda (barato a propósito):
//   - En memoria + localStorage se van sumando los conteos.
//   - Cada 60 s y al abrir la siguiente página se manda TODO lo acumulado en
//     UNA escritura con increment() a lecturas/{aaaa-mm-dd}. Si la página se
//     cierra antes (o a medio envío), lo manda la próxima que se abra.
//   - No cuenta lo que Firestore sirve desde su caché local (no se cobra).
//   - No cuenta sus propias escrituras.
//   Límite: las lecturas que hacen las reglas de seguridad (leer el perfil del
//   usuario en cada petición) no se ven desde el navegador.
//
// Se usa de dos formas:
//   - Páginas con el SDK "compat" (Reportes, Dashboard, SIG-FO-101): basta
//     cargar este archivo con <script> DESPUÉS de firebase-firestore-compat.js;
//     se engancha solo a .get() y .onSnapshot().
//   - Páginas con el SDK modular (hub, Horarios, Tareas): js/medidor-modular.js
//     envuelve getDocs/getDoc/onSnapshot y llama a MedidorLecturas.contar().
// ============================================================================
(function () {
  "use strict";
  if (window.MedidorLecturas) return;

  var CLAVE = "medidor-lecturas:pendiente";
  var GRANDE = 100;
  var pagina = (location.pathname || "/").replace(/index\.html$/, "") || "/";
  var escritor = null;
  var enviando = false;

  function hoy() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  // pendiente = { "aaaa-mm-dd": { "/ruta/": { "coleccion": { consultas, documentos, grandes } } } }
  function leerPendiente() {
    try { return JSON.parse(localStorage.getItem(CLAVE) || "{}") || {}; } catch (e) { return memoria; }
  }
  function guardarPendiente(p) {
    memoria = p;
    try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch (e) { /* sin almacenamiento: queda en memoria */ }
  }
  var memoria = {};

  function sumar(destino, origen) {
    Object.keys(origen).forEach(function (k) {
      var v = origen[k];
      if (v && typeof v === "object") sumar(destino[k] = destino[k] || {}, v);
      else destino[k] = (destino[k] || 0) + v;
    });
    return destino;
  }

  /** Anota una consulta: colección (texto) y cuántos documentos trajo. */
  function contar(coleccion, documentos, desdeCache) {
    if (desdeCache) return;
    var n = Math.max(0, Number(documentos) || 0);
    var dia = hoy(), p = leerPendiente();
    var porPagina = ((p[dia] = p[dia] || {})[pagina] = p[dia][pagina] || {});
    var c = (porPagina[coleccion || "desconocida"] = porPagina[coleccion || "desconocida"] || { consultas: 0, documentos: 0, grandes: 0 });
    c.consultas += 1;
    c.documentos += n;
    if (n >= GRANDE) c.grandes += 1;
    guardarPendiente(p);
  }

  /** Convierte un conteo en el documento a escribir (las hojas pasan por inc()). */
  function documentoDelDia(porPagina, inc, marcaTiempo) {
    var paginas = {}, totalC = 0, totalD = 0;
    Object.keys(porPagina).forEach(function (pag) {
      var cols = {};
      Object.keys(porPagina[pag]).forEach(function (col) {
        var c = porPagina[pag][col];
        totalC += c.consultas; totalD += c.documentos;
        cols[col] = { consultas: inc(c.consultas), documentos: inc(c.documentos), grandes: inc(c.grandes) };
      });
      paginas[pag] = cols;
    });
    return { paginas: paginas, total: { consultas: inc(totalC), documentos: inc(totalD) }, actualizadoEn: marcaTiempo };
  }

  /*
   * "En vuelo": lo que se está mandando se aparta en localStorage hasta que
   * Firestore confirma. Si la página se cierra o se cambia a otra antes de la
   * confirmación, la siguiente página lo devuelve al acumulado pasados
   * EN_VUELO_MS y se vuelve a mandar (así no se pierde al navegar).
   */
  var CLAVE_VUELO = "medidor-lecturas:en-vuelo";
  var EN_VUELO_MS = 20000;
  function leerVuelo() { try { return JSON.parse(localStorage.getItem(CLAVE_VUELO) || "{}") || {}; } catch (e) { return {}; } }
  function guardarVuelo(v) { try { localStorage.setItem(CLAVE_VUELO, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  function quitarVuelo(id) { var v = leerVuelo(); delete v[id]; guardarVuelo(v); }
  function recuperarVuelos() {
    var v = leerVuelo(), ahora = Date.now(), cambio = false, p = leerPendiente();
    Object.keys(v).forEach(function (id) {
      if (ahora - v[id].t > EN_VUELO_MS) { sumar(p, v[id].datos); delete v[id]; cambio = true; }
    });
    if (cambio) { guardarPendiente(p); guardarVuelo(v); }
  }

  /** Manda lo acumulado. Si falla, lo devuelve al acumulado para el próximo intento. */
  function enviar() {
    if (!escritor || enviando) return;
    recuperarVuelos();
    var p = leerPendiente(), dias = Object.keys(p);
    if (!dias.length) return;
    guardarPendiente({}); // se toma todo de una vez: otra pestaña no lo manda dos veces
    enviando = true;
    var pendientes = dias.map(function (dia) {
      var id = dia + ":" + Date.now() + ":" + Math.random().toString(36).slice(2, 7);
      var o = {}; o[dia] = p[dia];
      var v = leerVuelo(); v[id] = { t: Date.now(), datos: o }; guardarVuelo(v);
      return Promise.resolve()
        .then(function () { return escritor(dia, p[dia], documentoDelDia); })
        .then(function () { quitarVuelo(id); })
        .catch(function (err) {
          quitarVuelo(id);
          var codigo = err && err.code;
          // Sin permiso (cuenta sin perfil activo): ese día se descarta, no se reintenta.
          if (codigo === "permission-denied") return;
          // Sin sesión o sin conexión: se devuelve al acumulado y se reintenta luego.
          guardarPendiente(sumar(leerPendiente(), o));
          if (codigo !== "sin-sesion" && codigo !== "sin-app") console.warn("Medidor de lecturas: no se pudo guardar", err);
        });
    });
    Promise.all(pendientes).then(function () { enviando = false; });
  }

  /** Registra cómo escribir (lo pone el adaptador del SDK cuando ya hay sesión). */
  function usarEscritor(fn) {
    if (escritor) return;
    escritor = fn;
    setTimeout(enviar, 5000); // lo que quedó de la página anterior
  }

  // Cada minuto. No se manda al ocultar o cerrar la pestaña: el navegador corta
  // la conexión a medio envío; lo pendiente lo manda la próxima página que se abra.
  setInterval(enviar, 60000);

  /** "occ/abc/files/x" -> "occ/files"; consulta -> su colección. */
  function rutaGenerica(ruta) {
    return String(ruta || "").split("/").filter(function (_, i) { return i % 2 === 0; }).join("/") || "desconocida";
  }
  function coleccionDe(ref) {
    try {
      if (!ref) return "desconocida";
      var r = ref._delegate || ref; // compat -> modular
      if (r.type === "document") return rutaGenerica(r.path);
      if (r.type === "collection") return rutaGenerica(r.path);
      var q = r._query;
      if (q) return q.collectionGroup || rutaGenerica(q.path && (q.path.canonicalString ? q.path.canonicalString() : String(q.path)));
      if (typeof ref.path === "string") return rutaGenerica(ref.path);
    } catch (e) { /* etiqueta desconocida */ }
    return "desconocida";
  }

  /** Envuelve el callback de un onSnapshot para contar lo que llega del servidor. */
  function contarEnSnapshot(coleccion, esDocumento, callbackOriginal) {
    var primero = true;
    return function (snap) {
      try {
        var cache = snap && snap.metadata && snap.metadata.fromCache;
        if (!cache) {
          if (esDocumento) contar(coleccion, 1, false);
          else if (primero) contar(coleccion, Math.max(1, snap.size), false);
          else {
            var cambios = (snap.docChanges ? snap.docChanges() : []).filter(function (c) { return c.type !== "removed"; }).length;
            if (cambios) contar(coleccion, cambios, false);
          }
          primero = false;
        }
      } catch (e) { /* nunca romper la página por medir */ }
      return callbackOriginal.apply(this, arguments);
    };
  }

  /** Reemplaza el primer callback (o observer.next) de los argumentos de onSnapshot. */
  function envolverArgumentos(args, coleccion, esDocumento) {
    args = Array.prototype.slice.call(args);
    for (var i = 0; i < args.length; i++) {
      if (typeof args[i] === "function") { args[i] = contarEnSnapshot(coleccion, esDocumento, args[i]); break; }
      if (args[i] && typeof args[i].next === "function") {
        var obs = args[i];
        args[i] = { next: contarEnSnapshot(coleccion, esDocumento, obs.next.bind(obs)), error: obs.error && obs.error.bind(obs), complete: obs.complete && obs.complete.bind(obs) };
        break;
      }
    }
    return args;
  }

  // ---------- Adaptador del SDK "compat" (window.firebase) ----------
  function engancharCompat() {
    var fb = window.firebase;
    if (!fb || !fb.firestore || !fb.firestore.Query || fb.firestore.Query.prototype.__medido) return;
    var Q = fb.firestore.Query.prototype, D = fb.firestore.DocumentReference.prototype;
    var qGet = Q.get, dGet = D.get, qSnap = Q.onSnapshot, dSnap = D.onSnapshot;
    Q.get = function () {
      var col = coleccionDe(this);
      return qGet.apply(this, arguments).then(function (s) { contar(col, Math.max(1, s.size), s.metadata && s.metadata.fromCache); return s; });
    };
    D.get = function () {
      var col = coleccionDe(this);
      return dGet.apply(this, arguments).then(function (s) { contar(col, 1, s.metadata && s.metadata.fromCache); return s; });
    };
    Q.onSnapshot = function () { return qSnap.apply(this, envolverArgumentos(arguments, coleccionDe(this), false)); };
    D.onSnapshot = function () { return dSnap.apply(this, envolverArgumentos(arguments, coleccionDe(this), true)); };
    Q.__medido = true;

    usarEscritor(function (dia, porPagina, armar) {
      if (!fb.apps || !fb.apps.length) return Promise.reject({ code: "sin-app" });
      var usuario = fb.auth && fb.auth().currentUser;
      if (!usuario) return Promise.reject({ code: "sin-sesion" });
      var FV = fb.firestore.FieldValue;
      var datos = armar(porPagina, function (n) { return FV.increment(n); }, FV.serverTimestamp());
      return fb.firestore().collection("lecturas").doc(dia).set(datos, { merge: true });
    });
  }

  window.MedidorLecturas = {
    contar: contar,
    usarEscritor: usarEscritor,
    enviar: enviar,
    coleccionDe: coleccionDe,
    envolverArgumentos: envolverArgumentos,
    pagina: pagina,
    _pendiente: leerPendiente
  };
  engancharCompat();
})();
