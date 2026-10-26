import { listarPersonal, listarTurnos, listarFeriados } from '../firebase.js';
import { etiquetaTurno, horarioCorto, claveOrdenHora, tramosDe } from '../ajustes-turno.js';
import { exportarMesPdf, exportarMesExcel } from '../utilidades/exportar-mes.js';
import { textos } from '../textos.js';
import { estado } from '../estado.js';
import {
  isoALocal, localAIso, diasEnElMes, sumarMeses, nombreMes,
} from '../utilidades/fechas.js';

// Mismos tonos que los tokens --color-*-bg / --color-*-texto de css/estilos.css (todos por encima de 6:1).
const COLOR_LETRA = {
  D: { bg: '#FFF1C2', texto: '#6B5200' },
  E: { bg: '#FFE0CC', texto: '#8A3B12' },
  F: { bg: '#EDE4FF', texto: '#5B3FA8' },
  L: { bg: '#F0F0F0', texto: '#484848' },
};
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const ICONO_INSPECTOR = '<circle cx="10" cy="10" r="6"></circle><path d="m20 20-4.3-4.3"></path>';
const ICONO_ENCARGADO = '<path d="M11 2a2 2 0 0 0-2 2v2H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h4v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-8h4a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-4V4a2 2 0 0 0-2-2Z"></path>';

function iconoRol(puesto) {
  const trazos = puesto === 'inspector' ? ICONO_INSPECTOR : ICONO_ENCARGADO;
  return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${trazos}</svg>`;
}

export async function render(contenedor) {
  const t = textos.paginas.mes;

  contenedor.innerHTML = `
    <div class="pagina">
      <div class="encabezado">
        <div class="encabezado-titulo">${t.titulo}</div>
        <div class="encabezado-acciones">
          <button id="mes-pdf" class="boton-secundario boton-compacto">PDF</button>
          <button id="mes-excel" class="boton-chip">Excel</button>
        </div>
      </div>
      <div id="mes-exportar-error" class="mensaje-error" hidden style="margin:12px 20px 0;"></div>
      <div class="selector-mes">
        <button id="mes-anterior" class="boton-icono" aria-label="Mes anterior">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
        </button>
        <div id="mes-nombre" class="selector-mes-nombre"></div>
        <button id="mes-siguiente" class="boton-icono" aria-label="Mes siguiente">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
        </button>
      </div>

      <div class="leyenda">
        <span><i class="leyenda-punto" style="background:${COLOR_LETRA.D.bg}"></i>D</span>
        <span><i class="leyenda-punto" style="background:${COLOR_LETRA.E.bg}"></i>E</span>
        <span><i class="leyenda-punto" style="background:${COLOR_LETRA.F.bg}"></i>F</span>
        <span><i class="leyenda-punto leyenda-punto-hueco"></i>${t.leyendaHueco}</span>
        <span>${iconoRol('inspector')} Inspector</span>
        <span>${iconoRol('encargado')} Encargado</span>
      </div>

      <div id="cuadricula-mes" class="cuadricula-mes"></div>
    </div>
  `;

  document.getElementById('mes-anterior').addEventListener('click', () => {
    estado.mesVisible = sumarMeses(estado.mesVisible, -1);
    render(contenedor);
  });
  document.getElementById('mes-siguiente').addEventListener('click', () => {
    estado.mesVisible = sumarMeses(estado.mesVisible, 1);
    render(contenedor);
  });

  document.getElementById('mes-nombre').textContent = nombreMes(estado.mesVisible);

  const conectarExportar = (id, exportar, texto) => {
    const boton = document.getElementById(id);
    boton.addEventListener('click', async () => {
      const error = document.getElementById('mes-exportar-error');
      error.hidden = true;
      boton.disabled = true;
      boton.textContent = 'Preparando...';
      try {
        await exportar(estado.mesVisible);
      } catch (e) {
        console.error(e);
        error.textContent = 'No se pudo generar el archivo. Revisa tu conexión e intenta de nuevo.';
        error.hidden = false;
      } finally {
        boton.disabled = false;
        boton.textContent = texto;
      }
    });
  };
  conectarExportar('mes-pdf', exportarMesPdf, 'PDF');
  conectarExportar('mes-excel', exportarMesExcel, 'Excel');

  await pintarCuadricula(document.getElementById('cuadricula-mes'));
}

/**
 * Exportada para que otras páginas (Planificador) reutilicen el mismo calendario.
 * Con `editable`, cada persona y cada número de día se pueden tocar: se llama a
 * `alTocarPersona({ persona, fecha, turno })` o a `alTocarDia({ fecha, usuarios, turnos })`.
 */
export async function pintarCuadricula(cuadricula, { editable = false, alTocarPersona, alTocarDia } = {}) {
  cuadricula.innerHTML = '<div class="mensaje-cargando">Cargando...</div>';

  const mesIso = estado.mesVisible;
  const base = isoALocal(mesIso);
  const totalDias = diasEnElMes(mesIso);
  const primerDiaMes = localAIso(new Date(base.getFullYear(), base.getMonth(), 1));
  const ultimoDiaMes = localAIso(new Date(base.getFullYear(), base.getMonth(), totalDias));

  // La cuadrícula siempre empieza en lunes y termina en domingo, aunque eso
  // arrastre 1-6 días del mes anterior/siguiente (calendario normal).
  const primerDiaCuadricula = lunesAnteriorOIgual(isoALocal(primerDiaMes));
  const ultimoDiaCuadricula = domingoSiguienteOIgual(isoALocal(ultimoDiaMes));

  let usuarios; let turnos; let feriados;

  try {
    [usuarios, turnos, feriados] = await Promise.all([
      listarPersonal({ soloActivos: true }),
      listarTurnos(localAIso(primerDiaCuadricula), localAIso(ultimoDiaCuadricula)),
      listarFeriados(localAIso(primerDiaCuadricula), localAIso(ultimoDiaCuadricula)),
    ]);
  } catch (error) {
    console.error(error);
    cuadricula.innerHTML = `<div class="mensaje-cargando">${textos.errores.genericoAlGuardar}</div>`;
    return;
  }

  if (!usuarios || usuarios.length === 0) {
    cuadricula.innerHTML = '<div class="mensaje-cargando">Todavía no hay personal cargado. Ve a Personal para agregarlo.</div>';
    return;
  }

  const feriadosSet = new Set((feriados ?? []).map((f) => f.fecha));
  const turnosPorPersonaFecha = {};
  for (const turno of turnos ?? []) {
    turnosPorPersonaFecha[`${turno.usuario_id}_${turno.fecha}`] = turno;
  }

  const dias = [];
  const cursor = new Date(primerDiaCuadricula);
  while (localAIso(cursor) <= localAIso(ultimoDiaCuadricula)) {
    const iso = localAIso(cursor);
    dias.push({
      iso,
      numero: cursor.getDate(),
      esDelMes: iso >= primerDiaMes && iso <= ultimoDiaMes,
      esDomingo: cursor.getDay() === 0,
      esFeriado: feriadosSet.has(iso),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const encabezado = DIAS_SEMANA.map((nombre, i) => `
    <div class="dia-semana-cabecera ${i === 6 ? 'dia-semana-cabecera-domingo' : ''}">${nombre}</div>
  `).join('');

  const celdas = dias.map((dia) => celdaDia(dia, usuarios, turnosPorPersonaFecha, editable)).join('');

  cuadricula.innerHTML = `
    <div class="calendario-mes">
      <div class="calendario-encabezado">${encabezado}</div>
      <div class="calendario-cuerpo">${celdas}</div>
    </div>
  `;

  if (!editable) return;
  const personaPorId = new Map(usuarios.map((p) => [p.id, p]));
  cuadricula.querySelectorAll('[data-persona-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const { personaId, fecha } = el.dataset;
      alTocarPersona?.({ persona: personaPorId.get(personaId), fecha, turno: turnosPorPersonaFecha[`${personaId}_${fecha}`] ?? null });
    });
  });
  cuadricula.querySelectorAll('[data-dia]').forEach((el) => {
    el.addEventListener('click', () => {
      const fecha = el.dataset.dia;
      const turnosDelDia = Object.fromEntries(usuarios.map((p) => [p.id, turnosPorPersonaFecha[`${p.id}_${fecha}`] ?? null]));
      alTocarDia?.({ fecha, usuarios, turnos: turnosDelDia });
    });
  });
}

function celdaDia(dia, usuarios, turnosPorPersonaFecha, editable) {
  const clasesCelda = [
    'dia-celda',
    !dia.esDelMes ? 'dia-celda-fuera' : '',
    dia.esDomingo ? 'dia-celda-domingo' : '',
    dia.esFeriado ? 'dia-celda-feriado' : '',
  ].filter(Boolean).join(' ');

  if (!dia.esDelMes) {
    return `<div class="${clasesCelda}"><div class="dia-numero">${dia.numero}</div></div>`;
  }

  // Se ordena por hora de entrada (06:00 primero, la noche al final): así un domingo va
  // primero quien entra de día aunque su letra sea E1. Huecos y ausencias van al final.
  const filas = usuarios
    .map((persona) => {
      const turno = turnosPorPersonaFecha[`${persona.id}_${dia.iso}`];
      const primerNombre = persona.nombre.split(' ')[0];
      const primerNombreCap = primerNombre.charAt(0) + primerNombre.slice(1).toLowerCase();

      const tocable = editable ? `role="button" tabindex="0" data-persona-id="${persona.id}" data-fecha="${dia.iso}"` : '';

      if (!turno) {
        // Sin turno generado: en domingo es normal (la mayoría descansa), entre semana es un hueco.
        if (dia.esDomingo && !editable) return null;
        if (dia.esDomingo) {
          return {
            orden: 'Z_libre_' + primerNombreCap,
            html: `<div class="dia-persona dia-persona-libre" ${tocable}>${iconoRol(persona.puesto)}<span>${primerNombreCap}</span><span class="dia-persona-letra">—</span></div>`,
          };
        }
        return {
          orden: 'Z_hueco_' + primerNombreCap,
          html: `
            <div class="dia-persona dia-persona-hueco" ${tocable}>
              ${iconoRol(persona.puesto)}<span>${primerNombreCap}</span><span class="dia-persona-letra">?</span>
            </div>`,
        };
      }

      if (turno.tipo_cobertura === 'libre') {
        if (!editable) return null;
        return {
          orden: 'Z_libre_' + primerNombreCap,
          html: `<div class="dia-persona dia-persona-libre" ${tocable}>${iconoRol(persona.puesto)}<span>${primerNombreCap}</span><span class="dia-persona-letra">L</span></div>`,
        };
      }

      if (turno.tipo_cobertura === 'ausencia') {
        return {
          orden: 'Z_ausencia_' + primerNombreCap,
          html: `
            <div class="dia-persona dia-persona-ausencia" ${tocable}>
              ${iconoRol(persona.puesto)}<span>${primerNombreCap}</span><span class="dia-persona-letra">${textos.ausencias[turno.ausencia_tipo]?.[0] ?? '—'}</span>
            </div>`,
        };
      }

      // Un doble se pinta dos veces (misma letra, cada horario) y cada tramo se ordena por su hora.
      const color = COLOR_LETRA[turno.letra_reportada?.[0]] ?? COLOR_LETRA.L;
      return tramosDe(turno).map((tramo) => ({
        orden: `${claveOrdenHora(tramo)}_${primerNombreCap}`,
        html: `
          <div class="dia-persona" style="background:${color.bg}; color:${color.texto};" ${tocable}>
            ${iconoRol(persona.puesto)}<span>${primerNombreCap}</span><span class="dia-persona-letra">${etiquetaTurno(tramo)}</span>${horarioCorto(tramo) ? `<span class="dia-persona-horario"><span class="horario-largo">${horarioCorto(tramo)}</span><span class="horario-compacto">${horarioCorto(tramo, { compacto: true })}</span></span>` : ''}
          </div>`,
      }));
    })
    .flat()
    .filter(Boolean)
    .sort((a, b) => (a.orden < b.orden ? -1 : a.orden > b.orden ? 1 : 0))
    .map((fila) => fila.html)
    .join('');

  const numero = editable
    ? `<button type="button" class="dia-numero dia-numero-boton" data-dia="${dia.iso}" aria-label="Opciones del día ${dia.numero}">${dia.numero}</button>`
    : `<div class="dia-numero">${dia.numero}</div>`;

  return `
    <div class="${clasesCelda}">
      ${numero}
      <div class="dia-personas">${filas}</div>
    </div>`;
}

function lunesAnteriorOIgual(fecha) {
  const d = new Date(fecha);
  const diaSemana = d.getDay();
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + offset);
  return d;
}

function domingoSiguienteOIgual(fecha) {
  const d = new Date(fecha);
  const diaSemana = d.getDay();
  const offset = diaSemana === 0 ? 0 : 7 - diaSemana;
  d.setDate(d.getDate() + offset);
  return d;
}
