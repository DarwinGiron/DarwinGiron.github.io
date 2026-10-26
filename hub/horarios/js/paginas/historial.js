// Historial: cada cambio hecho en la app, del más reciente al más antiguo. El coordinador ve
// todo y puede filtrar por persona y tipo; el trabajador ve solo lo que lo involucra.

import { textos } from '../textos.js';
import { listarHistorial, esCoordinador } from '../firebase.js';
import { fechaCorta } from '../utilidades/fechas.js';

const TIPOS = {
  turno_editado: 'Cambios de turno',
  mes_generado: 'Mes generado',
  solicitud: 'Solicitudes',
  personal: 'Personal',
};

const escapar = (texto) => String(texto ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function cuando(iso) {
  const f = new Date(iso);
  const hh = String(f.getHours()).padStart(2, '0');
  const mm = String(f.getMinutes()).padStart(2, '0');
  const dia = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  return `${fechaCorta(dia)} · ${hh}:${mm}`;
}

export async function render(contenedor) {
  const t = textos.paginas.historial;
  const coordinador = esCoordinador();

  contenedor.innerHTML = `
    <div class="pagina">
      <div class="encabezado">
        <div class="encabezado-titulo">${t.titulo}</div>
      </div>
      ${coordinador ? `
      <div class="filtros-historial">
        <div class="campo">
          <label for="filtro-persona">${t.filtroPersona}</label>
          <select id="filtro-persona"><option value="">${t.filtroTodos}</option></select>
        </div>
        <div class="campo">
          <label for="filtro-tipo">${t.filtroTipo}</label>
          <select id="filtro-tipo">
            <option value="">${t.filtroTodos}</option>
            ${Object.entries(TIPOS).map(([valor, texto]) => `<option value="${valor}">${texto}</option>`).join('')}
          </select>
        </div>
      </div>` : ''}
      <div id="historial-lista" class="lista-columna"><div class="mensaje-cargando">Cargando...</div></div>
    </div>
  `;

  const lista = document.getElementById('historial-lista');
  let movimientos;
  try {
    movimientos = await listarHistorial();
  } catch (error) {
    console.error(error);
    lista.innerHTML = `<div class="mensaje-cargando">${textos.errores.genericoAlGuardar}</div>`;
    return;
  }

  const pintar = () => {
    const persona = coordinador ? document.getElementById('filtro-persona').value : '';
    const tipo = coordinador ? document.getElementById('filtro-tipo').value : '';
    const visibles = movimientos.filter((m) => (!persona || m.persona_nombre === persona) && (!tipo || m.accion === tipo));

    if (visibles.length === 0) {
      lista.innerHTML = `<div class="estado-vacio">${t.estadoVacio}</div>`;
      return;
    }
    lista.innerHTML = visibles.map((m) => `
      <div class="tarjeta-solicitud">
        <div class="tarjeta-solicitud-fila">
          <div class="tarjeta-solicitud-tipo">${escapar(m.texto)}</div>
          <span class="badge badge-gris">${escapar(TIPOS[m.accion] ?? m.accion)}</span>
        </div>
        <div class="tarjeta-solicitud-pie">${escapar(t.pie(m.actor_nombre || m.actor_correo || '—', cuando(m.creado_en)))}</div>
      </div>`).join('');
  };

  if (coordinador) {
    const personas = [...new Set(movimientos.map((m) => m.persona_nombre).filter(Boolean))].sort();
    document.getElementById('filtro-persona').insertAdjacentHTML('beforeend', personas.map((p) => `<option value="${escapar(p)}">${escapar(p)}</option>`).join(''));
    document.getElementById('filtro-persona').addEventListener('change', pintar);
    document.getElementById('filtro-tipo').addEventListener('change', pintar);
  }
  pintar();
}
