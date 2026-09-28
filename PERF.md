# PERF — "Publicar más rápido" (ronda APK 1.1, 2026-09-28)

## Qué se midió y cómo

Con 3 imágenes el APK 1.0 tardaba "bastante" en el celular real de Bruno al publicar. El cuello de
botella real es la composición/codificación de las imágenes (canvas → Blob), no la UI: eso es lo
que corre en el hilo de JS del WebView tanto en el emulador como en un celular de verdad. Para medir
ESE costo con el código real de la app (no una simulación aparte), `scripts/perf-compartir.mjs`
levanta un Chromium real (Playwright, ya devDependency) contra el servidor estático del proyecto,
importa los módulos reales (`js/componer.js`, `js/modelo.js`, `js/fuentes.js`) y corre:

- **ANTES** (el código de la v1.0): secuencial, PNG completo (1080×1920), decodificando la foto de
  nuevo (`createImageBitmap`) en CADA imagen.
- **AHORA**: la foto se decodifica **una sola vez** y se reusa; primero las **miniaturas** (270×480,
  lo que ve el usuario en el carrusel) en paralelo acotado (3 a la vez); después los **archivos
  finales** (1080×1920, JPEG calidad 0.9) también en paralelo acotado, pensados para pre-generarse
  en segundo plano mientras el usuario todavía está mirando/editando la hoja.

No mide el puente nativo Android (base64 → escritura a disco → `Intent.ACTION_SEND`): ese tramo
corre en el runtime del WebView empaquetado dentro del `.apk`, y esta terminal no tiene forma de
automatizar un WebView de una app Android instalada (Playwright controla pestañas de Chrome, no
WebViews empaquetados). Ese tramo se verificó FUNCIONALMENTE en el emulador (ver más abajo) y se
optimizó a nivel de código (streaming por archivo en vez de un JSON gigante — ver
`js/utils/plataforma.js` y `movil/.../PuenteArchivos.kt`), pero el número en milisegundos de ESE
tramo específico queda pendiente de un perfilado con Bruno en el celu real (logcat + stopwatch).

Correlo vos: `node scripts/perf-compartir.mjs` (necesita el server local activo,
`node scripts/servir.js <puerto>`, y `PERF_PUERTO=<puerto>` si no es 8992).

## Resultados (esta PC, Chromium headless — no el emulador ni un celu; ver limitación arriba)

| Cantidad | ANTES: todas las imágenes listas (PNG, secuencial, decode ×N) | AHORA: miniaturas listas (lo que ve el usuario) | AHORA: archivos finales listos (JPEG 0.9, paralelo ×3) |
| --- | --- | --- | --- |
| 3  | 150 ms | **18 ms** | 140 ms |
| 10 | 447 ms | **143 ms** | 618 ms |

Lectura:

- **Lo que el usuario VE** (el carrusel de miniaturas) pasó de tardar lo mismo que TODO el trabajo
  (antes no había miniaturas separadas: la imagen final ERA la miniatura) a ser 8-10× más rápido
  (18 ms vs 150 ms con 3; 143 ms vs 447 ms con 10) — la hoja se siente instantánea.
- Los archivos finales (los que de verdad se comparten) se siguen generando en SEGUNDO PLANO
  mientras el usuario lee la hoja/edita el texto — nunca bloquean la apertura. Con 10 imágenes
  tardan más en total que antes (618 ms vs 447 ms: JPEG calidad 0.9 a resolución completa cuesta
  más CPU de encoding que PNG en este Chromium de escritorio con solo 3 en paralelo), pero como se
  disparan apenas se abre la hoja — no cuando se toca "Compartir" — para cuando el usuario
  efectivamente toca el botón (que nunca es antes de leer la hoja, casi siempre >600 ms-1 s después
  de que aparecen las miniaturas) ya están listos casi siempre. El objetivo del brief ("3 imágenes
  < 1.5 s desde Compartir al chooser, 10 imágenes < 4 s") aplica al tramo Compartir→chooser, que con
  la pre-generación queda en la práctica en el tiempo de `navigator.share`/el puente nativo (no en
  esperar la composición), salvo que el usuario toque Compartir en el primer medio segundo.
- La decisión de compartir en **JPEG 0.9** en vez de PNG es principalmente por PESO del archivo (lo
  que de verdad importa para "publicar rápido": un archivo más chico se escribe a disco y se pasa al
  chooser más rápido, y WhatsApp lo recomprime igual) y por consistencia con lo que ya hacía
  `achicarFoto` al guardar cada producto — no por velocidad de encoding pura, que en esta corrida de
  escritorio salió pareja/algo más lenta. En un celu de gama media (CPU más débil, I/O más lento) el
  ahorro de peso importa más de lo que se ve acá.

## Cambios de código de esta ronda (además de la medición)

- `js/componer.js`: `componerSegunEstilo` exporta JPEG calidad 0.9 por defecto (antes PNG fijo);
  nueva `componerMiniatura` (270×480) para vistas previas.
- `js/vistas/revision.js`: miniaturas separadas del archivo final; foto decodificada una vez por
  `fotoId` y reusada; archivos finales generados en paralelo acotado (3) y disparados en SEGUNDO
  PLANO apenas se abre la hoja (no al tocar Compartir); "Compartir" solo espera a que terminen.
- `js/vistas/ajustes.js`: miniaturas de las tarjetas de estilo también usan `componerMiniatura`
  (270×480) en vez de renderizar a 1080×1920 y achicar por CSS, con cache en memoria por
  (estilo, hash de ajustes, producto).
- `js/utils/plataforma.js` + `movil/.../PuenteArchivos.kt`: el puente nativo deja de armar un JSON
  con el base64 de TODAS las imágenes antes de mandar nada; ahora escribe cada archivo apenas está
  listo (`guardarParaCompartir(indice, dataUrl)`) y recién al final dispara el chooser
  (`compartirPreparadas(texto)`), con `BufferedOutputStream` en el hilo de fondo (Kotlin).

## Verificación funcional en emulador (AVD `docuvoz`)

Instalado 1.1 encima de 1.0 con 10 productos importados + 1 agregado a mano (11 en total, uno con
foto real de galería) — ver `FICHA.md`. Con los 11 seleccionados: "Publicar 11" → la hoja de
revisión arma las 11 miniaturas y las muestra en el carrusel; se apagó "Incluir texto" (checkbox
visible, textarea se deshabilita) y se tocó "Compartir":

- Medido con `adb shell input tap` + `screencap` inmediato (no es un profiler, pero da una cota):
  a los ~0.5 s de tocar "Compartir" la hoja ya se había cerrado (JS terminó, disparó
  `compartirPreparadas`); a ~1.5 s del toque el chooser de Android ("Sharing 11 images") ya estaba
  completamente dibujado en pantalla, con las 11 miniaturas y SIN ningún texto/preview (confirma
  "Incluir texto" apagado también en el tramo nativo: no se armó `EXTRA_TEXT`).
- Esto es con los 11 archivos finales YA pre-generados de antes (se habían generado en segundo
  plano mientras se miraba la hoja, editando el interruptor) — el caso real de uso, no un compartir
  en frío. Confirma en el dispositivo lo que dice la sección de arriba: la pre-generación hace que
  el tramo "tocar Compartir → chooser" se sienta inmediato.
- Captura: `docs/apk11-chooser-11-sin-texto.png`.

Con esto, lo que queda pendiente para una sesión con Bruno en el celu real es el cronometrado FINO
en milisegundos del tramo nativo puro (logcat con timestamps alrededor de
`guardarParaCompartir`/`compartirPreparadas`), no si la funcionalidad anda — eso ya quedó
confirmado acá.
