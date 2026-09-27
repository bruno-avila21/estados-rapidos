# Bugs

Registro de fallos encontrados durante la construcción, con causa y arreglo (regla de cierre.md /
seguridad.md: nada se omite, lo no resuelto dice "pendiente: motivo"). Los 4 están resueltos.

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
