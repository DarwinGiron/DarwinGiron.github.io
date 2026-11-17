/* ============================================================
   Motor de repetición de tareas (sin dependencias).
   Se carga como script normal en el navegador (window.Motor) y con
   require() en Node para las pruebas (pruebas/motor.test.js).

   Fechas: siempre texto "AAAA-MM-DD" en hora local (sin zona horaria).
   Una serie tiene: startDate, endDate (opcional, "" = sin fin) y
   rule: { type, ... } con estos tipos:
     once      una sola vez, en startDate
     daily     todos los días
     weekdays  lunes a viernes
     weekly    days: [0..6] (0 = domingo)
     monthly   dayOfMonth: 1..31  (si el mes es más corto, cae en su último día)
               o lastBusinessDay: true (último día hábil, lunes a viernes)
     months    interval: cada N meses, el mismo día de startDate
     yearly    cada año, el mismo día y mes de startDate
   Nota: el "día hábil" solo descarta sábado y domingo; no conoce feriados.
   ============================================================ */
(function (root) {
  "use strict";

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /* Último día hábil (lunes a viernes) del mes m (1-12) del año y. */
  function lastBusinessDay(y, m) {
    var d = new Date(y, m, 0); // día 0 del mes siguiente = último día de este mes
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  /* ¿La serie s ocurre en la fecha d ("AAAA-MM-DD")? */
  function occursOn(s, d) {
    if (!s || !s.startDate || d < s.startDate) return false;
    if (s.endDate && d > s.endDate) return false;
    var p = d.split("-").map(Number), y = p[0], m = p[1], dd = p[2];
    var dow = new Date(y, m - 1, dd).getDay();
    var dim = new Date(y, m, 0).getDate(); // días del mes
    var r = s.rule || { type: "once" };
    var sp = s.startDate.split("-").map(Number);
    switch (r.type) {
      case "once": return d === s.startDate;
      case "daily": return true;
      case "weekdays": return dow >= 1 && dow <= 5;
      case "weekly": return (r.days || []).indexOf(dow) >= 0;
      case "monthly":
        if (r.lastBusinessDay) return d === lastBusinessDay(y, m);
        return dd === Math.min(r.dayOfMonth || 1, dim);
      case "months": {
        var diff = (y - sp[0]) * 12 + (m - sp[1]);
        return diff >= 0 && diff % (r.interval || 1) === 0 && dd === Math.min(sp[2], dim);
      }
      case "yearly": return m === sp[1] && dd === Math.min(sp[2], dim);
    }
    return false;
  }

  var api = { lastBusinessDay: lastBusinessDay, occursOn: occursOn };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Motor = api;
})(typeof window !== "undefined" ? window : this);
