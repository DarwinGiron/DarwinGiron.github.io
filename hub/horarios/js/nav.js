import { textos } from './textos.js';

const ICONOS = {
  'Mi horario': '<rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M8 2v4M16 2v4M3 10h18"></path>',
  Hoy: '<path d="M15 18l-6-6 6-6"></path><rect x="3" y="4" width="18" height="16" rx="2"></rect>',
  Mes: '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>',
  Planificar: '<path d="M4 20V10M4 10l4-6h8l4 6M4 10h16M8 20v-6h8v6"></path>',
  Solicitudes: '<path d="M4 6h16M4 12h10M4 18h7"></path>',
  Personal: '<circle cx="9" cy="7" r="3"></circle><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"></path><circle cx="18" cy="8" r="2.5"></circle><path d="M22 21v-1a5 5 0 0 0-3.5-4.8"></path>',
  Reportes: '<path d="M12 20V10M18 20V4M6 20v-4"></path>',
  Configuración: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"></path>',
  Historial: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  Más: '<circle cx="5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="19" cy="12" r="1.6"></circle>',
};

const RUTAS = {
  'Mi horario': '#/mi-horario',
  Hoy: '#/hoy',
  Mes: '#/mes',
  Planificar: '#/planificador',
  Solicitudes: '#/solicitudes',
  Personal: '#/personal',
  Reportes: '#/reportes',
  Configuración: '#/configuracion',
  Historial: '#/historial',
  Más: '#/mas',
};

// Barra inferior (celular): la del coordinador colapsa lo que no cabe en "Más".
const ITEMS_INFERIOR = {
  trabajador: ['Mi horario', 'Mes', 'Solicitudes', 'Historial'],
  coordinador: ['Hoy', 'Mes', 'Solicitudes', 'Más'],
};

// Barra lateral (escritorio): hay espacio de sobra, se listan todas las páginas directo.
const ITEMS_LATERAL = {
  trabajador: ['Mi horario', 'Mes', 'Solicitudes', 'Historial'],
  coordinador: ['Hoy', 'Mes', 'Planificar', 'Solicitudes', 'Personal', 'Reportes', 'Configuración', 'Historial'],
};

/** Pinta (o quita) la barra inferior (celular) y la barra lateral (escritorio) según el rol. */
export function pintarNav(hashActual, usuario) {
  const inferior = document.getElementById('nav-inferior');
  const lateral = document.getElementById('nav-lateral');

  if (!usuario) {
    inferior.innerHTML = '';
    inferior.hidden = true;
    lateral.innerHTML = '';
    lateral.hidden = true;
    return;
  }

  const rol = usuario.puesto === 'coordinador' ? 'coordinador' : 'trabajador';
  const activo = itemActivoPara(hashActual);

  inferior.hidden = false;
  inferior.innerHTML = ITEMS_INFERIOR[rol].map((item) => enlaceNav(item, item === activo, 'nav-item')).join('');

  lateral.hidden = false;
  lateral.innerHTML = `
    <div class="nav-lateral-marca">
      <div class="nav-lateral-logo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E31C5F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.5 2"></path></svg>
      </div>
      <div class="nav-lateral-nombre">${textos.app.nombre}</div>
    </div>
    <div class="nav-lateral-items">
      ${ITEMS_LATERAL[rol].map((item) => enlaceNav(item, item === activo || (activo === 'Más' && item === itemRealTrasMas(hashActual)), 'nav-lateral-item')).join('')}
    </div>
  `;
}

function enlaceNav(item, esActivo, clase) {
  const ruta = RUTAS[item];
  const color = esActivo ? 'var(--color-acento)' : 'var(--color-texto-suave)';
  return `
    <a href="${ruta}" class="${clase} ${esActivo ? clase + '-activo' : ''}" style="color:${color};">
      <svg width="${clase === 'nav-item' ? 24 : 20}" height="${clase === 'nav-item' ? 24 : 20}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONOS[item]}</svg>
      <span style="font-weight:${esActivo ? 700 : 600};">${item}</span>
    </a>`;
}

function itemActivoPara(hash) {
  const mapa = {
    '#/mi-horario': 'Mi horario',
    '#/hoy': 'Hoy',
    '#/mes': 'Mes',
    '#/solicitudes': 'Solicitudes',
    '#/historial': 'Historial',
    '#/mas': 'Más',
    '#/planificador': 'Más',
    '#/personal': 'Más',
    '#/configuracion': 'Más',
    '#/reportes': 'Más',
  };
  return mapa[hash] ?? null;
}

// En la barra lateral no hay "Más": estas rutas resaltan su propio ítem directo.
function itemRealTrasMas(hash) {
  const mapa = {
    '#/planificador': 'Planificar',
    '#/personal': 'Personal',
    '#/configuracion': 'Configuración',
    '#/reportes': 'Reportes',
  };
  return mapa[hash] ?? null;
}
