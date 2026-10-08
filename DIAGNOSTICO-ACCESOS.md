# Diagnóstico de accesos y módulos

Fecha: 2026-10-08 · Alcance: código del repo en `main` + `firestore.rules`.

**Qué NO se pudo verificar** (requiere la consola de Firebase, no hay acceso desde aquí):
- La lista real de usuarios, su rol y si están activos (`usuarios`).
- Qué casillas tiene marcadas hoy el rol Inspector (`configuracion/permisosInspector`).
- Que las reglas publicadas en Firebase sean las mismas que las del repo.

Lo de abajo es lo que el **código y las reglas permiten**; no es el estado real de tus cuentas.

---

## 1. Cómo se decide el acceso

| Capa | Dónde vive | Qué controla |
|---|---|---|
| Rol del usuario | `usuarios/{uid}.rol` y `.activo` | `admin`, `coordinador`, `inspector`. Una cuenta con `activo: false` queda fuera de todo. |
| Permisos del rol Inspector | `configuracion/permisosInspector` | Casillas: `dashboard`, `validacion`, `informes`, `configuraciones`, `configSeccionZonas/Procesos/Categorias/UbicacionPlanta/PlanoReporte`. |
| Reglas de Firestore | `firestore.rules` | La barrera real de los datos. |
| Guardas de pantalla | `protegerPagina(...)` | Redirigen o esconden menús; no protegen datos por sí solas. |

**Hallazgo clave:** los permisos son **por rol, no por persona**. Hay un solo documento de permisos para todos los inspectores. Por eso todos los inspectores activos tienen exactamente el mismo acceso. Lo único que cambia entre ellos es si la cuenta está activa y qué registros son suyos.

### Para saber el estado real hoy
1. Consola de Firebase → Firestore → `configuracion` → `permisosInspector`: las casillas en `true` son lo que tiene cada inspector.
2. Firestore → `usuarios`: filtra por `rol` y `activo`.
3. Reglas → Simulador, para probar una operación como un uid concreto.

Si me pasas el contenido de esos dos documentos, completo la tabla con datos reales.

---

## 2. Qué puede hacer un inspector activo, módulo por módulo

Leyenda: **propios** = solo los registros que él creó · **todos** = los de todo el equipo.

| Módulo | Colección | Ve | Crea | Edita | Elimina | Pantallas de gestión |
|---|---|---|---|---|---|---|
| SIG-FO-115 PPRs | `inspecciones` | propios | sí, a su nombre | solo su borrador | solo su borrador | admin/coordinador |
| SIG-FO-101 Imprentas | `liberaciones` | **todos** | sí | propios | no | admin |
| Contenedores | `verificaciones_transporte` | **todos** | sí | propios | no | gestor (corregir, unificar) |
| SIG-FO-116 BPM | `auditoriasBpm` | **todos** | sí | **cualquier mes** (ver hallazgo D) | no | admin/coordinador |
| SIG-FO-111 Vidrio | `registrosVidrio` | propios | sí | propios | no | admin/coordinador |
| SIG-FO-118 Tarimas | `registrosTarimas` | propios | sí | propios | no | — |
| Hisopado | `hisopados` | **todos** | sí | propios | no | admin/coordinador |
| Reportes de hallazgos | `reportes` | propios (todos si tiene permiso) | sí, como pendiente | solo "visto" y estado del hallazgo (todo si tiene `validacion`) | no | admin |
| Catálogos | `zonas`, `procesos` | todos | sí (alta en línea) | solo con permiso de sección | no | — |
| Catálogos de formato | `checklists`, `sigfo111Config`, `hisopadoConfig`, `sigfo101Config` | todos | no | no | no | gestor |
| Usuarios | `usuarios` | solo su perfil | no | no | no | gestor |
| Permisos | `configuracion/permisosInspector` | lectura | no | no | no | solo admin |

Pantallas del sistema de Reportes para un inspector: **Reportes** siempre; **Dashboard, Validación, Configuraciones e Informes** solo si la casilla correspondiente está marcada.

---

## 3. Hallazgos

Ordenados por importancia.

**A. (Medio) Un coordinador queda como inspector en el sistema de Reportes.** En el hub, `coordinador` y `admin` son equivalentes (`esGestor()`). En el sistema de Reportes (`js/auth.js` y las reglas `esAdmin()`), solo `admin` tiene acceso total. Un coordinador necesita que las casillas de Inspector estén marcadas para entrar a Dashboard o Validación, y no puede borrar reportes. Si la intención es que el coordinador valide, hay que decidirlo y unificar el criterio.

**B. (Medio) Con permiso de Dashboard, tres pestañas fallan.** Las reglas de `inspecciones`, `registrosVidrio` y `registrosTarimas` solo dejan a un inspector listar sus propios registros, pero el Dashboard consulta todos. Resultado: PPRs, Vidrio y Tarimas muestran "sin permiso". Contenedores, Imprentas, BPM y Hisopado sí cargan. Opciones: dar el Dashboard solo a gestores, o abrir esas listas de lectura a usuarios activos.

**C. (Medio) El permiso `validacion` es muy amplio.** Quien lo tiene lee todos los reportes y edita cualquiera, incluida la gravedad. Solo no puede borrar. `dashboard` e `informes` también dan lectura de todos los reportes.

**D. (Medio) `auditoriasBpm`: cualquier usuario activo puede sobrescribir el mes completo.** Es un documento compartido sin dueño ni validación de campos. Un inspector puede alterar o vaciar la auditoría del mes. Solo el borrado está restringido a gestores.

**E. (Bajo) Política de lectura inconsistente.** `inspecciones`, `registrosVidrio` y `registrosTarimas` son privadas por inspector, pero `liberaciones`, `verificaciones_transporte` y `hisopados` las ve todo el equipo. En hisopados es intencional (hay un comentario que lo explica). Conviene confirmar que las otras también lo sean.

**F. (Bajo) Altas libres en catálogos.** Cualquier usuario activo puede crear zonas, procesos, supervisores, áreas de máquina y proveedores. Es por diseño, pero sin validación de contenido salvo el nombre del proveedor; pueden aparecer duplicados.

**G. (Bajo) Dos claves de permiso para Configuraciones.** El menú usa `configuraciones`; las reglas de escritura usan `configSeccion*`. Hay que confirmar que la pestaña Permisos mantiene ambas coherentes, porque marcar solo una deja una pantalla sin función o un permiso sin pantalla. No lo verifiqué.

**H. (Bajo) `hub/reporte-qr.html` es una página huérfana.** Ningún enlace apunta a ella, tiene credenciales de ejemplo (`TU_PROYECTO`) y escribe en `reportes_produccion`, que no tiene reglas. No hace daño hoy, pero conviene borrarla o configurarla.

**I. (Bajo) Las guardas de pantalla son de comodidad.** Varias pantallas de gestión (`corregir-registros`, `unificar-proveedores`) las abre cualquier usuario y revisan el rol dentro. Los datos quedan protegidos por las reglas, así que no es una fuga, pero un inspector ve la pantalla.

**Lo que está bien:** el inspector no puede crear registros a nombre de otro (`inspectorUid` obligatorio), ningún registro se puede reasignar, solo gestores eliminan, `usuarios` y los permisos solo los edita un gestor o admin, y los borradores enviados de PPR son inmutables.

---

## 4. Diagnóstico por módulo

| Módulo | Estado | Observación |
|---|---|---|
| SIG-FO-115 PPRs | Correcto | Alcance claro. Afectado por el hallazgo B en el Dashboard. |
| SIG-FO-101 Imprentas | Correcto | Todo el equipo ve todo; confirmar intención (E). |
| Contenedores | Correcto | Corrección solo del autor o gestor. |
| SIG-FO-116 BPM | Atención | Hallazgo D. |
| SIG-FO-111 Vidrio | Correcto | Afectado por B. |
| SIG-FO-118 Tarimas | Correcto | Reglas e índice listos en el repo; falta publicarlos en Firebase si no se hizo. |
| Hisopado | Correcto | Lectura compartida intencional. |
| Reportes de hallazgos | Atención | Hallazgos A y C. |
| Dashboard / Informes | Atención | Hallazgos B y C. |
| Configuraciones y Permisos | Revisar | Hallazgo G. |
| `reporte-qr.html` | Huérfana | Hallazgo H. |

## 5. Consumo de lecturas (relacionado)

- Las dos mejoras de lecturas ya están: paginación en Reportes y Dashboard con una sola consulta (en `main`), y campana limitada más catálogos en caché (en la rama `claude/trusting-turing-mc2lre`, pendiente de pasar a `main`).
- El hallazgo B también cuesta lecturas: un inspector con Dashboard dispara consultas que terminan rechazadas.
