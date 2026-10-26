import { textos } from '../textos.js';

const RUTAS = {
  Planificar: '#/planificador',
  Personal: '#/personal',
  Reportes: '#/reportes',
  Configuración: '#/configuracion',
  Historial: '#/historial',
};

const ICONOS = {
  Planificar: '<path d="M4 20V10M4 10l4-6h8l4 6M4 10h16M8 20v-6h8v6"></path>',
  Personal: '<circle cx="9" cy="7" r="3"></circle><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"></path><circle cx="18" cy="8" r="2.5"></circle><path d="M22 21v-1a5 5 0 0 0-3.5-4.8"></path>',
  Reportes: '<path d="M12 20V10M18 20V4M6 20v-4"></path>',
  Configuración: '<circle cx="12" cy="12" r="3"></circle>',
  Historial: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
};

export async function render(contenedor) {
  contenedor.innerHTML = `
    <div class="pagina">
      <div class="encabezado">
        <div class="encabezado-titulo">Más</div>
      </div>
      <div class="lista-columna" style="padding:8px 16px;">
        ${textos.nav.masCoordinador.map((item) => `
          <a href="${RUTAS[item]}" class="fila-menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONOS[item]}</svg>
            <span>${item}</span>
          </a>
        `).join('')}
      </div>
    </div>
  `;
}
