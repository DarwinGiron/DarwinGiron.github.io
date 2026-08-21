// =========================================================
// transporte-datos.js
// Estructura del checklist de Verificación de Transporte (LOG-FO-101),
// replicada del Excel "Lista de Verificación e Inspección de Equipos de
// Transporte" — cada zona del furgón se evalúa por separado en su
// condición EXTERNA e INTERNA (las paredes, puertas y techo tienen
// aspectos distintos según el lado). "Generales" e "Cabina" no siguen
// ese patrón: Generales tiene su propia lista externa/interna, y Cabina
// es una sola lista (no aplica adentro/afuera).
//
// Cada zona lleva un "mapaId" que la conecta con su región clickeable en
// el diagrama del furgón (ver dibujarDiagramaFurgon en transporte.js).
// =========================================================

export const ZONAS = [
  {
    id: "pared-izquierda",
    nombre: "Pared Izquierda",
    mapaId: "izquierda",
    externa: {
      items: ["Limpia", "Agujeros", "Abolladuras mayores", "Cinta reflectiva"],
      otros: true, // el Excel trae un renglón "Otros (Describir)" en esta zona
    },
    interna: {
      items: ["Limpia", "Agujeros", "Abolladuras mayores", "Plywood quebrado"],
      otros: true,
    },
  },
  {
    id: "pared-derecha",
    nombre: "Pared Derecha",
    mapaId: "derecha",
    externa: {
      items: ["Limpia", "Agujeros", "Abolladuras mayores", "Cinta reflectiva"],
      otros: true,
    },
    interna: {
      items: ["Limpia", "Agujeros", "Abolladuras mayores", "Plywood quebrado"],
      otros: true,
    },
  },
  {
    id: "puertas",
    nombre: "Puertas",
    mapaId: "puertas",
    externa: {
      items: [
        "Limpia",
        "Agujeros",
        "Abolladuras mayores",
        "Cinta reflectiva",
        "Empaques en buen estado",
        "Funcionamiento de barras y manijas de apertura y cierre",
        "Hermeticidad al cerrar (evita el ingreso de agentes contaminantes a la carga)",
      ],
    },
    interna: {
      items: [
        "Limpia",
        "Agujeros",
        "Abolladuras mayores",
        "Cinta reflectiva",
        "Empaques en buen estado",
        "Funcionamiento de barras y manijas de apertura y cierre",
        "Hermeticidad al cerrar (evita el ingreso de agentes contaminantes a la carga)",
      ],
    },
  },
  {
    id: "techo",
    nombre: "Techo",
    mapaId: "techo",
    externa: {
      items: ["Agujeros que permitan filtración de agua", "Abolladuras mayores"],
    },
    interna: {
      items: [
        "Agujeros que permitan filtración de agua",
        "Abolladuras mayores",
        "Plywood quebrado",
        "Limpio, sin agentes contaminantes",
      ],
    },
  },
  {
    id: "generales",
    nombre: "Generales / Piso",
    mapaId: "piso",
    externa: {
      items: [
        "Llantas y rines limpios",
        "Conos de seguridad",
        "Alarma de retroceso",
        "Topes de llantas",
        "Barras de seguridad (4 en furgón, 2 en camión)",
      ],
    },
    interna: {
      items: [
        "Mal olor",
        "Libre de insectos",
        "Limpio, sin agentes contaminantes",
        "Piso deteriorado",
      ],
    },
  },
];

// Cabina, Camión y Piloto: no se divide en interna/externa (el Excel la
// deja como una sola lista, separada del resto de la unidad).
export const ZONA_CABINA = {
  id: "cabina",
  nombre: "Cabina, Camión y Piloto",
  mapaId: "cabina",
  items: [
    "Cabina limpia",
    "Piloto en condiciones aptas (sobrio, uniforme e identificación, EPP)",
    "Certificado de fumigación vigente (10 días)",
  ],
};

/** Id de respuesta estable para un ítem: zona + modo + índice. */
export function idItem(zonaId, modo, indice) {
  return `${zonaId}.${modo}.${indice}`;
}
