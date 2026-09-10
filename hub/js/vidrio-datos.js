// =========================================================
// vidrio-datos.js
// Estructura inicial del SIG-FO-111 "Registro de Vidrio y Plástico
// Quebradizo", transcrita del formato Rev. 01.
//
// El formato es una recorrida mensual: una fila por punto a inspeccionar
// (proceso, localización y el material de vidrio o plástico quebradizo que
// hay ahí), y en cada una se marca el TIPO DE RIESGO observado — 1, 2 o 3 —
// más la acción requerida cuando corresponde.
//
// Los puntos con material entre paréntesis en el Word ("Retrovisores
// (Vidrio)") se separaron en material + tipo para poder filtrar por uno u
// otro. A "Espejo convexo", "Guarda de seguridad" y "Ventanas", que en el
// formato no traían paréntesis, se les asignó el tipo evidente.
//
// Esto es solo la SEMILLA: se carga una vez desde Configuración y a partir
// de ahí los puntos se editan ahí mismo, no en este archivo.
// =========================================================

/** Escala de riesgo del formato. El número es el que se marca en la fila. */
export const RIESGOS_SEMILLA = [
  { valor: 1, etiqueta: "Riesgo ligero", descripcion: "No requiere acción.", requiereAccion: false },
  { valor: 2, etiqueta: "Riesgo medio", descripcion: "Acción cuando ocurren oportunidades.", requiereAccion: false },
  { valor: 3, etiqueta: "Acción urgente", descripcion: "Acción urgente o remoción de objetos.", requiereAccion: true },
];

/** Encabezado editable del formato (aparece arriba del registro). */
export const ENCABEZADO_SEMILLA = {
  titulo: "Registro de Vidrio y Plástico Quebradizo",
  codigo: "SIG-FO-111",
  revision: "Rev. 01",
  frecuencia: "A ser inspeccionado mensualmente",
};

/** Puntos a inspeccionar, en el orden del formato original. */
export const PUNTOS_SEMILLA = [
  { id: "p001", orden: 1, proceso: "MAN", localizacion: "MONTACARGA 18", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p002", orden: 2, proceso: "MAN", localizacion: "MONTACARGA 18", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p003", orden: 3, proceso: "MAN", localizacion: "MONTACARGA 20", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p004", orden: 4, proceso: "MAN", localizacion: "MONTACARGA 20", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p005", orden: 5, proceso: "MAN", localizacion: "MONTACARGA 21", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p006", orden: 6, proceso: "MAN", localizacion: "MONTACARGA 21", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p007", orden: 7, proceso: "MAN", localizacion: "MONTACARGA 22", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p008", orden: 8, proceso: "MAN", localizacion: "MONTACARGA 22", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p009", orden: 9, proceso: "MAN", localizacion: "MONTACARGA 23", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p010", orden: 10, proceso: "MAN", localizacion: "MONTACARGA 23", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p011", orden: 11, proceso: "MAN", localizacion: "MONTACARGA 24", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p012", orden: 12, proceso: "MAN", localizacion: "MONTACARGA 24", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p013", orden: 13, proceso: "MAN", localizacion: "MONTACARGA 25", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p014", orden: 14, proceso: "MAN", localizacion: "MONTACARGA 25", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p015", orden: 15, proceso: "MAN", localizacion: "MONTACARGA 28", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p016", orden: 16, proceso: "MAN", localizacion: "MONTACARGA 28", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p017", orden: 17, proceso: "MAN", localizacion: "MONTACARGA 29", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p018", orden: 18, proceso: "MAN", localizacion: "MONTACARGA 29", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p019", orden: 19, proceso: "MAN", localizacion: "MONTACARGA 30", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p020", orden: 20, proceso: "MAN", localizacion: "MONTACARGA 30", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p021", orden: 21, proceso: "MAN", localizacion: "MONTACARGA 31", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p022", orden: 22, proceso: "MAN", localizacion: "MONTACARGA 31", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p023", orden: 23, proceso: "MAN", localizacion: "MONTACARGA 32", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p024", orden: 24, proceso: "MAN", localizacion: "MONTACARGA 32", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p025", orden: 25, proceso: "MAN", localizacion: "MONTACARGA 33", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p026", orden: 26, proceso: "MAN", localizacion: "MONTACARGA 33", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p027", orden: 27, proceso: "MAN", localizacion: "MONTACARGA 34", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p028", orden: 28, proceso: "MAN", localizacion: "MONTACARGA 34", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p029", orden: 29, proceso: "MAN", localizacion: "MONTACARGA 35", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p030", orden: 30, proceso: "MAN", localizacion: "MONTACARGA 35", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p031", orden: 31, proceso: "MAN", localizacion: "MONTACARGA 36", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p032", orden: 32, proceso: "MAN", localizacion: "MONTACARGA 36", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p033", orden: 33, proceso: "MAN", localizacion: "MONTACARGA 37", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p034", orden: 34, proceso: "MAN", localizacion: "MONTACARGA 37", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p035", orden: 35, proceso: "MAN", localizacion: "MONTACARGA 38", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p036", orden: 36, proceso: "MAN", localizacion: "MONTACARGA 38", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p037", orden: 37, proceso: "MAN", localizacion: "MONTACARGA 39", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p038", orden: 38, proceso: "MAN", localizacion: "MONTACARGA 39", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p039", orden: 39, proceso: "MAN", localizacion: "MONTACARGA 40", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p040", orden: 40, proceso: "MAN", localizacion: "MONTACARGA 40", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p041", orden: 41, proceso: "MAN", localizacion: "MONTACARGA 41", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p042", orden: 42, proceso: "MAN", localizacion: "MONTACARGA 41", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p043", orden: 43, proceso: "MAN", localizacion: "MONTACARGA 42", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p044", orden: 44, proceso: "MAN", localizacion: "MONTACARGA 42", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p045", orden: 45, proceso: "MAN", localizacion: "MONTACARGA 43", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p046", orden: 46, proceso: "MAN", localizacion: "MONTACARGA 43", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p047", orden: 47, proceso: "MAN", localizacion: "MONTACARGA 44", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p048", orden: 48, proceso: "MAN", localizacion: "MONTACARGA 44", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p049", orden: 49, proceso: "MAN", localizacion: "MONTACARGA 45", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p050", orden: 50, proceso: "MAN", localizacion: "MONTACARGA 45", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p051", orden: 51, proceso: "MAN", localizacion: "MONTACARGA 46", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p052", orden: 52, proceso: "MAN", localizacion: "MONTACARGA 46", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p053", orden: 53, proceso: "MAN", localizacion: "MONTACARGA 47", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p054", orden: 54, proceso: "MAN", localizacion: "MONTACARGA 47", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p055", orden: 55, proceso: "MAN", localizacion: "MONTACARGA 48", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p056", orden: 56, proceso: "MAN", localizacion: "MONTACARGA 48", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p057", orden: 57, proceso: "MAN", localizacion: "MONTACARGA 49", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p058", orden: 58, proceso: "MAN", localizacion: "MONTACARGA 49", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p059", orden: 59, proceso: "MAN", localizacion: "MONTACARGA 50", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p060", orden: 60, proceso: "MAN", localizacion: "MONTACARGA 50", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p061", orden: 61, proceso: "MAN", localizacion: "MONTACARGA 51", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p062", orden: 62, proceso: "MAN", localizacion: "MONTACARGA 51", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p063", orden: 63, proceso: "MAN", localizacion: "MONTACARGA 52", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p064", orden: 64, proceso: "MAN", localizacion: "MONTACARGA 52", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p065", orden: 65, proceso: "MAN", localizacion: "MONTACARGA 53", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p066", orden: 66, proceso: "MAN", localizacion: "MONTACARGA 53", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p067", orden: 67, proceso: "MAN", localizacion: "MONTACARGA 54", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p068", orden: 68, proceso: "MAN", localizacion: "MONTACARGA 54", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p069", orden: 69, proceso: "MAN", localizacion: "MONTACARGA 55", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p070", orden: 70, proceso: "MAN", localizacion: "MONTACARGA 55", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p071", orden: 71, proceso: "MAN", localizacion: "MONTACARGA 56", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p072", orden: 72, proceso: "MAN", localizacion: "MONTACARGA 56", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p073", orden: 73, proceso: "MAN", localizacion: "MONTACARGA 57", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p074", orden: 74, proceso: "MAN", localizacion: "MONTACARGA 57", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p075", orden: 75, proceso: "MAN", localizacion: "MONTACARGA 58", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p076", orden: 76, proceso: "MAN", localizacion: "MONTACARGA 58", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p077", orden: 77, proceso: "MAN", localizacion: "MONTACARGA 59", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p078", orden: 78, proceso: "MAN", localizacion: "MONTACARGA 59", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p079", orden: 79, proceso: "MAN", localizacion: "MONTACARGA 60", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p080", orden: 80, proceso: "MAN", localizacion: "MONTACARGA 60", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p081", orden: 81, proceso: "MAN", localizacion: "MONTACARGA 61", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p082", orden: 82, proceso: "MAN", localizacion: "MONTACARGA 61", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p083", orden: 83, proceso: "MAN", localizacion: "MONTACARGA 62", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p084", orden: 84, proceso: "MAN", localizacion: "MONTACARGA 62", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p085", orden: 85, proceso: "MAN", localizacion: "MONTACARGA 63", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p086", orden: 86, proceso: "MAN", localizacion: "MONTACARGA 63", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p087", orden: 87, proceso: "MAN", localizacion: "MONTACARGA 64", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p088", orden: 88, proceso: "MAN", localizacion: "MONTACARGA 64", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p089", orden: 89, proceso: "MAN", localizacion: "MONTACARGA 65", material: "Retrovisores", tipo: "Vidrio" },
  { id: "p090", orden: 90, proceso: "MAN", localizacion: "MONTACARGA 65", material: "Luces frontales, traseras, pide vías, Stop, luz de emergencia", tipo: "Plástico quebradizo" },
  { id: "p091", orden: 91, proceso: "SIG", localizacion: "Corru. Fosber-2 F.C", material: "Espejo convexo", tipo: "Vidrio" },
  { id: "p092", orden: 92, proceso: "SIG", localizacion: "Corru. Fosber-2 F.B", material: "Espejo convexo", tipo: "Vidrio" },
  { id: "p093", orden: 93, proceso: "SIG", localizacion: "Corru. Fosber-1 F.C", material: "Espejo convexo", tipo: "Vidrio" },
  { id: "p094", orden: 94, proceso: "SIG", localizacion: "Corru. Fosber-1 F.B", material: "Espejo convexo", tipo: "Vidrio" },
  { id: "p095", orden: 95, proceso: "SIG", localizacion: "Corru. Fosber Carril", material: "Espejo convexo", tipo: "Vidrio" },
  { id: "p096", orden: 96, proceso: "SIG", localizacion: "Pasillo hacia B.Pads", material: "Espejo convexo", tipo: "Vidrio" },
  { id: "p097", orden: 97, proceso: "SIG", localizacion: "Bottom Pads", material: "Espejo convexo", tipo: "Vidrio" },
  { id: "p098", orden: 98, proceso: "SIG", localizacion: "Pasillo Ward No.10", material: "Espejo convexo", tipo: "Vidrio" },
  { id: "p099", orden: 99, proceso: "SIG", localizacion: "Ward No.10", material: "Espejo convexo", tipo: "Vidrio" },
  { id: "p100", orden: 100, proceso: "SIG", localizacion: "Embaladora No. 3", material: "Espejo convexo", tipo: "Vidrio" },
  { id: "p101", orden: 101, proceso: "MAN", localizacion: "Conter de Ward 14", material: "Guarda de seguridad", tipo: "Plástico quebradizo" },
  { id: "p102", orden: 102, proceso: "MAN", localizacion: "Quebradora Ward 14", material: "Guarda de seguridad", tipo: "Plástico quebradizo" },
  { id: "p103", orden: 103, proceso: "MAN", localizacion: "Flejadora Ward 14", material: "Guarda de seguridad", tipo: "Plástico quebradizo" },
  { id: "p104", orden: 104, proceso: "MAN", localizacion: "Conter de Ward 13", material: "Guarda de seguridad", tipo: "Plástico quebradizo" },
  { id: "p105", orden: 105, proceso: "MAN", localizacion: "Quebradora Ward 13", material: "Guarda de seguridad", tipo: "Plástico quebradizo" },
  { id: "p106", orden: 106, proceso: "MAN", localizacion: "Flejadora Ward 13", material: "Guarda de seguridad", tipo: "Plástico quebradizo" },
  { id: "p107", orden: 107, proceso: "MAN", localizacion: "Troqueladora Eterna", material: "Guarda de seguridad", tipo: "Plástico quebradizo" },
  { id: "p108", orden: 108, proceso: "MAN", localizacion: "Conter de saturno 11", material: "Guarda de seguridad", tipo: "Plástico quebradizo" },
  { id: "p109", orden: 109, proceso: "MAN", localizacion: "Quebradora de S-11", material: "Guarda de seguridad", tipo: "Plástico quebradizo" },
  { id: "p110", orden: 110, proceso: "MAN", localizacion: "Conter de Sj-15", material: "Guarda de seguridad", tipo: "Plástico quebradizo" },
  { id: "p111", orden: 111, proceso: "MAN", localizacion: "Flejadora de Sj-15", material: "Guarda de seguridad", tipo: "Plástico quebradizo" },
  { id: "p112", orden: 112, proceso: "MAN", localizacion: "Maq. Esquinero No.1", material: "Guarda de seguridad", tipo: "Plástico quebradizo" },
  { id: "p113", orden: 113, proceso: "MIN", localizacion: "Cabina Fosber No. 1", material: "Ventanas", tipo: "Vidrio" },
  { id: "p114", orden: 114, proceso: "MIN", localizacion: "Cabina Fosber No. 2", material: "Ventanas", tipo: "Vidrio" },
  { id: "p115", orden: 115, proceso: "MIN", localizacion: "Cabinas Corr. BHS", material: "Ventanas", tipo: "Vidrio" },
];
