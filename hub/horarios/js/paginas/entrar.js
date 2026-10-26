import { supabase, vincularYCargarUsuario, cerrarSesion } from '../supabase.js';
import { textos } from '../textos.js';

export async function render(contenedor) {
  const t = textos.paginas.entrar;

  contenedor.innerHTML = `
    <div class="pantalla-entrar">
      <div class="entrar-logo">
        <div class="entrar-logo-circulo">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#E31C5F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.5 2"></path>
          </svg>
        </div>
        <div class="entrar-nombre">${textos.app.nombre}</div>
        <div class="entrar-subtitulo">${textos.app.subtitulo}</div>
      </div>

      <form id="form-entrar" class="entrar-form" novalidate>
        <div class="campo">
          <label for="entrar-correo">${t.correo}</label>
          <input id="entrar-correo" type="email" placeholder="${t.correoPlaceholder}" required autocomplete="username">
        </div>
        <div class="campo">
          <label for="entrar-contrasena">${t.contrasena}</label>
          <input id="entrar-contrasena" type="password" placeholder="${t.contrasenaPlaceholder}" required autocomplete="current-password">
        </div>
        <div id="entrar-error" class="mensaje-error" hidden></div>
        <button type="submit" class="boton-principal">${t.botonEntrar}</button>
      </form>

      <a href="#/crear-contrasena" class="entrar-enlace">${t.crearContrasena}</a>
      <div class="entrar-ayuda">${t.ayuda}</div>
    </div>
  `;

  const form = document.getElementById('form-entrar');
  // El hub abre esta pantalla con ?correo=... para no obligar a escribirlo otra vez.
  const correoSugerido = new URLSearchParams(location.search).get('correo');
  if (correoSugerido) document.getElementById('entrar-correo').value = correoSugerido;
  const errorEl = document.getElementById('entrar-error');

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    errorEl.hidden = true;

    const correo = document.getElementById('entrar-correo').value.trim();
    const contrasena = document.getElementById('entrar-contrasena').value;
    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;

    try {
      const { error } = await supabase.auth.signInWithPassword({ email: correo, password: contrasena });
      if (error) {
        mostrarError(errorEl, textos.errores.contrasenaIncorrecta);
        return;
      }

      const usuario = await vincularYCargarUsuario();
      if (!usuario) {
        await cerrarSesion();
        mostrarError(errorEl, textos.errores.correoNoAutorizado);
        return;
      }

      location.hash = '#/mes';
    } catch (e) {
      console.error(e);
      mostrarError(errorEl, textos.errores.genericoAlGuardar);
    } finally {
      boton.disabled = false;
    }
  });
}

function mostrarError(el, texto) {
  el.textContent = texto;
  el.hidden = false;
}
