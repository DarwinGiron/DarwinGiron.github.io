// =========================================================
// bpm-checklist.js
// Preguntas de la Auditoría de Buenas Prácticas de Manufactura (SIG-FO-116),
// en un solo lugar para el formulario (sig-fo-116/app.js) y su editor
// (sig-fo-116/admin.html).
//
// Estructura fija en 3 niveles: SECCIÓN (pestaña, límite de puntaje: cada
// una tiene su propio % de cumplimiento) > GRUPO (subtítulo dentro de la
// pestaña, puramente visual — Personal, Instalaciones, Baños...) >
// PREGUNTA (Sí / No / No aplica). Las secciones y los grupos son fijos;
// lo que se edita aquí son las preguntas dentro de cada grupo.
//
// Cada pregunta tiene un id ESTABLE ("bpm-7", "calidad-3"...). La
// auditoría de cada mes (auditoriasBpm/{aaaa-mm}) guarda las respuestas
// por ese id (responses[qid]), así que:
//   - corregir el texto de una pregunta no pierde las respuestas ya dadas
//     (sigue siendo la misma pregunta, con mejor redacción);
//   - reordenar preguntas NO cambia sus ids (el orden es solo de
//     presentación) — a diferencia del código original, que los
//     calculaba por posición (sección + índice) y por eso no se podía
//     reordenar ni insertar sin desordenar las respuestas ya guardadas;
//   - una pregunta nueva recibe un id nuevo, nunca uno reciclado.
// =========================================================

import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const RUTA_CONFIG = ["checklists", "auditoria-bpm"];

/** Preguntas originales del formato (replicadas del prototipo SIG-FO-116). */
export const SECCIONES_BASE = [
  {
    "id": "calidad",
    "label": "Control de Calidad",
    "grupos": [
      {
        "nombre": null,
        "preguntas": [
          {
            "id": "calidad-1",
            "label": "¿Se cuenta con certificaciones del Sistema de Calidad (ISO-HACCP-FDA)?"
          },
          {
            "id": "calidad-2",
            "label": "¿Se cuenta con un programa de auditorías internas?"
          },
          {
            "id": "calidad-3",
            "label": "¿Se cumple con algún sistema para atender las reclamaciones y devoluciones hechas por parte de los clientes?"
          },
          {
            "id": "calidad-4",
            "label": "¿Se analizan los orígenes de reclamaciones y devoluciones para eliminarlos? (evidencias)"
          },
          {
            "id": "calidad-5",
            "label": "¿Se llevan a cabo o se implementan acciones correctivas? (evidencias)"
          },
          {
            "id": "calidad-6",
            "label": "¿Se cuenta con los instrumentos calibrados que sirvan para liberar la calidad y aceptación del producto, además de sus certificados?"
          },
          {
            "id": "calidad-7",
            "label": "¿Cómo establecen y estipulan los acuerdos y especificaciones de calidad con sus clientes?"
          },
          {
            "id": "calidad-8",
            "label": "¿Se encuentran controladas las especificaciones de los clientes?"
          },
          {
            "id": "calidad-9",
            "label": "¿Los operadores conocen los planes de reacción en caso de encontrar producto no conforme?"
          },
          {
            "id": "calidad-10",
            "label": "¿El proveedor demuestra un mejoramiento continuo de la calidad?"
          },
          {
            "id": "calidad-11",
            "label": "¿Tiene certificaciones de Medio Ambiente (sistemas de gestión, autorizaciones o reconocimientos de entes gubernamentales)?"
          },
          {
            "id": "calidad-12",
            "label": "¿Tiene programas de Responsabilidad Social?"
          },
          {
            "id": "calidad-13",
            "label": "¿Tiene programas de Seguridad Industrial acorde al sector al que pertenece?"
          },
          {
            "id": "calidad-14",
            "label": "¿Cuentan con Unidad o Departamento de Calidad con autonomía para la toma de decisiones?"
          },
          {
            "id": "calidad-15",
            "label": "¿Emite un certificado de calidad para los productos que comercializa?"
          },
          {
            "id": "calidad-16",
            "label": "¿Está previsto cómo notificar cambios a los clientes en las especificaciones, insumos, procesos de manufactura y fabricantes, antes de su implementación?"
          },
          {
            "id": "calidad-17",
            "label": "¿Está documentado que las materias primas / materiales se compran a proveedores aprobados por Aseguramiento / Control de Calidad?"
          },
          {
            "id": "calidad-18",
            "label": "¿Se cuenta con un sistema para la evaluación de proveedores?"
          }
        ]
      }
    ]
  },
  {
    "id": "proceso",
    "label": "Control de Proceso",
    "grupos": [
      {
        "nombre": null,
        "preguntas": [
          {
            "id": "proceso-1",
            "label": "¿Se tienen definidas las variables de los diferentes procesos clave?"
          },
          {
            "id": "proceso-2",
            "label": "¿Se monitorea diariamente y durante el proceso el comportamiento de las variables inspeccionadas?"
          },
          {
            "id": "proceso-3",
            "label": "¿Se cuenta con frecuencias definidas para el monitoreo del proceso y las variables establecidas?"
          },
          {
            "id": "proceso-4",
            "label": "¿Los procedimientos y/o instructivos de trabajo son conocidos por el personal?"
          },
          {
            "id": "proceso-5",
            "label": "¿Los operadores del proceso entienden e interpretan las gráficas de control, paretos e ishikawas?"
          },
          {
            "id": "proceso-6",
            "label": "¿Se realizan acciones correctivas cuando el proceso lo requiere?"
          },
          {
            "id": "proceso-7",
            "label": "¿Están documentadas las acciones correctivas?"
          },
          {
            "id": "proceso-8",
            "label": "¿Se cuenta con un sistema de identificación y trazabilidad?"
          },
          {
            "id": "proceso-9",
            "label": "¿Se mantienen las especificaciones vigentes en el piso de trabajo?"
          },
          {
            "id": "proceso-10",
            "label": "¿Cómo son controladas las especificaciones vigentes?"
          },
          {
            "id": "proceso-11",
            "label": "¿Se cuenta con un programa de mantenimiento de equipos?"
          },
          {
            "id": "proceso-12",
            "label": "¿Está actualizada la calibración cuando es requerida (equipos usados en puntos críticos de control u otros equipos críticos)?"
          },
          {
            "id": "proceso-13",
            "label": "¿Las actividades de inspección se realizan al arranque de la corrida y durante? ¿Con qué frecuencia? ¿Se encuentran documentadas?"
          },
          {
            "id": "proceso-14",
            "label": "¿Cuenta con un sistema homogéneo de asignación de número de lote por corrida de producción?"
          },
          {
            "id": "proceso-15",
            "label": "¿Se encuentran identificados claramente los materiales de desecho y sus recipientes?"
          },
          {
            "id": "proceso-16",
            "label": "¿Las áreas están separadas e identificadas de acuerdo a la actividad que allí se realiza?"
          },
          {
            "id": "proceso-17",
            "label": "¿Existen áreas separadas para recepción, muestreo, rechazos, materiales aprobados y devoluciones?"
          },
          {
            "id": "proceso-18",
            "label": "¿Se cuenta con los implementos necesarios para cada una de las actividades a realizar?"
          },
          {
            "id": "proceso-19",
            "label": "¿Los estantes o racks están separados de la pared al menos 30 cm?"
          },
          {
            "id": "proceso-20",
            "label": "¿Se da mantenimiento a las instalaciones según cronograma de actividades?"
          },
          {
            "id": "proceso-21",
            "label": "¿El flujo de los procesos garantiza que no se mezclan materiales rechazados con aprobados?"
          }
        ]
      }
    ]
  },
  {
    "id": "bpm",
    "label": "Buenas Prácticas de Manufactura",
    "grupos": [
      {
        "nombre": "Personal",
        "preguntas": [
          {
            "id": "bpm-1",
            "label": "¿En el programa de capacitación anual se incluyen las Buenas Prácticas de Manufactura? Evidencia."
          },
          {
            "id": "bpm-2",
            "label": "¿Los trabajadores conocen, entienden y siguen las BPM?"
          },
          {
            "id": "bpm-3",
            "label": "¿En las áreas de proceso existen letreros que indiquen \"NO COMER, NO FUMAR\", etc.?"
          },
          {
            "id": "bpm-4",
            "label": "¿Se prohíbe comer, fumar, escupir o masticar chicle mientras se encuentre en el área de trabajo?"
          },
          {
            "id": "bpm-5",
            "label": "¿Se tiene establecida la forma como el personal debe portar su uniforme, así como su equipo de protección personal?"
          },
          {
            "id": "bpm-6",
            "label": "¿El personal cuenta con el entrenamiento apropiado de acuerdo a la naturaleza de las actividades que desarrolla?"
          }
        ]
      },
      {
        "nombre": "Instalaciones",
        "preguntas": [
          {
            "id": "bpm-7",
            "label": "¿El resanado de paredes está en buenas condiciones, selladas adecuadamente sin cuarteaduras o grietas para prevenir la propagación de plagas?"
          },
          {
            "id": "bpm-8",
            "label": "¿Están los techos libres de contaminantes potenciales?"
          },
          {
            "id": "bpm-9",
            "label": "¿Los pisos son adecuados y están bien mantenidos para prevenir una contaminación?"
          },
          {
            "id": "bpm-10",
            "label": "¿Existe alumbrado suficiente en las áreas de producción e inspección?"
          },
          {
            "id": "bpm-11",
            "label": "¿La ventilación es adecuada para minimizar los posibles olores?"
          },
          {
            "id": "bpm-12",
            "label": "¿Existe separación de áreas de trabajo con áreas de proceso del producto (ej. carga y descarga separado de proceso; almacén de químicos separado de proceso)?"
          },
          {
            "id": "bpm-13",
            "label": "¿El área de mantenimiento está limpia, ordenada y bien aislada?"
          },
          {
            "id": "bpm-14",
            "label": "¿Se cuenta con áreas destinadas para almacenar equipos o materiales, para prevenir errores y contaminación cruzada?"
          },
          {
            "id": "bpm-15",
            "label": "¿El drenaje es adecuado a las instalaciones?"
          },
          {
            "id": "bpm-16",
            "label": "¿Los drenajes están provistos de rejillas para evitar la entrada de plagas?"
          }
        ]
      },
      {
        "nombre": "Baños",
        "preguntas": [
          {
            "id": "bpm-17",
            "label": "¿Los baños cuentan con puertas y no tienen acceso directo al proceso, materias primas o área de empaque?"
          },
          {
            "id": "bpm-18",
            "label": "¿Los baños cuentan con dispositivos para el jabón?"
          },
          {
            "id": "bpm-19",
            "label": "¿Se cuenta con papel y/o dispositivo para el secado de manos?"
          },
          {
            "id": "bpm-20",
            "label": "¿Se encuentran limpios los baños y/o mingitorios?"
          }
        ]
      },
      {
        "nombre": "Terrenos y Patios",
        "preguntas": [
          {
            "id": "bpm-21",
            "label": "¿En el exterior de la nave de proceso se mantiene un perímetro sin objetos, plantas, animales y libre de escombros?"
          },
          {
            "id": "bpm-22",
            "label": "¿Las áreas verdes y jardines son podados y conservados regularmente para minimizar el posible refugio de plagas?"
          },
          {
            "id": "bpm-23",
            "label": "¿Los escombros, desperdicios, compactados y basura están almacenados de manera que se elimine el refugio de plagas y alejados de la nave de proceso?"
          },
          {
            "id": "bpm-24",
            "label": "¿Se da mantenimiento adecuado a estas áreas para evitar la propagación de plagas?"
          },
          {
            "id": "bpm-25",
            "label": "¿Las áreas exteriores cercanas a las áreas de proceso se encuentran libres de agua estancada, fugas u otros problemas que generen propagación de plagas?"
          }
        ]
      },
      {
        "nombre": "Control de Plagas",
        "preguntas": [
          {
            "id": "bpm-26",
            "label": "¿Se cuenta con un programa documentado, vigente y continuo de fumigación contra insectos y plagas?"
          },
          {
            "id": "bpm-27",
            "label": "¿Es contratado?"
          },
          {
            "id": "bpm-28",
            "label": "¿Es de planta?"
          },
          {
            "id": "bpm-29",
            "label": "¿El proveedor conoce los materiales que se utilizan para la fumigación de su instalación?"
          },
          {
            "id": "bpm-30",
            "label": "¿El proveedor tiene una lista de sustancias químicas autorizadas para la fumigación de su instalación?"
          },
          {
            "id": "bpm-31",
            "label": "¿Se cumple con el programa de Control de Plagas?"
          },
          {
            "id": "bpm-32",
            "label": "¿Se utiliza este espacio para la inspección del control de roedores? (Se recomienda pintura blanca para el perímetro, facilita mantenimiento e inspección)"
          },
          {
            "id": "bpm-33",
            "label": "¿El plano de localización para trampas de roedores indica la posición actual de las trampas?"
          },
          {
            "id": "bpm-34",
            "label": "¿Hay buena protección contra insectos, roedores y pájaros?"
          },
          {
            "id": "bpm-35",
            "label": "¿Existe un área de almacenamiento de basura?"
          },
          {
            "id": "bpm-36",
            "label": "¿Los contenedores de basura están limpios e identificados para prevenir contaminaciones?"
          }
        ]
      },
      {
        "nombre": "Manejo de Residuos Peligrosos",
        "preguntas": [
          {
            "id": "bpm-37",
            "label": "¿Los cuadros de clasificación de riesgos de sustancias químicas utilizadas en la planta están a la vista del personal?"
          },
          {
            "id": "bpm-38",
            "label": "¿Todo el material y desperdicio peligroso es almacenado correctamente?"
          }
        ]
      },
      {
        "nombre": "Instalaciones (continuación)",
        "preguntas": [
          {
            "id": "bpm-39",
            "label": "¿Es adecuada la construcción para los procesos que se llevan a cabo?"
          },
          {
            "id": "bpm-40",
            "label": "¿El acabado de paredes, pisos y techos facilita su mantenimiento y limpieza?"
          },
          {
            "id": "bpm-41",
            "label": "¿Se dispone de servicios sanitarios, vestidores y regaderas apropiados para el personal, separados de las áreas operativas?"
          },
          {
            "id": "bpm-42",
            "label": "¿La iluminación es adecuada para la operación?"
          },
          {
            "id": "bpm-43",
            "label": "¿Las áreas productivas se encuentran limpias y ordenadas?"
          },
          {
            "id": "bpm-44",
            "label": "¿La delimitación e identificación de las áreas productivas es adecuada para los diferentes procesos?"
          },
          {
            "id": "bpm-45",
            "label": "¿Se encuentran identificadas adecuadamente, por código de colores, las tuberías de los servicios generales (aire comprimido, gas, agua, vapor)?"
          }
        ]
      },
      {
        "nombre": "Personal (continuación)",
        "preguntas": [
          {
            "id": "bpm-46",
            "label": "¿Se reubica al personal que se encuentra enfermo en procesos de bajo riesgo de contaminación?"
          },
          {
            "id": "bpm-47",
            "label": "Recipientes de basura identificados y con tapa"
          },
          {
            "id": "bpm-48",
            "label": "Elementos de protección personal"
          },
          {
            "id": "bpm-49",
            "label": "Exámenes de visiometría para personal de inspección visual"
          }
        ]
      }
    ]
  },
  {
    "id": "haccp",
    "label": "HACCP",
    "grupos": [
      {
        "nombre": null,
        "preguntas": [
          {
            "id": "haccp-1",
            "label": "¿Se emplea alguna agencia externa reconocida para la verificación de cumplimiento de HACCP?"
          },
          {
            "id": "haccp-2",
            "label": "¿Se tienen identificados los riesgos o peligros para el producto?"
          },
          {
            "id": "haccp-3",
            "label": "¿Se tienen determinados los puntos críticos de control?"
          },
          {
            "id": "haccp-4",
            "label": "¿Se cuenta con especificaciones en cada punto crítico de control?"
          },
          {
            "id": "haccp-5",
            "label": "¿Se cuenta con mecanismos de monitoreo de cada punto crítico de control?"
          },
          {
            "id": "haccp-6",
            "label": "¿Se cuenta con registros de calidad (documentado)?"
          },
          {
            "id": "haccp-7",
            "label": "¿Se cuenta con procedimientos de verificación?"
          }
        ]
      }
    ]
  },
  {
    "id": "almacenamiento",
    "label": "Almacenamiento y Transporte",
    "grupos": [
      {
        "nombre": null,
        "preguntas": [
          {
            "id": "almacenamiento-1",
            "label": "¿El producto terminado se encuentra almacenado sobre tarimas?"
          },
          {
            "id": "almacenamiento-2",
            "label": "¿El producto se encuentra identificado con estatus de calidad e información para rastreo?"
          },
          {
            "id": "almacenamiento-3",
            "label": "¿Los vehículos de transporte son inspeccionados antes de cargar los productos, asegurándose que se encuentran en óptimas condiciones sanitarias, libres de hoyos y posibles contaminaciones?"
          },
          {
            "id": "almacenamiento-4",
            "label": "¿El personal que realiza las maniobras de carga del producto conoce los procedimientos de manipulación?"
          },
          {
            "id": "almacenamiento-5",
            "label": "¿Se identifican las cajas adecuadamente para evitar la confusión en los envíos?"
          },
          {
            "id": "almacenamiento-6",
            "label": "¿Los almacenes se encuentran limpios, ordenados, sin humedad ni indicio de plagas? ¿Sólo se encuentran los materiales propios de cada almacén?"
          },
          {
            "id": "almacenamiento-7",
            "label": "¿Las materias primas, ingredientes y materiales de empaque se encuentran almacenados sobre tarimas?"
          },
          {
            "id": "almacenamiento-8",
            "label": "¿Las materias primas y materiales se encuentran identificados con su estatus de calidad e información para trazabilidad?"
          },
          {
            "id": "almacenamiento-9",
            "label": "¿El proveedor tiene en ejecución un procedimiento para la medida y el análisis de los datos de satisfacción del cliente?"
          },
          {
            "id": "almacenamiento-10",
            "label": "¿Hay un procedimiento documentado de la queja del cliente que demuestre la resolución eficaz de las peticiones del cliente por medios apropiados?"
          },
          {
            "id": "almacenamiento-11",
            "label": "¿Los resultados de problemas anteriores están cerrados según lo definido en el plan de acción correctiva?"
          },
          {
            "id": "almacenamiento-12",
            "label": "¿El proveedor maneja indicadores como exactitud de inventario, cumplimiento del plan de producción, cumplimiento del plan de mantenimiento preventivo, STC, CTR? ¿Su cumplimiento y metas están acorde con las mejores prácticas?"
          },
          {
            "id": "almacenamiento-13",
            "label": "¿El proveedor muestra un mejoramiento continuo en los indicadores de desempeño (en promedio)?"
          },
          {
            "id": "almacenamiento-14",
            "label": "¿Cuenta con procedimientos escritos para la recepción, identificación y almacenamiento de materias primas y materiales?"
          },
          {
            "id": "almacenamiento-15",
            "label": "¿Se encuentra ordenado y limpio el almacén?"
          },
          {
            "id": "almacenamiento-16",
            "label": "¿Se cuenta con extintores suficientes y está libre el acceso a ellos?"
          },
          {
            "id": "almacenamiento-17",
            "label": "¿Tiene establecido un programa de control de plagas y mantiene registros de los servicios realizados?"
          },
          {
            "id": "almacenamiento-18",
            "label": "¿Cuentan con procedimiento y registros de limpieza de los almacenes?"
          },
          {
            "id": "almacenamiento-19",
            "label": "¿El acceso es controlado a materiales rechazados?"
          },
          {
            "id": "almacenamiento-20",
            "label": "¿Los instrumentos de inspección y medición están calibrados?"
          },
          {
            "id": "almacenamiento-21",
            "label": "¿Existe procedimiento para el manejo de derrames e imprevistos?"
          },
          {
            "id": "almacenamiento-22",
            "label": "¿Se controla la limpieza de camiones al despacho?"
          }
        ]
      }
    ]
  },
  {
    "id": "mejora",
    "label": "Mejora Contínua",
    "grupos": [
      {
        "nombre": null,
        "preguntas": [
          {
            "id": "mejora-1",
            "label": "¿Se cuenta con una estrategia de mejora continua?"
          },
          {
            "id": "mejora-2",
            "label": "¿Dentro de esta estrategia se contemplan conceptos de Poka Yokes, Kaizen, SMED?"
          }
        ]
      }
    ]
  }
]

/** Copia de SECCIONES_BASE con "activa: true" en cada pregunta — la configuración por defecto mientras no se haya guardado ninguna. */
export function preguntasBase() {
  return SECCIONES_BASE.map((sec) => ({
    id: sec.id,
    label: sec.label,
    grupos: sec.grupos.map((g) => ({
      nombre: g.nombre,
      preguntas: g.preguntas.map((p) => ({ id: p.id, label: p.label, activa: true })),
    })),
  }));
}

/**
 * Lee las preguntas configuradas. Una sección que falte en lo guardado
 * (por ejemplo, la primera vez que se abre el editor) toma la original
 * completa. No atrapa el error: cada pantalla decide qué hacer si falla
 * la lectura (ver aviso-carga.js).
 *
 * @returns {Promise<{ secciones: Array, configurado: boolean }>}
 */
export async function cargarPreguntasBpm() {
  const snap = await getDoc(doc(db, ...RUTA_CONFIG));
  const guardado = snap.exists() && Array.isArray(snap.data().secciones) ? snap.data().secciones : null;
  if (!guardado) {
    return { secciones: preguntasBase(), configurado: false };
  }
  const porId = new Map(guardado.map((s) => [s.id, s]));
  const base = preguntasBase();
  const secciones = base.map((sec) => porId.get(sec.id) || sec);
  return { secciones, configurado: true };
}

/** Guarda TODAS las secciones (solo gestión, ver firestore.rules → checklists). */
export async function guardarPreguntasBpm(secciones, uid) {
  await setDoc(doc(db, ...RUTA_CONFIG), {
    secciones,
    actualizadoEn: serverTimestamp(),
    actualizadoPor: uid,
  });
}

/**
 * Convierte la configuración (secciones > grupos > preguntas, con
 * "activa") en la estructura que arma y puntúa el formulario: solo las
 * preguntas activas, sin los grupos que se quedaron vacíos, y sin las
 * secciones que se quedaron sin ningún grupo (una sección vacía no
 * tendría sentido como pestaña). La numeración ("1.", "2"...) es
 * correlativa por SECCIÓN completa, cruzando grupos — igual que en el
 * formato original.
 */
export function estructuraActiva(secciones) {
  return secciones
    .map((sec) => {
      let n = 0;
      const groups = sec.grupos
        .map((g) => {
          const activas = g.preguntas.filter((p) => p.activa !== false);
          if (activas.length === 0) return null;
          return {
            name: g.nombre,
            qids: activas.map((p) => {
              n += 1;
              return { id: p.id, text: p.label, num: n };
            }),
          };
        })
        .filter(Boolean);
      if (groups.length === 0) return null;
      return { id: sec.id, label: sec.label, groups };
    })
    .filter(Boolean);
}
