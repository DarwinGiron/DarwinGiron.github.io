import { textos } from '../textos.js';
import { estado } from '../estado.js';
import { nombreMes, sumarMeses } from '../utilidades/fechas.js';
import { generarMes } from '../generar-mes.js';
import { pintarCuadricula } from './mes.js';
import { confirmar } from '../utilidades/dialogo.js';

export async function render(contenedor) {
  const t = textos.paginas.planificador;

  contenedor.innerHTML = `
    <div class="pagina">
      <div class="encabezado">
        <div class="encabezado-titulo">${t.titulo}</div>
      </div>
      <div class="selector-mes">
        <button id="mes-anterior" class="boton-icono" aria-label="Mes anterior">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
        </button>
        <div id="mes-nombre" class="selector-mes-nombre"></div>
        <button id="mes-siguiente" class="boton-icono" aria-label="Mes siguiente">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
        </button>
      </div>

      <div style="padding:0 20px 16px;">
        <button id="boton-generar" class="boton-principal">${t.botonGenerar}</button>
        <div id="planificador-mensaje" class="mensaje-info" hidden></div>
      </div>

      <div id="cuadricula-mes" class="cuadricula-mes"></div>
      <div class="ayuda-scroll">${textos.paginas.mes.ayudaScroll}</div>
    </div>
  `;

  document.getElementById('mes-anterior').addEventListener('click', () => {
    estado.mesVisible = sumarMeses(estado.mesVisible, -1);
    render(contenedor);
  });
  document.getElementById('mes-siguiente').addEventListener('click', () => {
    estado.mesVisible = sumarMeses(estado.mesVisible, 1);
    render(contenedor);
  });

  document.getElementById('mes-nombre').textContent = nombreMes(estado.mesVisible);

  document.getElementById('boton-generar').addEventListener('click', async () => {
    const nombre = nombreMes(estado.mesVisible);
    const confirmado = await confirmar(t.confirmarGenerar(nombre), { textoConfirmar: t.botonGenerar });
    if (!confirmado) return;

    const boton = document.getElementById('boton-generar');
    const mensaje = document.getElementById('planificador-mensaje');
    boton.disabled = true;
    mensaje.hidden = true;

    try {
      const { creados } = await generarMes(estado.mesVisible);
      mensaje.textContent = `${t.toastGenerado} (${creados} turnos).`;
      mensaje.hidden = false;
      await pintarCuadricula(document.getElementById('cuadricula-mes'));
    } catch (e) {
      console.error(e);
      mensaje.textContent = e.message?.includes('semana de referencia')
        ? e.message
        : textos.errores.genericoAlGuardar;
      mensaje.hidden = false;
    } finally {
      boton.disabled = false;
    }
  });

  await pintarCuadricula(document.getElementById('cuadricula-mes'));
}
