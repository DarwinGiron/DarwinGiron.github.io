// =========================================================
// seed.js
// Datos iniciales del checklist SIG-FO-115, transcritos de
// "SIG-FO-115 Lista de Verificación de Cumplimiento de PPRs.xlsx".
//
// Los 90 aspectos y sus 11 secciones provienen de la hoja "Rev. 01".
// El campo `areas` de cada sección proviene de la hoja "Rev. 00",
// donde cada proceso lista qué secciones evalúa: NO todos los procesos
// evalúan lo mismo (Pre-Prensa revisa solo comportamiento y seguridad,
// mientras que Conversión revisa además orden y limpieza, infraestructura
// y manejo del producto).
//
// Aplicabilidad: un aspecto se le muestra al inspector si el área elegida
// está en `seccion.areas`. Un aspecto puede además declarar su propio
// `areas` para acotarse todavía más dentro de su sección.
//
// Uso: se ejecuta UNA SOLA VEZ desde el panel de administrador
// (botón "Cargar datos iniciales"). Después, toda edición —incluida la
// aplicabilidad por área— se hace desde el editor del admin.
//
// Revisa desde el editor: las áreas "CPA" (Compras) y "COM" (Comedor)
// no aparecían como procesos en la hoja Rev. 00, así que su aplicabilidad
// es una suposición razonable, no un dato del formato original.
// =========================================================

import { CHECKLIST_ID } from "./firebase-config.js";
import {
  crearChecklistSiNoExiste,
  publicarVersionChecklist,
  obtenerChecklist,
  guardarBorradorChecklist,
} from "./firestore.js";

export const DATOS_SEMILLA = {
  "areas": [
    {
      "id": "CON",
      "nombre": "Conversión",
      "activa": true,
      "orden": 1
    },
    {
      "id": "COR",
      "nombre": "Corrugación",
      "activa": true,
      "orden": 2
    },
    {
      "id": "LOG",
      "nombre": "Logística",
      "activa": true,
      "orden": 3
    },
    {
      "id": "CPA",
      "nombre": "Compras",
      "activa": true,
      "orden": 4
    },
    {
      "id": "COM",
      "nombre": "Comedor",
      "activa": true,
      "orden": 5
    },
    {
      "id": "ALM",
      "nombre": "Almacén de Materia Prima",
      "activa": true,
      "orden": 6
    },
    {
      "id": "MIN",
      "nombre": "Mantenimiento de Infraestructura",
      "activa": true,
      "orden": 7
    },
    {
      "id": "MAN",
      "nombre": "Mantenimiento Mecánico",
      "activa": true,
      "orden": 8
    },
    {
      "id": "MEL",
      "nombre": "Mantenimiento Eléctrico",
      "activa": true,
      "orden": 9
    },
    {
      "id": "PRE",
      "nombre": "Pre-Prensa",
      "activa": true,
      "orden": 10
    },
    {
      "id": "RHU",
      "nombre": "Recursos Humanos",
      "activa": true,
      "orden": 11
    },
    {
      "id": "SIG",
      "nombre": "Sistemas de Gestión",
      "activa": true,
      "orden": 12
    },
    {
      "id": "DIR",
      "nombre": "Dirección",
      "activa": true,
      "orden": 13
    },
    {
      "id": "CNT",
      "nombre": "Control de Papel",
      "activa": true,
      "orden": 14
    },
    {
      "id": "TEC",
      "nombre": "Tecnologías de la Información",
      "activa": true,
      "orden": 15
    },
    {
      "id": "PLA",
      "nombre": "Planificación",
      "activa": true,
      "orden": 16
    },
    {
      "id": "CAL",
      "nombre": "Aseguramiento de la Calidad",
      "activa": true,
      "orden": 17
    }
  ],
  "secciones": [
    {
      "id": "sec-01-comportamiento-del-perso",
      "titulo": "COMPORTAMIENTO DEL PERSONAL",
      "orden": 1,
      "areas": [
        "CON",
        "COR",
        "LOG",
        "ALM",
        "MIN",
        "MAN",
        "MEL",
        "PRE",
        "RHU",
        "SIG",
        "DIR",
        "CNT",
        "TEC",
        "PLA",
        "CAL",
        "CPA",
        "COM"
      ],
      "aspectos": [
        {
          "id": "asp-001",
          "texto": "El personal cuenta con un buen estado de salud, no hay personas que sufran enfermedades infectocontagiosas o con cortaduras o lesiones.",
          "peso": 1,
          "orden": 1
        },
        {
          "id": "asp-002",
          "texto": "El personal  utiliza el uniforme completo, limpio y de forma adecuada con el día correspondiente.",
          "peso": 1,
          "orden": 2
        },
        {
          "id": "asp-003",
          "texto": "dentro de la planta se observa el personal casual y/o visitantes cumplen con el uso de camisas sin botones.",
          "peso": 1,
          "orden": 3
        },
        {
          "id": "asp-004",
          "texto": "La redecilla se usa correctamente debe cubrir todo el cabello incluyendo la oreja.",
          "peso": 1,
          "orden": 4
        },
        {
          "id": "asp-005",
          "texto": "La redecilla no se usa en la áreas de comedores y baños.",
          "peso": 1,
          "orden": 5
        },
        {
          "id": "asp-006",
          "texto": "Dentro de la planta se observa a personal con cabello corto, afeitado, uñas limpias y cortas, sin maquillaje y sin joyería.",
          "peso": 1,
          "orden": 6
        },
        {
          "id": "asp-007",
          "texto": "No se observa ningún empleado mascando chicle, fumando, Estornudando o tosiendo, Sonandose la nariz, escupiendo (expectorar), Hurgandose la Nariz, rascandose la cabeza en las áreas de producción.",
          "peso": 1,
          "orden": 7
        },
        {
          "id": "asp-008",
          "texto": "No existe indicios de que el personal esté ingresando golosinas, chicles, galletas, ni bebidas energizantes. (revisar botes de basura)",
          "peso": 1,
          "orden": 8
        },
        {
          "id": "asp-009",
          "texto": "El uso de botes de plastico (pachones) son transparentes y solo se usan para almacenamiento de agua.",
          "peso": 1,
          "orden": 9
        },
        {
          "id": "asp-010",
          "texto": "Los lápices, lapiceros, carnets y otros, son llevados por debajo de la cintura en las áreas de producción",
          "peso": 1,
          "orden": 10
        },
        {
          "id": "asp-011",
          "texto": "El personal realiza el lavado de manos adecuadamente, lo realiza previo al ingreso, periódicamente durante su jornada laboral, luego de utilizar el baño, después de comer y cuando sea necesario.",
          "peso": 1,
          "orden": 11
        },
        {
          "id": "asp-012",
          "texto": "Los empleados que usen batas no deben usarlas en los baños y áreas de comida",
          "peso": 1,
          "orden": 12
        },
        {
          "id": "asp-013",
          "texto": "Hay instalaciones de desinfección donde es necesario.",
          "peso": 1,
          "orden": 13
        },
        {
          "id": "asp-014",
          "texto": "Los empleados no hacen uso de perfumes o cremas de mano en exceso, o con olores fuertes.",
          "peso": 1,
          "orden": 14
        }
      ]
    },
    {
      "id": "sec-02-orden-y-limpieza",
      "titulo": "Orden y Limpieza",
      "orden": 2,
      "areas": [
        "CON",
        "COR",
        "LOG",
        "ALM",
        "CNT",
        "RHU",
        "COM"
      ],
      "aspectos": [
        {
          "id": "asp-015",
          "texto": "Los pisos se encuentran limpios y libres de acumulación de polvo y basura.",
          "peso": 1,
          "orden": 1
        },
        {
          "id": "asp-016",
          "texto": "Los recipientes para depositar basura están limpios, cerrados y sin desbordamiento de basura.",
          "peso": 1,
          "orden": 2
        },
        {
          "id": "asp-017",
          "texto": "Las áreas de almacenes se mantienen limpias, ventiladas y secas.",
          "peso": 1,
          "orden": 3
        },
        {
          "id": "asp-018",
          "texto": "Las áreas están libres de fugas de aceite o de algún otro tipo de químicos.",
          "peso": 1,
          "orden": 4
        },
        {
          "id": "asp-019",
          "texto": "La máquina se encuentra libre de fugas de aceite o de algún otro tipo de químico.",
          "peso": 1,
          "orden": 5
        },
        {
          "id": "asp-020",
          "texto": "No se detectan condensación o fuga en las tuberías y los conductos.",
          "peso": 1,
          "orden": 6
        },
        {
          "id": "asp-021",
          "texto": "No existen reparaciones o modificaciones temporales.",
          "peso": 1,
          "orden": 7
        },
        {
          "id": "asp-022",
          "texto": "El equipo de limpieza está ordenado y almacenado adecuadamente para evitar contaminación (escobas, mopas, trapeadores).",
          "peso": 1,
          "orden": 8
        },
        {
          "id": "asp-023",
          "texto": "Los químicos que se utilizan para la limpieza y/o desinfección se encuentran almacenados y etiquetados correctamente.",
          "peso": 1,
          "orden": 9
        },
        {
          "id": "asp-024",
          "texto": "Las herramientas utilizadas para los cambios de medidas o ajustes se encuentran almacenadas adecuadamente y limpias.",
          "peso": 1,
          "orden": 10
        },
        {
          "id": "asp-025",
          "texto": "Las bandas transportadoras de material en proceso o terminado están limpias.",
          "peso": 1,
          "orden": 11
        },
        {
          "id": "asp-026",
          "texto": "La mesa de alimentación y/o empaque se encuentra limpia y sanitizada.",
          "peso": 1,
          "orden": 12
        },
        {
          "id": "asp-027",
          "texto": "Los rodillos de la imprenta se encuentran limpios y sanitizados.",
          "peso": 1,
          "orden": 13
        },
        {
          "id": "asp-028",
          "texto": "Los sellos y troqueles se limpian y sanitizan antes de iniciar la operación.",
          "peso": 1,
          "orden": 14
        },
        {
          "id": "asp-029",
          "texto": "Las áreas de almacén se encuentran ordenadas y clasificadas",
          "peso": 1,
          "orden": 15
        },
        {
          "id": "asp-030",
          "texto": "Los productos almacenados se encuentran debidamente identificados",
          "peso": 1,
          "orden": 16
        },
        {
          "id": "asp-031",
          "texto": "Se desinfectan las tarimas reparadas antes de ingresar a la planta industrial, Existe Registros?",
          "peso": 1,
          "orden": 17
        },
        {
          "id": "asp-032",
          "texto": "Todas las tarimas usadas para el embalaje y almacenamiento no son almacenadas a la intemperie para prevenir la contaminación.",
          "peso": 1,
          "orden": 18
        }
      ]
    },
    {
      "id": "sec-03-mantenimientos",
      "titulo": "MANTENIMIENTOS",
      "orden": 3,
      "areas": [
        "MAN",
        "MEL"
      ],
      "aspectos": [
        {
          "id": "asp-033",
          "texto": "Los equipos para la elaboración y/o embalaje de los empaques de cartón cuentan un diseño higienico apropiado y faciles de limpiar",
          "peso": 1,
          "orden": 1
        },
        {
          "id": "asp-034",
          "texto": "Las superficies en contacto con el empaque para alimentos son construidas de materiales apropiados para su uso previsto y están libre de suciedad",
          "peso": 1,
          "orden": 2
        },
        {
          "id": "asp-035",
          "texto": "Se asegura que después del mantenimiento, la máquina está en buen estado y libre de suciedad y derrames (dentro de máquina y sus arededores)",
          "peso": 1,
          "orden": 3
        },
        {
          "id": "asp-036",
          "texto": "El área alrededor donde se realizó el mantenimiento se encuentra libre de suciedad y derrames pertinentes ()",
          "peso": 1,
          "orden": 4
        },
        {
          "id": "asp-037",
          "texto": "las cajas de herramientas móviles se encuentran limpias, con herramientas debidamente ordenadas y clasificadas",
          "peso": 1,
          "orden": 5
        },
        {
          "id": "asp-038",
          "texto": "Los montacargas se encuentran libres de derrame de químicos, aceites o grasas para prevenir la contaminación",
          "peso": 1,
          "orden": 6
        },
        {
          "id": "asp-039",
          "texto": "Los montacargas se encuentran en buen funcionamiento (luces, claxon, frenos, cinturon de seguridad, entre otros)",
          "peso": 1,
          "orden": 7
        },
        {
          "id": "asp-040",
          "texto": "El personal utiliza equipo de protección para la aplicación de lubricantes, grasa u otro tipo de químico sobre la máquinaria",
          "peso": 1,
          "orden": 8
        },
        {
          "id": "asp-041",
          "texto": "Los envases que contienen químicos estan sellados e identificados para prevenir cualquier riesgo de contaminación",
          "peso": 1,
          "orden": 9
        },
        {
          "id": "asp-042",
          "texto": "El personal utiliza equipo de protección personal para controlar los derreames (Guantes, lentes, etc)",
          "peso": 1,
          "orden": 10
        }
      ]
    },
    {
      "id": "sec-04-infraestructura",
      "titulo": "INFRAESTRUCTURA",
      "orden": 4,
      "areas": [
        "CON",
        "COR",
        "LOG",
        "ALM",
        "CNT"
      ],
      "aspectos": [
        {
          "id": "asp-043",
          "texto": "Los techos están  libres de telarañas y de suciedad.",
          "peso": 1,
          "orden": 1
        },
        {
          "id": "asp-044",
          "texto": "Las paredes están limpias, sin grietas que puedan servir de anidamiento de plagas.",
          "peso": 1,
          "orden": 2
        },
        {
          "id": "asp-045",
          "texto": "Los recipientes para depositar basura están limpios, identificados, cerrados y sin desbordamiento de basura.",
          "peso": 1,
          "orden": 3
        },
        {
          "id": "asp-046",
          "texto": "La estación de lavado de manos cuenta con agua, jabón, secador/papel toalla, y jabón gel. Además del letrero indicando el procedimiento correcto de lavado de manos.",
          "peso": 1,
          "orden": 4
        },
        {
          "id": "asp-047",
          "texto": "Los portones y puertas que dan hacía el exterior poseen burletes de caucho",
          "peso": 1,
          "orden": 5
        },
        {
          "id": "asp-048",
          "texto": "Las paredes se encuentran libres de grietas o agujeros que pudieran servir de anidamiento de plagas",
          "peso": 1,
          "orden": 6
        },
        {
          "id": "asp-049",
          "texto": "Las telas mosquiteras de las ventanas están en buenas condiciones",
          "peso": 1,
          "orden": 7
        },
        {
          "id": "asp-050",
          "texto": "Las puertas, ventanas o aberturas que dan hacía el exterior se encuentran en buen estado y permanecen cerradas cuando no están en uso",
          "peso": 1,
          "orden": 8
        },
        {
          "id": "asp-051",
          "texto": "Existen focos de contaminación que puediese propiciar el anidamiento de plagas (Acumulación de elementos innecesarios)",
          "peso": 1,
          "orden": 9
        }
      ]
    },
    {
      "id": "sec-05-seguridad-industrial",
      "titulo": "SEGURIDAD INDUSTRIAL",
      "orden": 5,
      "areas": [
        "CON",
        "COR",
        "LOG",
        "ALM",
        "MIN",
        "MAN",
        "MEL",
        "PRE",
        "RHU",
        "SIG",
        "DIR",
        "CNT",
        "TEC",
        "PLA",
        "CAL",
        "CPA",
        "COM"
      ],
      "aspectos": [
        {
          "id": "asp-052",
          "texto": "Las visitas cuentan con el EPP adecuado. (reflectivos, casco, tapones auditivos)",
          "peso": 1,
          "orden": 1
        },
        {
          "id": "asp-053",
          "texto": "Personal en general hace uso correcto del EPP (protección auditiva)",
          "peso": 1,
          "orden": 2
        },
        {
          "id": "asp-054",
          "texto": "Montacargistas hacen uso del casco durante sus labores.",
          "peso": 1,
          "orden": 3
        },
        {
          "id": "asp-055",
          "texto": "El personal fijo hace uso de calzado industrial. (No zapato cerrado, no tenis)",
          "peso": 1,
          "orden": 4
        },
        {
          "id": "asp-056",
          "texto": "Los kits antiderrames se encuentran debidamente distribuidos y abastecidos para el uso previsto",
          "peso": 1,
          "orden": 5
        },
        {
          "id": "asp-057",
          "texto": "Estan las hojas de seguridad disponibles en las áreas de trabajo asignadas",
          "peso": 1,
          "orden": 6
        },
        {
          "id": "asp-058",
          "texto": "El personal casual hace uso de calzado cerrado (No tenis)",
          "peso": 1,
          "orden": 7
        }
      ]
    },
    {
      "id": "sec-06-manejo-del-producto",
      "titulo": "MANEJO DEL PRODUCTO",
      "orden": 6,
      "areas": [
        "CON",
        "COR",
        "LOG",
        "ALM",
        "CNT"
      ],
      "aspectos": [
        {
          "id": "asp-059",
          "texto": "El producto terminado y/ o en proceso se coloca en tarima en buen estado y con protección para su almacenamiento.",
          "peso": 1,
          "orden": 1
        },
        {
          "id": "asp-060",
          "texto": "El material en proceso se encuentra protegido y libre de polvo y suciedad.",
          "peso": 1,
          "orden": 2
        },
        {
          "id": "asp-061",
          "texto": "La bodega de producto en proceso y/o terminado se encuentra limpia y ordenada.",
          "peso": 1,
          "orden": 3
        },
        {
          "id": "asp-062",
          "texto": "Los pasillos se encuentran libre de obstaculos y limpios",
          "peso": 1,
          "orden": 4
        }
      ]
    },
    {
      "id": "sec-07-control-de-plagas",
      "titulo": "control de plagas",
      "orden": 7,
      "areas": [
        "MIN"
      ],
      "aspectos": [
        {
          "id": "asp-063",
          "texto": "Los drenajes internos disponen de adecuadas, tapaderas, rejillas o una malla protectora para evitar el ingreso de plagas u objetos extraños",
          "peso": 1,
          "orden": 1
        },
        {
          "id": "asp-064",
          "texto": "Los plaguicidas estan resguardados y segregados de otras materias con el fin de evitar la manipulación inadecuada que represente un peligro para la inocuidad de los productos (Estan bajo llave)",
          "peso": 1,
          "orden": 2
        },
        {
          "id": "asp-065",
          "texto": "Las lámparas atrapa insectos se encuentran limpias y en funcionamiento",
          "peso": 1,
          "orden": 3
        },
        {
          "id": "asp-066",
          "texto": "No se observa la presencia de roedores, insectos voladores, rastreros, aves u otro tipo de plaga dentro de planta",
          "peso": 1,
          "orden": 4
        },
        {
          "id": "asp-067",
          "texto": "No se observa de infestación de plagas en materia prima, producto en proceso o producto terminado",
          "peso": 1,
          "orden": 5
        },
        {
          "id": "asp-068",
          "texto": "No se observa excremento de insectos, aves u otro tipo de contaminante causado por plagas o animales.",
          "peso": 1,
          "orden": 6
        },
        {
          "id": "asp-069",
          "texto": "Las trampas de cebo para roedores estan en buen estado y sin incidencias",
          "peso": 1,
          "orden": 7
        },
        {
          "id": "asp-070",
          "texto": "Las trampas mecánicas se encuentran debidamente ancladas al piso, pegadas a la pared, cerradas con llave e identificadas con su etiqueta",
          "peso": 1,
          "orden": 8
        },
        {
          "id": "asp-071",
          "texto": "La persona designada para la aplicación de plaguicidas utiliza el equipo de protección adecuado",
          "peso": 1,
          "orden": 9
        }
      ]
    },
    {
      "id": "sec-08-casilleros",
      "titulo": "Casilleros",
      "orden": 8,
      "areas": [
        "RHU"
      ],
      "aspectos": [
        {
          "id": "asp-072",
          "texto": "Los medicamentos son dejados en los casilleros",
          "peso": 1,
          "orden": 1
        },
        {
          "id": "asp-073",
          "texto": "Los casilleros asignados se utilizan según su fin (no se guardan objetos personales en casilleros para alimentos )",
          "peso": 1,
          "orden": 2
        },
        {
          "id": "asp-074",
          "texto": "Esta prohibido el almacenamiento de alimentos en otras áreas que no hayan sido destinadas para este fin",
          "peso": 1,
          "orden": 3
        }
      ]
    },
    {
      "id": "sec-09-banos",
      "titulo": "Baños",
      "orden": 9,
      "areas": [
        "RHU",
        "COM"
      ],
      "aspectos": [
        {
          "id": "asp-075",
          "texto": "Los sanitarios son accesibles al personal, se encuentran en buen estado, higiénicos, iluminados, cuentan con basureros con tapadera y se mantienen abastecidos de papel higiénico y agua.",
          "peso": 1,
          "orden": 1
        },
        {
          "id": "asp-076",
          "texto": "Las puertas de entrada a los sanitarios son adecuadas para evitar la contaminación hacia las áreas de procesamiento.",
          "peso": 1,
          "orden": 2
        }
      ]
    },
    {
      "id": "sec-10-infraestrucutra-externa",
      "titulo": "Infraestrucutra Externa",
      "orden": 10,
      "areas": [
        "MIN"
      ],
      "aspectos": [
        {
          "id": "asp-077",
          "texto": "Las áreas verdes, áreas de circulación, patios de carga y descarga disponen de drenajes adecuados para evitar agua estancada?",
          "peso": 1,
          "orden": 1
        },
        {
          "id": "asp-078",
          "texto": "El área de recolección de residuos solidos se mantiene ordenada para evitar un ambiente propicio para la creación de plagas",
          "peso": 1,
          "orden": 2
        },
        {
          "id": "asp-079",
          "texto": "Se remueve periódicamente toda la suciedad y desperdicios en patios de carga y descarga, jardines y áreas de estacionamiento",
          "peso": 1,
          "orden": 3
        },
        {
          "id": "asp-080",
          "texto": "no hay presencia de malezas ni pastos altos cerca de las instalaciones para evitar que se conviertan en un refugio de plagas",
          "peso": 1,
          "orden": 4
        },
        {
          "id": "asp-081",
          "texto": "Se encuentran limpias, ordenadas y con buena iluminación las áreas de vestidores, almacenamiento de alimentos y almacenamiento de objetos personales.",
          "peso": 1,
          "orden": 5
        },
        {
          "id": "asp-082",
          "texto": "En el área de cafeteria se asegura el almacenamiento higiénico de ingredientes, preparación, almacenamiento y servicio de alimentos preparados. Se especifican las condiciones de almacenamiento, su temperatura y reposo, y limitaciones de tiempo.",
          "peso": 1,
          "orden": 6
        },
        {
          "id": "asp-083",
          "texto": "Se encuentra el muro perimetral con alambre espigado en buenas condiciones para evitar el ingreso de intrusos",
          "peso": 1,
          "orden": 7
        }
      ]
    },
    {
      "id": "sec-11-infraestructura-interno",
      "titulo": "Infraestructura Interno",
      "orden": 11,
      "areas": [
        "MIN"
      ],
      "aspectos": [
        {
          "id": "asp-084",
          "texto": "Todas las aberturas al exterior se encuentran debidamente protegidas para evitar el posible acceso de fuentes de contaminación",
          "peso": 1,
          "orden": 1
        },
        {
          "id": "asp-085",
          "texto": "Los productos químicos se encuentran resguardados en recipientes cerrrados y debidamente rotulados.",
          "peso": 1,
          "orden": 2
        },
        {
          "id": "asp-086",
          "texto": "El producto que se usa para el lavado de manos y sanitización es adecuado para la inocuidad de los alimentos (sin olor).",
          "peso": 1,
          "orden": 3
        },
        {
          "id": "asp-087",
          "texto": "Los servicios sanitarios se  encuentran limpios y en buen estado.",
          "peso": 1,
          "orden": 4
        },
        {
          "id": "asp-088",
          "texto": "Utiliza el equipo de protección adecuado",
          "peso": 1,
          "orden": 5
        },
        {
          "id": "asp-089",
          "texto": "Hay instalaciones de desinfección donde es necesario.",
          "peso": 1,
          "orden": 6
        },
        {
          "id": "asp-090",
          "texto": "Los utensilios de limpieza cumplen con un diseño higienico (Se mentiene en condiciones adecuadas)",
          "peso": 1,
          "orden": 7
        }
      ]
    }
  ],
  "criterios": [
    {
      "valor": "cumple",
      "etiqueta": "Cumple",
      "simbolo": "✔",
      "puntua": true
    },
    {
      "valor": "no_cumple",
      "etiqueta": "No Cumple",
      "simbolo": "✘",
      "puntua": true
    },
    {
      "valor": "na",
      "etiqueta": "No Aplica",
      "simbolo": "N/A",
      "puntua": false
    }
  ]
};

/**
 * Crea el checklist SIG-FO-115 con los datos originales del Excel (si aún
 * no existe) y publica la versión 1 para que los inspectores puedan usarla
 * de inmediato.
 */
export async function sembrarChecklistInicial(uid) {
  const checklist = await crearChecklistSiNoExiste(CHECKLIST_ID, {
    codigo: "SIG-FO-115",
    nombre: "Lista de Verificación de Cumplimiento de PPRs",
    areas: DATOS_SEMILLA.areas,
    secciones: DATOS_SEMILLA.secciones,
    criterios: DATOS_SEMILLA.criterios,
  });

  if (checklist.versionVigente > 0) {
    // Ya se publicó al menos una versión; no se vuelve a sembrar.
    return checklist.versionVigente;
  }

  return publicarVersionChecklist(CHECKLIST_ID, uid);
}

/**
 * Aplica al checklist YA EXISTENTE la aplicabilidad por proceso derivada del
 * Excel, sin tocar nada más: solo escribe el campo `areas` de cada sección
 * cuyo id coincida con el de la semilla. Los textos, pesos, orden y aspectos
 * que hayas editado se conservan intactos.
 *
 * Sirve para checklists cargados antes de que existiera este campo, cuando
 * todas las secciones se mostraban en todas las áreas.
 *
 * @returns {Promise<{actualizadas:number, sinCoincidencia:string[]}>}
 */
export async function aplicarAplicabilidadSugerida(uid) {
  const checklist = await obtenerChecklist(CHECKLIST_ID);
  if (!checklist) throw new Error("El checklist no existe todavía.");

  const areasPorSeccion = new Map(
    DATOS_SEMILLA.secciones.map((s) => [s.id, s.areas])
  );

  let actualizadas = 0;
  const sinCoincidencia = [];

  const secciones = (checklist.secciones || []).map((seccion) => {
    const areas = areasPorSeccion.get(seccion.id);
    if (!areas) {
      // Sección creada a mano por el admin: no se toca.
      sinCoincidencia.push(seccion.titulo);
      return seccion;
    }
    actualizadas += 1;
    return { ...seccion, areas };
  });

  await guardarBorradorChecklist(CHECKLIST_ID, { secciones }, uid);
  return { actualizadas, sinCoincidencia };
}
