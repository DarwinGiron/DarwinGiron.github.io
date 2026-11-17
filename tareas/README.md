# Control de tareas

App web de un solo archivo (`index.html` + `motor.js`) para controlar las tareas recurrentes del equipo. Usa Firebase Authentication (correo y contraseña) y Firestore. No necesita instalar ni compilar nada: solo Firebase por CDN y fuentes de Google.

**Roles**
- **admin**: ve todo, asigna tareas a cualquiera y crea accesos desde la pestaña *Equipo*.
- **member**: ve y gestiona únicamente lo suyo.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app (pantallas, Firebase, lógica). Aquí se pega `firebaseConfig`. |
| `tareas.css` | Estilos propios de esta sección. Debe subirse junto a `index.html`. |
| `motor.js` | Motor de repetición (`occursOn`, `lastBusinessDay`). Debe subirse junto a `index.html`. |
| `firestore.tareas.rules` | Reglas de seguridad de las colecciones `users`, `series` y `occ`. **No se publica completo** (ver paso 3). |
| `pruebas/motor.test.js` | Pruebas del motor, sin dependencias. |
| `pruebas/reglas.test.js` | Pruebas de las reglas con el emulador (opcional). |

## Puesta en marcha

Se usa el **mismo proyecto de Firebase** del dashboard SGI. Las colecciones de esta app son `users`, `series` y `occ`; no chocan con las del dashboard (`usuarios`, `reportes`, etc.).

### 1. Activar Authentication con correo y contraseña
1. Consola de Firebase → **Authentication** → **Sign-in method**.
2. Si **Correo electrónico/contraseña** aparece deshabilitado, habilítalo y guarda (si el dashboard ya lo usa, ya está activo).
3. Más tarde, cuando tengas la dirección de GitHub Pages: **Authentication → Settings → Authorized domains** → agrega `TU-USUARIO.github.io` (hace falta para que funcionen los enlaces de "cambiar contraseña").

### 2. Crear Firestore
Si el proyecto ya tiene Firestore (lo tiene si usas el dashboard), no hay nada que crear. Si no: **Firestore Database → Crear base de datos** (modo producción) y elige una ubicación.

### 3. Publicar las reglas sin pisar las del dashboard SGI
Firebase guarda **un solo archivo de reglas por proyecto**. Si publicas `firestore.tareas.rules` completo, se borran las reglas del dashboard. Por eso:

1. Abre las reglas actuales: Firestore → **Reglas** (o el `firestore.rules` del repo Reportes_APP, que es la copia buena).
2. Copia de `firestore.tareas.rules` **solo lo que está entre** `// ===== INICIO BLOQUE TAREAS =====` y `// ===== FIN BLOQUE TAREAS =====`.
3. Pégalo **dentro** de `match /databases/{database}/documents { ... }`, junto a los demás bloques. Las funciones deben quedar dentro de ese `match` (usan `$(database)`).
4. Las funciones del bloque empiezan con `tareas…` para no chocar con las del dashboard (`esAdmin`, `autenticado`, etc.).
5. **Publicar**. Haz lo mismo en el `firestore.rules` de Reportes_APP para que ese archivo siga siendo la copia completa.

Qué garantizan estas reglas: un member solo lee y escribe lo suyo, no puede crear tareas asignadas a otra persona, no puede cambiarse el rol, y solo el admin crea, cambia o borra perfiles de `users`.

### 4. Crear el primer administrador
1. **Authentication → Users → Add user**: correo y contraseña de Darwin (o usa una cuenta que ya exista). Copia su **UID**.
2. **Firestore Database → Iniciar colección** `users` → ID del documento = **el UID** → campos (tipo string):
   - `name`: tu nombre
   - `email`: tu correo
   - `role`: `admin`
3. Con ese admin, el resto del equipo se agrega desde la pestaña **Equipo → Agregar persona** (crea su acceso con role `member`). Quien tenga cuenta de Firebase pero no documento en `users` verá "Tu usuario todavía no está configurado".

### 5. `firebaseConfig` (ya está puesto)
`index.html` ya trae la configuración del mismo proyecto del hub SGI (`hub/js/firebase-config.js`) y usa la app de Firebase por defecto, igual que el hub. Como están en el mismo dominio, **la sesión es la misma**: quien ya entró al hub entra directo a Tareas con su cuenta, y **Salir** cierra la sesión en los dos. Si la cuenta no tiene perfil en `users`, Tareas lo avisa sin cerrar la sesión.

### 5b. Índice para las consultas de los members
Para no leer el historial completo, cada persona solo escucha sus registros (`occ`) desde hace 45 días (o desde el mes que esté viendo en el calendario). Esa consulta necesita el índice compuesto `occ (assigneeUid, date)`, que está en `firestore.indexes.json`. Créalo una vez en **Firestore → Índices → Compuestos → Crear índice** (colección `occ`, campos `assigneeUid` ascendente y `date` ascendente), o con el enlace que aparece en la consola del navegador. Mientras no exista, la app sigue funcionando con la consulta sin fecha (más lecturas).

### 6. Publicar en GitHub Pages
1. Crea un repositorio y sube `index.html` y `motor.js` (en la raíz; el resto de archivos son opcionales).
2. **Settings → Pages → Build and deploy → Deploy from a branch** → rama `main`, carpeta `/ (root)` → **Save**.
3. En un minuto o dos queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.
4. Agrega `TU-USUARIO.github.io` en los dominios autorizados (paso 1.3).

## Pruebas

**Motor de repetición** (solo Node 14+, sin instalar nada):
```bash
node pruebas/motor.test.js
```

**Reglas** (opcional; necesita Node 18+, Java 11+ y firebase-tools):
```bash
npm install --no-save @firebase/rules-unit-testing firebase firebase-tools
npx firebase emulators:exec --only firestore --project demo-tareas "node pruebas/reglas.test.js"
```
Como `firebase.json` no existe en esta carpeta, créalo antes con `{"firestore":{"rules":"firestore.tareas.rules"}}` solo para probar (no lo uses para publicar).

## Cosas a tener en cuenta
- El "último día hábil" descarta sábado y domingo; **no conoce feriados**.
- "Esta y las siguientes" al editar crea una serie nueva desde esa fecha; los registros ya hechos quedan con la serie anterior.
- Las evidencias se guardan dentro de Firestore (fotos comprimidas o archivos de hasta 500 KB).
- El comentario y la evidencia de cada tarea se ven y se editan en su ventana de detalle (tocar la tarea). Ya no se registran horas de inicio y fin; lo que estaba guardado se conserva en la base, solo no se muestra.
- Tiene su propia hoja de estilos, `tareas.css` (paleta coral `#FF9575`, menta `#E7F9F4`, crema `#F8F1E4` y azul noche `#06112D`, fuente Outfit); no usa la del hub. Sí usa los avisos de `hub/js/utils.js`, así que debe servirse desde el mismo sitio que el hub.
