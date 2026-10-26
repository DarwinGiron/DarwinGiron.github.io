import { getUsuarioActual, crearSolicitud, listarMisSolicitudes, registrarHistorial } from '../firebase.js';
import { textos } from '../textos.js';
import { fechaCorta } from '../utilidades/fechas.js';

export async function render(contenedor) {
  const t = textos.paginas.solicitudes;
  const usuario = getUsuarioActual();

  contenedor.innerHTML = `
    <div class="pagina">
      <div class="encabezado">
        <div class="encabezado-titulo">${t.titulo}</div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-titulo">${t.formTitulo}</div>
        <div class="campo">
          <label for="sol-tipo">${t.campoTipo}</label>
          <select id="sol-tipo">
            ${Object.entries(textos.tiposSolicitud).map(([clave, texto]) => `<option value="${clave}">${texto}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label id="sol-fechas-etiqueta">${t.campoFechas}</label>
          <div style="display:flex; gap:8px;" role="group" aria-labelledby="sol-fechas-etiqueta">
            <input id="sol-fecha-inicio" type="date" style="flex:1;" aria-label="Fecha inicial">
            <input id="sol-fecha-fin" type="date" style="flex:1;" aria-label="Fecha final">
          </div>
        </div>
        <div class="campo">
          <label for="sol-motivo">${t.campoMotivo}</label>
          <input id="sol-motivo" type="text" placeholder="${t.motivoPlaceholder}">
        </div>
        <div id="sol-error" class="mensaje-error" hidden></div>
        <div id="sol-info" class="mensaje-info" hidden></div>
        <button id="sol-enviar" class="boton-principal">${t.botonEnviar}</button>
      </div>

      <div class="lista-columna">
        <div class="tarjeta-titulo">${t.misSolicitudes}</div>
        <div id="sol-lista"></div>
      </div>
    </div>
  `;

  document.getElementById('sol-enviar').addEventListener('click', () => enviarSolicitud(usuario));

  await pintarLista(usuario);
}

async function enviarSolicitud(usuario) {
  const tipo = document.getElementById('sol-tipo').value;
  const fechaInicio = document.getElementById('sol-fecha-inicio').value;
  const fechaFin = document.getElementById('sol-fecha-fin').value || fechaInicio;
  const motivo = document.getElementById('sol-motivo').value.trim();
  const errorEl = document.getElementById('sol-error');
  const infoEl = document.getElementById('sol-info');
  errorEl.hidden = true;
  infoEl.hidden = true;

  if (!fechaInicio) {
    errorEl.textContent = textos.errores.campoFaltante('la fecha');
    errorEl.hidden = false;
    return;
  }

  const boton = document.getElementById('sol-enviar');
  boton.disabled = true;

  try {
    await crearSolicitud({
      tipo,
      solicitante_id: usuario.id ?? null,
      solicitante_nombre: usuario.nombre,
      detalle: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
      motivo: motivo || null,
    });

    await registrarHistorial({
      accion: 'solicitud',
      texto: `${usuario.nombre} pidió "${textos.tiposSolicitud[tipo] ?? tipo}" del ${fechaCorta(fechaInicio)} al ${fechaCorta(fechaFin)}`,
      persona: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo },
      fecha: fechaInicio,
    });

    infoEl.textContent = t().toastEnviada;
    infoEl.hidden = false;
    document.getElementById('sol-motivo').value = '';
    await pintarLista(usuario);
  } catch (e) {
    console.error(e);
    errorEl.textContent = textos.errores.genericoAlGuardar;
    errorEl.hidden = false;
  } finally {
    boton.disabled = false;
  }
}

function t() {
  return textos.paginas.solicitudes;
}

async function pintarLista(usuario) {
  const lista = document.getElementById('sol-lista');
  if (!lista) return; // la página ya cambió
  lista.innerHTML = '<div class="mensaje-cargando">Cargando...</div>';

  let desdeServidor = [];
  try {
    desdeServidor = await listarMisSolicitudes();
  } catch (error) {
    console.error(error);
  }

  if (desdeServidor.length === 0) {
    lista.innerHTML = `<div class="estado-vacio">${t().estadoVacioTrabajador}</div>`;
    return;
  }

  const filasServidor = desdeServidor.map((s) => {
    const estadoInfo = { pendiente: 'badge-amarillo', aprobada: 'badge-verde', rechazada: 'badge-roja' };
    return `
      <div class="tarjeta-solicitud">
        <div class="tarjeta-solicitud-fila">
          <div class="tarjeta-solicitud-tipo">${textos.tiposSolicitud[s.tipo] ?? s.tipo}</div>
          <div class="badge ${estadoInfo[s.estado] ?? 'badge-gris'}">${textos.estadosSolicitud[s.estado] ?? s.estado}</div>
        </div>
        <div class="tarjeta-solicitud-detalle">
          ${s.detalle?.fecha_inicio ? `${fechaCorta(s.detalle.fecha_inicio)} – ${fechaCorta(s.detalle.fecha_fin)}` : ''}
          ${s.motivo ? `· "${s.motivo}"` : ''}
        </div>
      </div>`;
  }).join('');

  lista.innerHTML = filasServidor;
}
