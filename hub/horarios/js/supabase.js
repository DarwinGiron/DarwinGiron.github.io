import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://uhbchvglyepazaqnoorb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_fTa4HaEmYdu73LaU1y3exg_CcP7ogxj';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

let usuarioActual = null; // fila de public.usuarios de la persona autenticada, o null

export function getUsuarioActual() {
  return usuarioActual;
}

export function setUsuarioActual(usuario) {
  usuarioActual = usuario;
}

export function esCoordinador() {
  return usuarioActual?.puesto === 'coordinador';
}

export async function obtenerSesion() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function cerrarSesion() {
  usuarioActual = null;
  await supabase.auth.signOut();
}

/**
 * Llama a vincular_cuenta() (engancha auth_id la primera vez) y devuelve la fila
 * de usuarios de la persona ya autenticada. Si el correo no está dado de alta,
 * devuelve null: la app debe cerrar la sesión y mostrar "correo no autorizado".
 */
export async function vincularYCargarUsuario() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  await supabase.rpc('vincular_cuenta');

  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (error) throw error;
  usuarioActual = data ?? null;
  return usuarioActual;
}
