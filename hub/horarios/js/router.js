import { obtenerSesion, getUsuarioActual } from './supabase.js';
import { pintarNav } from './nav.js';
import { textos } from './textos.js';

import * as entrar from './paginas/entrar.js';
import * as crearContrasena from './paginas/crear-contrasena.js';
import * as miHorario from './paginas/mi-horario.js';
import * as mes from './paginas/mes.js';
import * as planificador from './paginas/planificador.js';
import * as personal from './paginas/personal.js';
import * as configuracion from './paginas/configuracion.js';
import * as mas from './paginas/mas.js';
import * as solicitudes from './paginas/solicitudes.js';
import * as proximamente from './paginas/proximamente.js';

const rutas = {
  '#/entrar': { render: entrar.render, publica: true },
  '#/crear-contrasena': { render: crearContrasena.render, publica: true },
  '#/mi-horario': { render: miHorario.render },
  '#/mes': { render: mes.render },
  '#/planificador': { render: planificador.render, coordinador: true },
  '#/personal': { render: personal.render, coordinador: true },
  '#/configuracion': { render: configuracion.render, coordinador: true },
  '#/mas': { render: mas.render, coordinador: true },
  '#/hoy': { render: (c) => proximamente.render(c, textos.paginas.hoy.titulo), coordinador: true },
  '#/solicitudes': { render: solicitudes.render },
  '#/reportes': { render: (c) => proximamente.render(c, textos.paginas.reportes.titulo), coordinador: true },
  '#/historial': { render: (c) => proximamente.render(c, textos.paginas.historial.titulo) },
};

let contenedor;

export async function iniciarRouter() {
  contenedor = document.getElementById('contenido');
  window.addEventListener('hashchange', manejarRuta);
  await manejarRuta();
}

export async function manejarRuta() {
  const hash = (location.hash || '#/mi-horario').split('?')[0];
  const sesion = await obtenerSesion();
  const ruta = rutas[hash];

  if (!ruta) {
    location.hash = sesion ? '#/mi-horario' : '#/entrar';
    return;
  }

  if (!ruta.publica && !sesion) {
    location.hash = '#/entrar';
    return;
  }

  if (sesion && ruta.publica) {
    location.hash = '#/mi-horario';
    return;
  }

  const usuario = getUsuarioActual();
  if (ruta.coordinador && usuario?.puesto !== 'coordinador') {
    location.hash = '#/mi-horario';
    return;
  }

  contenedor.innerHTML = '';
  pintarNav(hash, usuario);
  await ruta.render(contenedor);
}
