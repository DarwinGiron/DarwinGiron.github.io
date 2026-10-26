import {
  getUsuarioActual, esCoordinador, crearSolicitud, listarMisSolicitudes, listarSolicitudes, resolverSolicitud,
  registrarHistorial, listarTurnos, listarFeriados, guardarTurnosManuales,
} from '../firebase.js';
import { textos } from '../textos.js';
import { fechaCorta, isoALocal, localAIso } from '../utilidades/fechas.js';
import { confirmar, pedirTexto } from '../utilidades/dialogo.js';
import { armarTurnoManual } from '../ajustes-turno.js';

const escapar = (texto) => String(texto ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CLASE_ESTADO = { pendiente: 'badge-amarillo', aprobada: 'badge-verde', rechazada: 'badge-roja' };

export async function render(contenedor) {
  if (esCoordinador()) {
    await renderCoordinador(contenedor);
    return;
  }

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
          ${s.motivo ? `· "${escapar(s.motivo)}"` : ''}
        </div>
        ${s.comentario_resolucion ? `<div class="tarjeta-solicitud-pie">Respuesta: ${escapar(s.comentario_resolucion)}</div>` : ''}
      </div>`;
  }).join('');

  lista.innerHTML = filasServidor;
}

// ---------- vista del coordinador: aprobar o rechazar ----------

function diasEntre(desde, hasta) {
  const dias = [];
  const cursor = isoALocal(desde);
  const fin = isoALocal(hasta || desde);
  while (cursor <= fin && dias.length < 62) {
    dias.push(localAIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

const rangoTexto = (s) => (s.detalle?.fecha_inicio
  ? (s.detalle.fecha_fin && s.detalle.fecha_fin !== s.detalle.fecha_inicio
    ? `${fechaCorta(s.detalle.fecha_inicio)} – ${fechaCorta(s.detalle.fecha_fin)}`
    : fechaCorta(s.detalle.fecha_inicio))
  : '');

const personaDe = (s) => ({ id: s.solicitante_id, nombre: s.solicitante_nombre || s.solicitante_correo, correo: s.solicitante_correo });

/** Al aprobar un permiso, marca esos días del solicitante como "Permiso personal" en el horario. */
async function aplicarPermiso(s) {
  if (!s.solicitante_id) return 0;
  const dias = diasEntre(s.detalle.fecha_inicio, s.detalle.fecha_fin);
  const [turnos, feriados] = await Promise.all([
    listarTurnos(dias[0], dias[dias.length - 1]),
    listarFeriados(dias[0], dias[dias.length - 1]),
  ]);
  const propios = new Map(turnos.filter((x) => x.usuario_id === s.solicitante_id).map((x) => [x.fecha, x]));
  const esFeriado = new Set(feriados.map((f) => f.fecha));
  const persona = { id: s.solicitante_id };
  const nuevos = dias.map((fecha) => armarTurnoManual({
    persona, fecha, opcion: 'ausencia:permiso', turnoActual: propios.get(fecha) ?? null, esFeriado: esFeriado.has(fecha),
  }));
  await guardarTurnosManuales(nuevos, { origen: 'solicitud', solicitudId: s.id });
  return nuevos.length;
}

async function renderCoordinador(contenedor) {
  const t = textos.paginas.solicitudes;

  contenedor.innerHTML = `
    <div class="pagina">
      <div class="encabezado">
        <div>
          <div class="encabezado-titulo">${t.titulo}</div>
          <div id="sol-subtitulo" class="encabezado-subtitulo"></div>
        </div>
      </div>
      <div id="sol-aviso" class="mensaje-info" hidden style="margin:12px 20px 0;"></div>
      <div class="lista-columna">
        <div class="tarjeta-titulo">Pendientes</div>
        <div id="sol-pendientes"><div class="mensaje-cargando">Cargando...</div></div>
        <div class="tarjeta-titulo" style="margin-top:12px;">Resueltas</div>
        <div id="sol-resueltas"></div>
      </div>
    </div>
  `;

  // Se busca el aviso cada vez: tras aprobar o rechazar la vista se vuelve a pintar.
  const avisar = (texto) => {
    const aviso = document.getElementById('sol-aviso');
    if (aviso) { aviso.textContent = texto; aviso.hidden = false; }
  };

  let solicitudes;
  try {
    solicitudes = await listarSolicitudes();
  } catch (error) {
    console.error(error);
    document.getElementById('sol-pendientes').innerHTML = `<div class="mensaje-cargando">${textos.errores.genericoAlGuardar}</div>`;
    return;
  }

  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente');
  const resueltas = solicitudes.filter((s) => s.estado !== 'pendiente').slice(0, 30);
  document.getElementById('sol-subtitulo').textContent = t.subtituloCoordinador(pendientes.length);

  const tarjeta = (s, conAcciones) => `
    <div class="tarjeta-solicitud ${conAcciones ? '' : 'tarjeta-solicitud-resuelta'}" data-id="${s.id}">
      <div class="tarjeta-solicitud-fila">
        <div class="tarjeta-solicitud-tipo">${escapar(s.solicitante_nombre || s.solicitante_correo)}</div>
        <div class="badge ${CLASE_ESTADO[s.estado] ?? 'badge-gris'}">${textos.estadosSolicitud[s.estado] ?? s.estado}</div>
      </div>
      <div class="tarjeta-solicitud-detalle">
        ${escapar(textos.tiposSolicitud[s.tipo] ?? s.tipo)} · ${rangoTexto(s)}
        ${s.motivo ? `<br>"${escapar(s.motivo)}"` : ''}
      </div>
      ${s.comentario_resolucion ? `<div class="tarjeta-solicitud-pie">Respuesta: ${escapar(s.comentario_resolucion)}</div>` : ''}
      ${s.resuelto_en ? `<div class="tarjeta-solicitud-pie">${s.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'} por ${escapar(s.resuelto_por_nombre || s.resuelto_por || '—')}</div>` : ''}
      ${conAcciones ? `
      <div class="acciones-fila" style="margin-top:12px;">
        <button class="boton-secundario sol-rechazar">Rechazar</button>
        <button class="boton-principal sol-aprobar" style="flex:1;">Aprobar</button>
      </div>` : ''}
    </div>`;

  document.getElementById('sol-pendientes').innerHTML = pendientes.length
    ? pendientes.map((s) => tarjeta(s, true)).join('')
    : `<div class="estado-vacio">${t.estadoVacioCoordinador}</div>`;
  document.getElementById('sol-resueltas').innerHTML = resueltas.length
    ? resueltas.map((s) => tarjeta(s, false)).join('')
    : '<div class="estado-vacio">Todavía no has resuelto solicitudes.</div>';

  const porId = new Map(solicitudes.map((s) => [s.id, s]));

  document.querySelectorAll('#sol-pendientes .sol-aprobar').forEach((boton) => boton.addEventListener('click', async () => {
    const s = porId.get(boton.closest('[data-id]').dataset.id);
    const persona = personaDe(s);
    const pregunta = s.tipo === 'permiso'
      ? t.confirmarAprobar.permiso(persona.nombre, fechaCorta(s.detalle.fecha_inicio), fechaCorta(s.detalle.fecha_fin || s.detalle.fecha_inicio))
      : `¿Aprobar "${textos.tiposSolicitud[s.tipo] ?? s.tipo}" de ${persona.nombre} (${rangoTexto(s)})?`;
    if (!await confirmar(pregunta, { textoConfirmar: 'Aprobar' })) return;

    boton.disabled = true;
    try {
      const marcados = s.tipo === 'permiso' ? await aplicarPermiso(s) : 0;
      await resolverSolicitud(s.id, 'aprobada', null);
      await registrarHistorial({
        accion: 'solicitud',
        texto: `${textos.paginas.historial.solicitudAprobada(textos.tiposSolicitud[s.tipo] ?? s.tipo, persona.nombre)} (${rangoTexto(s)})`,
        persona, fecha: s.detalle?.fecha_inicio ?? null,
      });
      await renderCoordinador(contenedor);
      if (s.tipo === 'permiso') {
        avisar(marcados ? `Permiso aprobado: ${marcados} día(s) marcados en el horario.` : 'Permiso aprobado. La persona no está en Personal, así que no se marcó en el horario.');
      } else {
        avisar('Solicitud aprobada. Ajusta el turno en Planificar (toca a la persona en ese día).');
      }
    } catch (error) {
      console.error(error);
      boton.disabled = false;
      avisar(textos.errores.genericoAlGuardar);
    }
  }));

  document.querySelectorAll('#sol-pendientes .sol-rechazar').forEach((boton) => boton.addEventListener('click', async () => {
    const s = porId.get(boton.closest('[data-id]').dataset.id);
    const persona = personaDe(s);
    const comentario = await pedirTexto(t.campoComentarioRechazo, { placeholder: 'Ej. No hay quién cubra ese día' });
    if (comentario === null && !await confirmar(`¿Rechazar sin comentario la solicitud de ${persona.nombre}?`, { textoConfirmar: 'Rechazar' })) return;

    boton.disabled = true;
    try {
      await resolverSolicitud(s.id, 'rechazada', comentario);
      await registrarHistorial({
        accion: 'solicitud',
        texto: `${textos.paginas.historial.solicitudRechazada(textos.tiposSolicitud[s.tipo] ?? s.tipo, persona.nombre)} (${rangoTexto(s)})`,
        persona, fecha: s.detalle?.fecha_inicio ?? null,
      });
      await renderCoordinador(contenedor);
      avisar('Solicitud rechazada.');
    } catch (error) {
      console.error(error);
      boton.disabled = false;
      avisar(textos.errores.genericoAlGuardar);
    }
  }));
}
