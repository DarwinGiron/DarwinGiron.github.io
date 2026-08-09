# SIG-FO-101 — Control de Liberación de Operación de Convertidoras

App web estática (HTML/CSS/JS vanilla, sin frameworks ni build step) que digitaliza el formato
**SIG-FO-101 Rev. 00** de Corrugadora Guatemala, S.A. (COGUSA): el Inspector de Inocuidad libera
una máquina convertidora antes de cada orden de producción, verificando limpieza y sanitización.

Vive como una carpeta independiente dentro del mismo repositorio que **SIG-FO-115** (el checklist
de PPRs, en la raíz). Ambas apps comparten el mismo proyecto de Firebase — mismos usuarios, mismos
roles, colecciones distintas — para que un inspector inicie sesión una sola vez y use las dos.

## Requisitos previos

Necesitas el **mismo proyecto de Firebase** que ya usa SIG-FO-115 (`reportes-inocuidad`, ver
[`../js/firebase-config.js`](../js/firebase-config.js)). Los valores ya están copiados en
[`firebase-config.js`](firebase-config.js) de esta carpeta — no hay que llenar ningún placeholder.

### 1. Habilitar Auth por correo/contraseña

Firebase Console → **Authentication → Sign-in method** → habilita **Correo electrónico/contraseña**
(si ya lo hiciste para SIG-FO-115, este paso ya está hecho — es el mismo proyecto).

### 2. Crear usuarios y sus perfiles

**No hay registro público.** El administrador da de alta cada cuenta manualmente:

1. Firebase Console → **Authentication → Users → Add user** (correo + contraseña).
2. Copia el **UID** que Firebase le asignó.
3. Firestore Database → colección **`usuarios`** → documento con **id = ese UID**, con estos campos:
   - `nombre` (string) — nombre completo, se muestra en la cabecera y en el historial.
   - `rol` (string) — `"inspector"` o `"admin"` (`"coordinador"` también cuenta como administrador,
     por compatibilidad con SIG-FO-115).
   - `activo` (boolean) — `true`.

Si el usuario ya existe para SIG-FO-115, no hay que hacer nada más: el mismo perfil sirve para
ambas apps.

> SIG-FO-115 tiene una pantalla de administración para invitar usuarios sin tocar la consola. Si
> ya la usas, puedes seguir dando de alta cuentas desde ahí — quedan disponibles aquí también.

### 3. Publicar las reglas de seguridad

Las reglas de `liberaciones` y `sigfo101Config` viven en **`/firestore.rules`, en la raíz del
repositorio** (un proyecto de Firebase publica un solo archivo de reglas para toda la base de
datos — no uno por app). Ese es el **único** archivo de reglas del proyecto: no hay copias por
carpeta.

Para publicar: copia el contenido de `/firestore.rules` en Firebase Console → **Firestore
Database → Reglas** → Publicar. (O `firebase deploy --only firestore:rules` si usas Firebase CLI.)

### 4. Índices de Firestore

El historial combina filtros (fecha, máquina, turno) con `orderBy("timestamp", "desc")`. La
primera vez que se ejecute cada combinación de filtros, Firestore puede pedir crear un **índice
compuesto** — el error que aparece en pantalla incluye el enlace directo para crearlo con un clic
(esperar a que pase a "Enabled" y recargar).

## Desplegar en GitHub Pages

Esta carpeta puede publicarse junto con SIG-FO-115 en el mismo sitio de GitHub Pages, en su propia
ruta:

1. Repo → **Settings → Pages** → Source: rama `main`, carpeta `/ (root)`.
2. La app queda accesible en `https://<usuario>.github.io/<repo>/sig-fo-101/login.html`.
3. No hace falta ningún paso de build: son archivos estáticos servidos tal cual.

## Notas de la implementación

- **Caché del navegador (importante):** igual que en SIG-FO-115, tanto los `<link>`/`<script>` de
  las 4 páginas como **todos los `import ... from "./archivo.js"` internos entre módulos** llevan
  el mismo parámetro `?v=7`. Un módulo ES se cachea por su URL exacta: un `import` sin versión
  puede seguir sirviendo una copia vieja del archivo indefinidamente aunque edites el original, sin
  ningún error visible. Cada vez que edites cualquier `.js` o `styles.css` de esta carpeta, sube el
  número de versión en TODOS los `import`, `<script src>` y `<link href>` a la vez.
- **SDK de Firebase**: se usa el SDK **compat** (scripts clásicos por CDN, objeto global
  `firebase`), a diferencia de SIG-FO-115 que usa el SDK modular v9. Por eso `firebase-config.js`
  aquí no hace `import` del SDK — asume que `firebase-app-compat.js`, `firebase-auth-compat.js` y
  `firebase-firestore-compat.js` ya cargaron por `<script>` antes que él (ver el `<head>`/final de
  cada página).
- **Cola offline**: `app.js` guarda cada liberación creada sin conexión en `localStorage`
  (`sfo101_cola_pendientes`) y la sincroniza automáticamente al detectar el evento `online` del
  navegador, o al volver a cargar la página ya con señal. La barra amarilla superior muestra
  cuántas liberaciones siguen pendientes. Editar y eliminar SÍ requieren conexión (no se encolan).
- **Autocompletado de cliente**: se alimenta combinando un caché local (`localStorage`, funciona
  sin conexión) con los últimos 200 clientes distintos leídos de Firestore al cargar la pantalla de
  captura — no existe una colección aparte de "clientes".
- **Roles**: la colección `usuarios` es la misma que usa SIG-FO-115, con los mismos valores de rol
  (`inspector`, `admin`, `coordinador`). Aquí `admin` y `coordinador` se tratan igual — ambos son
  el rol "administrador" que pide este formato (ver `esAdministrador()` en [`auth.js`](auth.js)).
- **Administración (máquinas y preguntas)**: [`admin.html`](admin.html) — solo administradores
  (`protegerPagina({ soloAdmin: true }, …)`, ver `auth.js`) — permite agregar, editar y eliminar el
  catálogo de máquinas y la lista de preguntas SI/NO de "Limpieza y Sanitización", sin tocar código.
  Ambas listas viven en un único documento (`sigfo101Config/general`, ver [`datos.js`](datos.js));
  cada cambio se guarda de inmediato al confirmarlo, sin un botón "Guardar cambios" aparte. Cada
  liberación guarda una **copia** del texto de cada pregunta tal como estaba al momento de
  capturarse (`respuestas: [{ preguntaId, texto, valor }]`), así que editar o borrar una pregunta
  después no cambia cómo se ven los registros históricos. Antes de que exista ese documento (primer
  uso de la app), se usa la semilla de [`config.js`](config.js) (`MAQUINAS_SEMILLA`,
  `PREGUNTAS_SEMILLA`) como valor inicial. Desde [`admin.html`](../admin.html) de SIG-FO-115 hay un
  botón **"Editar SIG-FO-101"** para llegar directo aquí.
