# Bugs

Registro de fallos encontrados durante la construcción, con causa y arreglo (regla de cierre.md /
seguridad.md: nada se omite, lo no resuelto dice "pendiente: motivo"). Todos resueltos.

### 5. QA.md 2026-09-27 (NO LISTO) — falta "Borrar todos los datos" en Respaldo
- **Paso:** QA manual (`qa-e2e`) siguiendo el checklist del brief, ítem "Exportar, borrar datos, importar: vuelve todo".
- **Síntoma:** no existe ningún botón para borrar todos los datos desde la UI; `db.vaciar()` existe (`js/db.js`) y se usa internamente en `importarRespaldo`, pero no está expuesto. La única forma de vaciar era borrar datos del navegador a mano o importar un JSON vacío como truco.
- **Causa:** al construir la pantalla Respaldo se cubrió exportar/importar pero se pasó por alto el ítem explícito del brief "borrar datos" como acción directa.
- **Arreglo:** `js/repositorio.js` (`borrarTodo`) + `js/vistas/respaldo.js` (sección "Zona de peligro", botón `data-accion="borrar-todo"`) — confirmación propia que sugiere exportar antes de continuar; al confirmar, vacía productos/blobs/config y navega a `#/` (sin `location.reload()`). Test E2E `test/e2e/respaldo.spec.js`.

### 6. QA.md 2026-09-27 (MEDIO) — Publicar puede quedar 5-10s en "Armando…" sin feedback final
- **Síntoma:** con `canShare` verdadero pero sin una hoja de compartir real que se cierre, el botón queda deshabilitado varios segundos y, en el peor caso (share que nunca resuelve), sin ningún toast ni forma de recuperarse.
- **Causa:** `publicarImagen` (`js/utils/compartir.js`) esperaba indefinidamente a `navigator.share()`, sin timeout de seguridad, y el caso "cancelado" no mostraba ningún toast final.
- **Arreglo:** `js/utils/compartir.js` — `Promise.race` entre `navigator.share()` y un timeout de seguridad (`TIMEOUT_COMPARTIR_MS`); si gana el timeout, se libera el botón igual y se avisa por toast que sigue en segundo plano. Se agregó toast también en el camino "cancelado". Test unitario con temporizadores falsos (`test/compartir.test.js`, `mock.timers` de `node:test`). Se probó también con `page.clock` en E2E pero resultó frágil (el fast-forward no siempre disparaba el timeout de forma determinística) y se descartó: el unitario ya cubre la lógica de forma robusta.

### 7. QA.md 2026-09-27 (MEDIO) — inputs de archivo ocultos en el tab order + errores de campo sin aria-live
- **Síntoma:** los `<input type=file>` ocultos (Galería/Cámara en el alta, subir plantilla, importar respaldo) quedaban en el orden de tabulación como paradas "fantasma" (invisibles al enfocarse); los mensajes de error de nombre/precio no se anunciaban a lectores de pantalla.
- **Arreglo:** `tabindex="-1"` en los 4 inputs ocultos (`js/vistas/detalle.js`, `js/vistas/plantilla.js`, `js/vistas/respaldo.js`) — se disparan solo desde el botón visible; `role="alert"` en los `div.campo__error` (`js/vistas/detalle.js`, función `campoTexto`); regla `:focus-visible` explícita agregada para `.tarjeta__nombre` y un fallback genérico en `css/estilos.css`.

### 12. `test/e2e/revision.spec.js` "la selección persiste tras recargar" — carrera test/app
- **Error exacto:**
  ```
  Error: expect(locator).not.toBeChecked() failed
  Locator: locator('[data-accion="seleccionar"]').first()
  Expected: not checked
  Received: checked
  ```
- **Causa:** el test hacía `await checks.nth(0).uncheck(); await page.reload();` uno después del otro. `uncheck()` de Playwright resuelve en cuanto se despacha el evento, pero el handler `change` de la app guarda en IndexedDB de forma asíncrona (`await repo.actualizarSeleccion(...)`) — el `reload()` podía llegar ANTES de que esa escritura terminara, y la página recién cargada leía el valor viejo. No es un bug de la app (la escritura sí se hace y sí persiste, solo que el test no esperaba la confirmación visible de que había terminado).
- **Arreglo:** el test ahora espera `[data-accion="publicar-seleccionados"]` con el texto "Publicar 1" (que solo aparece después de que `recargar()` — y por lo tanto la escritura previa — terminó) antes de recargar la página.
- **Resuelto:** sí — 28/28 E2E verdes.

### 11. Feature "estilos + selección + hoja de revisión" (2026-09-27): 4 fallos al correr la suite completa
- **Paso:** `npx playwright test -c test/e2e/playwright.config.js` después de agregar selección múltiple, barra "Publicar N" y la hoja de revisión.
- **Síntomas y causas:**
  1. **La barra fija "Publicar N" tapaba el FAB "+"** (ambos `position:fixed` cerca de la esquina inferior derecha) — `locator.click` en `[data-accion="agregar"]` fallaba con "subtree intercepts pointer events". Arreglo: `css/estilos.css` — `.barra-publicar` ahora deja un hueco (`padding-right`) del ancho del FAB y el FAB sube su `z-index` por encima de la barra.
  2. **`test/e2e/botones.spec.js` "publicar arma la imagen..."** seguía asumiendo que Publicar comparte directo; ahora abre la hoja de revisión primero. Arreglo: el test entra a la hoja y clickea `[data-accion="revision-compartir"]` antes de leer el toast.
  3. **`test/e2e/revision.spec.js` "Publicar de una tarjeta..."** leía `window.__compartir.llamadas` con `page.evaluate` inmediatamente después del `.click()` en compartir, sin esperar a que la cadena async (`copiarDescripcion` → `compartirArchivos` → `navigator.share`) terminara — carrera clásica. Arreglo: esperar `#toast` con el texto final antes de leer `llamadas` (mismo patrón que ya usaban los otros specs).
  4. **`test/e2e/ajustes.spec.js`**: en la pantalla Plantilla hay DOS elementos con `data-accion="ir-ajustes"` (el botón "← Volver a Ajustes" y el ítem de la nav inferior) — mismo valor, incidental, no un choque real de significado (los dos hacen "ir a Ajustes"). `locator(...).click()` sin `.first()` da "strict mode violation". Arreglo: `.first()` en el test.
- **Resuelto:** sí — 27/27 E2E verdes tras los 4 arreglos.

### 15. `test/e2e/editor.spec.js`: 2 fallos al escribir los tests del editor nuevo
- **Síntoma 1:** "arrastrar la manija de resize agranda la caja" — `expect(despuesCaja.width).toBeGreaterThan(antesCaja.width + 20)` fallaba por poco (300.3 vs 302.65 esperado).
  **Causa:** no es un bug de `redimensionarCaja` — la caja "nombre" por defecto ya tiene `x:60, w:960` sobre un lienzo de 1080, así que solo hay 60px de margen para crecer a la derecha antes del clamp (`limites.w - x`); el arrastre de prueba pedía crecer ~202 unidades de lienzo pero el clamp lo cortaba en +60 (~17.7px en pantalla), por debajo del umbral +20 que yo había puesto a ojo sin considerar el clamp.
  **Arreglo:** bajé el umbral del test a +10px (holgado respecto al incremento real de ~17.7px) — el resize funciona, la aserción estaba mal calibrada.
- **Síntoma 2:** "cambiar tamaño, color y tipografía... se ve al instante" — el `src` de la vista previa nunca cambiaba tras `input[type=range].fill('140')`.
  **Causa:** `locator.fill()` de Playwright no dispara correctamente el evento `input` en `<input type="range">` (pensado para campos de texto); el slider quedaba en su valor inicial y el handler `input` de la app nunca corría.
  **Arreglo:** se reemplazó `.fill()` por `.evaluate()` fijando `el.value` y despachando un `Event('input', {bubbles:true})` a mano, que sí dispara el handler real de la app.
- **Resuelto:** sí — 5/5 verdes.

### 16. Editor de plantilla: los sliders de tamaño/opacidad/redondeo NO regeneraban la vista previa al instante (bug real, no del test)
- **Síntoma:** cambiar "Tamaño de letra" (o la opacidad/redondeo del fondo) en el panel de propiedades no actualizaba la imagen de la vista previa; sí lo hacían color, tipografía, peso, alineación y visible.
- **Causa:** `js/vistas/plantilla.js` (`dibujarPanel`) — `actualizarCampo(campo, valor, regenerarInmediato)` solo llama a `regenerarPrevia()` cuando `regenerarInmediato` es verdadero, pero las 3 llamadas de `campoRangoNumero` para tamaño/opacidad/redondeo pasaban el callback con 2 argumentos únicamente (`(v) => actualizarCampo('tamano', v)`), dejando `regenerarInmediato` en `undefined`. Se detectó porque el test E2E del slider de tamaño nunca veía cambiar el `src` de la vista previa.
- **Arreglo:** se agregó `true` como tercer argumento en las 3 llamadas (tamaño, opacidad de fondo, redondeo de fondo), igual que ya tenían color/tipografía/peso/alineación/visible.
- **Resuelto:** sí — 5/5 E2E del editor verdes.

### 13. GitHub Pages "legacy build" no reconstruía solo en cada push
- **Síntoma:** después de pushear a `main`, `gh api repos/.../pages/builds/latest` seguía mostrando el commit del primer deploy — la app publicada quedó pegada en una versión vieja del `sw.js` durante varios pushes seguidos, aunque el push en sí funcionaba bien.
- **Causa:** con `build_type: legacy` (el modo por rama, sin Actions), GitHub Pages depende de un webhook interno para reconstruir en cada push, y ese webhook no disparó de forma confiable para los pushes de esta ronda — un forzado manual (`gh api -X POST .../pages/builds`) sí reconstruía, confirmando que no era un problema del contenido ni del push.
- **Arreglo:** se cambió el origen de Pages a `build_type: workflow` (`gh api -X PUT .../pages -f 'build_type=workflow'`) y se agregó `.github/workflows/pages.yml` ("Publicar en Pages", `actions/deploy-pages`), que corre explícitamente en cada push a `main` y cuyo resultado se puede verificar con `gh run list -w "Publicar en Pages"` — ya no depende de un webhook silencioso. El workflow arma un `_sitio/` curado (solo lo que se sirve: `index.html manifest.webmanifest sw.js css js icons fonts .nojekyll`), sin exponer `test/`, `docs/`, `BUGS.md`, etc. innecesariamente.
- **Resuelto:** sí — corrida verificada en verde (`gh api repos/.../actions/workflows/.../runs`).
- ¿Se repetiría en otro proyecto? Sí — cualquier proyecto con GitHub Pages en modo legacy puede sufrir el mismo webhook perdido. Queda como receta: si Pages no refleja un push, pasar a `build_type: workflow` en vez de seguir confiando en el build automático por rama.

### 14. Ronda "identidad visual + editor" (2026-09-27): 3 E2E rotos por cambios intencionales, no regresiones
- **Paso:** `npx playwright test -c test/e2e/playwright.config.js` después de la ronda de estilo/precio opcional/editor.
- **Síntomas:**
  1. `botones.spec.js` "ir-ajustes / ir-respaldo / ir-lista" — `locator('[data-accion="ir-respaldo"]').click()` da "strict mode violation: resolved to 2 elements": Ajustes ahora tiene su propio botón "Ir a Respaldo" (sección "Datos") además del ítem de la nav inferior. Mismo significado, dos lugares — no es un bug, hay que apuntar al de la nav.
  2. `botones.spec.js` "precio vacío o negativo... muestra error y no guarda" — el precio vacío YA NO es un error (CREAR-BRIEF.md: precio opcional). El test estaba probando el comportamiento VIEJO.
  3. `botones.spec.js` "precio vacío o negativo editado en línea... se revierte" — mismo motivo: vacío ahora guarda `null` ("Precio quitado"), no revierte.
- **Arreglo:** `.first()` en el selector de `ir-respaldo` del test 1; los tests 2 y 3 se reescribieron para reflejar el comportamiento nuevo (vacío = válido/sin precio, negativo sigue siendo error) en vez de borrarlos, para no perder cobertura del caso negativo.
- **Resuelto:** sí.

### 10. `test/e2e/sw.spec.js` intermitente dentro de la suite completa
- **Paso:** `npx playwright test -c test/e2e/playwright.config.js` (suite completa, 21 specs).
- **Error exacto:** `Error: page.goto: net::ERR_FAILED at http://127.0.0.1:8991/` — pero pasa siempre en aislado (`npx playwright test test/e2e/sw.spec.js`).
- **Causa:** no reproducible de forma determinística; probable carrera de instalación/activación del SW bajo carga (single worker corriendo 21 specs seguidos). No es "no existe/ya existe" (contaminación de datos) ni el reloj — parece timing puro del navegador con el SW.
- **Arreglo:** se le agregó `test.describe.configure({ retries: 2 })` a `test/e2e/sw.spec.js` como mitigación pragmática (el smoke del SW ya tiene su unit test determinístico en `test/sw-estrategia.test.js`, esto solo cubre el caso end-to-end).
- **Resuelto:** parcialmente — mitigado con retries, causa raíz no confirmada. Si vuelve a fallar con retries agotados, revisar si conviene aislar este spec en su propio worker/proyecto de Playwright.

### 9. `test/compartir.test.js` no podía asignar `global.navigator`
- **Paso:** `node --test test/compartir.test.js`.
- **Error exacto:**
  ```
  TypeError: Cannot set property navigator of #<Object> which has only a getter
  ```
- **Causa:** Node 22 expone `globalThis.navigator` como una propiedad experimental de solo lectura (getter, sin setter) con `userAgent` etc.; `global.navigator = {...}` falla porque no hay setter.
- **Arreglo:** `test/compartir.test.js` — se reemplazó la asignación directa por `Object.defineProperty(global, 'navigator', { value: {...}, configurable: true, writable: true })`.
- **Resuelto:** sí.

### 8. QA.md 2026-09-27 (BAJO) — precio vacío o negativo se guardaba como "$ 0" en silencio
- **Síntoma:** `parsearPrecio` clampeaba negativos a 0 y un campo vacío también daba 0; `validarProducto` aceptaba 0 como precio válido, así que nunca se mostraba un error.
- **Arreglo:** `js/modelo.js` — `parsearPrecio` ya no clampea (devuelve `NaN` si no hay número, preserva el signo); `validarProducto` exige `precio > 0`. `js/vistas/detalle.js` muestra el error de campo en vez de guardar. `js/vistas/lista.js` (edición en línea) revierte el input y avisa por toast en vez de guardar un precio inválido. Tests en `test/modelo.test.js` y E2E en `test/e2e/botones.spec.js`.

### 1. `calcularLineas` puede devolver una línea más ancha que la caja en textos muy largos
- **Paso:** correr `npm test` (`test/layout.test.js`).
- **Error exacto:**
  ```
  not ok 3 - calcularLineas: texto muy largo se parte en 2 líneas al llegar al mínimo
  The expression evaluated to a falsy value:
    assert.ok(medirAncho(linea, tamano) <= 260 + 1e-6)
  ```
- **Reproducir:** `calcularLineas({texto:'Campera de invierno impermeable talle grande', anchoMax:260, medirAncho:(t,s)=>t.length*s*0.55, tamanoInicial:60, tamanoMinimo:24, maxLineas:2})`.
- **Causa:** `js/layout.js` (`partirEnLineas`, versión original) cortaba el reparto de palabras apenas se llenaba la línea `maxLineas-1` y volcaba TODAS las palabras restantes en la última línea sin volver a chequear el ancho — un wrap greedy incompleto, no un wrap real de todas las palabras.
- **Arreglo:** `js/layout.js` (`partirEnLineas`) — se reescribió para hacer un wrap completo (todas las líneas que hagan falta) y recién después, si superan `maxLineas`, fusionar el excedente en la última línea permitida solo en el camino "forzado" (último recurso, protegido por el `ctx.clip()` del dibujo real en `js/componer.js`). Se separaron los tests (`test/layout.test.js`) en "entra bien en 2 líneas" vs. "ni así entra, se acepta desborde porque el dibujo lo recorta".
- **Resuelto:** sí — 30/30 tests unitarios verdes.
- ¿Se repetiría en otro proyecto? Es un detalle de implementación de este wrap manual, no un patrón del ecosistema: la lección queda como comentario en `js/layout.js`, sin fila en un `APRENDIZAJES.md` global.

### 2. E2E `botones.spec.js`: clic en "ir-lista" estando ya en la lista no cambiaba nada
- **Paso:** `npx playwright test -c test/e2e/playwright.config.js`.
- **Error exacto:**
  ```
  Error: [data-accion="ir-lista"] no cambió nada al hacer clic
  expect(received).not.toBe(expected) // Object.is equality
  ```
- **Reproducir:** clickear `[data-accion="ir-lista"]` estando ya en `#/`, dentro de un loop genérico que exige diff de DOM en cada clic.
- **Causa:** el test genérico asumía que TODO botón visible cambia el DOM al tocarlo, pero un botón de navegación ya activo hace un re-render idéntico (mismo estado) — no es un bug de la app, es un supuesto incorrecto del test.
- **Arreglo:** superado por el arreglo del #4 (se reescribió `botones.spec.js` entero con un test explícito por acción; ya no hay un loop genérico que asuma esto).
- **Resuelto:** sí.

### 3. E2E `sw.spec.js`: `context.setOffline(true)` tira `net::ERR_INTERNET_DISCONNECTED` en vez de servir desde caché
- **Paso:** `npx playwright test -c test/e2e/playwright.config.js` (proyecto `movil`, `serviceWorkers:'allow'`).
- **Error exacto:**
  ```
  Error: page.reload: net::ERR_INTERNET_DISCONNECTED
  Call log:
    - waiting for navigation until "load"
  ```
- **Reproducir:** registrar el SW, esperar `registro.active`, `context.setOffline(true)`, `page.reload()` (o `page.goto()`: mismo error).
- **Causa confirmada:** `context.setOffline(true)` de Playwright corta la conectividad a nivel del proceso del navegador (CDP `Network.emulateNetworkConditions`), un nivel más abajo que el Service Worker — ni siquiera llega a evaluarse el `fetch` handler para servir desde Cache Storage. Es una limitación conocida de probar SW offline con `setOffline`, no un bug de `sw.js`.
- **Arreglo:** `test/e2e/sw.spec.js` — se reemplazó `context.setOffline(true)` por `page.route('**/*', route => route.abort())`: bloquea las requests reales a la red a nivel de Playwright/CDP, pero una respuesta servida por el SW directamente desde Cache Storage nunca llega a generar una request de red, así que sí pasa.
- **Resuelto:** sí — el smoke del SW pasa (instala, y offline simulado con `route.abort()` sigue sirviendo la app desde caché).

### 4. E2E `botones.spec.js`: el loop genérico de "cada botón cambia algo" colgaba en `[data-accion="exportar"]`
- **Paso:** correr la suite completa (`npx playwright test -c test/e2e/playwright.config.js`), no el archivo solo.
- **Error exacto:**
  ```
  Test timeout of 30000ms exceeded.
  Error: locator.click: Test timeout of 30000ms exceeded.
  Call log:
    - waiting for locator('[data-accion="exportar"]').first()
  ```
- **Reproducir:** correr `botones.spec.js` dentro de la suite completa (pasaba aislado, colgaba en conjunto — señal de estado compartido/orden, no del reloj como en otros proyectos).
- **Causa:** el loop genérico recorría un vocabulario fijo asumiendo en qué pantalla te deja cada acción anterior (p. ej. después de "editar" te quedás en el detalle, así que el próximo "borrar" del loop es el del detalle, no el de la tarjeta) — una cadena de estados implícita y frágil, exactamente lo que la receta e2e.md pide evitar ("no iterar por posición"; acá el problema era iterar por una secuencia de pantallas supuesta, no por posición, pero el efecto es el mismo: un cambio de layout o de timing corre el estado y el siguiente `click()` apunta a un elemento tapado por un diálogo que quedó abierto de una iteración anterior).
- **Arreglo:** `test/e2e/botones.spec.js` — se reemplazó el loop único por tests explícitos, uno por acción, cada uno navegando a una pantalla conocida antes de clickear y afirmando un efecto concreto (no un diff de `page.content()` genérico). Más verboso, cero estado compartido entre acciones.
- **Resuelto:** sí — 17/17 E2E verdes, corridos dos veces seguidas sin flakiness.
- ¿Se repetiría en otro proyecto? Sí — se sumó una nota a la receta compartida `~/.claude/crear-kit/recetas/e2e.md` (sección `botones.spec.js`) para que el próximo proyecto con varias pantallas no arme la misma cadena implícita.

### 17. Editor: Deshacer "no anda" (QA v4), el deslizador se corta al arrastrarlo y la hoja de revisión muestra una opción en blanco
- **Paso:** QA v4 sobre la URL publicada; después reproducido con Playwright contra la misma URL.
- **Error exacto:** QA: "Deshacer, Rehacer y Restablecer no funcionan … Rehacer nunca se habilita". Reproducción propia en vivo: Deshacer SÍ revierte (`top 93.75% → 76.0417%`, Rehacer habilitado); lo que sí falla es el deslizador de tamaño: arrastrado de punta a punta pasa de `58` a `64`. Y `#revision-estilo` tiene una `<option>` vacía.
- **Reproducir:** Plantilla → tocar "Nombre" → arrastrar el deslizador "Tamaño de letra". Hoja de revisión → abrir "Estilo para esta tanda".
- **Causa:** (1) `actualizarCampo` rehacía el panel de propiedades en cada `input`: el `<input type=range>` que se estaba arrastrando se reemplazaba por uno nuevo y el gesto moría al primer paso. Es probablemente lo que QA vio como "no revierte": el cambio casi no ocurría. (2) `revision.js` tenía su propia copia de `ETIQUETA_ESTILO` sin el 4º estilo. (3) El test de deshacer anterior solo miraba que los botones se habilitaran, no que la posición volviera.
- **Arreglo:** los cambios continuos (deslizadores, selector de color) redibujan lienzo y capas con `conPanel: false`; los discretos siguen rehaciendo el panel. `revision.js` usa `ETIQUETA_ESTILO` de `modelo.js`. Tests nuevos que miden el resultado: deshacer/rehacer/restablecer por posición, deshacer de tipografía, arrastre con el dedo (CDP touch), deslizador arrastrado de punta a punta, y las 5 opciones con texto.
- **Inestabilidad de los tests nuevos en la suite completa:** el de etiquetas leía las opciones antes de que la hoja (async) se armara y el táctil arrastraba antes de que el editor terminara la primera vista previa. Ahora esperan el estado listo (`toHaveCount(5)` y la `src` de la vista previa).
- **Resuelto:** sí (ver commit).
- ¿Se repetiría en otro proyecto? Sí: "no redibujes el control que el usuario está arrastrando" y "un E2E de deshacer tiene que medir el estado, no el botón" van a la receta `e2e.md`.

### 18. En el E2E táctil, tocar Deshacer después de arrastrar no hacía nada
- **Paso:** `test/e2e/tactil.spec.js` dentro de la suite completa: arrastrar "Nombre" con el dedo (CDP `Input.dispatchTouchEvent`) y hacer `.tap()` en Deshacer.
- **Error exacto:** `expect.poll(posicion).toEqual(inicial)` → `- "top": "76.0417%"  + "top": "93.75%"`. Registro de eventos: `pointerdown:deshacer | pointerup:deshacer`, **sin `click`**.
- **Reproducir:** cualquier página, incluso una vacía con un `<div>` y un `<button>`: arrastre táctil por CDP y después `.tap()` → el primer toque no genera `click`, el segundo sí.
- **Causa:** artefacto de la emulación táctil de Chromium por CDP, no de la app (se reprodujo igual en una página vacía, con y sin `preventDefault`). Es la explicación más probable del "Deshacer no funciona" del QA v4, que automatiza el navegador con el mismo mecanismo.
- **Arreglo:** el test arrastra con el dedo y toca Deshacer con `.click()`, y deja comentado por qué. Además, como mejora real de uso, Deshacer / Rehacer / Restablecer pasan a una barra `position: sticky` arriba del lienzo (`.editor-plantilla__barra`): antes estaban a casi dos pantallas (y≈1545) debajo de lo que se edita.
- **Resuelto:** sí. Lección para QA: un "no responde al toque" con automatización táctil se confirma en una página vacía o en un celu real antes de reportarlo como alto.

### 19. (seguimiento de #10) El smoke del SW sigue intermitente
- **Paso:** `npx playwright test test/e2e/sw.spec.js --retries=0`, 5 corridas aisladas.
- **Error exacto:** `page.goto: net::ERR_FAILED at http://127.0.0.1:8991/` (3/5 pasan).
- **Causa:** pendiente. Se descartó que fuera cortar la red con el SW en "activating": ahora espera `state === 'activated'` y sigue igual. Hipótesis siguiente: `page.route` también intercepta el `fetch()` del SW y la caída al caché no encuentra la clave de `/`.
- **Arreglo:** pendiente; el test sigue con `retries: 2`. La app sí abre sin red (verificado a mano y en QA).
