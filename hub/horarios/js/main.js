import { iniciarSesionHorarios } from './firebase.js';
import { iniciarRouter } from './router.js';
import { textos } from './textos.js';

async function iniciar() {
  document.getElementById('aviso-offline').textContent = textos.errores.sinConexion;

  // El inicio de sesión es el del hub: si no hay sesión, esto redirige a su pantalla de acceso.
  const usuario = await iniciarSesionHorarios();
  if (!usuario) {
    document.getElementById('contenido').innerHTML = `<div class="estado-vacio">${textos.errores.genericoAlGuardar}</div>`;
    return;
  }

  await iniciarRouter();
  configurarAvisoConexion();
}

function configurarAvisoConexion() {
  const aviso = document.getElementById('aviso-offline');
  aviso.hidden = navigator.onLine;
  window.addEventListener('online', () => { aviso.hidden = true; });
  window.addEventListener('offline', () => { aviso.hidden = false; });
}

iniciar();
