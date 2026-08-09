// =========================================================
// firebase-config.js
// Inicialización única de Firebase (App, Auth, Firestore).
// Todos los demás módulos importan las instancias desde aquí.
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Configuración del proyecto "reportes-5e94c" (Firebase Console > Configuración
// del proyecto > Tus apps). No es secreta: identifica el proyecto, no autoriza acceso;
// lo que protege los datos son las reglas de seguridad (ver firestore.rules).
// Se exporta porque el módulo usuarios.js necesita crear una segunda
// instancia temporal de Firebase para dar de alta cuentas sin cerrar
// la sesión del administrador.
//
// NOTA DE TRANSICIÓN: este proyecto es el MISMO que usa el repo "Reportes"
// (ver ../js/config.js -> FIREBASE_CONFIG en la raíz del sitio). Se unificó
// a propósito para que un usuario autenticado en el hub quede también
// autenticado en Reportes (y viceversa), sin iniciar sesión dos veces.
// Si esas credenciales cambian alguna vez, actualízalas también aquí.
export const firebaseConfig = {
  apiKey: "AIzaSyAn-pxaMeu5R2V8FqMT_Gvrp1KL2XPLUd4",
  authDomain: "reportes-5e94c.firebaseapp.com",
  projectId: "reportes-5e94c",
  storageBucket: "reportes-5e94c.firebasestorage.app",
  messagingSenderId: "596353467554",
  appId: "1:596353467554:web:b1eb2ae5d5072a07eac3fb",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Identificador del checklist activo en toda la aplicación.
// Si en el futuro se necesitan múltiples formatos (no solo SIG-FO-115),
// este valor puede volverse dinámico (parámetro de URL, selector, etc.).
export const CHECKLIST_ID = "sig-fo-115";
