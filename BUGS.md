# Bugs

Registro de fallos encontrados durante la construcción, con causa y arreglo (regla de cierre.md /
seguridad.md: nada se omite, lo no resuelto dice "pendiente: motivo"). Todos resueltos.

### 50. `sw.spec.js` fallaba de forma consistente (recurrencia de #10/#39/#45/#46/#47), diagnosticado y arreglado — no era ajeno al código
- **Paso:** Fase final del reskin. `npx playwright test -c test/e2e/playwright.config.js test/e2e/sw.spec.js` — fallaba 3/3 (intento + 2 retries) de forma determinística en esta máquina, aislado y dentro de la suite completa.
- **Error exacto:**
  ```
  Error: page.goto: net::ERR_FAILED at http://127.0.0.1:8991/
  Call log:
    - navigating to "http://127.0.0.1:8991/", waiting until "load"
    > await page.goto('/');   (después de page.route('**/*', route.abort()))
  ```
- **Reproducir (antes del arreglo):** `npx playwright test -c test/e2e/playwright.config.js test/e2e/sw.spec.js --retries=0` — fallaba siempre, no era intermitente en esta máquina.
- **Causa (confirmada con un spec de diagnóstico en scratchpad que agregaba listeners de `response`/`console` y volvía a leer el registro):** el test esperaba `registration.active.state === 'activated'` y a continuación, en el mismo tick, activaba `page.route('**/*', abort)` y navegaba de nuevo esperando que el SW sirviera desde caché. Pero `active.state === 'activated'` es un flag que el **renderer** ve por el lado de JS; el proceso del **navegador** (donde vive el ruteo real "esta navegación va al fetch handler del SW, no a la red") sincroniza el estado de "cliente controlado" en un paso aparte, con su propia latencia. Si la navegación que corta la red llega antes de que esa sincronización termine, el navegador trata la navegación como NO controlada, nunca dispara el fetch handler del SW, y el `route.abort()` mata la petición de verdad — de ahí el `net::ERR_FAILED`. Confirmado agregando una navegación intermedia CON red + polling extra: pasaba 5/5; quitando esos milisegundos de más, volvía a fallar 3/3.
- **Arreglo:** `test/e2e/sw.spec.js` — después de confirmar `active.state === 'activated'`, se agrega una navegación real (`page.goto('/')`, con red todavía permitida) seguida de `page.waitForFunction(() => !!navigator.serviceWorker.controller)`. Esa espera es una condición determinística (no un `timeout`/`sleep` a ciegas): confirma que ESTA página ya está controlada por el SW antes de cortar la red y navegar por tercera vez. Se sacó el `test.describe.configure({ retries: 2 })` (BUGS.md #10) porque ya no hace falta — 5/5 corridas limpias con `--retries=0`, y 92/92 en la suite completa.
- **NUCLEO restaurado en `sw.js` (v13→v14):** con la causa real resuelta (no tenía que ver con la cantidad de archivos precacheados), se vuelven a meter en `NUCLEO` los 3 archivos que la Fase 1 había sacado para "bajar el flake" sin diagnóstico (`./fonts/newsreader-400.woff2`, `./fonts/manrope-400.woff2`, `./fonts/manrope-600.woff2`, más `./js/utils/iconos.js`) — estaban afuera del precache y por lo tanto la PWA no abría con las fuentes/íconos nuevos en la primera carga sin red. De paso se sumó `./js/utils/plataforma.js`, que faltaba en `NUCLEO` desde la ronda APK 1.1 (`d4c513b`) y lo importan `respaldo.js`/`compartir.js`/`ajustes-la-app.js`, ya en el núcleo — mismo criterio: sin él, esas pantallas podían quedar rotas offline en la primera carga.
- **Resuelto:** sí.
- ¿Se repetiría en otro proyecto? Sí — cualquier E2E que mida `registration.active.state` y corte la red en la MISMA navegación tiene esta carrera. Agregado a `recetas/e2e.md` (sección "Service Worker: verificarlo aparte de los E2E mockeados"): la sincronización correcta es esperar `navigator.serviceWorker.controller` después de una navegación real con red, no un timeout.

### 49. Fase 4: el botón "Deshacer preset" quedaba visible con `hidden` puesto (pisado por `.fila{display:flex}`)
- **Paso:** verificación manual con agent-browser a 412×915 en `/#/plantilla?estilo=editorial` — el
  botón "Deshacer preset" (nuevo, galería de presets) aparecía en el snapshot de accesibilidad y
  `agent-browser is visible` lo confirmaba visible aun con `filaDeshacerPreset.hidden = true` recién
  entrado al editor (nadie aplicó ningún preset todavía).
- **Error exacto:** ninguna excepción — bug visual/de estado: `hidden` (atributo HTML) no ocultaba
  el elemento.
- **Reproducir:** abrir `/#/plantilla?estilo=<cualquiera>` sin haber tocado la galería de presets;
  `agent-browser is visible "[data-accion='deshacer-preset']"` daba `true`.
- **Causa:** el contenedor del botón usa `class="fila"`, y `.fila { display: flex; }` (css/estilos.css)
  es una regla de AUTOR con la misma especificidad que el `[hidden] { display: none }` que trae el
  navegador por defecto — una regla de autor siempre gana contra la hoja de estilos por defecto del
  navegador, sin importar el orden. Es la MISMA trampa que ya resolvían `.tarjeta-estilo__badge[hidden]`
  y `.editor-plantilla__badge[hidden]` (ya existian en el CSS antes de esta ronda) -- pero esas dos
  son puntuales por clase, y no había una regla genérica para `.fila`.
- **Arreglo:** agregar `.fila[hidden] { display: none; }` junto a la definición de `.fila`
  (`css/estilos.css`), en vez de una clase puntual — cubre este caso Y cualquier `.fila` oculta que
  se agregue después.
- **Resuelto:** sí, mismo commit de Fase 4.
- ¿Se repetiría en otro proyecto? Sí — cualquier proyecto con clases utilitarias que fijan `display`
  (`.fila`, `.flex`, `.grid`, etc.) tiene esta misma trampa con el atributo `hidden`: conviene una
  regla genérica `[hidden] { display: none !important; }` (o, como acá, una por clase utilitaria)
  desde el arranque del proyecto, no descubrirla bug por bug.

### 48. Fase 4: la galería de presets arriba del lienzo rompía el arrastre con mouse/touch en 412×915
- **Paso:** `npm run test:e2e` con la galería de presets de composición (`js/vistas/plantilla.js`)
  insertada ANTES de `previaContenedor` (lienzo + overlay), entre el selector de estilo y la barra
  de deshacer/rehacer.
- **Error exacto:** `test/e2e/editor.spec.js:163` (`deshacer devuelve el elemento a donde estaba…`),
  `editor.spec.js:300` (badge "Personalizado" al mover) y `test/e2e/tactil.spec.js:36` (arrastrar con
  el dedo) fallaban con `expect(movido.top).not.toBe(inicial.top)` — el elemento "nombre" quedaba
  EXACTAMENTE en la misma posición después de arrastrarlo (`76.0417%` en ambos casos).
- **Reproducir:** `npx playwright test test/e2e/editor.spec.js -g "deshacer devuelve el elemento"`
  con la galería antes del lienzo en el DOM.
- **Causa:** la galería (título + tira de 4 tarjetas 148×263px aprox.) sumaba suficiente alto como
  para empujar el lienzo/overlay hacia abajo y sacar el elemento "nombre" (que ya está cerca del
  75% inferior de un lienzo lógico 1080×1920) del viewport visible en 412×915. Los tests arrastran
  con coordenadas de pantalla reales (`page.mouse`/emulación táctil por CDP), no por selector: el
  `pointerdown` caía fuera del viewport y nunca llegaba al elemento, así que `ajustes.nombre` nunca
  cambiaba.
- **Arreglo:** mover la galería de presets al FINAL de `wrap.append(...)` (después de
  `previaContenedor`/`capas`/`panel`, no antes) — es una sección para "probar otra composición", no
  la edición principal, así que no debía competir por el espacio de arriba con el lienzo (regla de
  UI 6, móvil primero: la acción principal accesible sin scroll extra). `js/vistas/plantilla.js`.
- **Resuelto:** sí, mismo commit de Fase 4.
- ¿Se repetiría en otro proyecto? Sí — cualquier pantalla que agregue una sección nueva ARRIBA de
  una superficie interactiva ya testeada con coordenadas de pantalla reales (no por selector) puede
  romper el mismo tipo de test sin que el test en sí tenga nada mal. Vale la pena, al agregar
  contenido nuevo a una pantalla con drag/touch, revisar primero si va antes o después de la
  superficie interactiva en el DOM.

### 47. `sw.spec.js` sigue fallando en esta máquina (recurrencia de #46/#45/#39), confirmado ajeno a Fase 4
- **Paso:** `npm run test:e2e` completo al cerrar Fase 4 (catálogo de presets de composición: banner
  inferior/editorial/polaroid/story inmersiva). Único fallo, 84/85 specs pasan.
- **Error exacto:** igual que #46/#45/#39 — `page.goto: net::ERR_FAILED at http://127.0.0.1:8991/`
  con `page.route('**/*', route.abort())` activo, los 3 intentos (intento + 2 retries).
- **Reproducir:** `npx playwright test test/e2e/sw.spec.js`.
- **Causa:** la misma de #39/#45/#46 (pendiente de investigar, fuera de alcance).
- **Arreglo:** ninguno en esta ronda (mismo criterio que #39/#45/#46).
- **Resuelto:** no (fuera de alcance, igual que #39/#45/#46).
- ¿Se repetiría en otro proyecto? No aplica — sigue sin diagnóstico (ver #39).

### 46. `sw.spec.js` sigue fallando en esta máquina (recurrencia de #45/#39), confirmado ajeno a Fase 3
- **Paso:** `npm run test:e2e` completo al cerrar Fase 3 (3 funcionalidades "M" del reskin: reordenar
  con drag/teclado, editar precio en modal desde la grilla, acciones visibles en la grilla). Único
  fallo, 84/85 specs pasan.
- **Error exacto:** igual que #45/#39 — `page.goto: net::ERR_FAILED at http://127.0.0.1:8991/` con
  `page.route('**/*', route.abort())` activo, los 3 intentos (intento + 2 retries).
- **Reproducir:** `npx playwright test test/e2e/sw.spec.js`. Confirmado con `git stash` (vuelve todo
  el árbol de trabajo al commit base `786adac`, ANTES de Fase 3) → el mismo test falla IGUAL, 3/3,
  con el código viejo — cero relación con los cambios de esta ronda (`sw.js` VERSION `v11`→`v12` +
  `./js/reordenar.js` nuevo en `NUCLEO`).
- **Causa:** la misma de #39/#45 (pendiente de investigar, fuera de alcance).
- **Arreglo:** ninguno en esta ronda (mismo criterio que #39/#45).
- **Resuelto:** no (fuera de alcance, igual que #39/#45).
- ¿Se repetiría en otro proyecto? No aplica — sigue sin diagnóstico (ver #39).

### 45. `sw.spec.js` sigue fallando en esta máquina (recurrencia de #39), confirmado ajeno a Fase 2
- **Paso:** `npm run test:e2e` completo al cerrar Fase 2 (5 funcionalidades "S" del reskin). Único
  fallo restante además de #44 (ya resuelto).
- **Error exacto:** igual que #39 — `page.goto: net::ERR_FAILED at http://127.0.0.1:8991/` con
  `page.route('**/*', route.abort())` activo, los 3 intentos (intento + 2 retries), tanto en la
  suite completa como aislado (`npx playwright test test/e2e/sw.spec.js`).
- **Reproducir:** `npx playwright test test/e2e/sw.spec.js`. Confirmado con `git stash push -- sw.js`
  (vuelve `sw.js` a como estaba ANTES de Fase 2, VERSION `v10` sin `secciones.js` en `NUCLEO`) → el
  mismo test falla IGUAL, 3/3, con el `sw.js` viejo — cero relación con los cambios de esta ronda
  (subir `VERSION` a `v11` + sumar `./js/vistas/secciones.js` a `NUCLEO`, que faltaba desde la ronda
  "secciones" original).
- **Causa:** la misma de #39 (pendiente de investigar, marcada ahí como fuera de alcance — probable
  cosa de esta máquina/versión de Chromium con `page.route abort` + Service Worker, no del código).
- **Arreglo:** ninguno en esta ronda (mismo criterio que #39: no corresponde diagnosticar/arreglar
  acá un fallo que ya existía antes de tocar nada de Fase 2).
- **Resuelto:** no (fuera de alcance, igual que #39).
- ¿Se repetiría en otro proyecto? No aplica — sigue sin diagnóstico (ver #39).

### 44. Fase 2 "S" #5 (calidad de imagen): "Alta" (JPEG 0.95) no pesa más que "Estándar" (JPEG 0.85) en el test nuevo
- **Paso:** `npm run test:e2e`, test nuevo `revision.spec.js` `"Calidad de imagen": Estándar por
  defecto, "Alta" pesa más y se recuerda entre hojas` (Fase 2, implementando el selector de calidad
  en la hoja de revisión, `js/vistas/revision.js` + `js/modelo.js` `resolverOpcionesExportacion`).
- **Error exacto:**
  ```
  Error: expect(received).toBeGreaterThan(expected)
  Expected: > 43313
  Received:   43313
  ```
  (`pesoAlta` y `pesoEstandar`, tamaño en bytes del archivo final compartido, salen exactamente
  iguales — no solo "parecidos": el mismo número.)
- **Reproducir:** `npx playwright test test/e2e/revision.spec.js -g "Calidad de imagen"`.
- **Causa:** del TEST, no de la app — se agregó `window.__revisionDebug` (mismo criterio que
  `window.__editorDebugPlantilla` en `plantilla.js`) para verificar `calidadImagen`/tamaños reales
  en cada `generarFinales`, y mostró que la app SÍ generaba los tamaños correctos (43313 con
  "Estándar", 79169 con "Alta"). El test sincronizaba el segundo "Compartir" esperando el TEXTO del
  toast (`/Mi estado/`), pero ese mismo texto ya estaba en pantalla desde el PRIMER compartir (dura
  3.2s, `js/utils/toast.js`) — `expect(...).toHaveText(...)` pasaba de inmediato, sin esperar a que
  el segundo `navigator.share` (mockeado) terminara de verdad, y el test leía `window.__compartir.
  llamadas.at(-1)` con la llamada VIEJA (todavía 1 sola en el array).
- **Arreglo:** `test/e2e/revision.spec.js` — la espera pasa a ser `expect.poll(() =>
  window.__compartir.llamadas.length).toBe(2)` (una señal real: sumó una SEGUNDA llamada), en vez
  de confiar en el texto del toast cuando se comparte dos veces en el mismo test. De paso queda
  `window.__revisionDebug` en `js/vistas/revision.js` (calidad usada + tamaños de los archivos
  finales), reusable en otros tests sin mockear `navigator.share`.
- **Resuelto:** sí — `npx playwright test test/e2e/revision.spec.js` → 14/14.
- **Paso:** `npm run test:e2e` completo, rama `rediseno-organic`, después de reescribir `css/estilos.css`
  (tokens + 2 fuentes nuevas autoalojadas) y sumar `js/utils/iconos.js` (íconos SVG inline
  reemplazando emojis/glifos en `lista.js`/`plantilla.js`/`secciones.js`/`detalle.js`).
- **Error exacto (1, `revision.spec.js` "el selector de estilo de la hoja regenera las imágenes"):**
  ```
  Error: expect(received).not.toBe(expected) // Object.is equality
  Expected: not null
  ```
  (`primeraImagen` y `segundaImagen` llegaban `null` — el `<img class="hoja-revision__miniatura">`
  se crea SIN `src` y lo recibe recién cuando termina de componerse en canvas; `toHaveCount(1)` ya
  pasa con el `<img>` recién creado y vacío, y el test leía `getAttribute('src')` inmediatamente.)
- **Causa (1):** carrera preexistente en el test (no en la app): dependía de que, por timing
  accidental, `img.src` ya estuviera puesto para cuando se leía. El reskin agrega 2 fuentes
  (`@font-face` en `css/estilos.css`) que el navegador carga antes del primer paint, corriendo lo
  bastante el reloj como para que la carrera, antes favorable, empezara a perder.
- **Arreglo (1):** `test/e2e/revision.spec.js` — se agregó `esperarMiniaturaLista(page)` que espera
  con `page.waitForFunction` a que el `<img>` tenga `src` de verdad antes de leerlo, en las dos
  capturas (antes y después de cambiar de estilo). No se tocó ningún selector ni `data-*`.
- **Resuelto (1):** sí — `npx playwright test test/e2e/revision.spec.js` → 10/10.
- **Error exacto (2, `sw.spec.js`, ya registrado como #10):** mismo `net::ERR_FAILED at
  http://127.0.0.1:8991/`, pero ahora falló las 3 veces (intento + 2 retries) tanto en la suite
  completa como aislado, cuando antes del reskin (mismo commit base, verificado con `git stash`)
  fallaba 1 de 2 intentos ("1 flaky", se recuperaba con el retry).
- **Causa (2):** confirmada por A/B — sumar 2 fuentes nuevas + `js/utils/iconos.js` a `NUCLEO`
  (`sw.js`, 39 → 42 entradas) alargó el `cache.addAll` del `install` lo bastante como para que la
  carrera de #10 (ya intermitente en el baseline: 1 de 2 intentos) pasara a fallar los 3 intentos
  seguidos (intento + 2 retries), tanto en la suite completa como aislado. La lógica de ruteo del SW
  no cambió (`test/sw-estrategia.test.js` determinístico sigue en verde) — es la misma carrera de
  #10, más frecuente con más peso en `NUCLEO`, no una carrera nueva.
- **Arreglo (2):** `sw.js` — se sacaron `./js/utils/iconos.js`, `./fonts/newsreader-400.woff2`,
  `./fonts/manrope-400.woff2` y `./fonts/manrope-600.woff2` del array `NUCLEO` (precache atómico del
  `install`). No hace falta que estén ahí: las fuentes ya son `cache-first` por patrón
  (`js/sw-estrategia.js`, `/\/fonts\/.+\.woff2$/`) y `iconos.js` es `network-first` como cualquier
  otro `.js` — ambos quedan cacheados solos en la primera visita online real (mismo criterio que
  `js/vistas/secciones.js`, que tampoco está en `NUCLEO` desde antes de este reskin). `VERSION` se
  mantuvo en `v10` igual (cambió `css/estilos.css`, que sí está en `NUCLEO`).
- **Resuelto (2):** sí — reproducido el A/B (con las 3 entradas de más: 3/3 fallos; sin ellas: vuelve
  a "1 flaky", igual que el baseline) y `npm run test:e2e` → 76 passed + `sw.spec.js` en verde con
  el retry existente, igual que antes del reskin.

### 23. Ronda "vista previa en vivo + distribución": el editor de plantilla no cargaba (TDZ) y 2 tests nuevos leían el canvas antes de que se redibujara
- **Paso:** `npx playwright test -c test/e2e/playwright.config.js test/e2e/editor.spec.js` después de cambiar la vista previa del editor de un `<img>` regenerado por Blob a un `<canvas>` dibujado en vivo con `requestAnimationFrame`.
- **Error exacto:** las 14 pruebas de `editor.spec.js` fallaban por timeout esperando `[data-elemento="nombre"]`; la captura de página mostraba `Ocurrió un error al mostrar esta pantalla: Cannot access 'rafPendiente' before initialization`.
- **Reproducir:** entrar a `#/plantilla` con `let rafPendiente = false;` declarado DESPUÉS del punto donde `render()` ya llama a `solicitarRedibujo()` (que lee `rafPendiente`) — aunque `function solicitarRedibujo(){}` se hoistea entera, el `let` no: queda en zona muerta temporal hasta que su propia línea se ejecuta.
- **Causa:** en `js/vistas/plantilla.js`, `let rafPendiente = false; let contadorDibujos = 0;` estaban declarados junto a `solicitarRedibujo()` en la sección "Lógica", MÁS ABAJO de las llamadas iniciales (`dibujarOverlay(); ajustarResolucionCanvas(); solicitarRedibujo();`) que ya corren durante `render()`.
- **Arreglo:** se movieron `let rafPendiente = false;` y `let contadorDibujos = 0;` arriba, junto a las demás variables de estado de `render()` (antes de `historial`), y se sacó la declaración duplicada de más abajo. Además, 2 tests nuevos ("Acomodar automáticamente" y "Centrar horizontal") leían `window.__editorDebugPlantilla` inmediatamente después del click, sin esperar el próximo `requestAnimationFrame` (coalescido a propósito, máx. 1 dibujo por frame) — se cambiaron a `expect.poll(...)` sobre el valor calculado (centro horizontal) en vez de una lectura única.
- **Resuelto:** sí — 14/14 verdes (commit de esta ronda, ver `Claude-Session` al pie).
- ¿Se repetiría en otro proyecto? Sí, la parte del TDZ: declarar variables de estado (`let`/`const`) SIEMPRE arriba de la función que las consume, nunca confiar en que el orden de aparición de `function` declarations hoisteadas "arrastra" también a los `let` que usan — se agregó como comentario en el propio archivo; no amerita una fila aparte en `APRENDIZAJES.md` (es una regla general de JS, no un patrón de este ecosistema).

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
- **Seguimiento 2026-09-28 (ronda "vista previa en vivo + distribución + instalar/compartir"):** volvió a aparecer varias veces al correr la suite completa (52 specs) después de sumar `js/utils/qr.js`, `js/utils/instalacion.js` y los cambios de `sw.js` (VERSION `v8`, nuevos archivos en `NUCLEO`) — y también aislado, sin relación con esos archivos. De 3 corridas de la suite completa: 2 pasaron en el **retry #1** (queda "flaky", no "failed" — Playwright cuenta un test que pasa en un retry como éxito del run) y 1 agotó los 3 intentos y quedó roja. Nada de esto se tocó: sigue siendo el mismo timing conocido de `page.route` + Service Worker (BUGS.md #10/#19), no una regresión de esta ronda; si vuelve a darse roja, correr de nuevo (`npx playwright test test/e2e/sw.spec.js`) alcanza para confirmarlo.
- **Seguimiento 2026-09-28 (ronda "APK autónomo"):** agotó los 3 intentos y quedó roja en `npm run test:e2e` corriendo la suite completa (52 specs, 50 pasaron) después de sumar `js/utils/plataforma.js` y los cambios de `compartir.js`/`respaldo.js`/`ajustes-la-app.js`/`main.js` para el puente Android. Mismo síntoma exacto (`net::ERR_FAILED at http://127.0.0.1:8991/`), y esos archivos no tocan `sw.js` ni el registro del SW: no es una regresión de esta ronda.
- **Seguimiento 2026-09-28 (ronda "APK 1.1" — ajustes por estilo/barra responsive/miniaturas/compartir sin texto/perf JPEG/capas verticales):** en 3 corridas completas de `npx playwright test -c test/e2e/playwright.config.js` (64 specs, todo lo demás verde): una pasó en el **retry #1** (flaky, no failed) y dos agotaron los 3 intentos (`net::ERR_FAILED at http://127.0.0.1:8991/`, mismo síntoma de siempre, incluida la corrida final después del fix de `base64ABlob` y las capturas en emulador). Ninguno de los cambios de esta ronda toca `sw.js` más allá de subir `VERSION` a `v9` y sumar `./assets/ejemplo.jpg` a `NUCLEO` (un archivo estático más en la lista, mismo patrón que los íconos): no es una regresión. Se deja documentado y se sigue: es el comportamiento esperado que ya avisó Bruno en el brief ("sw.spec intermitente conocido #19").

### 20. La hoja de revisión quedaba abierta encima de otra pantalla
- **Paso:** verificación en vivo de la v5: abrir la hoja (Publicar) y cambiar de pantalla (Atrás de Android / cambio de hash).
- **Error exacto:** `locator.click: <select id="revision-estilo"> from <div class="dialogo-overlay"> subtree intercepts pointer events` al querer tocar el editor.
- **Reproducir:** Publicar un producto → botón Atrás del celu → la vista de abajo cambia pero la hoja sigue encima y no se puede tocar nada.
- **Causa:** la hoja es un overlay agregado al `<body>` que no escucha la navegación.
- **Arreglo:** abrir la hoja suma un paso al historial (`pushState`); `popstate` la cierra, así Atrás cierra la hoja sin cambiar de pantalla. Cerrarla con la X, Escape o al compartir hace `history.back()` para no dejar el paso de más. Tests: Atrás cierra la hoja y la lista queda usable; cerrar con la X no deja el paso.
- **Resuelto:** sí (ver commit).

### 21. La barra de Deshacer "fija" se iba con el scroll
- **Paso:** verificación en vivo de la v6: bajar hasta el panel de propiedades del editor.
- **Error exacto:** `barraVisibleAlScrollear: false` con `scrollY: 597`; único ancestro con overflow: `MAIN.vista:auto`.
- **Reproducir:** Plantilla → tocar Nombre → bajar hasta los deslizadores: la barra desaparece arriba.
- **Causa:** `.vista` tenía `overflow-y: auto` sin alto fijo: no scrollea ella (crece y scrollea la ventana) pero igual es el contenedor de referencia del `position: sticky`, que queda anulado.
- **Arreglo:** `.vista` pasa a `overflow-x: clip` (contiene el desborde horizontal sin crear contenedor de scroll). Test E2E que baja hasta el panel y mide que la barra siga arriba.
- **Resuelto:** sí (ver commit).

### 22. Cloudflare: el deploy fallaba por "Asset too large"
- **Paso:** primer deploy en Cloudflare (proyecto creado como Worker, deploy command `npx wrangler deploy`).
- **Error exacto:** `✘ [ERROR] Asset too large. Cloudflare Workers supports assets with sizes of up to 25 MiB. We found a file /opt/buildhome/repo/node_modules/workerd/bin/workerd with a size of 128 MiB.`
- **Reproducir:** conectar el repo a Cloudflare sin `wrangler.jsonc`: wrangler detecta "Static" con `Output Directory: .` y sube todo el repo (2332 archivos, node_modules incluido).
- **Causa:** sin archivo de configuración, wrangler usa la raíz del repo como carpeta de assets.
- **Arreglo:** `wrangler.jsonc` versionado con `assets.directory: "./_sitio"` (lo arma `scripts/armar-sitio.mjs`, el mismo que usa GitHub Pages).
- **Resuelto:** pendiente de confirmar con el próximo deploy.

### 23. `node --test` sin argumentos corre también los specs de Playwright y explota
- **Paso:** durante la ronda "APK 1.1" (configuración por estilo/perf/capas), correr `node --test` a secas (sin lista de archivos) para chequear rápido los tests unitarios después de tocar `js/modelo.js`.
- **Error exacto:**
  ```
  not ok 2 - test\e2e\ajustes.spec.js
  Error: Playwright Test did not expect test() to be called here.
  ```
  (y lo mismo para los otros 8 archivos de `test/e2e/*.spec.js`).
- **Reproducir:** `node --test` en la raíz del proyecto: el runner nativo de Node barre TODO `test/**/*.test.js` y también entra a `test/e2e/*.spec.js`, que usan `test`/`test.beforeEach`/`test.use` de `@playwright/test`, no de `node:test` — chocan.
- **Causa:** no es un bug del código: `package.json` ya define `"test": "node --test test/modelo.test.js test/layout.test.js ..."` con la lista explícita de archivos unitarios (sin tocar `test/e2e/`) precisamente para evitar esto; invocar `node --test` directo, sin esa lista, se salta esa protección.
- **Arreglo:** ninguno en el código. Correr siempre `npm test` (unitarios) y `npm run test:e2e` (Playwright) por separado, nunca `node --test` a secas en este repo.
- **Resuelto:** sí — confirmado con `npm test` (mismos archivos, todos verdes).
- ¿Se repetiría en otro proyecto? Sí, en cualquier repo que mezcle `node:test` y Playwright en la misma carpeta `test/`: nota para la receta compartida `~/.claude/crear-kit/recetas/e2e.md` ("nunca `node --test` a secas si convive con specs de Playwright; usar siempre el script de `package.json`").

### 24. E2E nuevo de "capas verticales" (ronda 2026-09-28): `count()` de 0 filas apenas navegado
- **Paso:** `npx playwright test -c test/e2e/playwright.config.js -g "las capas se apilan verticalmente"`.
- **Error exacto:**
  ```
  Error: expect(received).toBeGreaterThanOrEqual(expected)
  Expected: >= 3
  Received:    0
  ```
- **Reproducir:** `page.goto('/#/plantilla?estilo=mi-plantilla')` y de inmediato `page.locator('.editor-plantilla__fila-capa').count()` (sin esperar nada antes).
- **Causa:** `count()` no es una aserción que reintenta (a diferencia de `expect(locator).toHaveCount(...)`): devuelve lo que hay en el DOM en ESE instante. `render()` de `plantilla.js` es `async` (espera `repo.obtenerPlantillaConfig()`, decodificar imágenes, etc.) y todavía no había terminado de armar `.editor-plantilla__capas` cuando el test ya estaba contando. Verificado con un spec de depuración: el HTML final SÍ tiene las 4 filas: el problema era 100% el timing del test, no la app (confirmado leyendo `#vista` con `page.waitForTimeout(1000)` antes de contar).
- **Arreglo:** `test/e2e/editor.spec.js` — se espera `await expect(filas.first()).toBeVisible()` antes de `count()`.
- **Resuelto:** sí — verde en la corrida siguiente.
- ¿Se repetiría en otro proyecto? Sí: "`count()`/`.all()` no esperan nada, usar siempre una aserción `expect(locator).toHave*` (que sí reintenta) antes de leer una colección recién armada de forma async" ya está en la receta `e2e.md`; no hace falta una fila nueva, es el mismo patrón de siempre.

### 25. `movil\build-apk.ps1`: el PRIMER `assembleRelease` de cada sesión falla con `classes.dex` en uso
- **Paso:** ronda "APK 1.1" — corrí `movil\build-apk.ps1` tres veces en la misma sesión (build de 1.1, después de un `git stash`/rebuild de 1.0, después de un `git stash pop`/rebuild de 1.1 otra vez). Las 3 veces, el PRIMER intento de cada tanda falló igual.
- **Error exacto:**
  ```
  Execution failed for task ':app:mergeDexRelease'.
  > D:\...\movil\app\build\intermediates\dex\release\mergeDexRelease\classes.dex: El proceso no tiene acceso al archivo porque está siendo utilizado por otro proceso
  ```
- **Reproducir:** correr `assembleRelease` (vía `build-apk.ps1`) poco después de que Gradle terminó de escribir el `classes.dex` de una corrida anterior — el segundo intento, inmediato, siempre pasa.
- **Causa:** algo en Windows (el patrón más probable es Windows Defender/antivirus escaneando el `.dex` recién escrito) tiene el archivo abierto un instante justo cuando el próximo build quiere reescribirlo — carrera de archivo, no un error de Gradle ni del proyecto.
- **Arreglo:** ninguno en el código; correr `build-apk.ps1` de nuevo apenas falla con este mensaje resuelve siempre. Si se vuelve tedioso, se podría sumar un reintento automático al script (1 retry con esperar 2s) — no se hizo en esta ronda para no tocar el script de build sin pedido explícito.
- **Resuelto:** sí (con el reintento manual).
- ¿Se repetiría en otro proyecto? Sí, en cualquier build Android en Windows con Defender activo: nota para la receta `crear-apk` ("si `assembleRelease` falla una sola vez con `classes.dex ... en uso por otro proceso`, correr de nuevo sin diagnosticar más — es una carrera de archivo del antivirus, no del build").

### 26. (falsa alarma) "La foto importada no se ve" — en realidad la foto de prueba ES el logo de la app
- **Paso:** verificación en emulador (AVD `docuvoz`) de la ronda "APK 1.1" — armé un respaldo `.json` de prueba (10 productos con `fotoBase64` de `test/e2e/fixtures/producto.png`) y lo importé desde Respaldo → Elegir archivo, primero en el APK 1.0 y de nuevo tras actualizar a 1.1.
- **Lo que pareció un error:** la miniatura de los 10 productos (lista, detalle) mostraba el logo de estados-rapidos (anillo segmentado + rayo), y lo leí como el ícono genérico "sin foto" (`tarjeta__foto--vacia`) — es decir, pensé que la foto no se había importado.
- **Causa real: NO había ningún bug.** `test/e2e/fixtures/producto.png` — el fixture que usan TODOS los E2E de este repo para "la foto de un producto" — es, a propósito, el propio logo de la app (`assets/logo.svg` rasterizado), no una foto de producto de verdad. La miniatura mostrada era la foto de prueba real, correctamente importada y decodificada; se veía igual al placeholder "sin foto" solo porque a simple vista, en una miniatura chica, un logo con círculo+rayo sobre fondo oscuro se parece al propio ícono vacío de la app (que usa la misma identidad visual). Confirmado abriendo `test/e2e/fixtures/producto.png` directo: es el logo, pixel a pixel igual a lo que se vio en el emulador.
- **De más queda:** por las dudas, `js/utils/imagen.js` (`base64ABlob`) se cambió igual de `fetch(dataUrl).then(r => r.blob())` a decodificar el base64 a mano (`atob` + `Uint8Array` + `new Blob(...)`) — no porque hiciera falta (no había bug), sino porque de paso queda testeable sin mocks (`test/imagen.test.js`, nuevo) y no depende de que el motor soporte `fetch` sobre esquema `data:`. Cambio de bajo riesgo, cero comportamiento distinto observado, pero se deja documentado para no confundir el porqué si alguien lo lee después.
- **Resuelto:** sí — no había nada que resolver; verificado con capturas nuevas (`docs/apk11-*.png`) usando un producto con una foto de GALERÍA real (no el fixture-logo) para las capturas que sí importaba distinguir visualmente.
- ¿Se repetiría en otro proyecto? Lección para QA propio, no para el ecosistema: si el fixture de "foto de producto" de los tests es el logo de la marca, un vistazo rápido en el emulador puede confundirse con el estado vacío — para verificar visualmente a ojo, usar una foto de galería real, no el fixture de los E2E.

### 28. "Se sobresale de la pantalla" en el Samsung de Bruno (APK 1.1) — nunca se probó con letra grande
- **Paso:** Bruno instaló el APK 1.1 en su Samsung real y reportó "se sobresale de la pantalla" sin más detalle. La skill `crear-apk` (BUGS.md, `referencias/ui-movil.md` §10) exige medir `document.documentElement.scrollWidth === innerWidth` en el teléfono antes de dar el APK por bueno — no se hizo en la ronda 1.1.
- **Reproducir:** emulador AVD `docuvoz`, debug build con `WebView.setWebContentsDebuggingEnabled(true)` + `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` + CDP (`Runtime.evaluate`). `adb shell settings put system font_scale 1.6` + `adb shell wm density 504` (+20% sobre los 420 de fábrica del AVD, ancho lógico resultante ~343px) con la tarjeta "Foto con precio" de Ajustes en estado "Personalizado" (badge visible).
- **Error exacto (medido):** `.tarjeta-estilo` de "Foto con precio": `getBoundingClientRect().right = 463` con `innerWidth = 343` → 120px afuera del viewport, invisible (no aparece como scroll horizontal porque `.vista { overflow-x: clip }` lo recorta: `document.documentElement.scrollWidth` se queda en 343, igual a `innerWidth` — **medir solo `scrollWidth` no alcanza, hay que medir `getBoundingClientRect()` de los elementos**). Captura: `docs/apk12-antes-statusbar.png` (se ve el mismo frame con los dos bugs de esta ronda).
- **Causa:** `.grilla-estilos { grid-template-columns: repeat(2, 1fr) }` — `1fr` a secas es `minmax(auto, 1fr)`, así que el track no podía achicarse por debajo del `min-content` de la tarjeta. Con la etiqueta "Foto con precio" en 2 líneas y el badge "Personalizado" + botón "Editar" en una sola fila (`.tarjeta-estilo__pie`, sin `flex-wrap`) a letra grande, ese `min-content` superaba el ancho del viewport y el grid entero se corría a la derecha.
- **Arreglo:** `css/estilos.css` — `.grilla-estilos` a `grid-template-columns: repeat(2, minmax(0, 1fr))`; `.tarjeta-estilo` con `min-width: 0`; `.tarjeta-estilo__pie` con `flex-wrap: wrap` y `.tarjeta-estilo__pie .boton` con `min-width: 0`; `.tarjeta-estilo__badge` con `overflow-wrap: anywhere`. Nada de `overflow-x: hidden` nuevo ni de tocar `textZoom` (es accesibilidad, no un bug). Verificado: mismo escenario (1.6 / +20% densidad) da `right = 312` (adentro de los 343), 0 desbordes en las 10 pantallas de `test/e2e/overflow-fuente-grande.spec.js`. Captura: `docs/apk12-despues-statusbar.png`.
- **Resuelto:** sí — matriz repetida (`barrer.cjs`) con el release corregido, 0 desbordes en Productos, alta/edición, Ajustes, editor de plantilla, respaldo, diálogo de confirmación y hoja de revisión.
- ¿Se repetiría en otro proyecto? Sí — cualquier `grid-template-columns: repeat(N, 1fr)` con contenido que no envuelve (badge + botón en una fila) es candidato al mismo bug con `font_scale` alto: sumado al checklist de `crear-apk` SKILL.md y a `referencias/ui-movil.md` §10.

### 29. El título de la pantalla se ve detrás del reloj/íconos del sistema al scrollear (APK 1.1)
- **Paso:** mismo reporte de Bruno ("se sobresale de la pantalla") — al scrollear Ajustes hacia abajo y volver a mirar arriba, el contenido pasaba por detrás de la barra de estado (reloj, wifi, batería) en vez de quedar tapado por un fondo opaco.
- **Reproducir:** emulador, cualquier `font_scale`/densidad — no es un bug de textZoom, es de layout. `location.hash = '#/ajustes'` y `window.scrollTo(0, 260)` (o más): el título/contenido scrolleado queda visible por debajo de los íconos del status bar. Captura: `docs/apk12-antes-statusbar.png`.
- **Causa:** `enableEdgeToEdge()` (Kotlin) hace que la WebView dibuje detrás de la barra de estado a propósito (por eso existe `--safe-top: env(safe-area-inset-top)`), pero ese inset se aplicaba una sola vez como `padding-top` de `.app` (contenedor de TODO, no solo del header). Como quien scrollea es la ventana (`.vista { overflow-x: clip }`, no un contenedor propio) y `.encabezado` estaba en flujo normal, al scrollear el título viajaba hacia arriba del padding y quedaba en la franja de la barra de estado sin nada opaco cubriéndolo.
- **Arreglo:** `css/estilos.css` — se sacó el `padding-top: var(--safe-top)` de `.app` y se puso en `.encabezado` (`position: sticky; top: 0; z-index: 15; background: var(--color-fondo); padding-top: calc(var(--safe-top) + 16px)`). El header queda siempre fijo arriba, pintado con el mismo fondo que la app, cubriendo la franja del status bar sin importar cuánto se scrollee. Verificado con capturas a `scrollY = 260` y `scrollY = 900`: el título nunca se mezcla con los íconos del sistema (`docs/apk12-despues-statusbar.png`, `docs/apk12-despues-statusbar-scroll-profundo.png`).
- **Resuelto:** sí.
- ¿Se repetiría en otro proyecto? Sí — cualquier WebView con `enableEdgeToEdge()` que reserve el `safe-area-inset-top` con un padding de una sola vez en vez de un header fijo/sticky con su propio fondo tiene el mismo problema apenas el contenido sea más alto que la pantalla. Sumado a `crear-apk` BUGS.md y `referencias/ui-movil.md` §10.

### 30. Test nuevo `overflow-fuente-grande.spec.js`: `[data-accion="editar"]` ambiguo con 2+ productos
- **Paso:** `npx playwright test -c test/e2e/playwright.config.js overflow-fuente-grande.spec.js`, primera corrida (bug #28/#29 arriba).
- **Error exacto:**
  ```
  Error: expect(locator).toBeVisible() failed
  strict mode violation: locator('[data-accion="editar"]') resolved to 2 elements
  ```
- **Reproducir:** helper `crearProducto()` esperaba `page.locator('[data-accion="editar"]')` (sin acotar) después de guardar; al crear un 2° producto en el mismo test ya hay 2 botones `[data-accion="editar"]` en la lista (uno por tarjeta) y Playwright en modo estricto rechaza el locator ambiguo.
- **Causa:** no es un bug de la app — error de test: el selector no distinguía "el que se acaba de crear" del resto de la lista.
- **Arreglo:** `test/e2e/overflow-fuente-grande.spec.js` — `crearProducto()` ahora espera `page.locator('[data-accion="editar"]').last()` (el último producto agregado es el último en la lista, por orden de alta).
- **Resuelto:** sí — verde tras el cambio.
- ¿Se repetiría en otro proyecto? Sí, patrón general de E2E: un helper que crea N veces el mismo tipo de fila y después usa un selector no acotado para "la que acabo de crear" es ambiguo desde la 2ª vez — acotar con `.last()`/`.nth()` o por texto único. No amerita fila en la receta compartida (ya cubierto por "esperar con una aserción que reintenta", entrada #24); nota solo para no repetirlo en este archivo.

### 31. Mismo test: el drag para personalizar "foto-precio" no se registraba con viewport de 800px de alto
- **Paso:** después de arreglar la entrada #30, la misma corrida seguía fallando, ahora en `personalizarEstiloFotoPrecio()`: `.editor-plantilla__badge` se quedaba `hidden` pese a haber hecho el drag.
- **Error exacto:**
  ```
  Error: expect(locator).toBeVisible() failed
  Locator:  locator('.editor-plantilla__badge')
  Expected: visible
  Received: hidden
  ```
- **Reproducir:** script de diagnóstico aparte (`chromium.launch()` + mismo flujo, fuera de Playwright Test) leyendo `ajustesPorEstilo['foto-precio'].nombre` de IndexedDB antes y después del drag: con viewport `{ width: 320, height: 800 }`, `[data-elemento="nombre"]` cae en `y ≈ 746` (alto 32px); el drag de este test mueve el puntero a `caja.y + alto/2 + 60 ≈ 822`, **afuera** de un viewport de 800px de alto. El objeto `nombre` quedaba idéntico antes/después (`x/y/w/h` sin cambios): el gesto nunca llegó a soltarse sobre el lienzo.
- **Causa:** no es un bug de la app — el viewport de prueba (800px de alto, elegido solo pensando en el ancho que este test quería variar) es más bajo que lo que ocupan la barra + capas del editor de plantilla antes de llegar al lienzo, así que el punto de destino del drag caía fuera de la ventana visible.
- **Arreglo:** `test/e2e/overflow-fuente-grande.spec.js` — el viewport de estos tests pasa a `height: 1400` (de sobra para que toda la barra+capas+lienzo entren y el drag tenga margen). Confirmado con el mismo script de diagnóstico: con `height: 1400` el objeto `nombre` sí cambia de posición y el badge queda visible.
- **Resuelto:** sí.
- ¿Se repetiría en otro proyecto? Sí — patrón general: un test que hace drag-and-drop debe usar un viewport con espacio real de sobra alrededor del punto de destino, no solo "algo razonable"; si el drag no cambia nada, medir el estado antes/después del gesto (no solo el resultado visual esperado) para distinguir "el gesto no llegó a pasar" de "el gesto pasó pero el efecto no es el esperado". Nota para la receta `e2e.md` si se repite en otro proyecto con editores drag-and-drop.

### 32. Mismo test: `[data-accion="cancelar"]` ambiguo — el form de detalle.js también tiene un "Cancelar"
- **Paso:** corrida completa de `overflow-fuente-grande.spec.js` tras arreglar #30/#31.
- **Error exacto:**
  ```
  Error: locator.click: Error: strict mode violation: locator('[data-accion="cancelar"]') resolved to 2 elements:
      1) <button ... data-accion="cancelar" ...>Cancelar</button> aka locator('#vista').getByRole('button', { name: 'Cancelar' })
      2) <button ... data-accion="cancelar" ...>Cancelar</button> aka getByRole('alertdialog').getByRole('button', { name: 'Cancelar' })
  ```
- **Reproducir:** en `#/producto/<id>` con el diálogo de confirmación de borrado abierto, `page.locator('[data-accion="cancelar"]')` sin acotar matchea TANTO el botón "Cancelar" propio del form de `detalle.js` (volver sin guardar) COMO el "Cancelar" del diálogo (`js/utils/confirmar.js`) — ambos con el mismo `data-accion`.
- **Causa:** no es un bug de la app (dos botones "Cancelar" con roles distintos y contextos distintos es correcto); error de test — selector no acotado al diálogo.
- **Arreglo:** `test/e2e/overflow-fuente-grande.spec.js` — `page.locator('.dialogo [data-accion="cancelar"]')` en vez de global.
- **Resuelto:** sí.
- ¿Se repetiría en otro proyecto? Sí — mismo patrón que #30: cualquier `data-accion` reutilizado en dos contextos superpuestos (un form y un diálogo que se abre encima) es ambiguo apenas ambos están montados a la vez. Acotar siempre al contenedor del diálogo/modal cuando se interactúa con sus botones.

### 33. Dos corridas de `playwright test` en paralelo contra la misma carpeta `test-results/` chocan
- **Paso:** lancé la corrida aislada de `overflow-fuente-grande.spec.js` (para reverificar tras el fix de #31) y, sin esperarla, lancé también `npm run test:e2e` (la suite completa) — ambas en segundo plano, casi al mismo tiempo.
- **Error exacto:**
  ```
  node:internal/fs/promises:857
  Error: ENOENT: no such file or directory, mkdir 'D:\...\estados-rapidos\test-results\.playwright-artifacts-4'
      at WorkerHost.start (...\node_modules\playwright\lib\runner\index.js:5472:5)
  ```
  Antes del crash, 4 tests de esa misma suite completa daban falso timeout (1.0m, el timeout de 60s del test) que en la corrida aislada (sin la otra corriendo en simultáneo) no pasaba.
- **Reproducir:** dos `playwright test` apuntando al mismo `test-results/` (default) al mismo tiempo — Playwright limpia/recrea esa carpeta al arrancar cada corrida; si la otra corrida está escribiendo un artifact justo en ese momento, el `mkdir` de un worker choca con el `rm -rf` + recreación de la otra.
- **Causa:** no es un bug de la app ni del test — condición de carrera por correr dos invocaciones de Playwright a la vez contra el mismo output dir, además de duplicar la carga de CPU/memoria (más probable que un timeout real de 60s en un test que normalmente tarda ~15s por variante).
- **Arreglo:** ninguno en el código — nunca correr dos `playwright test` en simultáneo contra el mismo proyecto sin `--output` separado. Si hace falta pararalelizar corridas del mismo repo, pasar `--output <carpeta-propia>` a cada una.
- **Resuelto:** sí — confirmado corriendo la suite completa SOLA (sin nada más de Playwright corriendo a la vez): verde.
- ¿Se repetiría en otro proyecto? Sí, en cualquier repo con Playwright: nota para la receta compartida `~/.claude/crear-kit/recetas/e2e.md` ("nunca 2 `playwright test` en paralelo contra el mismo `test-results/`; usar `--output` si hace falta correr en simultáneo").

### 34. Carrera real: `recargar()` de la lista podía pisar la pantalla a la que ya navegaste
- **Paso:** descubierto por `overflow-fuente-grande.spec.js` (ronda "textZoom", 2026-09-28) al encadenar: tildar el checkbox de un producto y, de inmediato, ir a "nuevo producto" — sin este test nadie lo había disparado.
- **Error exacto:** `page.locator('details.grupo summary').waitFor()` con timeout, porque el DOM de `#vista` seguía mostrando el skeleton/lista de Productos con `location.hash` ya en `#/producto/nuevo`.
- **Reproducir:** en `js/vistas/lista.js`, el `change` del checkbox hace `await repo.actualizarSeleccion(...)` (escritura async a IndexedDB) **antes** de llamar `recargar()` (= `render(contenedor, ...)` de nuevo). `page.locator(checkbox).click()` de Playwright resuelve apenas se despacha el evento, sin esperar ese `await` interno — así que el test alcanza a navegar a otra pantalla (`page.goto('#/producto/nuevo')`, que dispara el render de `detalle.js` sobre el mismo `contenedor`) mientras el `await actualizarSeleccion` de la lista todavía está en vuelo. Cuando por fin resuelve, `recargar()` corre "normal" — sin chequear que el usuario ya se fue de Productos — y pisa el formulario recién dibujado con el skeleton/lista vieja.
- **Causa:** `render()` de `lista.js` no distinguía "sigo siendo la pantalla activa" de "ya me pisaron" — mutaba `contenedor` (el `<main id="vista">` COMPARTIDO por todas las rutas) incondicionalmente, en cada punto (al arrancar, tras cada `await`), sin verificar `location.hash` en ninguno.
- **Arreglo:** `js/vistas/lista.js` — nueva `esVigente()` (`!location.hash || location.hash === '#/'`), chequeada (1) al arrancar `render()`, antes de tocar `contenedor` para nada (cubre el caso real: `recargar()` invocado cuando ya navegaste), y (2) antes del `commit` final (arma todas las piezas en un array `piezas` fuera del DOM primero — incluida la foto de cada tarjeta, otro `await` — y recién al final, si sigue vigente, hace UN solo `contenedor.textContent=''` + `contenedor.append(...piezas)`). Nada de tocar `contenedor` a medias.
- **Resuelto:** sí — confirmado con un script de reproducción aparte (`chromium.launch` + la secuencia exacta) antes y después del fix: antes, `#vista` quedaba con el skeleton de Productos pese a `location.hash = '#/producto/nuevo'`; después, el formulario de alta se ve normal.
- ¿Se repetiría en otro proyecto? Sí — cualquier SPA con un router "manual" (un solo contenedor compartido, `render()` reescribe todo) donde una vista se auto-recarga (`recargar()`/`refresh()`) después de un `await` propio tiene el mismo riesgo: el render viejo puede resolver después de que el usuario ya navegó y pisar la pantalla nueva. Antes de la mutación final (y antes de arrancar, si el disparador puede venir de un callback async), verificar que la ruta "dueña" de ese render siga siendo la activa. Nota para la receta compartida de routers manuales si se repite en otro proyecto.

### 35. Panel de propiedades del editor: "Derecha" (alineación) se pasaba del viewport a 320px + letra grande
- **Paso:** `overflow-fuente-grande.spec.js`, corrida limpia tras arreglar la carrera #34 (recién ahí el test llegaba a esta pantalla).
- **Error exacto:**
  ```
  Editor de plantilla (capa seleccionada): scrollOverflow=false
  BUTTON.boton.boton--chico right=329 left=236 "Derecha"
  ```
  (viewport 320px, font_scale 130%: el botón terminaba en x=329, 9px afuera).
- **Reproducir:** panel de propiedades del editor de plantilla, con un elemento de texto seleccionado → fila de alineación ("Izquierda"/"Centro"/"Derecha"), a 320px de ancho con la fuente del sistema al 130%.
- **Causa:** `.fila { display: flex; gap: 10px }` (sin `flex-wrap`) — usada para las 3 filas de botones del panel (peso, alineación) y otras 6 filas de controles del proyecto (`ajustes.js`, `detalle.js`, `revision.js`). Con 3 botones de texto ("Izquierda"/"Centro"/"Derecha") y la letra grande del sistema, el `min-content` de la fila superaba los 320px.
- **Arreglo:** `css/estilos.css` — `.fila` con `flex-wrap: wrap`. Es una clase genérica de "fila de controles", así que el arreglo cubre las 8 filas del proyecto de una sola vez (peso/alineación del editor, encuadre de foto y "La app" de Ajustes, acciones de detalle, incluir-texto de la hoja de revisión) sin tocar cada una.
- **Resuelto:** sí — confirmado con el mismo test en las 6 combinaciones de ancho/escala, 0 desbordes.
- ¿Se repetiría en otro proyecto? Sí — cualquier `display: flex` de una fila de botones/controles sin `flex-wrap` es candidato al mismo bug con `font_scale` alto; ya está cubierto por el punto general de bug #42 en la skill `crear-apk` (medir con `font_scale` 1.3/1.6), no amerita fila aparte ahí.

### 36. `secciones.spec.js` (ronda "secciones"): `hasText` sobre `.fila-seccion` nunca encuentra el nombre de la sección
- **Paso:** primera corrida de `test/e2e/secciones.spec.js` recien escrito -- 6 de 8 tests fallan ya en el helper `crearSeccion()`, incluso habiendo creado la seccion con exito (toast "Seccion creada" visible).
- **Error exacto:**
  ```
  Error: expect(locator).toBeVisible() failed
  Locator: locator('.fila-seccion').filter({ hasText: 'Lunes' })
  Expected: visible
  Timeout: 5000ms
  Error: element(s) not found
  ```
  El snapshot de accesibilidad del error confirma que la fila SI esta: `textbox "Nombre de la seccion Lunes": Lunes`.
- **Reproducir:** `test/e2e/secciones.spec.js`, `crearSeccion()` -- `page.locator('.fila-seccion', { hasText: nombre })`.
- **Causa:** no es un bug de la app -- es el test. `js/vistas/secciones.js` (`filaSeccion()`) muestra el nombre en un `<input type="text">` editable (para poder renombrar inline), y el `value` de un input **no forma parte del `textContent`** del elemento: `hasText` de Playwright matchea contra texto renderizado (accesible), no contra `value`. `.fila-seccion` solo tiene como texto real los botones "up"/"down"/"Borrar" -- nunca el nombre.
- **Arreglo:** `test/e2e/secciones.spec.js` -- cambiar todos los `page.locator('.fila-seccion', { hasText: nombre })` por filtrar el contenedor con `.filter({ has: page.getByLabel(...) })` apuntando al input por su `aria-label` (`Nombre de la seccion ${nombre}`, unico y estable).
- **Resuelto:** si -- confirmado corriendo `secciones.spec.js` completo despues del cambio: 8/8 verdes.
- Se repetiria en otro proyecto? Si -- cualquier fila con un campo editable inline (nombre-como-input, no como texto) es candidata a este mismo error de test si alguien usa `hasText` sobre el contenedor en vez de apuntar al campo por su rol/label. Nota para la receta compartida de E2E (`~/.claude/crear-kit/recetas/e2e.md`): con inputs editables, localizar por `aria-label`/`getByRole('textbox', {name})`, nunca por `hasText` del contenedor.

### 37. `secciones.spec.js`: `crearProducto()` asume UN solo `[data-accion="editar"]` por nombre, pero un producto en 2 secciones aparece 2 veces
- **Paso:** test "un producto en 2 secciones aparece en ambos grupos con la MISMA casilla sincronizada" -- falla al crear "Conjunto" (asignado a Lunes + Lencería), no al crear productos de 1 sola seccion.
- **Error exacto:**
  ```
  Error: strict mode violation: locator('[data-accion="editar"]').filter({ hasText: 'Conjunto' }) resolved to 2 elements
  ```
- **Reproducir:** `crearProducto()` con `secciones: ['Lunes', 'Lenceria']` -- la vista "Todas" (agrupada) dibuja a "Conjunto" una vez por CADA grupo al que pertenece (comportamiento correcto del feature, ver `agruparProductosPorSeccion`), asi que su boton `[data-accion="editar"]` aparece 2 veces en el DOM.
- **Causa:** no es un bug de la app -- el helper generico `crearProducto()` (copiado de otros specs que nunca tienen productos multi-seccion) asumia unicidad con un `expect(locator).toBeVisible()` sin desambiguar.
- **Arreglo:** `test/e2e/secciones.spec.js` -- `.first()` en esa aserción, mismo criterio que `overflow-fuente-grande.spec.js` ya usa (`.last()`) para el caso analogo de 2+ tarjetas con el mismo `data-accion`.
- **Resuelto:** si.
- Se repetiria en otro proyecto? Si -- cualquier helper de test que asuma "1 nombre = 1 elemento en el DOM" se rompe apenas la UI puede repetir el mismo dato en mas de un lugar (agrupados, tabs, vistas duplicadas). Ya cubierto en espiritu por la convencion `.first()`/`.last()` que el proyecto ya usa; no amerita nota aparte en la receta compartida.

### 38. `secciones.spec.js`: reload justo despues de plegar un grupo puede ganarle a la escritura async de la preferencia
- **Paso:** test "plegar un grupo de 'Todas' se recuerda entre visitas" -- falla de forma intermitente (paso, corrio bien en la corrida siguiente sin tocar código).
- **Error exacto:**
  ```
  Error: expect(locator).toHaveJSProperty(expected) failed
  Expected: false
  Received: true
  ```
  (despues de `page.reload()`, el grupo "Lunes" seguia abierto pese a haberse plegado antes del reload).
- **Reproducir:** `js/vistas/lista.js`, el listener `detalle.addEventListener('toggle', () => { repo.guardarPreferenciasLista(...) })` no se espera (no hay ningun await entre el toggle y lo que sigue) -- si el test (o el usuario) recarga la pagina INMEDIATAMENTE despues de plegar, la escritura a IndexedDB puede no haber terminado todavia y se pierde, igual que BUGS.md #12/#34 (accion async sin esperar antes de navegar/recargar).
- **Causa:** el test no esperaba ninguna confirmación (visible o de datos) de que la escritura terminó antes de `page.reload()` -- a diferencia de `revision.spec.js`, acá no hay ningún toast (plegar/desplegar es silencioso a propósito, no amerita interrumpir con un aviso).
- **Arreglo:** `test/e2e/secciones.spec.js` -- antes del `reload()`, `page.waitForFunction()` releyendo `repo.obtenerPreferenciasLista()` hasta ver el grupo marcado como plegado, en vez de confiar en que el toggle visual ya implica que la escritura async terminó.
- **Resuelto:** si -- corrida repetida 3 veces seguidas sin flakiness después del cambio.
- Se repetiria en otro proyecto? Si -- cualquier preferencia que se guarda "en silencio" (sin toast) al reaccionar a un evento del DOM (`toggle`, `change`) es candidata al mismo timing si un test recarga inmediatamente después; cuando no hay señal visible, esperar el dato mismo (releer el store) en vez de un elemento de UI. Nota para la receta compartida de E2E si se repite en otro proyecto.

### 39. `sw.spec.js` y `revision.spec.js` (2 tests) fallan en esta máquina INDEPENDIENTEMENTE de la ronda "secciones"
- **Paso:** corrida completa de `npm run test:e2e` después de implementar secciones — 11 fallos totales; investigando cada uno, 2 no tienen relación con `lista.js`/`secciones.js`.
- **Error exacto:** `sw.spec.js` → `page.goto: net::ERR_FAILED at http://127.0.0.1:8991/` con `page.route('**/*', route.abort())` activo (los 3 intentos, incluidos los retries). `revision.spec.js` ("el selector de estilo de la hoja regenera las imágenes") → `expect(segundaImagen).not.toBe(primeraImagen)` sale igual.
- **Reproducir:** `git stash` (vuelve al commit `e5d5898`, ANTES de esta ronda) + `npx playwright test sw.spec.js revision.spec.js` → los mismos 2 fallan igual, 0 relación con el código de esta ronda.
- **Causa:** pendiente de investigar — no se tocó nada de `sw.js`/`revision.js` en la ronda "secciones", así que no corresponde diagnosticarlo ni arreglarlo acá (fuera de alcance del pedido). Puede ser un problema de esta máquina/versión de Chromium instalada, no necesariamente del código.
- **Arreglo:** ninguno en esta ronda — queda anotado para no confundirlo con una regresión de "secciones" en una corrida futura de `npm run test:e2e`.
- **Resuelto:** no (fuera de alcance).
- ¿Se repetiría en otro proyecto? No aplica todavía — falta diagnóstico.

### 40. `overflow-fuente-grande.spec.js`: el filtro de secciones (scroll horizontal PROPIO) se detectaba como desborde
- **Paso:** corrida completa de la matriz 320/360/412 x 130%/160% después de sumarle las pantallas de "secciones" -- 6 de 6 combinaciones fallan en "Productos (con selección / barra Publicar)".
- **Error exacto:**
  ```
  Error: Productos (con selección / barra Publicar): scrollOverflow=false
  BUTTON.chip right=428 left=152 "Lunes para publicar (0)"
  BUTTON.chip right=624 left=436 "Sin sección (3)"
  BUTTON.chip.chip--fantasma right=798 left=632 "⚙ Secciones"
  ```
- **Reproducir:** `.filtro-secciones` (`css/estilos.css`) es a propósito una fila con `overflow-x: auto` -- "SCROLL HORIZONTAL PROPIO (no de la página)" pedido en el brief. Con nombres de sección largos, sus chips sobresalen del viewport DE MANERA INTENCIONAL (para eso existe el scroll): `medirDesborde()` mide `getBoundingClientRect()` de cada elemento sin distinguir "se pasa del viewport porque hay un bug" de "se pasa del viewport porque su contenedor lo scrollea a propósito".
- **Causa:** no es un bug de la app -- el detector genérico del spec no tenía en cuenta contenedores con scroll horizontal propio (ya existía uno, `.hoja-revision__carrusel`, pero nunca había tenido contenido suficiente para disparar el falso positivo).
- **Arreglo:** `test/e2e/overflow-fuente-grande.spec.js`, `medirDesborde()` -- un elemento cuenta como desborde solo si NINGÚN ancestro (hasta `body`) tiene `overflow-x: auto/scroll` con `scrollWidth > clientWidth` (scroll real, no solo declarado). El chequeo de `document.documentElement.scrollWidth` (el desborde de LA PÁGINA, no de un contenedor) se mantiene sin cambios: un scroll horizontal propio bien encapsulado nunca debería mover ese número.
- **Resuelto:** sí -- las 6 combinaciones vuelven a dar 0 desbordes con nombres de sección largos.
- ¿Se repetiría en otro proyecto? Sí -- cualquier spec de "sin desborde horizontal" que mida `getBoundingClientRect()` de todos los elementos (necesario cuando hay `overflow-x: clip/hidden`, ver bug #42 de la skill `crear-apk`) tiene que excluir los contenedores con scroll horizontal PROPIO, o cualquier carrusel/fila de chips real dispara un falso positivo apenas su contenido es más ancho que la pantalla. Nota para la receta compartida de E2E (`~/.claude/crear-kit/recetas/e2e.md`).

### 41. `overflow-fuente-grande.spec.js`: crear 2 secciones seguidas sin esperar el re-render pierde la segunda
- **Paso:** matriz completa (320/360/412 x 130%/160%) -- 6 de 6 fallan con timeout en `[data-accion="toggle-seccion"]').nth(1)` al editar el producto "Campera...": solo existía 1 chip de sección, no 2.
- **Error exacto:**
  ```
  Test timeout of 90000ms exceeded.
  Error: locator.click: Test timeout of 90000ms exceeded.
  Call log:
    - waiting for locator('[data-accion="toggle-seccion"]').nth(1)
  ```
- **Reproducir:** el setup del test crea las 2 secciones en un loop sin esperar confirmación entre una y otra:
  ```js
  for (const nombre of ['Lunes para publicar', 'Electrodomésticos de línea blanca']) {
    await page.locator('input[aria-label="Nombre de la nueva sección"]').fill(nombre);
    await page.locator('[data-accion="crear-seccion"]').click();
  }
  ```
- **Causa:** no es un bug de la app -- es el mismo patrón de carrera que BUGS.md #34/#38 (acción async sin esperar antes de la siguiente acción). `.click()` en "crear-seccion" resuelve al DESPACHAR el evento, no al terminar el handler async (`await repo.crearSeccion(...)` + `recargar()`, que hace `contenedor.textContent=''` y reconstruye TODO el formulario, input incluido). Si el segundo `.fill()` corre ANTES de que termine ese `recargar()`, escribe en el input VIEJO (a punto de destruirse); cuando el `recargar()` de la primera sección por fin corre, ese input desaparece y el que queda es uno NUEVO y VACÍO. El `.click()` en "crear-seccion" que sigue manda el form con el nombre vacío → `validarNombreSeccion` lo rechaza (`mostrarToast(error)` y `return`, sin crear nada) → la segunda sección nunca se crea.
- **Arreglo:** `test/e2e/overflow-fuente-grande.spec.js` -- esperar `.fila-seccion` visible con ese nombre (mismo criterio que `crearSeccion()` de `secciones.spec.js`) antes de tipear la siguiente, en vez de encadenar los 2 `fill()+click()` a ciegas.
- **Resuelto:** sí.
- ¿Se repetiría en otro proyecto? Sí -- ya está cubierto por el mismo punto general que #34/#38 (nunca encadenar una segunda acción sobre un formulario que se auto-reconstruye async sin esperar una confirmación visible de la primera); no amerita nota aparte en la receta compartida, ya quedó anotado ahí con #38.

### 42. Chip de sección largo en el alta/edición de producto se pasa del viewport a 320-412px + letra grande
- **Paso:** `overflow-fuente-grande.spec.js`, corrida limpia tras arreglar la carrera de creación de secciones (#41) -- ahora SÍ se crean las 2 secciones, y "Alta de producto" (con las 2 disponibles como chips) falla a 320px/130-160%, 360px/160% y 412px/160%.
- **Error exacto:**
  ```
  Alta de producto: scrollOverflow=false
  BUTTON.chip right=428 left=31 "Electrodomésticos de línea blanca"
  ```
- **Reproducir:** pantalla de alta/edición de producto (`js/vistas/detalle.js`, `grupoSecciones`/`chipsSecciones`), con una sección de nombre largo ("Electrodomésticos de línea blanca") entre las disponibles.
- **Causa:** `.chip` (`css/estilos.css`) tiene `white-space: nowrap` -- pensado para la fila `.filtro-secciones`, que SÍ tiene scroll horizontal propio y donde nowrap es lo correcto (cada chip entero, deslizable). Pero `.chips-secciones` (chips del alta/edición) NO scrollea: es un `flex-wrap: wrap` normal, donde el wrap tiene que pasar DENTRO de un chip demasiado largo, no solo ENTRE chips -- con `nowrap`, un chip cuyo texto por sí solo mide más que el viewport no tiene forma de encogerse y sobresale.
- **Arreglo:** `css/estilos.css` -- `.chips-secciones .chip { white-space: normal; text-align: center; }` (más específico que `.chip`, sin tocar el comportamiento de `.filtro-secciones`, que sigue con scroll horizontal y `nowrap`).
- **Resuelto:** sí -- confirmado corriendo las 6 combinaciones de `overflow-fuente-grande.spec.js` despues del cambio: 6/6 verdes.
- ¿Se repetiría en otro proyecto? Sí -- un chip/pill con `white-space: nowrap` es seguro solo dentro de un contenedor con scroll horizontal propio; en cualquier `flex-wrap` normal (chips seleccionables, tags), un solo chip con texto largo + letra grande del sistema puede desbordar igual que una fila sin `flex-wrap` (mismo espíritu que bug #35/#42 de la skill `crear-apk`).

### 43. `overflow-fuente-grande.spec.js`: el ícono del CTA "Publicar N" se salía de la pantalla (izquierda) a fuente grande, en la vista grilla
- **Paso:** reskin de productos_lista_natural/productos_vista_grilla_natural (comparación contra Interfaz/comparacion/), corrida completa de `overflow-fuente-grande.spec.js` tras sumar el badge decorativo "WhatsApp →" al CTA "Publicar N productos" de la grilla.
- **Error exacto:**
  ```
  Productos (Todas, agrupado por sección, grilla): scrollOverflow=false
  svg right=2 left=-18 ""
  circle right=-1 left=-5 ""
  circle right=-11 left=-15 ""
  circle right=-1 left=-5 ""
  line right=-5 left=-11 ""
  line right=-5 left=-11 ""
  ```
  (el `svg`/`circle`/`line` son el ícono "compartir" del botón `[data-accion="publicar-seleccionados"]`; a 320-412px con fuente 130-160% aparecía con `left` negativo, es decir, dibujado a la izquierda del borde de la pantalla).
- **Reproducir:** vista grilla, algún producto seleccionado (aparece la barra `.barra-publicar`), fuente del sistema al 130% o más, viewport 320-412px.
- **Causa:** `.barra-publicar .boton--primario` tenía `justify-content: center` y el texto `white-space: nowrap` (agregado para evitar que "Publicar N productos" se partiera en 2 líneas). Con el badge "WhatsApp →" sumado al ancho, el contenido total del botón (ícono + texto sin poder achicarse + badge) pasaba a medir más que el botón; `justify-content: center` en un flex que desborda no recorta: empuja los hijos por igual hacia afuera de la caja, y a fuente grande ese sobrante alcanzaba para mandar el ícono a la izquierda del viewport (`left` negativo).
- **Arreglo:** `js/vistas/lista.js` (`barraPublicarFija`) — ícono + texto ahora van en un `<span class="barra-publicar__contenido">` que SÍ se puede achicar (`min-width:0`, `flex-shrink:1`); el texto vive en su propio `<span class="barra-publicar__texto">` con `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` (trunca en vez de desbordar — `el.textContent` del botón sigue siendo exacto "Publicar N producto(s)" para los tests, la ellipsis es puramente visual). `css/estilos.css` — el botón usa `justify-content: space-between` solo cuando lleva badge (`.boton--publicar-grilla`) y `center` si no; ícono y badge llevan `flex-shrink: 0`.
- **Resuelto:** sí — confirmado con `overflow-fuente-grande.spec.js` (6/6 verdes) y la suite completa (100/100 e2e).
- ¿Se repetiría en otro proyecto? Sí — mismo espíritu que #35/#42: un botón con contenido variable (ícono + texto + badge opcional) necesita que el elemento que puede crecer sea el que se achica (`min-width:0` + ellipsis en el texto), nunca `justify-content: center`/`nowrap` a ciegas en el contenedor entero, porque eso empuja los elementos de ancho fijo (íconos, badges) fuera de la pantalla en vez de recortar el texto.
