import { supabase } from '../supabase.js';
import { textos } from '../textos.js';

const PERSONAL_INICIAL = [
  { codigo_empleado: '5750', nombre: 'EMERSON ELÍ MAZARIEGOS C', puesto: 'inspector', grupo: 1 },
  { codigo_empleado: '5211', nombre: 'JOSE OSLIN BARREIRA LOPE', puesto: 'encargado', grupo: 1 },
  { codigo_empleado: '6056', nombre: 'LUIS ALBERTO ARÉVALO SAL', puesto: 'inspector', grupo: 2 },
  { codigo_empleado: '5182', nombre: 'WILMER OMAR SIS POP', puesto: 'encargado', grupo: 2 },
  { codigo_empleado: '6867', nombre: 'IRMA LUCÍA MARTÍNEZ GARC', puesto: 'inspector', grupo: 3 },
  { codigo_empleado: '6291', nombre: 'DAVID SALOMON VELIZ ALVA', puesto: 'encargado', grupo: 3 },
];

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

      <div style="padding:20px;">
        <button id="boton-carga-inicial" class="boton-secundario" style="width:100%;">Cargar personal inicial</button>
        <div id="personal-mensaje" class="mensaje-info" hidden></div>
      </div>
    </div>
  `;

  document.getElementById('boton-agregar').addEventListener('click', () => mostrarFormNuevo());
  document.getElementById('boton-carga-inicial').addEventListener('click', () => cargarPersonalInicial());

  await pintarLista();

  async function pintarLista() {
    const lista = document.getElementById('lista-personal');
    lista.innerHTML = '<div class="mensaje-cargando">Cargando...</div>';

    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .neq('puesto', 'coordinador')
      .order('grupo');

    if (error) {
      console.error(error);
      lista.innerHTML = `<div class="mensaje-cargando">${textos.errores.genericoAlGuardar}</div>`;
      return;
    }

    if (!data || data.length === 0) {
      lista.innerHTML = `<div class="estado-vacio">Todavía no hay personal. Usa "Agregar" o "Cargar personal inicial".</div>`;
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
        <div class="tarjeta-persona-icono">${badgeGrupo || '—'}</div>
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
        if (personaExistente) {
          const { error } = await supabase.from('usuarios')
            .update({ nombre, puesto, grupo, correo, activo })
            .eq('id', personaExistente.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('usuarios')
            .insert({ nombre, puesto, grupo, correo, activo });
          if (error) throw error;
        }
        document.getElementById('form-nuevo').hidden = true;
        await pintarLista();
      } catch (e) {
        console.error(e);
        errorEl.textContent = textos.errores.genericoAlGuardar;
        errorEl.hidden = false;
      }
    });
  }

  async function cargarPersonalInicial() {
    const mensaje = document.getElementById('personal-mensaje');
    const boton = document.getElementById('boton-carga-inicial');
    boton.disabled = true;
    mensaje.hidden = true;

    try {
      const { data: existentes, error: errExistentes } = await supabase
        .from('usuarios').select('codigo_empleado');
      if (errExistentes) throw errExistentes;
      const codigosExistentes = new Set((existentes ?? []).map((u) => u.codigo_empleado));

      const nuevos = PERSONAL_INICIAL
        .filter((p) => !codigosExistentes.has(p.codigo_empleado))
        .map((p) => ({ ...p, correo: correoPlaceholder(p.codigo_empleado), activo: true }));

      if (nuevos.length === 0) {
        mensaje.textContent = 'El personal inicial ya estaba cargado.';
        mensaje.hidden = false;
        return;
      }

      const { error } = await supabase.from('usuarios').insert(nuevos);
      if (error) throw error;

      mensaje.textContent = `Se cargaron ${nuevos.length} personas. Completa el correo real de cada una antes de que entren por primera vez.`;
      mensaje.hidden = false;
      await pintarLista();
    } catch (e) {
      console.error(e);
      mensaje.textContent = textos.errores.genericoAlGuardar;
      mensaje.hidden = false;
    } finally {
      boton.disabled = false;
    }
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
