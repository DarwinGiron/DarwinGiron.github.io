import { getUsuarioActual, listarTurnos } from '../firebase.js';
import { textos } from '../textos.js';
import { hoyIso, semanaDe, fechaCorta, fechaConDiaLargo } from '../utilidades/fechas.js';
import { sePuedeInstalar, alCambiarInstalable, instalar } from '../instalador.js';

// Mismos tonos que css/estilos.css (oscurecidos en la auditoría de accesibilidad para AA 4.5:1).
const COLOR_LETRA = {
  D: { bg: '#FFF1C2', texto: '#6B5200' },
  E: { bg: '#FFE0CC', texto: '#8A3B12' },
  F: { bg: '#EDE4FF', texto: '#5B3FA8' },
  L: { bg: '#F0F0F0', texto: '#484848' },
};

function colorDe(letraReportada) {
  const base = letraReportada?.[0] ?? 'L';
  return COLOR_LETRA[base] ?? COLOR_LETRA.L;
}

export async function render(contenedor) {
  const t = textos.paginas.miHorario;
  const usuario = getUsuarioActual();
  const hoy = hoyIso();
  const dias = semanaDe(hoy);

  contenedor.innerHTML = `
    <div class="pagina">
      <div class="encabezado">
        <div class="encabezado-titulo">${t.titulo}</div>
        <div class="campana" title="Avisos">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path>
          </svg>
        </div>
      </div>

      <div id="banner-instalar" hidden></div>

      <div class="selector-doble">
        <div class="selector-opcion selector-activa">${t.pestanaSemana}</div>
        <a href="#/mes" class="selector-opcion">${t.pestanaMes}</a>
      </div>

      <div id="tarjeta-hoy" class="tarjeta-hoy">Cargando...</div>

      <div id="lista-semana" class="tarjeta"></div>

      <div class="acciones-columna">
        <button id="boton-solicitar" class="boton-principal">${t.botonSolicitar}</button>
        <div class="acciones-fila">
          <a href="#/solicitudes?tipo=cambio_turno" class="boton-secundario boton-enlace">Pedir cambio de turno</a>
          <a href="#/mes" class="boton-secundario boton-enlace">Ver el mes</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('boton-solicitar').addEventListener('click', () => {
    location.hash = '#/solicitudes';
  });

  pintarBannerInstalar();
  alCambiarInstalable(() => pintarBannerInstalar());

  if (!usuario?.id) {
    document.getElementById('tarjeta-hoy').innerHTML = 'Tu correo todavía no está en el personal de Horarios. Pídele al coordinador que lo agregue; mientras tanto puedes ver el <a href="#/mes">calendario del equipo</a>.';
    return;
  }

  let turnos;
  try {
    turnos = (await listarTurnos(dias[0], dias[dias.length - 1])).filter((t) => t.usuario_id === usuario.id);
  } catch (error) {
    console.error(error);
    document.getElementById('tarjeta-hoy').textContent = textos.errores.genericoAlGuardar;
    return;
  }

  const porFecha = Object.fromEntries((turnos ?? []).map((t2) => [t2.fecha, t2]));
  pintarTarjetaHoy(porFecha[hoy], hoy, t);
  pintarListaSemana(dias, porFecha, hoy, t);
}

function pintarBannerInstalar() {
  const banner = document.getElementById('banner-instalar');
  if (!banner) return;

  if (!sePuedeInstalar()) {
    banner.hidden = true;
    banner.innerHTML = '';
    return;
  }

  banner.hidden = false;
  banner.innerHTML = `
    <div class="banner-instalar">
      <div class="banner-instalar-texto">
        <div class="banner-instalar-titulo">Instala Horarios en tu celular</div>
        <div class="banner-instalar-subtitulo">Ábrela como una app, incluso sin conexión.</div>
      </div>
      <button id="banner-instalar-boton" class="boton-chip">Instalar</button>
      <button id="banner-instalar-cerrar" class="banner-instalar-cerrar" aria-label="Cerrar">×</button>
    </div>
  `;

  document.getElementById('banner-instalar-boton').addEventListener('click', async () => {
    await instalar();
    pintarBannerInstalar();
  });
  document.getElementById('banner-instalar-cerrar').addEventListener('click', () => {
    banner.hidden = true;
  });
}

function pintarTarjetaHoy(turno, hoy, t) {
  const el = document.getElementById('tarjeta-hoy');
  if (!turno) {
    el.style.background = COLOR_LETRA.L.bg;
    el.innerHTML = `
      <div class="tarjeta-hoy-etiqueta" style="color:${COLOR_LETRA.L.texto}">${t.etiquetaHoy(fechaCorta(hoy))}</div>
      <div class="tarjeta-hoy-letra" style="color:${COLOR_LETRA.L.texto}">—</div>
      <div class="tarjeta-hoy-horario" style="color:${COLOR_LETRA.L.texto}">Sin turno generado todavía</div>
    `;
    return;
  }
  const color = colorDe(turno.letra_reportada);
  const horario = turno.tipo_cobertura === 'libre'
    ? t.diaLibre
    : `${turno.hora_ini ?? ''} – ${turno.hora_fin ?? ''}`;
  el.style.background = color.bg;
  el.innerHTML = `
    <div class="tarjeta-hoy-etiqueta" style="color:${color.texto}">${t.etiquetaHoy(fechaCorta(hoy))}</div>
    <div class="tarjeta-hoy-letra" style="color:${color.texto}">${turno.letra_reportada}</div>
    <div class="tarjeta-hoy-horario" style="color:${color.texto}">${horario}</div>
  `;
}

function pintarListaSemana(dias, porFecha, hoy, t) {
  const el = document.getElementById('lista-semana');
  el.innerHTML = `
    <div class="tarjeta-titulo">Esta semana</div>
    ${dias.map((fecha) => {
      const turno = porFecha[fecha];
      const color = colorDe(turno?.letra_reportada);
      const letra = turno?.letra_reportada ?? '—';
      const horario = !turno ? '—' : (turno.tipo_cobertura === 'libre' ? t.diaLibre : `${turno.hora_ini ?? ''}–${turno.hora_fin ?? ''}`);
      const esHoy = fecha === hoy;
      return `
        <div class="fila-dia ${esHoy ? 'fila-dia-hoy' : ''}">
          <div class="fila-dia-fecha">${fechaCorta(fecha)}</div>
          <div class="fila-dia-letra" style="background:${color.bg}; color:${color.texto}">${letra}</div>
          <div class="fila-dia-horario">${horario}</div>
        </div>`;
    }).join('')}
  `;
}
