import { textos } from '../textos.js';
import { estado } from '../estado.js';
import { nombreMes, sumarMeses, fechaCorta, primerDiaDelMes, isoALocal } from '../utilidades/fechas.js';
import { generarMes } from '../generar-mes.js';
import { pintarCuadricula } from './mes.js';
import { confirmar, elegirOpcion, pedirHorario } from '../utilidades/dialogo.js';
import { guardarTurnosManuales, eliminarTurnos, idTurno, listarFeriados, registrarHistorial, obtenerConfig } from '../firebase.js';
import { opcionesPersona, OPCIONES_DIA, OPCION_DOMINGO_3_TURNOS, armarTurnoManual, describirOpcion, trabaja } from '../ajustes-turno.js';
import { letraBaseDelDia } from '../rotacion.js';

export async function render(contenedor) {
  const t = textos.paginas.planificador;

  contenedor.innerHTML = `
    <div class="pagina">
      <div class="encabezado">
        <div class="encabezado-titulo">${t.titulo}</div>
      </div>
      <div class="selector-mes">
        <button id="mes-anterior" class="boton-icono" aria-label="Mes anterior">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
        </button>
        <div id="mes-nombre" class="selector-mes-nombre"></div>
        <button id="mes-siguiente" class="boton-icono" aria-label="Mes siguiente">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#222222" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
        </button>
      </div>

      <div style="padding:0 20px 16px;">
        <button id="boton-generar" class="boton-principal">${t.botonGenerar}</button>
        <div id="planificador-mensaje" class="mensaje-info" hidden></div>
        <p class="ayuda-planificador">Toca a una persona para cambiar su día (letra, 6 a 6, no trabaja o no se presentó). Toca el número del día para cambiarlo a todo el equipo.</p>
      </div>

      <div id="cuadricula-mes" class="cuadricula-mes"></div>
      <div class="ayuda-scroll">${textos.paginas.mes.ayudaScroll}</div>
    </div>
  `;

  const mensaje = document.getElementById('planificador-mensaje');
  const avisar = (texto) => { mensaje.textContent = texto; mensaje.hidden = false; };
  const cuadricula = document.getElementById('cuadricula-mes');
  const repintar = () => pintarCuadricula(cuadricula, { editable: true, alTocarPersona, alTocarDia });

  document.getElementById('mes-anterior').addEventListener('click', () => {
    estado.mesVisible = sumarMeses(estado.mesVisible, -1);
    render(contenedor);
  });
  document.getElementById('mes-siguiente').addEventListener('click', () => {
    estado.mesVisible = sumarMeses(estado.mesVisible, 1);
    render(contenedor);
  });

  document.getElementById('mes-nombre').textContent = nombreMes(estado.mesVisible);

  document.getElementById('boton-generar').addEventListener('click', async () => {
    const nombre = nombreMes(estado.mesVisible);
    const confirmado = await confirmar(t.confirmarGenerar(nombre), { textoConfirmar: t.botonGenerar });
    if (!confirmado) return;

    const boton = document.getElementById('boton-generar');
    boton.disabled = true;
    mensaje.hidden = true;

    try {
      const { creados } = await generarMes(estado.mesVisible);
      avisar(`${t.toastGenerado} (${creados} turnos).`);
      await registrarHistorial({ accion: 'mes_generado', texto: `Mes de ${nombre} generado con la rotación (${creados} turnos)` });
      await repintar();
    } catch (e) {
      console.error(e);
      avisar(e.message?.includes('semana de referencia') ? e.message : textos.errores.genericoAlGuardar);
    } finally {
      boton.disabled = false;
    }
  });

  async function esFeriado(fecha) {
    try {
      return (await listarFeriados(fecha, fecha)).length > 0;
    } catch {
      return false;
    }
  }

  /** Borra los cambios a mano y vuelve a pasar la rotación sobre el mes (solo rellena lo que falta). */
  async function volverAPlanificado(ids) {
    await eliminarTurnos(ids);
    await generarMes(primerDiaDelMes(estado.mesVisible));
  }

  async function alTocarPersona({ persona, fecha, turno }) {
    let opcion = await elegirOpcion(`${fechaCorta(fecha)} · ${persona.nombre}`, opcionesPersona(turno), { subtitulo: t.hojaSubtitulo });
    if (!opcion) return;
    if (opcion === 'horario-manual') {
      const horario = await pedirHorario(`Horario de ${persona.nombre.split(' ')[0]} · ${fechaCorta(fecha)}`, {
        horaIni: turno?.hora_ini?.slice(0, 5) || '06:00', horaFin: turno?.hora_fin?.slice(0, 5) || '14:00',
      });
      if (!horario) return;
      opcion = `horario:${horario.hora_ini}-${horario.hora_fin}`;
    }

    try {
      if (opcion === 'restaurar') {
        await volverAPlanificado([idTurno(fecha, persona.id)]);
        await registrarHistorial({ accion: 'turno_editado', texto: `${persona.nombre} vuelve a lo planificado el ${fechaCorta(fecha)}`, persona, fecha });
      } else {
        const nuevo = armarTurnoManual({ persona, fecha, opcion, turnoActual: turno, esFeriado: await esFeriado(fecha) });
        await guardarTurnosManuales([nuevo]);
        await registrarHistorial({ accion: 'turno_editado', texto: `${persona.nombre}: ${describirOpcion(opcion)} el ${fechaCorta(fecha)}`, persona, fecha });
      }
      await repintar();
    } catch (e) {
      console.error(e);
      avisar(textos.errores.genericoAlGuardar);
    }
  }

  async function alTocarDia({ fecha, usuarios, turnos }) {
    const esDomingo = isoALocal(fecha).getDay() === 0;
    const opciones = esDomingo ? [OPCION_DOMINGO_3_TURNOS, ...OPCIONES_DIA] : OPCIONES_DIA;
    const opcion = await elegirOpcion(`${fechaCorta(fecha)} · todo el equipo`, opciones, { subtitulo: 'Se aplica a quienes estaban programados ese día.' });
    if (!opcion) return;

    try {
      if (opcion === OPCION_DOMINGO_3_TURNOS.valor) {
        await domingoDeTresTurnos({ fecha, usuarios, turnos });
        return;
      }

      if (opcion === 'restaurar') {
        const manuales = usuarios.filter((p) => ['manual', 'solicitud'].includes(turnos[p.id]?.origen));
        if (manuales.length === 0) {
          avisar(`El ${fechaCorta(fecha)} no tiene cambios hechos a mano.`);
          return;
        }
        if (!await confirmar(`¿Deshacer los ${manuales.length} cambios a mano del ${fechaCorta(fecha)}?`, { textoConfirmar: 'Deshacer' })) return;
        await volverAPlanificado(manuales.map((p) => idTurno(fecha, p.id)));
        for (const p of manuales) await registrarHistorial({ accion: 'turno_editado', texto: `${p.nombre} vuelve a lo planificado el ${fechaCorta(fecha)}`, persona: p, fecha });
        await repintar();
        return;
      }

      const [accion, puesto] = opcion.split(':');
      const opcionPersona = accion === 'libre' ? 'libre' : 'ausencia:falta';
      const afectados = usuarios.filter((p) => (puesto === 'todos' || p.puesto === puesto) && trabaja(turnos[p.id]));
      if (afectados.length === 0) {
        avisar(`Nadie de ese grupo estaba programado el ${fechaCorta(fecha)}.`);
        return;
      }
      const nombres = afectados.map((p) => p.nombre.split(' ')[0]).join(', ');
      if (!await confirmar(`${OPCIONES_DIA.find((o) => o.valor === opcion).texto} (${fechaCorta(fecha)}): ${nombres}. ¿Continuar?`, { textoConfirmar: 'Aplicar' })) return;

      const feriado = await esFeriado(fecha);
      await guardarTurnosManuales(afectados.map((p) => armarTurnoManual({ persona: p, fecha, opcion: opcionPersona, turnoActual: turnos[p.id], esFeriado: feriado })));
      for (const p of afectados) {
        await registrarHistorial({ accion: 'turno_editado', texto: `${p.nombre}: ${describirOpcion(opcionPersona)} el ${fechaCorta(fecha)}`, persona: p, fecha });
      }
      await repintar();
    } catch (e) {
      console.error(e);
      avisar(textos.errores.genericoAlGuardar);
    }
  }

  /**
   * Cambia un domingo de 6 a 6 a 3 turnos: cada grupo trabaja su letra de la semana (D, E, F)
   * con su horario normal. A quien ya tenga una ausencia marcada no se le toca.
   * Para regresar al 6 a 6: "Volver a lo planificado este día".
   */
  async function domingoDeTresTurnos({ fecha, usuarios, turnos }) {
    const config = await obtenerConfig();
    if (!config) {
      avisar('Configura primero la semana de referencia en Configuración.');
      return;
    }
    const letras = letraBaseDelDia(isoALocal(fecha), { semanaReferenciaLunes: isoALocal(config.semana_referencia_lunes), grupoEnD: config.grupo_en_d });
    const afectados = usuarios.filter((p) => p.grupo && turnos[p.id]?.tipo_cobertura !== 'ausencia');
    const resumen = [1, 2, 3].map((g) => `Turno ${g} → ${letras[g]}`).join(', ');
    if (!await confirmar(`¿Pasar el ${fechaCorta(fecha)} a 3 turnos? ${resumen}.`, { textoConfirmar: 'Pasar a 3 turnos' })) return;

    const feriado = await esFeriado(fecha);
    await guardarTurnosManuales(afectados.map((p) => armarTurnoManual({ persona: p, fecha, opcion: letras[p.grupo], turnoActual: turnos[p.id], esFeriado: feriado })));
    for (const p of afectados) {
      await registrarHistorial({ accion: 'turno_editado', texto: `${p.nombre}: turno ${letras[p.grupo]} (domingo de 3 turnos) el ${fechaCorta(fecha)}`, persona: p, fecha });
    }
    await repintar();
    avisar(`El ${fechaCorta(fecha)} quedó con 3 turnos. Si alguien no puede, tócalo y elige "Doble D + F" o una ausencia.`);
  }

  await repintar();
}
