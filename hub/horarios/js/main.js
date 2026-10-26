import { supabase, vincularYCargarUsuario, cerrarSesion, setUsuarioActual } from './supabase.js';
import { iniciarRouter, manejarRuta } from './router.js';
import { textos } from './textos.js';
import { procesarColaEscritura } from './offline.js';
import './instalador.js'; // se importa temprano para no perder el evento beforeinstallprompt

async function iniciar() {
  document.getElementById('aviso-offline').textContent = textos.errores.sinConexion;

  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    try {
      const usuario = await vincularYCargarUsuario();
      if (!usuario) {
        await cerrarSesion();
      }
    } catch (e) {
      // Sin conexión al abrir la app: no se puede vincular/leer el usuario todavía,
      // pero la sesión guardada sigue siendo válida — no la cerramos por un error de red.
      console.error(e);
    }
  }

  await iniciarRouter();
  configurarAvisoConexion();

  supabase.auth.onAuthStateChange((_evento, sesionNueva) => {
    if (!sesionNueva) {
      setUsuarioActual(null);
      manejarRuta();
    }
  });
}

function configurarAvisoConexion() {
  const aviso = document.getElementById('aviso-offline');
  aviso.hidden = navigator.onLine;

  window.addEventListener('online', () => {
    aviso.hidden = true;
    procesarColaEscritura(supabase);
  });
  window.addEventListener('offline', () => {
    aviso.hidden = false;
  });

  if (navigator.onLine) procesarColaEscritura(supabase); // por si quedó algo pendiente de la sesión anterior
}

iniciar();
