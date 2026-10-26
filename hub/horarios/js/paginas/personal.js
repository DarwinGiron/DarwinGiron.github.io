import { listarPersonal, guardarPersona, registrarHistorial } from '../firebase.js';
import { textos } from '../textos.js';

export async function render(contenedor) {
  const t = textos.paginas.personal;

  contenedor.innerHTML = `
    <div class="pagina">
      <div class="encabezado">
        <div class="encabezado-titulo">${t.titulo}</div>
        <button id="boton-agregar" class="boton-chip">+ ${t.botonAgregar}</button>
      </div>

      <div id="form-nuevo" class="tarjeta" hidden></div>
      <div id="lista-personal" class="lista-columna"></div>
    </div>
  `;

  document.getElementById('boton-agregar').addEventListener('click', () => mostrarFormNuevo());

  await pintarLista();

  async function pintarLista() {
    const lista = document.getElementById('lista-personal');
    lista.innerHTML = '<div class="mensaje-cargando">Cargando...</div>';

    let data;
    try {
      data = await listarPersonal();
    } catch (error) {
      console.error(error);
      lista.innerHTML = `<div class="mensaje-cargando">${textos.errores.genericoAlGuardar}</div>`;
      return;
    }

    if (!data || data.length === 0) {
      lista.innerHTML = `<div class="estado-vacio">Todavía no hay personal. Usa "Agregar" para dar de alta a cada persona.</div>`;
      return;
    }

    lista.innerHTML = data.map((persona) => tarjetaPersona(persona)).join('');

    data.forEach((persona) => {
      const tarjeta = document.getElementById(`persona-${persona.id}`);
      tarjeta.querySelector('.persona-editar').addEventListener('click', () => mostrarFormEdicion(persona));
    });
  }

  function tarjetaPersona(persona) {
    const correoPendiente = esCorreoPlaceholder(persona.correo);
    const badgeGrupo = persona.grupo ? `Turno ${persona.grupo}` : '';
    const badgeEstado = !persona.activo
      ? `<span class="badge badge-gris">${t.badgeInactivo}</span>`
      : correoPendiente
        ? `<span class="badge badge-amarillo">Correo pendiente</span>`
        : `<span class="punto-activo"></span>`;

    return `
      <div id="persona-${persona.id}" class="tarjeta-persona">
        <div class="tarjeta-persona-icono" title="${badgeGrupo}">${persona.grupo ? `T${persona.grupo}` : '—'}</div>
        <div class="tarjeta-persona-info">
          <div class="tarjeta-persona-nombre">${persona.nombre}</div>
          <div class="tarjeta-persona-detalle">${capitalizar(persona.puesto)} · ${badgeGrupo || 'sin grupo'} · ${correoPendiente ? 'sin correo asignado' : persona.correo}</div>
        </div>
        ${badgeEstado}
        <button class="persona-editar boton-icono" aria-label="Editar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5E5E5E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>
        </button>
      </div>`;
  }

  function mostrarFormNuevo() {
    const form = document.getElementById('form-nuevo');
    form.hidden = false;
    form.innerHTML = formularioPersona(null);
    enlazarFormulario(form, null);
    form.scrollIntoView({ behavior: 'smooth' });
  }

  function mostrarFormEdicion(persona) {
    const tarjeta = document.getElementById(`persona-${persona.id}`);
    const contenedorForm = document.createElement('div');
    contenedorForm.className = 'tarjeta';
    contenedorForm.innerHTML = formularioPersona(persona);
    tarjeta.replaceWith(contenedorForm);
    enlazarFormulario(contenedorForm, persona);
  }

  function formularioPersona(persona) {
    const esNuevo = !persona;
    // Prefijo único por formulario: puede haber uno de "nuevo" y uno de "editar" abiertos
    // a la vez, y los <label for="..."> necesitan un id que no se repita en la página.
    const idp = esNuevo ? 'nuevo' : `editar-${persona.id}`;
    return `
      <div class="campo">
        <label for="${idp}-nombre">Nombre</label>
        <input id="${idp}-nombre" class="f-nombre" type="text" value="${persona?.nombre ?? ''}" placeholder="Nombre completo">
      </div>
      <div class="campo">
        <label for="${idp}-puesto">Puesto</label>
        <select id="${idp}-puesto" class="f-puesto">
          <option value="inspector" ${persona?.puesto === 'inspector' ? 'selected' : ''}>Inspector</option>
          <option value="encargado" ${persona?.puesto === 'encargado' ? 'selected' : ''}>Encargado</option>
        </select>
      </div>
      <div class="campo">
        <label for="${idp}-grupo">Grupo</label>
        <select id="${idp}-grupo" class="f-grupo">
          <option value="1" ${persona?.grupo === 1 ? 'selected' : ''}>Turno 1</option>
          <option value="2" ${persona?.grupo === 2 ? 'selected' : ''}>Turno 2</option>
          <option value="3" ${persona?.grupo === 3 ? 'selected' : ''}>Turno 3</option>
        </select>
      </div>
      <div class="campo">
        <label for="${idp}-correo">Correo</label>
        <input id="${idp}-correo" class="f-correo" type="email" value="${persona && !esCorreoPlaceholder(persona.correo) ? persona.correo : ''}" placeholder="correo@cogusa.com">
      </div>
      <label class="campo-check">
        <input class="f-activo" type="checkbox" ${persona?.activo !== false ? 'checked' : ''}> Activo
      </label>
      <div id="form-error" class="mensaje-error" hidden></div>
      <div class="acciones-fila" style="margin-top:8px;">
        <button class="f-guardar boton-principal">${t.botonGuardarPersona}</button>
        <button class="f-cancelar boton-secundario">${textos.comun.cancelar}</button>
      </div>
    `;
  }

  function enlazarFormulario(contenedorForm, personaExistente) {
    contenedorForm.querySelector('.f-cancelar').addEventListener('click', () => pintarLista());
    contenedorForm.querySelector('.f-guardar').addEventListener('click', async () => {
      const nombre = contenedorForm.querySelector('.f-nombre').value.trim();
      const puesto = contenedorForm.querySelector('.f-puesto').value;
      const grupo = Number(contenedorForm.querySelector('.f-grupo').value);
      const correoIngresado = contenedorForm.querySelector('.f-correo').value.trim();
      const activo = contenedorForm.querySelector('.f-activo').checked;
      const errorEl = contenedorForm.querySelector('#form-error');
      errorEl.hidden = true;

      if (!nombre) {
        errorEl.textContent = textos.errores.campoFaltante('el nombre');
        errorEl.hidden = false;
        return;
      }

      const correo = correoIngresado || correoPlaceholder(personaExistente?.codigo_empleado ?? Date.now().toString());

      try {
        const id = await guardarPersona(personaExistente?.id ?? null, { nombre, puesto, grupo, correo, activo, codigo_empleado: personaExistente?.codigo_empleado ?? null });
        await registrarHistorial({
          accion: 'personal',
          texto: `${personaExistente ? 'Ficha actualizada' : 'Persona agregada'}: ${nombre} (${puesto}, Turno ${grupo}${activo ? '' : ', inactivo'})`,
          persona: { id, nombre, correo },
        });
        document.getElementById('form-nuevo').hidden = true;
        await pintarLista();
      } catch (e) {
        console.error(e);
        errorEl.textContent = textos.errores.genericoAlGuardar;
        errorEl.hidden = false;
      }
    });
  }
}

function correoPlaceholder(codigo) {
  return `pendiente+${codigo}@cogusa.local`;
}

function esCorreoPlaceholder(correo) {
  return typeof correo === 'string' && correo.startsWith('pendiente+') && correo.endsWith('@cogusa.local');
}

function capitalizar(texto) {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '';
}
