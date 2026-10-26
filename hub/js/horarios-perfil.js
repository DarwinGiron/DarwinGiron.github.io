// =========================================================
// horarios-perfil.js
// Bloque "Mis horarios" del menú de perfil (avatar con las iniciales).
//
// La app de horarios (hub/horarios/) tiene su propio inicio de sesión en
// Supabase, pero guarda la sesión en el almacenamiento del navegador de este
// mismo sitio. Por eso, si la persona ya entró allí una vez, aquí se leen sus
// próximos turnos sin pedir nada más. Si no, se ofrece abrir la app.
// El código de Supabase solo se descarga la primera vez que se abre el menú.
// =========================================================

import { hoyIso, localAIso, isoALocal } from "../horarios/js/utilidades/fechas.js";

const DIAS_A_MOSTRAR = 5;
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

let cargado = false;

/** Construye un elemento con clases y texto (sin innerHTML: los datos vienen de la base). */
function elemento(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function enlaceHorarios(correo, texto) {
  const parametros = correo ? `?correo=${encodeURIComponent(correo)}` : "";
  const a = elemento("a", "btn btn-texto btn-sm", texto);
  a.href = `horarios/index.html${parametros}#/mi-horario`;
  return a;
}

function mostrar(contenedor, ...nodos) {
  contenedor.replaceChildren(...nodos);
}

function sumarDias(iso, dias) {
  const f = isoALocal(iso);
  f.setDate(f.getDate() + dias);
  return localAIso(f);
}

function etiquetaDia(iso, hoy) {
  if (iso === hoy) return "Hoy";
  if (iso === sumarDias(hoy, 1)) return "Mañana";
  const f = isoALocal(iso);
  return `${DIAS_CORTOS[f.getDay()]} ${f.getDate()}`;
}

function filaTurno(iso, hoy, turno) {
  const fila = elemento("div", "perfil-horarios__fila" + (iso === hoy ? " perfil-horarios__fila--hoy" : ""));
  fila.appendChild(elemento("span", "perfil-horarios__dia", etiquetaDia(iso, hoy)));

  const letra = turno?.letra_reportada ?? "";
  const base = letra.charAt(0).toUpperCase();
  const chip = elemento("span", `perfil-horarios__letra perfil-horarios__letra--${"DEFL".includes(base) && base ? base : "L"}`, letra || "—");
  fila.appendChild(chip);

  let horario = "Sin turno";
  if (turno) {
    horario = turno.hora_ini && turno.hora_fin ? `${turno.hora_ini.slice(0, 5)}–${turno.hora_fin.slice(0, 5)}` : "Libre";
  }
  fila.appendChild(elemento("span", "perfil-horarios__horario", horario));
  return fila;
}

/**
 * Pinta los próximos turnos en `contenedor`. Se ejecuta una sola vez por carga de página,
 * la primera vez que la persona abre el menú de perfil.
 */
export async function cargarHorariosPerfil(contenedor, correo) {
  if (cargado) return;
  cargado = true;

  mostrar(contenedor, elemento("div", "perfil-horarios__estado", "Cargando…"));

  try {
    const { supabase } = await import("../horarios/js/supabase.js");
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      mostrar(
        contenedor,
        elemento("div", "perfil-horarios__estado", "Entra una vez a Horarios para ver aquí tus turnos."),
        enlaceHorarios(correo, "Abrir Horarios")
      );
      return;
    }

    const { data: usuario, error: errorUsuario } = await supabase
      .from("usuarios").select("id").eq("auth_id", session.user.id).maybeSingle();
    if (errorUsuario) throw errorUsuario;
    if (!usuario) {
      mostrar(
        contenedor,
        elemento("div", "perfil-horarios__estado", "Tu correo no está dado de alta en Horarios."),
        enlaceHorarios(correo, "Abrir Horarios")
      );
      return;
    }

    const hoy = hoyIso();
    const dias = Array.from({ length: DIAS_A_MOSTRAR }, (_, i) => sumarDias(hoy, i));
    const { data: turnos, error } = await supabase
      .from("turnos")
      .select("fecha, letra_reportada, hora_ini, hora_fin")
      .eq("usuario_id", usuario.id)
      .in("fecha", dias);
    if (error) throw error;

    const porFecha = new Map((turnos ?? []).map((t) => [t.fecha, t]));
    mostrar(
      contenedor,
      ...dias.map((iso) => filaTurno(iso, hoy, porFecha.get(iso))),
      enlaceHorarios(correo, "Ver mi calendario")
    );
  } catch (error) {
    console.error("No se pudieron cargar los horarios del perfil:", error);
    cargado = false; // permite reintentar al volver a abrir el menú
    mostrar(
      contenedor,
      elemento("div", "perfil-horarios__estado", "No se pudieron cargar tus horarios."),
      enlaceHorarios(correo, "Abrir Horarios")
    );
  }
}
