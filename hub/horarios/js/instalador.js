// Captura beforeinstallprompt en cuanto el módulo se importa (idealmente desde main.js,
// muy al inicio) para no perder el evento si el navegador lo dispara antes de que el
// usuario llegue a Mi horario.

let eventoDiferido = null;
let yaInstalada = false;
const escuchas = new Set();

window.addEventListener('beforeinstallprompt', (evento) => {
  evento.preventDefault();
  eventoDiferido = evento;
  escuchas.forEach((fn) => fn());
});

window.addEventListener('appinstalled', () => {
  yaInstalada = true;
  eventoDiferido = null;
  escuchas.forEach((fn) => fn());
});

export function sePuedeInstalar() {
  return !yaInstalada && eventoDiferido !== null;
}

/** Se llama cuando cambia si se puede instalar (evento disponible, o ya se instaló). */
export function alCambiarInstalable(fn) {
  escuchas.add(fn);
  return () => escuchas.delete(fn);
}

/** Muestra el diálogo nativo de instalación. Devuelve 'accepted' | 'dismissed' | null. */
export async function instalar() {
  if (!eventoDiferido) return null;
  eventoDiferido.prompt();
  const { outcome } = await eventoDiferido.userChoice;
  eventoDiferido = null;
  return outcome;
}
