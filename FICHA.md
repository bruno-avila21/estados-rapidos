# Ficha — estados-rapidos

> Lo que el código no cuenta. La zona **AUTO** la regenera `node bin/ficha.js` (desde
> `Agentes/centro`); el resto lo escribís vos y el generador no lo pisa.
>
> **Regla:** acá van *nombres* de variables y *de dónde* se obtienen. Nunca un valor.
> Por eso esta ficha se puede commitear y un agente la puede leer entera.

<!-- AUTO:inicio -->
## Cómo está hecho

| Dato | Valor |
| --- | --- |
| Stack | HTML + CSS + JS (módulos ES), sin build ni dependencias de runtime |
| Repo | https://github.com/bruno-avila21/estados-rapidos |
| Despliegue configurado | GitHub Pages, rama `main`, raíz `/` |
| Puerto (dev local) | 8080 (`node scripts/servir.js`) |
<!-- AUTO:fin -->

## Variables
| Variable | De dónde se saca | Estado |
| --- | --- | --- |
| `(ninguna)` | — | no hay backend ni `.env`: todo el dato es local al navegador (IndexedDB) |

## Dónde está subido

| Qué | URL | Cuenta / proveedor |
| --- | --- | --- |
| Producción | https://bruno-avila21.github.io/estados-rapidos/ | GitHub Pages, cuenta `bruno-avila21` |
| Prueba / staging | — | no aplica (sin build; `main` es lo que se ve) |

## Contexto

| Dato | Valor |
| --- | --- |
| Cliente | Bruno (uso propio, un solo negocio) |
| Estado | producción |
| Qué hace | Arma y comparte el estado de WhatsApp de un producto (foto + nombre + precio sobre una plantilla propia) en 3 segundos, sin automatizar WhatsApp |
| No tocar | Los datos de producto (fotos, nombres, precios) NUNCA van al repo — viven solo en el IndexedDB de cada instalación. El repo es público (decisión de Bruno, mismo caso que `cv`): revisar antes de commitear que no se cuele nada de las capturas de `docs/` con datos reales si algún día dejan de ser de prueba |

## APK — 2026-09-28
- Paquete: `com.estadosrapidos.app`. APK autónomo: la web va adentro (`assets/`, servida por `https://appassets.androidplatform.net/`), anda sin internet (sin permiso INTERNET) y no depende de ningún hosting. Se reparte pasando el `.apk` por WhatsApp.
- Compartir a WhatsApp (varias imágenes juntas), elegir foto (galería/cámara) y guardar el respaldo `.json` pasan por puentes nativos (`movil/app/src/main/java/com/estadosrapidos/app/PuenteArchivos.kt`, objeto JS `Android`): el WebView no tiene `navigator.share` con archivos ni `<a download>` confiable.
- Firma: `D:\Proyectos_Propios\Agentes\llaves\estados-rapidos.jks` + `estados-rapidos.credenciales`, junto a las demás llaves y **fuera del repo**. Sin esa llave no se puede instalar una versión nueva encima (habría que desinstalar y se pierden los datos). Respaldala en el gestor de contraseñas.
- Sin auto-actualización: cada versión es un APK nuevo que se reenvía; instalado encima conserva los datos.
- Build: `movil/build-apk.ps1` (JDK 17, arma `_sitio/` y compila release; aborta si detecta firma de debug). Verificado 2026-09-28: `estados-rapidos-1.0.apk`, 2.84 MB, DN `CN=Estados rapidos, O=Bruno Avila, C=AR` (no debug). Copiado a la raíz del proyecto y a `_INSTALABLES\estados-rapidos\` (hardlink vía `instalables.py`).
- Verificado en emulador (AVD `docuvoz`): arranca sin flash blanco, alta de producto con foto de galería, exportar respaldo (SAF, contenido JSON válido), Publicar con 3 productos abre el chooser de Android con las 3 imágenes + texto, Atrás cierra la hoja de revisión sin salir de la app y desde la lista sí sale. `apk-decompile.py` sobre el release: `debuggable=false`, `allowBackup=false`, 0 secretos, solo la Activity launcher exported (más el receiver estándar de AndroidX profileinstaller, protegido por permiso de firma). No verificado: cámara física (el emulador no tiene una) y medición de `scrollWidth` por WebView DevTools (exige un build debug aparte; visualmente, sin overflow en ninguna pantalla).

## APK 1.1 — 2026-09-28 (ronda "ajustes por estilo / barra responsive / miniaturas / compartir sin texto / perf JPEG / capas verticales")
- `versionCode` 2, `versionName` "1.1" (`movil/version.properties`). Build con `movil/build-apk.ps1`: `estados-rapidos-1.1.apk`, 2.86 MB, mismo DN de siempre (no debug).
- **Verificado en emulador (AVD `docuvoz`) instalando 1.1 ENCIMA de un 1.0 con datos cargados** (se reconstruyó un 1.0 "de verdad" desde el commit anterior a esta ronda vía `git stash`, ya que el 1.0 viejo lo había podado `instalables.py` — ver BUGS.md): se importó un respaldo de 10 productos en el 1.0 recién instalado, se subió a 1.1 con `adb install -r` y **los 10 productos siguieron ahí** (nombre/precio/descripción/foto), más un producto 11 agregado ya en 1.1 con una foto real de Galería.
- Editor por estilo: `#/ajustes` → tarjetas de "Foto con precio"/"Foto con descripción"/"Mi plantilla" con botón "Editar" (no en "Solo la foto"); "Editar" abre `#/plantilla?estilo=…`; mover un elemento marca "Personalizado" (badge en editor Y en la tarjeta de Ajustes) y "Restablecer" lo saca.
- Barra del editor (Deshacer/Rehacer/Acomodar/Restablecer) en grilla 2×2: entra sin recortarse.
- Capas del editor: lista vertical (nombre a lo ancho + ojo a la derecha, ≥48px de alto).
- Hoja de revisión: interruptor "Incluir texto" — apagado, compartido de 11 imágenes SIN texto (chooser "Sharing 11 images" sin ningún preview de texto), confirmado en pantalla.
- Miniaturas de Ajustes: sin ícono de imagen rota (skeleton "Generando…" hasta tener `src`).
- Capturas: `docs/apk11-ajustes-miniaturas.png`, `apk11-editor-barra.png`, `apk11-editor-badge-personalizado.png`, `apk11-editor-capas-verticales.png`, `apk11-hoja-incluir-texto.png` / `apk11-hoja-incluir-texto-off.png`, `apk11-chooser-11-sin-texto.png`.
- Performance ("publicar más rápido"): ver `PERF.md` — miniaturas de la hoja separadas del archivo final (270×480 JPEG) y archivos finales (1080×1920 JPEG 0.9) pre-generados en segundo plano apenas se abre la hoja; medido en Chromium real (no el emulador, ver limitación en PERF.md) miniaturas listas 8-10× más rápido que antes. En el emulador, compartir 11 imágenes sin texto: chooser abierto y dibujado en pantalla a ≤1.5s de tocar "Compartir" (con los finales ya pre-generados).
- No verificado en esta ronda: cronometrado en milisegundos del puente nativo puro (falta logcat con Bruno en un celu real).

## APK 1.3 — 2026-09-28 (ronda "secciones": etiquetas para agrupar/filtrar productos)
- `versionCode` 4, `versionName` "1.3" (`movil/version.properties`). Build con `movil/build-apk.ps1`: `estados-rapidos-1.3.apk`, 2.87 MB, mismo DN de siempre (no debug, `apksigner verify --print-certs` confirmado).
- **Verificado en emulador (AVD `docuvoz`) instalando 1.3 ENCIMA de un 1.2 "de verdad" con datos cargados** (reconstruido desde el commit anterior a esta ronda con `git worktree`, ya que el `.apk` viejo lo había podado `instalables.py` — mismo criterio que la ronda 1.1): se cargaron 3 productos con foto real (Remera básica $5.000, Pantalón jean $8.000, Gorra sin precio) en el 1.2 recién instalado, se subió a 1.3 con `adb install -r` y **los 3 productos siguieron ahí** con nombre/precio/foto intactos, agrupados solos bajo "Sin sección" (secciones nuevas para datos migrados, sin romper nada).
- Secciones probadas en el emulador: crear ("Lunes", "Lenceria") desde `#/secciones`, asignar "Remera básica" a "Lunes" desde el alta/edición (chips), filtro por sección con contador y botón "Publicar esta sección (N)" (independiente de las casillas), agrupado "Todas" con encabezados plegables y "Sin sección" al final, conmutador lista compacta/grilla (se recuerda).
- Matriz de letra del sistema (`adb shell settings put system font_scale 1.0/1.3/1.6`) en Productos (lista, grilla, filtrado) y en Gestión de secciones: sin desbordes visibles en ninguna combinación.
- Capturas: `docs/apk13-lista-compacta-secciones.png`, `apk13-grilla.png`, `apk13-filtro-seccion-publicar.png`, `apk13-gestion-secciones.png`.
- Performance (150 productos, CREAR-BRIEF.md): medido en Chromium real (proxy de escritorio, no el emulador — mismo criterio de limitación que PERF.md) con 150 productos + 8 secciones importados por respaldo: render de Productos en 36-47 ms (5 corridas), muy por debajo del objetivo de 300 ms. Fotos de las 150 tarjetas se traen todas en paralelo (`Promise.all`, antes era secuencial) y el checkbox ya no recompone toda la lista al tocarlo.
- Emulador restaurado al terminar: `font_scale` vuelto a 1.0, app desinstalada, fotos de prueba borradas de `/sdcard/Pictures`.
- No verificado en esta ronda: cronometrado real en el emulador/celu físico con exactamente 150 productos (la medición de performance fue en Chromium de escritorio, no en el WebView del APK).

## APK 1.4 — 2026-09-28 (fase final del reskin "Organic Minimalist": sw.spec.js diagnosticado, E2E de Fase 3 completos, logo/íconos en la paleta nueva)
- `versionCode` 5, `versionName` "1.4" (`movil/version.properties`). Build con `movil/build-apk.ps1`: `estados-rapidos-1.4.apk`, 2.91 MB.
- `sw.spec.js` (BUGS.md #10/#39/#45/#46/#47) diagnosticado y arreglado de verdad, no mitigado con timeouts: la carrera era entre `registration.active.state === 'activated'` (flag JS) y que el proceso del navegador termine de enrutar la SIGUIENTE navegación a través del SW — arreglo determinístico en `test/e2e/sw.spec.js` (esperar `navigator.serviceWorker.controller` tras una navegación real con red). Con la causa resuelta, `sw.js` (v13→v14) recupera en `NUCLEO` las fuentes `newsreader-400`/`manrope-400`/`manrope-600` y `js/utils/iconos.js` que la Fase 1 había sacado del precache sin diagnóstico, más `js/utils/plataforma.js` (faltaba desde APK 1.1). Detalle completo en BUGS.md #50.
- 8 E2E nuevos de Fase 3 que faltaban: reordenar el carrusel de la hoja de revisión con los botones accesibles y con arrastre táctil real (`test/e2e/revision-reordenar.spec.js`), y el modal de editar precio + acciones de la grilla — válido, vacío, negativo con error, Escape, "Subir a Estado" sin alterar la selección (`test/e2e/grilla.spec.js`).
- `assets/logo.svg` recoloreado a la paleta "Organic Minimalist" (anillo verde ciprés + rayo umber, sin degradé), íconos PWA regenerados (`npm run iconos`, fondo alabastro `#fbf9f5`) y adaptive icon del APK (`movil/app/src/main/res/drawable/fondo_lanzador.xml` + `mipmap-*/ic_launcher.png`) recoloreado a verde ciprés plano, sin degradé.
- `npm test`: 163/163. `npm run test:e2e`: 100/100 (92 previos + 8 nuevos), sw.spec.js incluido y estable (5/5 corridas sueltas con `--retries=0`).
- **Verificado en emulador (AVD `docuvoz`) instalando 1.4 ENCIMA de un 1.3 "de verdad" con datos cargados** (reconstruido desde el commit `17db5e4` con `git worktree`, mismo criterio que rondas anteriores): se cargó 1 producto con foto real ("Veri", $1.234) en el 1.3 recién instalado, se subió a 1.4 con `adb install -r` y **el producto siguió ahí** con nombre/precio/foto intactos; la 1.4 abre con la identidad visual nueva (verde ciprés/oliva en modo oscuro, Newsreader/Manrope).
- Firma verificada con `apksigner verify --print-certs` sobre ambos APKs (1.4 y el 1.3 reconstruido): mismo DN (`CN=Estados rapidos, O=Bruno Avila, C=AR`) y mismo SHA-256 (`5d043d0f7642a77aa6469c3e9106780cfc57f97a97aa49da5c004efa0b27dfb4`) — misma llave. `aapt dump badging`: `versionCode='5' versionName='1.4'`.
- Emulador restaurado al terminar: app desinstalada, foto de prueba borrada de `/sdcard/Pictures`.
- No verificado en esta ronda: cámara física (limitación del emulador, ya conocida de rondas anteriores).
