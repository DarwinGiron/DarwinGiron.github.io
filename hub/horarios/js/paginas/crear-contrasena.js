import { supabase, vincularYCargarUsuario, cerrarSesion } from '../supabase.js';
import { textos } from '../textos.js';

export async function render(contenedor) {
  const t = textos.paginas.crearContrasena;

  contenedor.innerHTML = `
    <div class="pantalla-entrar">
      <div class="entrar-logo">
        <div class="entrar-logo-circulo">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#E31C5F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.5 2"></path>
          </svg>
        </div>
        <div class="entrar-nombre">${t.titulo}</div>
      </div>
      <div class="entrar-ayuda" style="margin:0 0 20px;">${t.ayuda}</div>

      <form id="form-crear" class="entrar-form" novalidate>
        <div class="campo">
          <label for="crear-correo">${t.correo}</label>
          <input id="crear-correo" type="email" placeholder="${textos.paginas.entrar.correoPlaceholder}" required autocomplete="username">
        </div>
        <div class="campo">
          <label for="crear-contrasena">${t.contrasena}</label>
          <input id="crear-contrasena" type="password" required minlength="6" autocomplete="new-password">
        </div>
        <div class="campo">
          <label for="crear-confirmar">${t.confirmar}</label>
          <input id="crear-confirmar" type="password" required minlength="6" autocomplete="new-password">
        </div>
        <div id="crear-error" class="mensaje-error" hidden></div>
        <button type="submit" class="boton-principal">${t.boton}</button>
      </form>

      <a href="#/entrar" class="entrar-enlace">${textos.paginas.entrar.botonEntrar}</a>
    </div>
  `;

  const form = document.getElementById('form-crear');
  const errorEl = document.getElementById('crear-error');

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    errorEl.hidden = true;

    const correo = document.getElementById('crear-correo').value.trim();
    const contrasena = document.getElementById('crear-contrasena').value;
    const confirmar = document.getElementById('crear-confirmar').value;

    if (contrasena !== confirmar) {
      mostrarError(errorEl, 'Las contraseñas no son iguales. Escríbelas de nuevo.');
      return;
    }

    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;

    try {
      const { error } = await supabase.auth.signUp({ email: correo, password: contrasena });
      if (error) {
        mostrarError(errorEl, textos.errores.genericoAlGuardar);
        return;
      }

      const usuario = await vincularYCargarUsuario();
      if (!usuario) {
        await cerrarSesion();
        mostrarError(errorEl, textos.errores.correoNoAutorizado);
        return;
      }

      location.hash = '#/mi-horario';
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
