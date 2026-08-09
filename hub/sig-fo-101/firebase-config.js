// =========================================================
// firebase-config.js
// Inicialización de Firebase con el SDK "compat" (vía CDN, ver
// login.html/index.html/historial.html: los <script> de firebase-app-compat,
// firebase-auth-compat y firebase-firestore-compat deben cargar ANTES que
// este archivo, porque aquí se usa el objeto global `firebase`).
//
// Usa el MISMO proyecto de Firebase que SIG-FO-115 (../js/firebase-config.js
// en la raíz del repo) a propósito: ambos formatos comparten usuarios y
// roles — un inspector inicia sesión una sola vez y usa los dos. Si ese
// proyecto cambia alguna vez, actualiza estos valores para que coincidan.
// =========================================================

const firebaseConfig = {
  apiKey: "AIzaSyAn-pxaMeu5R2V8FqMT_Gvrp1KL2XPLUd4",
  authDomain: "reportes-5e94c.firebaseapp.com",
  projectId: "reportes-5e94c",
  storageBucket: "reportes-5e94c.firebasestorage.app",
  messagingSenderId: "596353467554",
  appId: "1:596353467554:web:b1eb2ae5d5072a07eac3fb",
};

firebase.initializeApp(firebaseConfig);

export const auth = firebase.auth();
export const db = firebase.firestore();
export const FieldValue = firebase.firestore.FieldValue;

// Persistencia offline de Firestore: permite que las LECTURAS (historial)
// sigan funcionando desde caché sin conexión. La escritura offline de
// liberaciones nuevas la maneja app.js con su propia cola en localStorage,
// para tener control explícito sobre cuándo y qué se sincroniza.
db.enablePersistence({ synchronizeTabs: true }).catch((error) => {
  console.warn("Persistencia offline de Firestore no disponible:", error.code);
});
