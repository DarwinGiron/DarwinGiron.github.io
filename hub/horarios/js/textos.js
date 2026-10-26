// textos.js
// Textos de la interfaz de Horarios (COGUSA). Español de Guatemala, trato de "tú".
// No traducir aquí valores de la base de datos: las llaves de letras/coberturas/
// ausencias/estadosSolicitud ya son los mismos strings que guarda Supabase.
// Copiado tal cual de 05-TEXTOS-UI.md — no editar sin actualizar ese documento también.

export const textos = {
  app: {
    nombre: 'Horarios',
    subtitulo: 'COGUSA',
  },

  comun: {
    guardar: 'Guardar',
    guardarCambios: 'Guardar cambios',
    cancelar: 'Cancelar',
    seguirRevisando: 'Seguir revisando',
    agregar: 'Agregar',
    aprobar: 'Aprobar',
    rechazar: 'Rechazar',
    entrar: 'Entrar',
    enviar: 'Enviar',
    importar: 'Importar',
    exportarExcel: 'Exportar Excel',
    exportarCSV: 'Exportar CSV',
    copiarTabla: 'Copiar tabla',
    generarMes: 'Generar mes',
  },

  nav: {
    trabajador: ['Mi horario', 'Mes', 'Solicitudes', 'Historial'],
    coordinador: ['Hoy', 'Mes', 'Solicitudes', 'Más'],
    masCoordinador: ['Planificar', 'Personal', 'Reportes', 'Configuración', 'Historial'],
  },

  letras: {
    D: { corta: 'D', larga: 'Día', horario: '06:00–14:00' },
    E: { corta: 'E', larga: 'Tarde', horario: '14:00–21:00' },
    F: { corta: 'F', larga: 'Noche', horario: '21:00–06:00' },
    L: { corta: 'L', larga: 'Libre', horario: null },
  },

  coberturas: {
    normal: { texto: 'Turno normal' },
    '6a6dia': { texto: '6 a 6 día', descripcion: 'Cobertura de 06:00 a 18:00' },
    '6a6noche': { texto: '6 a 6 noche', descripcion: 'Cobertura de 18:00 a 06:00' },
    doblar: { texto: 'Doblar turno', descripcion: 'Cubre una segunda franja el mismo día' },
    libre: { texto: 'Libre', descripcion: 'Día de descanso' },
    ausencia: { texto: 'Ausencia', descripcion: 'No trabaja este día' },
  },

  ausencias: {
    vacaciones: 'Vacaciones',
    enfermedad: 'Enfermedad / suspensión IGSS',
    permiso: 'Permiso personal',
    capacitacion: 'Capacitación',
    falta: 'No se presentó',
    otro: 'Otro',
  },

  tiposSolicitud: {
    cambio_turno: 'Cambio de turno con un compañero',
    cobertura_6a6: 'Cobertura 6 a 6',
    permiso: 'Permiso o ausencia',
    evento_extra: 'Evento extra',
  },

  estadosSolicitud: {
    pendiente: 'Pendiente',
    aprobada: 'Aprobada',
    rechazada: 'Rechazada',
  },

  paginas: {
    entrar: {
      titulo: 'Horarios',
      correo: 'Correo',
      correoPlaceholder: 'tu.correo@cogusa.com',
      contrasena: 'Contraseña',
      contrasenaPlaceholder: 'Tu contraseña',
      botonEntrar: 'Entrar',
      crearContrasena: 'Crear mi contraseña',
      ayuda: '¿Problemas para entrar? Pregúntale al coordinador.',
    },

    crearContrasena: {
      titulo: 'Crea tu contraseña',
      ayuda: 'Usa el mismo correo con el que te dio de alta el coordinador.',
      correo: 'Correo',
      contrasena: 'Nueva contraseña',
      confirmar: 'Confirma tu contraseña',
      boton: 'Crear contraseña',
    },

    miHorario: {
      titulo: 'Mi horario',
      pestanaSemana: 'Semana',
      pestanaMes: 'Mes',
      etiquetaHoy: (fechaCorta) => `HOY · ${fechaCorta}`,
      diaLibre: 'Libre',
      botonSolicitar: 'Solicitar',
      botonCalendario: 'Mi calendario',
      botonPDF: 'Descargar PDF',
    },

    hoy: {
      titulo: 'Hoy',
      turno: (n) => `Turno ${n}`,
      badgeHueco: '⚠ Sin cubrir',
      textoHueco: (letra) => `Turno ${letra} · nadie asignado todavía`,
      encabezadoTabla: 'Hoja de reporte',
      columnas: ['Código', 'Nombre', 'Letra', 'Entrada', 'Salida', 'Split entrada', 'Split salida', 'Ausencia', 'Comentario'],
      botonCopiar: 'Copiar tabla',
      toastCopiado: 'Tabla copiada. Ya puedes pegarla en el sistema institucional.',
      notaVariantes: 'D1 · E1 · F1 = cobertura 6 a 6 de día (11 h, ya con el almuerzo descontado). Letra sin "1" = turno normal o 6 a 6 de noche.',
    },

    mes: {
      titulo: 'Mes',
      columnaPersona: 'Persona',
      ayudaScroll: 'Desliza a los lados para ver todo el mes',
      leyendaPunto: 'Punto = 6 a 6 o doblar (mismo color de letra, otras horas)',
      leyendaHueco: 'Hueco',
    },

    planificador: {
      titulo: 'Planificador',
      botonGenerar: 'Generar mes',
      confirmarGenerar: (mes) => `¿Generar ${mes}? Se completan los días vacíos con la rotación automática. Lo que ya editaste a mano no se toca.`,
      toastGenerado: 'Mes generado. Revisa los domingos y los huecos en rojo.',
      advertenciaDobleLetra: (nombre, fecha) => `${nombre} tiene dos letras el ${fecha}. Revisa esa celda.`,
      hojaTitulo: (fecha, nombre) => `${fecha} · ${nombre}`,
      hojaSubtitulo: 'Elige la letra o el tipo de cobertura',
      notaCoberturaEspecial: '"6 a 6 día" cambia la letra que se reporta (D → D1) y descuenta 1 h de almuerzo. "6 a 6 noche" y "Doblar" mantienen la letra normal, solo cambian las horas reales.',
      confirmarAusencia: (nombre, fecha) => `Esto marca a ${nombre} como ausente el ${fecha}. ¿Continuar?`,
      estadoVacio: (mes) => `${mes} todavía no tiene horario. Genera el mes con la rotación automática y luego ajusta lo que haga falta.`,
    },

    solicitudes: {
      titulo: 'Solicitudes',
      formTitulo: 'Nueva solicitud',
      campoTipo: 'Tipo',
      campoFechas: 'Fechas',
      campoMotivo: 'Motivo',
      motivoPlaceholder: 'Cuéntale al coordinador por qué...',
      botonEnviar: 'Enviar solicitud',
      toastEnviada: 'Solicitud enviada. Te avisamos cuando el coordinador responda.',
      misSolicitudes: 'Mis solicitudes',
      estadoVacioTrabajador: 'No tienes solicitudes. Cuando pidas un cambio o un permiso, lo verás aquí con su estado.',
      subtituloCoordinador: (n) => `${n} pendientes de tu aprobación`,
      estadoVacioCoordinador: 'No hay solicitudes pendientes. Aquí aparecerán en cuanto alguien pida algo.',
      sugerenciasTitulo: 'Sugerencias de reemplazo',
      sugerenciaLibre: (nombre) => `${nombre} · tiene libre ese día`,
      sugerenciaDoblar: (nombre) => `${nombre} · mismo grupo, puede doblar`,
      sugerencia6a6: (nombre) => `${nombre} · puede hacer 6 a 6`,
      campoComentarioRechazo: '¿Por qué la rechazas? (el trabajador lo verá)',

      confirmarAprobar: {
        cambio_turno: (nombreA, nombreB, fecha) => `¿Aprobar el cambio de turno entre ${nombreA} y ${nombreB} el ${fecha}?`,
        cobertura_6a6: (nombre, fecha) => `¿Aprobar la cobertura 6 a 6 de ${nombre} el ${fecha}?`,
        permiso: (nombre, fechaInicio, fechaFin) => `¿Aprobar el permiso de ${nombre} del ${fechaInicio} al ${fechaFin}?`,
        evento_extra: (nombre, horas, fecha) => `¿Aprobar las ${horas} horas extra de ${nombre} el ${fecha}?`,
      },
      confirmarRechazar: {
        cambio_turno: (nombreA, nombreB, fecha) => `¿Rechazar el cambio de turno entre ${nombreA} y ${nombreB} el ${fecha}?`,
        cobertura_6a6: (nombre, fecha) => `¿Rechazar la cobertura 6 a 6 de ${nombre} el ${fecha}?`,
        permiso: (nombre, fechaInicio, fechaFin) => `¿Rechazar el permiso de ${nombre} del ${fechaInicio} al ${fechaFin}?`,
        evento_extra: (nombre, horas, fecha) => `¿Rechazar las ${horas} horas extra de ${nombre} el ${fecha}?`,
      },
    },

    personal: {
      titulo: 'Personal',
      botonAgregar: 'Agregar',
      badgeInactivo: 'Inactivo',
      dropzoneTitulo: 'Arrastra el Excel institucional',
      dropzoneSubtitulo: 'o toca para elegir el archivo',
      vistaPrevia: 'Vista previa detectada',
      confirmarImportar: (n) => `¿Importar a estas ${n} personas? Se crean con la letra y el grupo detectados; después puedes corregir el puesto y el correo de cada una.`,
      botonGuardarPersona: 'Guardar persona',
      confirmarDesactivar: (nombre) => `¿Marcar a ${nombre} como inactiva? Deja de aparecer en la rotación, pero su historial se conserva.`,
      botonDesactivar: 'Marcar inactiva',
      busquedaSinResultados: 'No encontramos a nadie con ese nombre.',
    },

    configuracion: {
      titulo: 'Configuración',
      seccionLetras: 'Letras y horas',
      seccionSemanaReferencia: 'Semana de referencia',
      ayudaSemanaReferencia: 'De aquí se calcula toda la rotación hacia adelante',
      campoLunes: 'Lunes de esa semana',
      campoGrupoEnD: 'Grupo que está en D esa semana',
      seccionFeriados: (anio) => `Feriados ${anio}`,
      confirmarCambioSemanaReferencia: 'Cambiar la semana de referencia recalcula la rotación de todo el mes actual y los siguientes. ¿Continuar?',
      confirmarEliminarFeriado: (fecha) => `¿Quitar el ${fecha} de los feriados?`,
      feriadosVacio: 'Todavía no agregaste feriados este año.',
    },

    reportes: {
      titulo: 'Reportes',
      columnas: ['Persona', 'Puesto', 'Grupo', 'Horas ordinarias', 'Horas extra', 'Ausencias', 'Permisos', 'Cambios', 'Turnos F', 'Domingos'],
      confirmarExportar: (mes) => `Se descarga el reporte de ${mes}.`,
      estadoVacio: (mes) => `Todavía no hay turnos generados en ${mes}. Ve al Planificador y toca "Generar mes".`,
    },

    historial: {
      titulo: 'Historial',
      filtroTodos: 'Todos',
      filtroPersona: 'Persona',
      filtroTipo: 'Tipo',
      estadoVacio: 'No hay más movimientos. Aquí verás cada cambio a medida que ocurra.',
      turnoCreado: (nombre, fecha) => `Turno de ${nombre} creado para el ${fecha}`,
      turnoEditado: (nombre, fecha) => `Turno editado: ${nombre}, ${fecha}`,
      turnoEliminado: (nombre, fecha) => `Turno de ${nombre} eliminado, ${fecha}`,
      solicitudAprobada: (tipo, nombre) => `${tipo} de ${nombre} aprobado`,
      solicitudRechazada: (tipo, nombre) => `${tipo} de ${nombre} rechazado`,
      mesGenerado: (mes) => `Mes de ${mes} generado`,
      pie: (actor, cuando) => `Por ${actor} · ${cuando}`,
    },
  },

  errores: {
    sinConexion: 'Sin conexión. Vuelve a conectarte para ver y guardar cambios.',
    enviandoCola: 'Enviando los cambios pendientes...',
    colaEnviada: 'Listo. Todos tus cambios se guardaron.',
    conflicto: 'Este cambio ya no aplica porque alguien más editó ese día. Revisa el turno antes de intentar de nuevo.',
    correoNoAutorizado: 'Ese correo no está autorizado. Pídele al coordinador que te dé de alta en Personal.',
    contrasenaIncorrecta: 'El correo o la contraseña no son correctos. Inténtalo de nuevo.',
    dosLetrasMismoDia: (nombre) => `${nombre} ya tiene una letra ese día. Cambia primero la existente o elige otro día.`,
    campoFaltante: (campo) => `Completa ${campo} antes de continuar.`,
    genericoAlGuardar: 'No se pudo guardar. Inténtalo de nuevo en un momento.',
    sesionCerrada: 'Tu sesión terminó. Vuelve a entrar.',
    excelNoReconocido: 'Ese archivo no tiene el formato esperado. Usa el reporte que exporta el sistema institucional.',
  },

  vacios: {
    solicitudesTrabajador: 'No tienes solicitudes. Cuando pidas un cambio o un permiso, lo verás aquí con su estado.',
    solicitudesCoordinador: 'No hay solicitudes pendientes. Aquí aparecerán en cuanto alguien pida algo.',
    planificador: (mes) => `${mes} todavía no tiene horario. Genera el mes con la rotación automática y luego ajusta lo que haga falta.`,
    reportes: (mes) => `Todavía no hay turnos generados en ${mes}. Ve al Planificador y toca "Generar mes".`,
    historial: 'No hay más movimientos. Aquí verás cada cambio a medida que ocurra.',
    avisos: 'No tienes avisos nuevos.',
    personalBusqueda: 'No encontramos a nadie con ese nombre.',
    feriados: 'Todavía no agregaste feriados este año.',
  },

  avisos: {
    cambioTurnoAprobado: (nombre, fecha) => `Tu cambio de turno con ${nombre} para el ${fecha} fue aprobado.`,
    cambioTurnoRechazado: (nombre, fecha) => `Tu cambio de turno con ${nombre} para el ${fecha} fue rechazado.`,
    cobertura6a6Aprobada: (fecha) => `Tu cobertura 6 a 6 del ${fecha} fue aprobada.`,
    cobertura6a6Rechazada: (fecha) => `Tu cobertura 6 a 6 del ${fecha} fue rechazada.`,
    permisoAprobado: (fechaInicio, fechaFin) => `Tu permiso del ${fechaInicio} al ${fechaFin} fue aprobado.`,
    permisoRechazado: (fechaInicio, fechaFin) => `Tu permiso del ${fechaInicio} al ${fechaFin} fue rechazado.`,
    eventoExtraAprobado: (horas, fecha) => `Tus ${horas} horas extra del ${fecha} fueron aprobadas.`,
    eventoExtraRechazado: (horas, fecha) => `Tus ${horas} horas extra del ${fecha} fueron rechazadas.`,
    turnoCambiadoManual: (fecha, letra) => `El coordinador cambió tu turno del ${fecha} a ${letra}.`,
    turnoMarcadoAusencia: (fecha, tipoAusencia) => `El coordinador marcó el ${fecha} como ${tipoAusencia} en tu horario.`,
    mesGenerado: (mes) => `Ya está listo tu horario de ${mes}.`,
    feriadoAgregado: (fecha) => `El ${fecha} se marcó como feriado. Las horas que trabajes ese día cuentan 100% extra.`,
    generico: 'Tienes una actualización en tu horario. Toca para ver los detalles.',
  },
};

export default textos;
