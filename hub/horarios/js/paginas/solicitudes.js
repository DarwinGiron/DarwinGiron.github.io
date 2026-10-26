import {
  getUsuarioActual, esCoordinador, crearSolicitud, listarMisSolicitudes, listarSolicitudes, resolverSolicitud,
  registrarHistorial, listarTurnos, listarFeriados, guardarTurnosManuales, listarPersonal,
} from '../firebase.js';
import { formularioCambioHtml, enlazarFormularioCambio, aplicarCambio, textoCambio } from './cambio-turno.js';
import { planDeCobertura, turnosDeCobertura, textoPlan, validarRangoVacaciones } from '../vacaciones.js';
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
        <div class="tarjeta-titulo">Nueva solicitud</div>
        ${selectorTipo('sol')}
        <div id="cambio-form" hidden></div>
        <div id="vacaciones-form" hidden></div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-titulo">Otras solicitudes</div>
        <div class="tarjeta-ayuda">Permiso, cobertura 6 a 6 o evento extra.</div>
        <div class="campo">
          <label for="sol-tipo">${t.campoTipo}</label>
          <select id="sol-tipo">
            ${Object.entries(textos.tiposSolicitud).filter(([clave]) => !['cambio_turno', 'vacaciones'].includes(clave)).map(([clave, texto]) => `<option value="${clave}">${texto}</option>`).join('')}
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
  enlazarSelectorTipo('sol', {
    cambio: () => abrirCambioTrabajador(usuario),
    vacaciones: () => abrirVacacionesTrabajador(usuario),
  }, location.hash.includes('tipo=vacaciones') ? 'vacaciones' : location.hash.includes('tipo=cambio_turno') ? 'cambio' : null);

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
  if (tipo === 'vacaciones') {
    const error = validarRangoVacaciones(fechaInicio, document.getElementById('sol-fecha-fin').value);
    if (error) {
      errorEl.textContent = error;
      errorEl.hidden = false;
      return;
    }
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

/** Lista de la cobertura propuesta, para mostrarla en una tarjeta o en una confirmación. */
function htmlPlan(plan) {
  return `<ul class="plan-lista">${textoPlan(plan).map((l) => `<li>${escapar(l)}</li>`).join('')}</ul>`;
}

/** Botones para elegir qué se pide: cambio de turno o vacaciones. */
function selectorTipo(idp) {
  return `
    <div class="grupo-opciones selector-solicitud" role="group" aria-label="Tipo de solicitud">
      <button type="button" class="grupo-opcion" data-${idp}-tipo="cambio" aria-pressed="false">Cambio de turno</button>
      <button type="button" class="grupo-opcion" data-${idp}-tipo="vacaciones" aria-pressed="false">Vacaciones</button>
    </div>`;
}

/** Muestra el formulario del tipo elegido (y lo arma la primera vez). */
function enlazarSelectorTipo(idp, abrir, inicial) {
  const botones = [...document.querySelectorAll(`[data-${idp}-tipo]`)];
  const zonas = { cambio: document.getElementById(idp === 'sol' ? 'cambio-form' : 'cambio-form-coord'), vacaciones: document.getElementById(idp === 'sol' ? 'vacaciones-form' : 'vacaciones-form-coord') };
  const elegir = (tipo) => {
    botones.forEach((b) => {
      const activo = b.dataset[`${idp}Tipo`] === tipo;
      b.classList.toggle('grupo-opcion-activa', activo);
      b.setAttribute('aria-pressed', String(activo));
    });
    Object.entries(zonas).forEach(([clave, zona]) => { zona.hidden = clave !== tipo; });
    abrir[tipo]();
  };
  botones.forEach((b) => b.addEventListener('click', () => elegir(b.dataset[`${idp}Tipo`])));
  if (inicial) elegir(inicial);
}

/** Formulario de vacaciones: persona (solo el coordinador), desde, hasta y motivo. */
function formVacacionesHtml(idp, personal, conPersona) {
  return `
    ${conPersona ? `
    <div class="campo">
      <label for="${idp}-persona">Persona</label>
      <select id="${idp}-persona" class="v-persona"><option value="">Elige a la persona...</option>${personal.map((p) => `<option value="${p.id}">${escapar(p.nombre)} · ${escapar(p.puesto)}</option>`).join('')}</select>
    </div>` : ''}
    <div class="campo">
      <label id="${idp}-fechas">Desde y hasta</label>
      <div style="display:flex; gap:8px;" role="group" aria-labelledby="${idp}-fechas">
        <input type="date" class="v-desde" style="flex:1;" aria-label="Primer día de vacaciones">
        <input type="date" class="v-hasta" style="flex:1;" aria-label="Último día de vacaciones">
      </div>
      <div class="tarjeta-ayuda" style="margin:8px 0 0;">Máximo 3 semanas seguidas (21 días).</div>
    </div>
    <div class="v-plan plan-vacaciones" hidden></div>
    <div class="campo">
      <label for="${idp}-motivo">Comentario (opcional)</label>
      <input id="${idp}-motivo" type="text" class="v-motivo" placeholder="Ej. Vacaciones anuales">
    </div>
    <div class="v-error mensaje-error" hidden></div>
    <div class="v-info mensaje-info" hidden></div>
  `;
}

/** Conecta el formulario: valida el rango y muestra la cobertura propuesta. Devuelve leer(). */
function enlazarVacaciones(raiz, { personal, personaFija = null }) {
  const persona = () => personaFija ?? personal.find((p) => p.id === raiz.querySelector('.v-persona')?.value);
  const zona = raiz.querySelector('.v-plan');
  let ultimo = 0;

  async function vistaPrevia() {
    const p = persona();
    const desde = raiz.querySelector('.v-desde').value;
    const hasta = raiz.querySelector('.v-hasta').value;
    if (!p || !desde || !hasta) { zona.hidden = true; return; }
    const error = validarRangoVacaciones(desde, hasta);
    zona.hidden = false;
    if (error) { zona.innerHTML = `<div class="mensaje-error" style="margin:0;">${escapar(error)}</div>`; return; }
    const turno = ++ultimo;
    zona.innerHTML = '<div class="mensaje-cargando">Calculando la cobertura...</div>';
    try {
      const plan = await planDeCobertura({ personaId: p.id, desde, hasta });
      if (turno !== ultimo) return;
      zona.innerHTML = `<div class="plan-titulo">Cobertura propuesta mientras ${escapar(p.nombre.split(' ')[0].charAt(0) + p.nombre.split(' ')[0].slice(1).toLowerCase())} está de vacaciones</div>${htmlPlan(plan)}`;
    } catch (e) {
      console.error(e);
      zona.hidden = true;
    }
  }
  ['.v-persona', '.v-desde', '.v-hasta'].forEach((sel) => raiz.querySelector(sel)?.addEventListener('change', vistaPrevia));

  return function leer() {
    const p = persona();
    const desde = raiz.querySelector('.v-desde').value;
    const hasta = raiz.querySelector('.v-hasta').value;
    if (!p) return { error: 'Elige a la persona.' };
    const error = validarRangoVacaciones(desde, hasta);
    if (error) return { error };
    return { persona: p, desde, hasta, motivo: raiz.querySelector('.v-motivo').value.trim() || null };
  };
}

async function abrirVacacionesTrabajador(usuario) {
  const zona = document.getElementById('vacaciones-form');
  if (!usuario.id) {
    zona.innerHTML = '<div class="mensaje-error">Tu correo no está en el personal de Horarios, así que no puedes pedir vacaciones todavía. Pídele al coordinador que te agregue.</div>';
    return;
  }
  if (zona.dataset.listo) return;
  zona.dataset.listo = '1';
  let personal = [];
  try { personal = await listarPersonal({ soloActivos: true }); } catch (e) { console.error(e); }
  const yo = personal.find((p) => p.id === usuario.id) ?? { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo };
  zona.innerHTML = `${formVacacionesHtml('vac', personal, false)}<button id="vac-enviar" class="boton-principal">Enviar solicitud de vacaciones</button>`;
  const leer = enlazarVacaciones(zona, { personal, personaFija: yo });

  document.getElementById('vac-enviar').addEventListener('click', async () => {
    const errorEl = zona.querySelector('.v-error');
    const infoEl = zona.querySelector('.v-info');
    errorEl.hidden = true; infoEl.hidden = true;
    const datos = leer();
    if (datos.error) { errorEl.textContent = datos.error; errorEl.hidden = false; return; }
    const boton = document.getElementById('vac-enviar');
    boton.disabled = true;
    try {
      await crearSolicitud({
        tipo: 'vacaciones',
        solicitante_id: usuario.id,
        solicitante_nombre: usuario.nombre,
        detalle: { fecha_inicio: datos.desde, fecha_fin: datos.hasta },
        motivo: datos.motivo,
      });
      await registrarHistorial({
        accion: 'solicitud',
        texto: `${usuario.nombre} pidió vacaciones del ${fechaCorta(datos.desde)} al ${fechaCorta(datos.hasta)}`,
        persona: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo },
        fecha: datos.desde,
      });
      infoEl.textContent = t().toastEnviada;
      infoEl.hidden = false;
      await pintarLista(usuario);
    } catch (e) {
      console.error(e);
      errorEl.textContent = textos.errores.genericoAlGuardar;
      errorEl.hidden = false;
    } finally {
      boton.disabled = false;
    }
  });
}

async function abrirCambioTrabajador(usuario) {
  const zona = document.getElementById('cambio-form');
  if (!zona) return;
  if (!usuario.id) {
    zona.innerHTML = '<div class="mensaje-error">Tu correo no está en el personal de Horarios, así que no puedes pedir cambios todavía. Pídele al coordinador que te agregue.</div>';
    return;
  }
  if (zona.dataset.listo) return;
  zona.dataset.listo = '1';

  let personal = [];
  try {
    personal = await listarPersonal({ soloActivos: true });
  } catch (error) {
    console.error(error);
  }
  const yo = personal.find((p) => p.id === usuario.id) ?? { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo };
  zona.innerHTML = `
    ${formularioCambioHtml({ idp: 'cambio', personal, solicitante: yo })}
    <div class="campo">
      <label for="cambio-motivo">Justificación del cambio</label>
      <textarea id="cambio-motivo" class="campo-texto-largo" rows="3" placeholder="Explica por qué necesitas el cambio (obligatorio)"></textarea>
    </div>
    <div id="cambio-error" class="mensaje-error" hidden></div>
    <div id="cambio-info" class="mensaje-info" hidden></div>
    <button id="cambio-enviar" class="boton-principal">Enviar cambio de turno</button>
  `;
  const leer = enlazarFormularioCambio(zona, { personal, solicitante: yo });

  document.getElementById('cambio-enviar').addEventListener('click', async () => {
    const errorEl = document.getElementById('cambio-error');
    const infoEl = document.getElementById('cambio-info');
    errorEl.hidden = true; infoEl.hidden = true;
    const datos = leer();
    if (datos.error) {
      errorEl.textContent = datos.error;
      errorEl.hidden = false;
      return;
    }
    const justificacion = document.getElementById('cambio-motivo').value.trim();
    if (justificacion.length < 5) {
      errorEl.textContent = 'Escribe la justificación del cambio de turno.';
      errorEl.hidden = false;
      return;
    }
    const boton = document.getElementById('cambio-enviar');
    boton.disabled = true;
    try {
      const detalle = {
        fecha_inicio: datos.fecha,
        fecha_fin: datos.fecha,
        companero_id: datos.b.id,
        companero_nombre: datos.b.nombre,
        companero_correo: datos.b.correo ?? null,
        horario_solicitante: datos.horarioA,
        horario_companero: datos.horarioB,
      };
      await crearSolicitud({
        tipo: 'cambio_turno',
        solicitante_id: usuario.id,
        solicitante_nombre: usuario.nombre,
        detalle,
        motivo: justificacion,
      });
      const texto = `${usuario.nombre} pidió cambio de turno el ${fechaCorta(datos.fecha)}: ${textoCambio(detalle, usuario.nombre)}`;
      await registrarHistorial({ accion: 'solicitud', texto, persona: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo }, fecha: datos.fecha });
      await registrarHistorial({ accion: 'solicitud', texto, persona: datos.b, fecha: datos.fecha });
      infoEl.textContent = t().toastEnviada;
      infoEl.hidden = false;
      await pintarLista(usuario);
    } catch (error) {
      console.error(error);
      errorEl.textContent = textos.errores.genericoAlGuardar;
      errorEl.hidden = false;
    } finally {
      boton.disabled = false;
    }
  });
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
          ${s.detalle?.fecha_inicio ? (s.detalle.fecha_fin && s.detalle.fecha_fin !== s.detalle.fecha_inicio ? `${fechaCorta(s.detalle.fecha_inicio)} – ${fechaCorta(s.detalle.fecha_fin)}` : fechaCorta(s.detalle.fecha_inicio)) : ''}
          ${s.tipo === 'cambio_turno' && s.detalle?.companero_nombre ? `<br>${escapar(textoCambio(s.detalle, s.solicitante_nombre || 'Tú'))}` : ''}
          ${s.motivo ? `<br>${s.tipo === 'cambio_turno' ? 'Justificación' : 'Motivo'}: "${escapar(s.motivo)}"` : ''}
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

/** Al aprobar un permiso o vacaciones, marca esos días del solicitante con esa ausencia en el horario. */
async function aplicarAusencia(s) {
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
    persona, fecha, opcion: `ausencia:${s.tipo === 'vacaciones' ? 'vacaciones' : 'permiso'}`, turnoActual: propios.get(fecha) ?? null, esFeriado: esFeriado.has(fecha),
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
      <div class="tarjeta">
        <div class="tarjeta-titulo">Nueva solicitud</div>
        <div class="tarjeta-ayuda">Lo registras directo en el horario, sin que la persona tenga que pedirlo.</div>
        ${selectorTipo('coord')}
        <div id="cambio-form-coord" hidden></div>
        <div id="vacaciones-form-coord" hidden></div>
      </div>
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
        ${s.tipo === 'cambio_turno' && s.detalle?.companero_nombre ? `<br>${escapar(textoCambio(s.detalle, s.solicitante_nombre))}` : ''}
        ${s.motivo ? `<br>${s.tipo === 'cambio_turno' ? 'Justificación' : 'Motivo'}: "${escapar(s.motivo)}"` : ''}
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

  const abrirCambioCoordinador = async () => {
    const zona = document.getElementById('cambio-form-coord');
    if (zona.dataset.listo) return;
    zona.dataset.listo = '1';
    const personal = await listarPersonal({ soloActivos: true });
    zona.innerHTML = `
      ${formularioCambioHtml({ idp: 'cambio-coord', personal })}
      <div class="campo">
        <label for="cambio-coord-motivo">Justificación del cambio</label>
        <textarea id="cambio-coord-motivo" class="campo-texto-largo" rows="2" placeholder="Por qué se hace el cambio (obligatorio)"></textarea>
      </div>
      <div id="cambio-coord-error" class="mensaje-error" hidden></div>
      <button id="cambio-coord-guardar" class="boton-principal">Aplicar cambio</button>
    `;
    const leer = enlazarFormularioCambio(zona, { personal });
    document.getElementById('cambio-coord-guardar').addEventListener('click', async () => {
      const errorEl = document.getElementById('cambio-coord-error');
      errorEl.hidden = true;
      const datos = leer();
      if (datos.error) { errorEl.textContent = datos.error; errorEl.hidden = false; return; }
      const justificacion = document.getElementById('cambio-coord-motivo').value.trim();
      if (justificacion.length < 5) { errorEl.textContent = 'Escribe la justificación del cambio de turno.'; errorEl.hidden = false; return; }
      const boton = document.getElementById('cambio-coord-guardar');
      boton.disabled = true;
      try {
        await aplicarCambio({ ...datos, origen: 'manual' });
        const detalle = { companero_nombre: datos.b.nombre, horario_solicitante: datos.horarioA, horario_companero: datos.horarioB };
        const texto = `Cambio de turno el ${fechaCorta(datos.fecha)}: ${textoCambio(detalle, datos.a.nombre)}. Justificación: ${justificacion}`;
        await registrarHistorial({ accion: 'turno_editado', texto, persona: datos.a, fecha: datos.fecha });
        await registrarHistorial({ accion: 'turno_editado', texto, persona: datos.b, fecha: datos.fecha });
        await renderCoordinador(contenedor);
        avisar(`Cambio de turno del ${fechaCorta(datos.fecha)} aplicado en el horario: ${textoCambio(detalle, datos.a.nombre)}.`);
      } catch (error) {
        console.error(error);
        boton.disabled = false;
        errorEl.textContent = textos.errores.genericoAlGuardar;
        errorEl.hidden = false;
      }
    });
  };

  const abrirVacacionesCoordinador = async () => {
    const zona = document.getElementById('vacaciones-form-coord');
    if (zona.dataset.listo) return;
    zona.dataset.listo = '1';
    const personal = await listarPersonal({ soloActivos: true });
    zona.innerHTML = `${formVacacionesHtml('vac-coord', personal, true)}<button id="vac-coord-guardar" class="boton-principal">Registrar vacaciones</button>`;
    const leer = enlazarVacaciones(zona, { personal });
    document.getElementById('vac-coord-guardar').addEventListener('click', async () => {
      const errorEl = zona.querySelector('.v-error');
      errorEl.hidden = true;
      const datos = leer();
      if (datos.error) { errorEl.textContent = datos.error; errorEl.hidden = false; return; }
      const plan = await planDeCobertura({ personaId: datos.persona.id, desde: datos.desde, hasta: datos.hasta });
      const pregunta = `¿Registrar vacaciones de ${escapar(datos.persona.nombre)} del ${fechaCorta(datos.desde)} al ${fechaCorta(datos.hasta)}?`
        + `<div class="plan-titulo" style="margin-top:12px;">Cobertura que se aplicará</div>${htmlPlan(plan)}`;
      if (!await confirmar(pregunta, { textoConfirmar: 'Registrar' })) return;

      const boton = document.getElementById('vac-coord-guardar');
      boton.disabled = true;
      try {
        const marcados = await aplicarAusencia({
          id: null, tipo: 'vacaciones', solicitante_id: datos.persona.id,
          detalle: { fecha_inicio: datos.desde, fecha_fin: datos.hasta },
        });
        if (plan.cambios.length) await guardarTurnosManuales(await turnosDeCobertura(plan), { origen: 'manual' });
        await registrarHistorial({
          accion: 'turno_editado',
          texto: `Vacaciones de ${datos.persona.nombre} del ${fechaCorta(datos.desde)} al ${fechaCorta(datos.hasta)}${datos.motivo ? ` (${datos.motivo})` : ''}`,
          persona: datos.persona, fecha: datos.desde,
        });
        for (const c of plan.cambios) {
          await registrarHistorial({ accion: 'turno_editado', texto: `${c.persona.nombre} cubre vacaciones de ${datos.persona.nombre} el ${fechaCorta(c.fecha)}`, persona: c.persona, fecha: c.fecha });
        }
        await renderCoordinador(contenedor);
        const revisar = plan.pendientes.length ? ` Revisa a mano: ${plan.pendientes.map(fechaCorta).join(', ')}.` : '';
        avisar(`Vacaciones registradas: ${marcados} día(s) marcados y ${plan.cambios.length} turno(s) de compañeros ajustados.${revisar}`);
      } catch (error) {
        console.error(error);
        boton.disabled = false;
        errorEl.textContent = textos.errores.genericoAlGuardar;
        errorEl.hidden = false;
      }
    });
  };

  enlazarSelectorTipo('coord', { cambio: abrirCambioCoordinador, vacaciones: abrirVacacionesCoordinador }, null);

  document.querySelectorAll('#sol-pendientes .sol-aprobar').forEach((boton) => boton.addEventListener('click', async () => {
    const s = porId.get(boton.closest('[data-id]').dataset.id);
    const persona = personaDe(s);
    const esCambio = s.tipo === 'cambio_turno' && s.detalle?.companero_id && s.solicitante_id;
    const esAusencia = s.tipo === 'permiso' || s.tipo === 'vacaciones';
    let plan = null;
    if (s.tipo === 'vacaciones' && s.solicitante_id) {
      try {
        plan = await planDeCobertura({ personaId: s.solicitante_id, desde: s.detalle.fecha_inicio, hasta: s.detalle.fecha_fin || s.detalle.fecha_inicio });
      } catch (error) {
        console.error(error);
      }
    }
    const pregunta = esAusencia
      ? `¿Aprobar ${s.tipo === 'vacaciones' ? 'las vacaciones' : 'el permiso'} de ${persona.nombre} del ${fechaCorta(s.detalle.fecha_inicio)} al ${fechaCorta(s.detalle.fecha_fin || s.detalle.fecha_inicio)}? Esos días quedan marcados en el horario.`
      : esCambio
        ? `${t.confirmarAprobar.cambio_turno(persona.nombre, s.detalle.companero_nombre, fechaCorta(s.detalle.fecha_inicio))} Quedará: ${textoCambio(s.detalle, persona.nombre)}.`
        : `¿Aprobar "${textos.tiposSolicitud[s.tipo] ?? s.tipo}" de ${persona.nombre} (${rangoTexto(s)})?`;
    const textoConfirmacion = plan
      ? `${escapar(pregunta)}<div class="plan-titulo" style="margin-top:12px;">Cobertura que se aplicará</div>${htmlPlan(plan)}`
      : escapar(pregunta);
    if (!await confirmar(textoConfirmacion, { textoConfirmar: 'Aprobar' })) return;

    boton.disabled = true;
    try {
      const marcados = esAusencia ? await aplicarAusencia(s) : 0;
      if (plan?.cambios.length) {
        await guardarTurnosManuales(await turnosDeCobertura(plan), { origen: 'solicitud', solicitudId: s.id });
        for (const c of plan.cambios) {
          await registrarHistorial({
            accion: 'turno_editado',
            texto: `${c.persona.nombre} cubre vacaciones de ${persona.nombre} el ${fechaCorta(c.fecha)}`,
            persona: c.persona, fecha: c.fecha,
          });
        }
      }
      if (esCambio) {
        await aplicarCambio({
          fecha: s.detalle.fecha_inicio,
          a: { id: s.solicitante_id },
          b: { id: s.detalle.companero_id },
          horarioA: s.detalle.horario_solicitante,
          horarioB: s.detalle.horario_companero,
          origen: 'solicitud',
          solicitudId: s.id,
        });
        await registrarHistorial({
          accion: 'solicitud',
          texto: `Cambio de turno aprobado el ${fechaCorta(s.detalle.fecha_inicio)}: ${textoCambio(s.detalle, persona.nombre)}`,
          persona: { id: s.detalle.companero_id, nombre: s.detalle.companero_nombre, correo: s.detalle.companero_correo },
          fecha: s.detalle.fecha_inicio,
        });
      }
      await resolverSolicitud(s.id, 'aprobada', null);
      await registrarHistorial({
        accion: 'solicitud',
        texto: `${textos.paginas.historial.solicitudAprobada(textos.tiposSolicitud[s.tipo] ?? s.tipo, persona.nombre)} (${rangoTexto(s)})`,
        persona, fecha: s.detalle?.fecha_inicio ?? null,
      });
      await renderCoordinador(contenedor);
      if (esAusencia) {
        const nombreTipo = s.tipo === 'vacaciones' ? 'Vacaciones aprobadas' : 'Permiso aprobado';
        const cobertura = plan?.cambios.length ? ` Cobertura aplicada: ${plan.cambios.length} turno(s) de compañeros ajustados.` : '';
        const revisar = plan?.pendientes.length ? ` Revisa a mano: ${plan.pendientes.map(fechaCorta).join(', ')}.` : '';
        avisar(marcados ? `${nombreTipo}: ${marcados} día(s) marcados en el horario.${cobertura}${revisar}` : `${nombreTipo}. La persona no está en Personal, así que no se marcó en el horario.`);
      } else if (esCambio) {
        avisar(`Cambio de turno aprobado y aplicado en el horario: ${textoCambio(s.detalle, persona.nombre)}.`);
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
