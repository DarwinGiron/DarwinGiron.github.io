import { supabase } from '../supabase.js';
import { textos } from '../textos.js';
import { fechaLarga } from '../utilidades/fechas.js';
import { confirmar, pedirTexto } from '../utilidades/dialogo.js';

export async function render(contenedor) {
  const t = textos.paginas.configuracion;

  contenedor.innerHTML = `
    <div class="pagina">
      <div class="encabezado">
        <div class="encabezado-titulo">${t.titulo}</div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-titulo">${t.seccionLetras}</div>
        <div id="lista-letras" class="lista-columna-ajustada"></div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-titulo">${t.seccionSemanaReferencia}</div>
        <div class="tarjeta-ayuda">${t.ayudaSemanaReferencia}</div>
        <div class="campo">
          <label for="conf-lunes">${t.campoLunes}</label>
          <input id="conf-lunes" type="date">
        </div>
        <div class="campo">
          <label id="conf-grupo-etiqueta">${t.campoGrupoEnD}</label>
          <div class="grupo-opciones" id="conf-grupo-opciones" role="group" aria-labelledby="conf-grupo-etiqueta">
            <button type="button" class="grupo-opcion" data-grupo="1" aria-pressed="false">Turno 1</button>
            <button type="button" class="grupo-opcion" data-grupo="2" aria-pressed="false">Turno 2</button>
            <button type="button" class="grupo-opcion" data-grupo="3" aria-pressed="false">Turno 3</button>
          </div>
        </div>
        <div id="config-error" class="mensaje-error" hidden></div>
        <button id="boton-guardar-config" class="boton-principal" style="margin-top:12px;">${textos.comun.guardarCambios}</button>
        <div id="config-mensaje" class="mensaje-info" hidden></div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-titulo-fila">
          <div class="tarjeta-titulo">${t.seccionFeriados(new Date().getFullYear())}</div>
          <button id="boton-agregar-feriado" class="boton-icono-relleno" aria-label="Agregar feriado">+</button>
        </div>
        <div id="lista-feriados" class="lista-columna-ajustada"></div>
      </div>
    </div>
  `;

  let grupoSeleccionado = null;

  await pintarLetras();
  await pintarConfig();
  await pintarFeriados();

  document.getElementById('boton-agregar-feriado').addEventListener('click', agregarFeriado);
  document.getElementById('boton-guardar-config').addEventListener('click', guardarConfig);

  async function pintarLetras() {
    const { data, error } = await supabase.from('letras').select('*').order('codigo');
    const el = document.getElementById('lista-letras');
    if (error) {
      el.innerHTML = `<div class="mensaje-cargando">${textos.errores.genericoAlGuardar}</div>`;
      return;
    }
    el.innerHTML = (data ?? []).map((letra) => `
      <div class="fila-letra">
        <div class="fila-letra-badge" style="background:var(--color-${letra.codigo.toLowerCase()}-bg, var(--color-l-bg));color:var(--color-${letra.codigo.toLowerCase()}-texto, var(--color-l-texto))">${letra.codigo}</div>
        <div class="fila-letra-texto">${letra.nombre} ${letra.hora_ini ? `· ${letra.hora_ini.slice(0, 5)}–${letra.hora_fin.slice(0, 5)}` : ''} · ${letra.horas_ordinarias} h ordinarias</div>
      </div>`).join('');
  }

  async function pintarConfig() {
    const { data, error } = await supabase.from('config').select('*').maybeSingle();
    if (error) {
      console.error(error);
      return;
    }
    if (data) {
      document.getElementById('conf-lunes').value = data.semana_referencia_lunes;
      grupoSeleccionado = data.grupo_en_d;
    }
    marcarGrupoSeleccionado();

    document.querySelectorAll('.grupo-opcion').forEach((boton) => {
      boton.addEventListener('click', () => {
        grupoSeleccionado = Number(boton.dataset.grupo);
        marcarGrupoSeleccionado();
      });
    });
  }

  function marcarGrupoSeleccionado() {
    document.querySelectorAll('.grupo-opcion').forEach((boton) => {
      const activo = Number(boton.dataset.grupo) === grupoSeleccionado;
      boton.classList.toggle('grupo-opcion-activa', activo);
      boton.setAttribute('aria-pressed', String(activo));
    });
  }

  async function guardarConfig() {
    const lunes = document.getElementById('conf-lunes').value;
    const errorEl = document.getElementById('config-error');
    const mensajeEl = document.getElementById('config-mensaje');
    errorEl.hidden = true;
    mensajeEl.hidden = true;

    if (!lunes || !grupoSeleccionado) {
      errorEl.textContent = textos.errores.campoFaltante('la fecha y el grupo');
      errorEl.hidden = false;
      return;
    }

    const fechaComoDate = new Date(`${lunes}T00:00:00`);
    if (fechaComoDate.getDay() !== 1) {
      errorEl.textContent = 'Esa fecha no es lunes. Elige el lunes de la semana de referencia.';
      errorEl.hidden = false;
      return;
    }

    try {
      const { data: existente } = await supabase.from('config').select('id').maybeSingle();
      const payload = { id: true, semana_referencia_lunes: lunes, grupo_en_d: grupoSeleccionado };
      const { error } = existente
        ? await supabase.from('config').update(payload).eq('id', true)
        : await supabase.from('config').insert(payload);
      if (error) throw error;

      mensajeEl.textContent = 'Semana de referencia guardada.';
      mensajeEl.hidden = false;
    } catch (e) {
      console.error(e);
      errorEl.textContent = textos.errores.genericoAlGuardar;
      errorEl.hidden = false;
    }
  }

  async function pintarFeriados() {
    const { data, error } = await supabase.from('feriados').select('*').order('fecha');
    const el = document.getElementById('lista-feriados');
    if (error) {
      el.innerHTML = `<div class="mensaje-cargando">${textos.errores.genericoAlGuardar}</div>`;
      return;
    }
    if (!data || data.length === 0) {
      el.innerHTML = `<div class="estado-vacio">${t.feriadosVacio}</div>`;
      return;
    }
    el.innerHTML = data.map((f) => `
      <div class="fila-feriado" data-id="${f.id}">
        <div>${fechaLarga(f.fecha)}</div>
        <div class="fila-feriado-nombre">${f.nombre}</div>
        <button class="feriado-eliminar boton-icono" aria-label="Eliminar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5E5E5E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>
        </button>
      </div>`).join('');

    el.querySelectorAll('.feriado-eliminar').forEach((boton) => {
      boton.addEventListener('click', async (evento) => {
        const fila = evento.target.closest('.fila-feriado');
        const id = fila.dataset.id;
        const fecha = fila.querySelector('div').textContent;
        const confirmado = await confirmar(t.confirmarEliminarFeriado(fecha), { textoConfirmar: 'Quitar' });
        if (!confirmado) return;
        const { error } = await supabase.from('feriados').delete().eq('id', id);
        if (error) {
          await confirmar(textos.errores.genericoAlGuardar, { textoConfirmar: 'Entendido', textoCancelar: 'Cerrar' });
          return;
        }
        await pintarFeriados();
      });
    });
  }

  async function agregarFeriado() {
    const fecha = await pedirTexto('Fecha del feriado', { placeholder: 'AAAA-MM-DD' });
    if (!fecha) return;
    const nombre = await pedirTexto('Nombre del feriado', { placeholder: 'Ej. Independencia' });
    if (!nombre) return;
    const { error } = await supabase.from('feriados').insert({ fecha, nombre });
    if (error) {
      await confirmar(textos.errores.genericoAlGuardar, { textoConfirmar: 'Entendido', textoCancelar: 'Cerrar' });
      return;
    }
    await pintarFeriados();
  }
}
