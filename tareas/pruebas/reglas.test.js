/* Pruebas de las reglas con el emulador de Firestore.
   Requisitos: Node 18+, Java 11+ y firebase-tools. Instalación y uso (ver README):
     npm install --no-save @firebase/rules-unit-testing firebase
     npx firebase emulators:exec --only firestore --project demo-tareas "node pruebas/reglas.test.js"
   (Este archivo no es parte de la app; es solo para verificar firestore.tareas.rules.) */
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where } = require("firebase/firestore");

let ok = 0, fallos = 0;
async function prueba(nombre, fn) {
  try { await fn(); ok++; console.log("  ok   " + nombre); }
  catch (e) { fallos++; console.log("  FALLA " + nombre + "\n        " + e.message); }
}

(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-tareas",
    firestore: { rules: fs.readFileSync(path.join(__dirname, "..", "firestore.tareas.rules"), "utf8") }
  });

  // Datos de partida (se escriben saltando las reglas)
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/admin1"), { name: "Admin", email: "a@x.com", role: "admin" });
    await setDoc(doc(db, "users/ana"), { name: "Ana", email: "ana@x.com", role: "member" });
    await setDoc(doc(db, "users/beto"), { name: "Beto", email: "beto@x.com", role: "member" });
    await setDoc(doc(db, "series/sAna"), { title: "De Ana", assigneeUid: "ana", createdBy: "ana", rule: { type: "daily" }, startDate: "2026-01-01" });
    await setDoc(doc(db, "series/sAnaAdmin"), { title: "De Ana (la puso el admin)", assigneeUid: "ana", createdBy: "admin1", rule: { type: "daily" }, startDate: "2026-01-01" });
    await setDoc(doc(db, "series/sBeto"), { title: "De Beto", assigneeUid: "beto", createdBy: "beto", rule: { type: "daily" }, startDate: "2026-01-01" });
    await setDoc(doc(db, "occ/sAna_2026-11-17"), { seriesId: "sAna", date: "2026-11-17", assigneeUid: "ana" });
    await setDoc(doc(db, "occ/sBeto_2026-11-17"), { seriesId: "sBeto", date: "2026-11-17", assigneeUid: "beto" });
    await setDoc(doc(db, "occ/sBeto_2026-11-17/files/f1"), { assigneeUid: "beto", name: "x.jpg", type: "image/jpeg", data: "data:image/jpeg;base64,AA==" });
  });

  const ana = env.authenticatedContext("ana").firestore();
  const admin = env.authenticatedContext("admin1").firestore();
  const anon = env.unauthenticatedContext().firestore();

  console.log("Perfiles (users)");
  await prueba("member lee su propio perfil", () => assertSucceeds(getDoc(doc(ana, "users/ana"))));
  await prueba("member NO lee el perfil de otro", () => assertFails(getDoc(doc(ana, "users/beto"))));
  await prueba("member NO lista todos los perfiles", () => assertFails(getDocs(collection(ana, "users"))));
  await prueba("member NO se hace admin", () => assertFails(updateDoc(doc(ana, "users/ana"), { role: "admin" })));
  await prueba("member NO crea perfiles (ni el suyo)", () => assertFails(setDoc(doc(ana, "users/nuevo"), { name: "N", email: "n@x.com", role: "member" })));
  await prueba("admin crea un perfil", () => assertSucceeds(setDoc(doc(admin, "users/nuevo"), { name: "N", email: "n@x.com", role: "member" })));
  await prueba("admin lista todos los perfiles", () => assertSucceeds(getDocs(collection(admin, "users"))));
  await prueba("sin sesión no lee nada", () => assertFails(getDoc(doc(anon, "users/ana"))));

  console.log("Series");
  await prueba("member lista solo las suyas (consulta filtrada)", () => assertSucceeds(getDocs(query(collection(ana, "series"), where("assigneeUid", "==", "ana")))));
  await prueba("member NO lista las de todos", () => assertFails(getDocs(collection(ana, "series"))));
  await prueba("member NO lee una serie de otro", () => assertFails(getDoc(doc(ana, "series/sBeto"))));
  await prueba("member crea una serie para sí", () => assertSucceeds(setDoc(doc(ana, "series/n1"), { title: "T", assigneeUid: "ana", createdBy: "ana", rule: { type: "once" }, startDate: "2026-11-17" })));
  await prueba("member NO crea una serie asignada a otro", () => assertFails(setDoc(doc(ana, "series/n2"), { title: "T", assigneeUid: "beto", createdBy: "ana", rule: { type: "once" }, startDate: "2026-11-17" })));
  await prueba("member NO crea una serie diciendo que la creó otro", () => assertFails(setDoc(doc(ana, "series/n3"), { title: "T", assigneeUid: "ana", createdBy: "beto", rule: { type: "once" }, startDate: "2026-11-17" })));
  await prueba("member edita la suya", () => assertSucceeds(updateDoc(doc(ana, "series/sAna"), { title: "Nuevo nombre" })));
  await prueba("member NO reasigna la suya a otro", () => assertFails(updateDoc(doc(ana, "series/sAna"), { assigneeUid: "beto" })));
  await prueba("member NO edita la que puso el admin", () => assertFails(updateDoc(doc(ana, "series/sAnaAdmin"), { title: "x" })));
  await prueba("member NO edita la de otro", () => assertFails(updateDoc(doc(ana, "series/sBeto"), { title: "x" })));
  await prueba("member NO borra la de otro", () => assertFails(deleteDoc(doc(ana, "series/sBeto"))));
  await prueba("member borra la suya", () => assertSucceeds(deleteDoc(doc(ana, "series/n1"))));
  await prueba("admin asigna una serie a cualquiera", () => assertSucceeds(setDoc(doc(admin, "series/n4"), { title: "T", assigneeUid: "beto", createdBy: "admin1", rule: { type: "once" }, startDate: "2026-11-17" })));

  console.log("Ocurrencias (occ) y evidencia");
  await prueba("member lee las suyas (consulta filtrada)", () => assertSucceeds(getDocs(query(collection(ana, "occ"), where("assigneeUid", "==", "ana")))));
  await prueba("member NO lee las de otro", () => assertFails(getDoc(doc(ana, "occ/sBeto_2026-11-17"))));
  await prueba("member NO escribe en las de otro", () => assertFails(setDoc(doc(ana, "occ/sBeto_2026-11-17"), { seriesId: "sBeto", date: "2026-11-17", assigneeUid: "ana", done: true }, { merge: true })));
  await prueba("member registra una ocurrencia de su serie", () => assertSucceeds(setDoc(doc(ana, "occ/sAna_2026-11-18"), { seriesId: "sAna", date: "2026-11-18", assigneeUid: "ana", done: true }, { merge: true })));
  await prueba("member NO registra ocurrencias de una serie ajena", () => assertFails(setDoc(doc(ana, "occ/sBeto_2026-11-19"), { seriesId: "sBeto", date: "2026-11-19", assigneeUid: "ana" })));
  await prueba("member NO usa un id que no corresponde a serie y fecha", () => assertFails(setDoc(doc(ana, "occ/cualquiera"), { seriesId: "sAna", date: "2026-11-20", assigneeUid: "ana" })));
  await prueba("member actualiza la suya (merge)", () => assertSucceeds(setDoc(doc(ana, "occ/sAna_2026-11-17"), { seriesId: "sAna", date: "2026-11-17", assigneeUid: "ana", note: "listo" }, { merge: true })));
  await prueba("member NO pasa su ocurrencia a otra persona", () => assertFails(updateDoc(doc(ana, "occ/sAna_2026-11-17"), { assigneeUid: "beto" })));
  await prueba("member NO lee evidencia de otro", () => assertFails(getDoc(doc(ana, "occ/sBeto_2026-11-17/files/f1"))));
  await prueba("member NO sube evidencia a la ocurrencia de otro", () => assertFails(setDoc(doc(ana, "occ/sBeto_2026-11-17/files/f2"), { assigneeUid: "ana", name: "x", type: "image/jpeg", data: "data:," })));
  await prueba("member sube evidencia a la suya", () => assertSucceeds(setDoc(doc(ana, "occ/sAna_2026-11-17/files/f3"), { assigneeUid: "ana", name: "x", type: "image/jpeg", data: "data:," })));
  await prueba("evidencia no se puede modificar", () => assertFails(updateDoc(doc(ana, "occ/sAna_2026-11-17/files/f3"), { name: "y" })));
  await prueba("admin lee la evidencia de cualquiera", () => assertSucceeds(getDoc(doc(admin, "occ/sBeto_2026-11-17/files/f1"))));
  await prueba("member NO borra la ocurrencia de otro", () => assertFails(deleteDoc(doc(ana, "occ/sBeto_2026-11-17"))));

  console.log("\n" + ok + " correctas, " + fallos + " con falla");
  await env.cleanup();
  process.exit(fallos ? 1 : 0);
})();
