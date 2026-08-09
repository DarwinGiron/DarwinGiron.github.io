// ============================================================================
// tema-horario.js — modo oscuro automático por horario (19:00–06:00)
// ============================================================================
// Se carga como <script> normal (NO type="module", NO defer/async) y lo más
// arriba posible del <head>, antes del <link> a css/estilos.css: así el
// atributo data-theme ya está puesto en <html> ANTES de que el navegador
// pinte el primer frame, y no hay parpadeo de tema claro seguido de un
// cambio a oscuro (o viceversa).
//
// Usa la hora LOCAL del dispositivo del usuario (no la del servidor ni UTC),
// que es el horario que a él le importa. Se reevalúa cada minuto por si la
// pestaña se queda abierta cruzando el límite de las 19:00 o las 06:00.
// ============================================================================
(function () {
  function esHorarioNocturno(fecha) {
    const hora = fecha.getHours();
    return hora >= 19 || hora < 6;
  }

  function aplicarTema() {
    const oscuro = esHorarioNocturno(new Date());
    document.documentElement.setAttribute("data-theme", oscuro ? "dark" : "light");
  }

  aplicarTema();
  setInterval(aplicarTema, 60 * 1000);
})();
