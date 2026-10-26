import { supabase, getUsuarioActual } from '../supabase.js';
import { textos } from '../textos.js';
import { guardarConCola, listarColaPorTabla, estaEnLinea } from '../offline.js';
import { fechaCorta } from '../utilidades/fechas.js';

let manejadorColaActualizada = null;

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

  if (manejadorColaActualizada) document.removeEventListener('cola:actualizada', manejadorColaActualizada);
  manejadorColaActualizada = () => pintarLista(usuario);
  document.addEventListener('cola:actualizada', manejadorColaActualizada);

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
    const { enviado } = await guardarConCola(supabase, {
      tabla: 'solicitudes',
      tipo: 'insert',
      payload: {
        tipo,
        solicitante_id: usuario.id,
        detalle: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
        motivo: motivo || null,
        estado: 'pendiente',
      },
    });

    infoEl.textContent = enviado ? t().toastEnviada : 'Sin conexión. La solicitud se guardó y se enviará sola al reconectar.';
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

  const pendientesCola = await listarColaPorTabla('solicitudes');
  const propiasEnCola = pendientesCola.filter((item) => item.payload?.solicitante_id === usuario.id);

  let desdeServidor = [];
  if (estaEnLinea()) {
    const { data, error } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('solicitante_id', usuario.id)
      .order('creado_en', { ascending: false });
    if (!error) desdeServidor = data ?? [];
  }

  if (propiasEnCola.length === 0 && desdeServidor.length === 0) {
    lista.innerHTML = `<div class="estado-vacio">${t().estadoVacioTrabajador}</div>`;
    return;
  }

  const filasEnCola = propiasEnCola.map((item) => `
    <div class="tarjeta-solicitud tarjeta-solicitud-pendiente">
      <div class="tarjeta-solicitud-fila">
        <div class="tarjeta-solicitud-tipo">${textos.tiposSolicitud[item.payload.tipo] ?? item.payload.tipo}</div>
        <div class="badge badge-amarillo">Sin enviar</div>
      </div>
      <div class="tarjeta-solicitud-detalle">
        ${fechaCorta(item.payload.detalle.fecha_inicio)} – ${fechaCorta(item.payload.detalle.fecha_fin)}
        ${item.payload.motivo ? `· "${item.payload.motivo}"` : ''}
      </div>
      <div class="tarjeta-solicitud-pie">Se enviará sola en cuanto haya conexión</div>
    </div>
  `).join('');

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

  lista.innerHTML = filasEnCola + filasServidor;
}
