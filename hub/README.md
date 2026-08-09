# SIG-FO-115 · Lista de Verificación de Cumplimiento de PPRs (digital)

Aplicación web (HTML + CSS + JS puro, sin frameworks de build) que reemplaza el checklist en Excel
`SIG-FO-115` de COGUSA, con almacenamiento en Firebase Firestore. Pensada para hospedarse
gratuitamente en GitHub Pages.

> Este repositorio también incluye, en [`sig-fo-101/`](sig-fo-101/README.md), el formato
> **SIG-FO-101 — Control de Liberación de Operación de Convertidoras**: una app aparte que
> comparte el mismo proyecto de Firebase (usuarios y roles), pero con su propia colección
> (`liberaciones`) y sus propios archivos. Ver el README de esa carpeta para desplegarla.

## Arquitectura de archivos

```
index.html               Login
nueva-inspeccion.html     Recorrido de inspección: fecha/turno + pestañas por proceso + envío
inspecciones.html         Inspecciones realizadas: historial, filtros, detalle, resumen
admin.html                Editor de estructura del checklist + usuarios + publicación de versiones
configuraciones.html      Hub de administración: elige entre editar SIG-FO-115 o SIG-FO-101

css/styles.css            Tema visual (azul marino + dorado), mobile-first

js/firebase-config.js     Inicialización de Firebase (App, Auth, Firestore)
js/auth.js                Sesión, rol y guardas de página
js/firestore.js           Única capa que lee/escribe Firestore
js/utils.js               Funciones puras (fechas, cálculo de resultados) + helpers de UI
js/login.js               Controlador de index.html
js/checklist.js           Controlador de nueva-inspeccion.html
js/historial.js           Controlador de inspecciones.html
js/admin.js                Controlador de admin.html
js/configuraciones.js      Controlador de configuraciones.html
js/usuarios.js             Alta de cuentas desde el panel (sin cerrar la sesión del admin)
js/seed.js                 Datos iniciales (90 aspectos / 11 secciones / 17 áreas) del Excel Rev. 01
```

> Las reglas de seguridad NO viven en esta carpeta: hay un único
> [`/firestore.rules`](../firestore.rules) en la raíz del sitio, compartido con la app de
> Reportes (un proyecto de Firebase publica un solo archivo de reglas para toda la base de datos).

## Roles

| Rol | Etiqueta visible | Estructura del checklist | Usuarios | Historial completo | Ejecuta inspecciones |
|---|---|---|---|---|---|
| `admin` | Administrador | ✅ | ✅ | ✅ todos | ✅ |
| `coordinador` | Coordinador de SGIA | ✅ | ✅ | ✅ todos | ✅ |
| `inspector` | Inspector | ❌ | ❌ | solo las propias | ✅ |

`admin` y `coordinador` son **roles de gestión** con permisos idénticos: se
distinguen solo por el título mostrado, para reflejar el puesto real dentro de la
organización. Los roles se definen en un único lugar —la constante `ROLES` de
[`js/auth.js`](js/auth.js)— y las reglas de seguridad los replican en la función
`esGestor()` de [`/firestore.rules`](../firestore.rules). Para agregar otro rol de
gestión en el futuro, hay que tocar esos dos puntos.

## Modelo de datos en Firestore

```
usuarios/{uid}
  nombre, email, rol ("admin" | "coordinador" | "inspector"), activo, creadoEn

checklists/{checklistId}                 ← borrador de trabajo del admin ("sig-fo-115")
  codigo, nombre, versionVigente, borradorModificado
  areas: [{ id, nombre, activa, orden }]
  secciones: [{ id, titulo, orden, areas: [...],
                aspectos: [{ id, texto, peso, orden, areas?: [...] }] }]
  criterios: [{ valor, etiqueta, simbolo, puntua }]

checklists/{checklistId}/versiones/{numero}   ← snapshot inmutable publicado
  numero, publicadaEn, publicadaPor, areas, secciones, criterios

inspecciones/{fecha_turno_inspectorUid}   ← UN documento por recorrido completo, id determinístico
  checklistId, version, turno, fechaInspeccion
  inspectorUid, inspectorNombre
  estado: "borrador" | "enviada"
  iniciadaEn, actualizadaEn        ← actualizadaEn se toca en TODO guardado, borrador o enviado
  enviadaEn                        ← se fija al finalizar, ya no cambia
  resultado: { totalEvaluados, cumple, noCumple, na, porcentajeCumplimiento }   ← agregado de TODAS las áreas
  areas: {
    [areaId]: {
      areaNombre,
      respuestas: { [aspectoId]: { valor, observacion } },
      resultado: { totalEvaluados, cumple, noCumple, na, porcentajeCumplimiento },  ← solo esta área
      hisopado: null | { registros: [...] },   ← sección opcional/eventual, por área
      comentarios,
    },
    ...
  }
```

### El recorrido: una sesión, muchos procesos

`nueva-inspeccion.html` **no** pide elegir un área al inicio. El inspector elige fecha y turno una
sola vez y entra a un **recorrido**: una fila de pestañas con todos los procesos activos que
tengan al menos un aspecto aplicable (una sección sin aspectos asignados no genera una pestaña
vacía).

**Cambiar de pestaña es pura navegación local — no escribe nada en Firestore.** Se hace con las
pestañas de proceso; todo lo que el inspector responde se acumula en memoria
(`estado.respuestasPorArea`, `estado.datosPorArea`) mientras se mueve libremente entre procesos.
La escritura a la base de datos ocurre solo con dos botones fijos al pie de la pantalla:

- **"Guardar"** (dorado, principal): guarda el avance de **todo** el recorrido en ese momento, sin
  importar en qué pestaña estés parado — pensado para usarse en cualquier momento, "por si acaso".
  No navega ni cierra nada; te deja donde estabas.
- **"Terminar"** (junto a "Guardar", siempre visible al pie): hace el mismo guardado y además
  cierra el recorrido mostrando la pantalla de resumen.

**El recorrido completo (todas sus áreas) es UN SOLO documento en Firestore**, no uno por proceso.
Su id es determinístico — `idRecorrido(fecha, turno, inspectorUid)` en
[`js/firestore.js`](js/firestore.js), con forma `fecha_turno_uid` — así que retomarlo nunca
requiere una consulta ni preguntarle nada al inspector: es un `getDoc()` directo por id.

- **"Guardar"** llama a **`guardarRecorrido()`**: escribe TODAS las áreas del recorrido de una vez,
  como `estado: "borrador"`.
- **"Terminar"** llama a **`finalizarRecorrido()`**: escribe el mismo documento como
  `estado: "enviada"` — el reporte completo pasa a ser inmutable de una sola vez, no proceso por
  proceso. Se bloquea (con un toast, sin guardar nada) si algún proceso todavía tiene **cero**
  respuestas; el resto de aspectos sin calificar dentro de un proceso ya evaluado sí se permite
  dejarlos así, quedan reflejados como tal en el reporte.

> **Por qué las respuestas NO viven en un solo mapa por `aspectoId`:** un mismo aspecto (p. ej.
> "El personal cuenta con buen estado de salud…") se reutiliza literalmente entre procesos que
> comparten sección — Conversión y Corrugación comparten los 52 mismos `aspectoId`, por ejemplo.
> Un mapa global habría hecho que calificar ese aspecto en un proceso lo mostrara ya respondido
> (con la respuesta de otro proceso) en todos los demás que comparten esa sección. Por eso cada
> proceso tiene su propio mapa (`respuestasPorArea[areaId][aspectoId]`), aislado de los demás.

- El contador de la cabecera (`{respondidos}/{total}`) y el pie (hallazgos/cumplimiento) suman
  **todo** el recorrido acumulado hasta el momento, no solo el proceso visible — cada uno se
  calcula por proceso (con su propio mapa) y luego se suman los conteos, para no cruzar
  aspectos compartidos entre procesos.
- El check ✓ de una pestaña significa "ya respondiste todo aquí", no "ya se envió" — nada se
  envía hasta el guardado explícito.
- **Transición entre pestañas:** al cambiar de proceso, el contenido (`#contenido-recorrido`) se
  desvanece y desliza hacia el lado por el que "sale", se reconstruye mientras está invisible, y
  entra deslizándose desde el lado opuesto (`animarSalida`/`animarEntrada` en
  [`js/checklist.js`](js/checklist.js)). La dirección depende de si avanzas o retrocedes en la
  fila de pestañas. Respeta `prefers-reduced-motion` automáticamente, porque esa preferencia ya
  fuerza `transition-duration` a ~0 en toda la app (sección 2 de `styles.css`). No se anima la
  primera carga del recorrido ni al llegar por un enlace de "Continuar" desde un borrador.

### Guardar y retomar durante el turno

Un recorrido de planta no siempre se termina de una sentada.

- Al entrar a `nueva-inspeccion.html` con fecha y turno ya conocidos (fila "Continuar" desde el
  historial), `iniciarRecorrido()` en [`js/checklist.js`](js/checklist.js) calcula el id
  determinístico y llama a `obtenerRecorrido()` **una sola vez, para todo el recorrido**: si el
  documento existe, TODAS las áreas con avance guardado se restauran de golpe en memoria, sin
  ningún `confirm()` ni pregunta — el turno tampoco se vuelve a pedir, porque ya viene en la URL.
  El paso 1 (fecha/turno) se oculta de inmediato al detectar esos parámetros, antes incluso de que
  termine de cargar la sesión, para evitar cualquier parpadeo.
- Al entrar SIN esos parámetros (botón **"+ Nueva inspección"**), el paso 1 (fecha/turno) se
  muestra siempre, sin excepción — es una acción explícita de "empezar algo nuevo" y no intenta
  adivinar ni retomar nada por su cuenta. Retomar un pendiente es un camino aparte: la tarjeta
  "Pendiente de terminar" del historial ya trae su propio `?fecha=&turno=` en el enlace, así que
  cae en el primer caso de arriba. (Antes esta pantalla también intentaba auto-detectar cualquier
  borrador pendiente al entrar sin parámetros; se quitó porque mezclaba dos acciones con intención
  distinta — "seguir esto" vs. "empezar de cero" — bajo el mismo botón.)
- **Cambiar de turno por error, ya con el recorrido abierto:** el turno de la cabecera
  (`Turno X · fecha`) es un botón — tocarlo abre un modal para elegir otro turno. Si ese turno ya
  tiene avance guardado se carga solo; si no, arranca vacío. Si hay cambios sin guardar en el turno
  actual, se confirma antes de descartarlos.
- Si el recorrido encontrado ya está `"enviada"`, no se abre para editar: se redirige directo a su
  detalle de solo lectura en el historial (`inspecciones.html?ver=…`).
- `listarRecorridos()` ([`js/firestore.js`](js/firestore.js)) trae recorridos en cualquier estado
  con **una sola consulta** — antes hacían falta dos (una para enviadas, otra para borradores) por
  tener campos de fecha distintos; ahora `actualizadaEn` se actualiza tanto al guardar borrador
  como al finalizar, así que una sola consulta ordenada por ese campo cubre ambos casos, y solo
  necesita UN índice compuesto en vez de dos.
- Cada fila del historial es un recorrido completo (no un proceso suelto): muestra turno, fecha,
  cuántos procesos cubre y el nombre del inspector. Un borrador se distingue con la insignia verde
  **"Pendiente de terminar"** en vez del donut de cumplimiento; su fila enlaza a
  `nueva-inspeccion.html?fecha=…&turno=…` para retomarlo tal cual quedó.
- Junto a cada fila hay un botón **"Eliminar"**: el propio inspector solo lo ve sobre sus propios
  borradores; un gestor (admin/coordinador) lo ve sobre CUALQUIER registro, borrador o ya enviado
  (por ejemplo, para depurar recorridos de prueba). Llama a `eliminarInspeccion()`
  ([`js/firestore.js`](js/firestore.js)) y refresca la lista. El mismo botón existe en la vista de
  detalle de un recorrido enviado, visible solo para gestores.
- La vista de detalle del historial ya no muestra un solo proceso: recorre `insp.areas` y renderiza
  el reporte completo, área por área, con el cumplimiento global arriba y el de cada proceso dentro
  de su propia sección.
- Si hay respuestas sin guardar en cualquier proceso, un aviso del propio navegador
  (`beforeunload`) avisa antes de cerrar la pestaña del navegador.

**Inmutabilidad para actualizar, no para eliminar:** en cuanto una inspección pasa a `"enviada"`,
las reglas de seguridad ([`/firestore.rules`](../firestore.rules)) siguen impidiendo cualquier
`update` posterior — ni el propio inspector ni un gestor pueden editar sus respuestas una vez
enviada. El `delete`, en cambio, es una excepción deliberada: un gestor puede borrar cualquier
inspección (borrador o enviada) para depurar registros de prueba o duplicados; un inspector normal
solo puede borrar sus propios borradores, nunca una ya enviada.

### Estilo visual de esta pantalla

Los botones de calificación de `nueva-inspeccion.html` (óvalos de contorno) son distintos del
resto de la app (tarjetas rellenas en el detalle del historial). Es intencional: todo el CSS
nuevo vive escopado bajo `.pantalla-recorrido` en [`css/styles.css`](css/styles.css) — no toca
`.calificacion__opcion` ni `.seccion-titulo` fuera de esa pantalla.

### Aplicabilidad por proceso

No todos los procesos evalúan lo mismo. En la hoja **Rev. 00** del Excel cada proceso lista qué
secciones le corresponden: Pre-Prensa solo revisa comportamiento del personal y seguridad
industrial, mientras que Conversión revisa además orden y limpieza, infraestructura y manejo del
producto.

Eso se modela con el campo `areas`:

- **`seccion.areas`** — lista de códigos de área donde se evalúa la sección. Es el mecanismo
  principal y el que viene poblado desde el Excel.
- **`aspecto.areas`** — opcional; acota un aspecto todavía más dentro de su sección (por ejemplo,
  "los rodillos de la imprenta" solo en Conversión).
- **Lista vacía o ausente = aplica a todas las áreas**, para que una sección nueva sea visible
  mientras no se la restrinja.

El filtrado vive en `filtrarEstructuraPorArea()` ([`js/utils.js`](js/utils.js)) y alimenta tanto el
render del checklist como el cálculo del puntaje, de modo que el resultado nunca incluye aspectos
que no se le mostraron al inspector.

Se edita desde el panel: **Estructura → botón "Áreas"** en cada sección o aspecto. El botón
**"Aplicabilidad del Excel"** reaplica la matriz original a un checklist ya cargado, sin tocar
textos, pesos, orden ni aspectos editados.

Resultado con los datos del Excel:

| Aspectos | Áreas |
|---|---|
| 52 | Conversión, Corrugación, Logística, Almacén de MP, Control de Papel |
| 44 | Mantenimiento de Infraestructura, Recursos Humanos |
| 41 | Comedor |
| 31 | Mantenimiento Mecánico, Mantenimiento Eléctrico |
| 21 | Pre-Prensa, Dirección, Sistemas de Gestión, Calidad, TI, Planificación, Compras |

Cada vez que el admin publica cambios en el editor, se congela una nueva versión en
`versiones/{n}`. Las inspecciones ya guardadas conservan el número de versión con el que
se ejecutaron, así el historial nunca se corrompe aunque la estructura cambie después.

## Configuración de Firebase (una sola vez)

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com/).
2. **Authentication** → Sign-in method → habilita **Correo/contraseña**.
3. **Firestore Database** → Crear base de datos (modo producción).
4. **Firestore Database → Reglas** → pega el contenido de [`/firestore.rules`](../firestore.rules) (raíz del sitio) y publica.
5. **Configuración del proyecto → Tus apps → Web (`</>`)** → registra la app y copia el objeto
   `firebaseConfig`.
6. Pega esos valores en [`js/firebase-config.js`](js/firebase-config.js), reemplazando los
   `"TU_API_KEY"`, etc.

### Crear el primer administrador

1. En **Authentication → Users → Add user**, crea la cuenta del administrador (correo + contraseña).
2. Copia su **UID** (columna "User UID").
3. En **Firestore Database → Datos**, crea manualmente el documento:
   - Colección: `usuarios`
   - ID del documento: el UID copiado
   - Campos: `nombre` (string), `email` (string), `rol` = `"admin"` (string), `activo` = `true` (boolean)
4. Inicia sesión con esa cuenta en `index.html` → serás dirigido a `admin.html`.

### Cargar el checklist inicial

En `admin.html`, si el checklist `sig-fo-115` aún no existe, aparecerá un botón
**"Cargar estructura inicial desde el Excel (SIG-FO-115)"**. Al presionarlo se crean las 17 áreas,
11 secciones y 90 aspectos transcritos del Excel original, y se publica automáticamente como
**versión 1** para que los inspectores puedan empezar a usarla de inmediato.

> Nota: los códigos de área **CPA** ("Compras") y **COM** ("Comedor") no tenían un nombre completo
> documentado en el archivo Excel origen (solo el código de 3 letras visible en la hoja "Rev. 01").
> Verifica y corrige esos dos nombres desde la pestaña **Áreas** del editor si no corresponden.

### Dar de alta usuarios (inspectores o coordinadores)

Se hace íntegramente desde la aplicación, sin tocar la consola de Firebase:

1. En `admin.html` → pestaña **Usuarios** → botón **"+ Invitar"**.
2. Escribe nombre, correo y rol (Inspector, Coordinador de SGIA o Administrador). La contraseña
   temporal se genera sola (puedes cambiarla) y la cuenta queda **activa** por defecto.
3. Al guardar se crea la cuenta en Firebase Authentication y su perfil en Firestore, y —si dejas
   marcada la casilla— se envía un correo para que la persona defina su propia contraseña.

Para cambiar el nombre, el rol o desactivar a alguien, usa el botón **"Editar"** de su fila.
Por defecto la lista muestra solo usuarios activos; marca *"Mostrar también usuarios inactivos"*
para ver y reactivar a los desactivados.

> **Detalle técnico:** llamar a `createUserWithEmailAndPassword()` con el SDK de cliente inicia
> sesión con la cuenta recién creada, lo que expulsaría al administrador. Por eso
> [`js/usuarios.js`](js/usuarios.js) crea una instancia secundaria y temporal de la app de Firebase
> para dar el alta, y la libera con `deleteApp()`: la sesión del administrador nunca se toca.

## Despliegue en GitHub Pages

```bash
git init
git add .
git commit -m "SIG-FO-115 digital"
git branch -M main
git remote add origin <url-de-tu-repo>
git push -u origin main
```

Luego, en GitHub: **Settings → Pages → Source: "Deploy from a branch" → Branch: `main` / `(root)`**.
No requiere paso de build: es HTML/CSS/JS servido tal cual.

## Extensibilidad futura (ya prevista en el esquema, no implementada aún)

- **Exportación a PDF**: `historial.js` ya reconstruye el detalle completo de una inspección
  (aspectos, respuestas, observaciones, hisopado) a partir de `inspecciones/{id}` +
  `checklists/{id}/versiones/{n}`; solo falta enviar ese mismo contenido a una librería de
  generación de PDF en el navegador.
- **Firmas digitales**: el documento de inspección ya reserva un campo `firmas` (inspector/validador)
  sin usar; puede capturarse con un `<canvas>` de firma y guardarse como imagen o trazo vectorial.
- **Notificaciones por umbral de cumplimiento**: el checklist podría incorporar un campo
  `umbralAlerta` (%) y, al crear una inspección con `resultado.porcentajeCumplimiento` por debajo
  del umbral, disparar una notificación (Cloud Function + FCM, o un correo vía servicio externo).

## Notas técnicas

- **Avisos (toasts):** `mostrarToast(mensaje, tipo)` en [`js/utils.js`](js/utils.js) reemplaza al
  viejo banner fijo en la parte de arriba de cada página (`zona-alerta`, ya eliminado del HTML).
  El toast flota arriba-centro, se retira solo (4 s, o 6 s si es error) o al tocarlo, y no depende
  de dónde haya hecho scroll el usuario — importante en pantallas con botones de acción fijos al
  pie (Guardar, Enviar…), donde el banner anterior quedaba fuera de vista justo cuando más
  importaba el aviso. `tipo` es `"info"` (por defecto), `"exito"` o `"error"`.
- **Bug de contraste en modo oscuro (corregido):** `--marino-600`/`--marino-700` no tenían valor
  propio para modo oscuro y heredaban el azul muy oscuro pensado para texto sobre fondo blanco —
  contraste real de ~1.4:1 sobre las superficies oscuras (prácticamente invisible) en enlaces, el
  botón secundario y el toast informativo. Ya tienen un valor validado (`#5b8fd6`, ≥4.78:1) en
  ambos bloques de modo oscuro (`@media (prefers-color-scheme: dark)` y `[data-theme="dark"]`).
- Sin build ni paquetes npm: Firebase se importa por CDN como módulos ES (`type="module"`).
- **Caché del navegador (importante):** tanto los `<link>`/`<script>` de las 4 páginas como
  **todos los `import ... from "./archivo.js"` internos entre módulos** llevan el mismo parámetro
  `?v=4`. Esto no es cosmético: un módulo ES se cachea en el navegador por su URL exacta, y un
  `import "./utils.js"` sin versión puede quedarse sirviendo una copia vieja del archivo aunque el
  `<script>` que lo carga sí esté versionado — el módulo entero falla al evaluarse (con un error
  del tipo *"does not provide an export named…"*) y la página deja de funcionar por completo, sin
  ningún aviso visible más que ese error en la consola. **Cada vez que edites cualquier archivo en
  `js/` o `css/styles.css`, sube el número de versión en TODOS los `import`, `<script src>` y
  `<link href>` a la vez** (son el mismo número en todo el proyecto). El más simple es un
  buscar-y-reemplazar del número de versión actual al siguiente en los 4 `.html` y los `.js` de `js/`.
- **Navegación:** en móvil se usa la barra inferior fija; a partir de 640px esa barra se oculta y
  toma su lugar la navegación de la cabecera (`.nav-superior`). Ambas deben mantenerse
  sincronizadas al agregar una página nueva.
- `listarRecorridos` combina `inspectorUid` (igualdad) con `actualizadaEn`/fechas (rango + orden) en
  una sola consulta, así que le pide a Firestore **un índice compuesto** la primera vez que se
  ejecuta con esa combinación de filtros. Si la consulta falla, el mensaje de error en pantalla
  incluye el texto real que devuelve Firestore (antes solo se veía en la consola del navegador); si
  es por falta de índice, ese mensaje trae un enlace de Firebase que lo crea con un clic — solo hay
  que abrirlo, esperar a que el índice pase a "Enabled" en la consola de Firebase y recargar.
- Las fotografías/evidencia fotográfica quedaron fuera de este alcance, según lo solicitado.
