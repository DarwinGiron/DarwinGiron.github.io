/* Pruebas del motor de repetición. Sin dependencias.
   Ejecutar:  node pruebas/motor.test.js   (necesita Node 14 o más nuevo) */
const assert = require("node:assert");
const { occursOn, lastBusinessDay } = require("../motor.js");

let ok = 0, fallos = 0;
function prueba(nombre, fn) {
  try { fn(); ok++; console.log("  ok   " + nombre); }
  catch (e) { fallos++; console.log("  FALLA " + nombre + "\n        " + e.message); }
}
const S = (rule, startDate, endDate) => ({ rule, startDate, endDate: endDate || "" });
/* fechas del mes (y-m) en las que ocurre la serie */
function dias(s, y, m) {
  const out = [], dim = new Date(y, m, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const f = y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    if (occursOn(s, f)) out.push(d);
  }
  return out;
}

prueba("una vez: solo en su fecha", () => {
  const s = S({ type: "once" }, "2026-11-17");
  assert.strictEqual(occursOn(s, "2026-11-17"), true);
  assert.strictEqual(occursOn(s, "2026-11-16"), false);
  assert.strictEqual(occursOn(s, "2026-11-18"), false);
});

prueba("diaria con fin: incluye inicio y fin, nada fuera", () => {
  const s = S({ type: "daily" }, "2026-11-10", "2026-11-12");
  assert.strictEqual(occursOn(s, "2026-11-09"), false);
  assert.strictEqual(occursOn(s, "2026-11-10"), true);
  assert.strictEqual(occursOn(s, "2026-11-11"), true);
  assert.strictEqual(occursOn(s, "2026-11-12"), true);
  assert.strictEqual(occursOn(s, "2026-11-13"), false);
});

prueba("lunes a viernes: no ocurre sábado ni domingo", () => {
  const s = S({ type: "weekdays" }, "2026-11-01");
  assert.strictEqual(occursOn(s, "2026-11-16"), true);  // lunes
  assert.strictEqual(occursOn(s, "2026-11-20"), true);  // viernes
  assert.strictEqual(occursOn(s, "2026-11-21"), false); // sábado
  assert.strictEqual(occursOn(s, "2026-11-22"), false); // domingo
  assert.strictEqual(occursOn(s, "2026-11-23"), true);  // lunes
});

prueba("semanal lunes y miércoles", () => {
  const s = S({ type: "weekly", days: [1, 3] }, "2026-11-01");
  assert.deepStrictEqual(dias(s, 2026, 11).slice(0, 4), [2, 4, 9, 11]);
  assert.strictEqual(occursOn(s, "2026-11-17"), false); // martes
});

prueba("semanal no ocurre antes de la fecha de inicio", () => {
  const s = S({ type: "weekly", days: [1] }, "2026-11-16");
  assert.strictEqual(occursOn(s, "2026-11-09"), false);
  assert.strictEqual(occursOn(s, "2026-11-16"), true);
});

prueba("mensual día 31: cae en el último día de los meses cortos", () => {
  const s = S({ type: "monthly", dayOfMonth: 31 }, "2026-01-01");
  assert.deepStrictEqual(dias(s, 2026, 1), [31]);
  assert.deepStrictEqual(dias(s, 2026, 2), [28]);   // febrero común
  assert.deepStrictEqual(dias(s, 2028, 2), [29]);   // febrero bisiesto
  assert.deepStrictEqual(dias(s, 2026, 4), [30]);
});

prueba("mensual día 15: una sola vez al mes", () => {
  const s = S({ type: "monthly", dayOfMonth: 15 }, "2026-01-01");
  assert.deepStrictEqual(dias(s, 2026, 11), [15]);
});

prueba("último día hábil: casos con fin de semana y fin de mes normal", () => {
  assert.strictEqual(lastBusinessDay(2026, 11), "2026-11-30"); // lunes
  assert.strictEqual(lastBusinessDay(2026, 5), "2026-05-29");  // 31 es domingo
  assert.strictEqual(lastBusinessDay(2026, 2), "2026-02-27");  // 28 es sábado
  assert.strictEqual(lastBusinessDay(2027, 1), "2027-01-29");  // 31 es domingo
  assert.strictEqual(lastBusinessDay(2025, 11), "2025-11-28"); // 30 es domingo
  assert.strictEqual(lastBusinessDay(2026, 12), "2026-12-31"); // jueves
});

prueba("mensual último día hábil: ocurre solo ese día", () => {
  const s = S({ type: "monthly", lastBusinessDay: true }, "2026-01-01");
  assert.deepStrictEqual(dias(s, 2026, 5), [29]);
  assert.deepStrictEqual(dias(s, 2026, 11), [30]);
});

prueba("cada 3 meses desde el 31 de enero", () => {
  const s = S({ type: "months", interval: 3 }, "2026-01-31");
  assert.strictEqual(occursOn(s, "2026-01-31"), true);
  assert.strictEqual(occursOn(s, "2026-02-28"), false);
  assert.strictEqual(occursOn(s, "2026-03-31"), false);
  assert.strictEqual(occursOn(s, "2026-04-30"), true);  // abril tiene 30
  assert.strictEqual(occursOn(s, "2026-07-31"), true);
  assert.strictEqual(occursOn(s, "2026-10-31"), true);
  assert.strictEqual(occursOn(s, "2027-01-31"), true);
});

prueba("cada 3 meses cruzando de año", () => {
  const s = S({ type: "months", interval: 3 }, "2026-11-10");
  assert.strictEqual(occursOn(s, "2027-02-10"), true);
  assert.strictEqual(occursOn(s, "2027-01-10"), false);
});

prueba("cada 6 meses", () => {
  const s = S({ type: "months", interval: 6 }, "2026-03-15");
  assert.strictEqual(occursOn(s, "2026-03-15"), true);
  assert.strictEqual(occursOn(s, "2026-06-15"), false);
  assert.strictEqual(occursOn(s, "2026-09-15"), true);
  assert.strictEqual(occursOn(s, "2027-03-15"), true);
  assert.strictEqual(occursOn(s, "2026-02-15"), false); // antes del inicio
});

prueba("anual con 29 de febrero: 28 en años comunes, 29 en bisiestos", () => {
  const s = S({ type: "yearly" }, "2024-02-29");
  assert.strictEqual(occursOn(s, "2024-02-29"), true);
  assert.strictEqual(occursOn(s, "2025-02-28"), true);
  assert.strictEqual(occursOn(s, "2025-03-01"), false);
  assert.strictEqual(occursOn(s, "2028-02-29"), true);
  assert.strictEqual(occursOn(s, "2028-02-28"), false);
  assert.strictEqual(occursOn(s, "2023-02-28"), false); // antes del inicio
});

prueba("anual respeta la fecha final", () => {
  const s = S({ type: "yearly" }, "2026-05-10", "2027-12-31");
  assert.strictEqual(occursOn(s, "2027-05-10"), true);
  assert.strictEqual(occursOn(s, "2028-05-10"), false);
});

prueba("entradas inválidas no rompen", () => {
  assert.strictEqual(occursOn(null, "2026-11-17"), false);
  assert.strictEqual(occursOn({ startDate: "2026-01-01", rule: { type: "otra" } }, "2026-11-17"), false);
});

console.log("\n" + ok + " pruebas correctas, " + fallos + " con falla");
if (fallos) process.exitCode = 1;
