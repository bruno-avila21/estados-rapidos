# CLAUDE.md — estados-rapidos

## Qué es
PWA para armar en 3 segundos el estado de WhatsApp de uno o varios productos: foto (+ opcionalmente
nombre y precio, según el estilo elegido) en 1080×1920, con **selección múltiple persistente** y una
**hoja de revisión** antes de compartir (carrusel de imágenes, descripción editable, selector de
estilo) que copia el texto al portapapeles y abre la hoja de compartir de Android (`navigator.share`,
uno o varios archivos juntos) para elegir WhatsApp → Mi estado. Sin backend, sin build, sin
dependencias de runtime. Todo el dato vive en el IndexedDB del celular de quien la usa — el repo es
público pero solo tiene código, nunca datos de producto.

Diez estilos de imagen (`js/modelo.js`, `ESTILOS_IMAGEN`; se eligen en la pantalla **Plantillas**
(`#/plantillas`: tarjetas con miniatura en vivo, estrella de favoritas y filtro Todas/Favoritas), con
override opcional por producto). Los 4 originales, configuraciones libres: **Solo la foto** (por
defecto, sin textos), **Foto con precio**, **Foto con descripción** (cada estado lleva su propio
texto aunque se publiquen varios juntos) y **Mi plantilla** (fondo PNG propio). Los 4 de Fase 4,
composiciones prediseñadas de geometría fija (`js/geometria-presets.js`, `PRESETS_COMPOSICION`,
elegibles desde la pantalla Plantillas): **Banner inferior** (franja sólida anclada
abajo), **Editorial** (marco con nombre/precio arriba), **Polaroid** (tarjeta blanca con foto
recortada y textos abajo) y **Story inmersiva** (scrim degradado sobre la foto a pantalla completa).
Más 2 presets replicados de diseños que entregó Bruno (2026-10-07): **Novedad** (foto a sangre,
scrim verde oscuro, pill arriba, nombre en dos renglones con el segundo en itálica verde, caja de
precio y llamado de WhatsApp) y **Ficha natural** (fondo crema, foto arriba con insignia de hoja,
nombre en mayúsculas, caja "Precio: $…" y "Escribime"); en estos dos también se mueven,
redimensionan y ocultan las piezas del diseño (pill, divisores, llamado de WhatsApp, insignia —
`ELEMENTOS_DECORATIVOS` en modelo.js, `resolverCajasDecorativas` en componer.js) — para revisarlos a ojo:
`node scripts/previa-presets.mjs <salida.jpg> <foto> novedad ficha-natural`.
Precio **opcional** en todos: vacío es válido ("Sin precio"), solo un negativo es error. Nombre,
precio y descripción comparten un solo **editor de plantilla** tipo inspector (pantalla "Plantilla",
se abre desde Ajustes): clic/toque selecciona un elemento sobre la vista previa, arrastrar mueve,
las manijas de las esquinas redimensionan, con panel de propiedades (tamaño, tipografía, color,
fondo/etiqueta, visible), capas, deshacer/rehacer y restablecer. Al arrastrar se ven las guías del
centro (se encienden y dicen "Centrado" al engancharse) y el elemento seleccionado trae un mini
menú flotante (tamaño, alineación, color, tipografía). El lienzo arranca **bloqueado** (deslizar
por encima hace scroll y no mueve nada): se edita después de tocar "Editar" o un texto de la
imagen: ahí el lienzo pasa a **pantalla completa** (sin scroll alrededor, con deshacer/rehacer a
mano) hasta tocar "Listo". Ajustes arranca con la **vista previa** del estado y "Cambiar"/"Editar";
el resto (encuadre, texto que acompaña, formato del precio, datos) va en bloques plegables.

Apariencia elegible (Ajustes → Apariencia, `js/utils/tema.js` + `js/tema-inicial.js`, guardada en
`localStorage` de ese celular): modo automático/claro/oscuro/negro (`data-theme`; "Negro" es oscuro +
`data-negro`: fondo negro puro y texto blanco) y tono del color primario
(`data-tono`: Ciprés por defecto, Océano, Terracota, Ciruela, Grafito — `node scripts/capturas-tonos.mjs
<carpeta>` para verlos).

Identidad visual "Organic Minimalist" (reskin 2026-09-28): paleta verde ciprés + umber sobre
superficies de alabastro/lino (verde ciprés primario `--color-primario`, umber `--color-acento`;
sin gradientes decorativos — regla de UI 4; contraste AA verificado — ver `CALIDAD.md`), logo propio
(`assets/logo.svg`, anillo segmentado en verde ciprés + rayo en umber, colores planos) rasterizado a
PNG 192/512 maskable con Playwright (`npm run iconos`). Tipografía: 8 fuentes OFL autoalojadas en
`fonts/*.woff2` — **Newsreader** (títulos) y **Manrope** (cuerpo/labels) para la UI, más las 6
originales que siguen sirviendo a los estilos de imagen con tipografía elegible (Inter, Montserrat,
Poppins, Playfair Display, Bebas Neue, Pacifico) — cargadas con `FontFace` (`js/fuentes.js`) — nada
de Google Fonts remoto (la CSP no lo permite). Íconos propios de línea en `js/utils/iconos.js` (sin
fuente de íconos remota), todas las fuentes/íconos en el precache `NUCLEO` de `sw.js` (offline desde
la primera carga).

Fuente de verdad del alcance: `CREAR-BRIEF.md`.

## Cómo se prueba localmente
No abrir `index.html` con doble clic: el Service Worker y `navigator.share`/`clipboard` necesitan un
origen `http(s)` (o `localhost`), no `file://`. Levantar el servidor estático propio:

```bash
npm install            # una vez (solo trae @playwright/test, de test)
node scripts/servir.js # o: npm run servir
```

Imprime la URL local y la IP de LAN — desde el Android, en la misma wifi, "Agregar a pantalla de
inicio" para instalarla igual que en producción.

Tests:
```bash
npm test          # unidad: node --test (modelo, layout, respaldo, estrategia del SW, geometría del editor)
npm run test:e2e  # Playwright, viewport 412x915 (Chromium)
npm run test:todo # ambos
```

## Cómo se publica
GitHub Pages, pero con un workflow de **GitHub Actions** (`.github/workflows/pages.yml`, "Publicar en
Pages"), no el "legacy build" por branch — ese no reconstruía solo en cada push (BUGS.md #13). Un
push a `main` dispara el workflow; se verifica con `gh run list -w "Publicar en Pages"` (o
`gh run watch <id>`) y queda servido en `https://bruno-avila21.github.io/estados-rapidos/`. No hay
paso de build real: el workflow solo empaqueta y sube los archivos tal cual están en `main`.

Para regenerar los íconos PNG (192/512, maskable) desde `assets/logo.svg`: `npm run iconos`
(`scripts/generar-iconos.mjs`, rasteriza con Playwright — ya es devDependency de test, no se suma nada).

## Las 8 reglas de UI (obligatorias, de `patrones.md`)
1. Tokens CSS en `:root` (`css/estilos.css`); nada de estilos inline en el HTML.
2. Toda interacción con `hover`, `focus-visible`, `active`, `disabled` + transición 200ms.
3. Un H1 por pantalla (`#titulo-pantalla`), escala tipográfica fija, 2 pesos máximo.
4. Sin gradientes decorativos, sin una card por cada dato, sin colores fuera de los tokens.
5. Estados vacío / carga / error **diseñados** (nunca "Loading..." pelado): ver `js/vistas/lista.js`
   (`estadoVacio`), skeleton en la carga, `[role=alert]` en los errores.
6. Móvil primero: acciones principales (Publicar, Guardar) abajo, pulgar-friendly; targets ≥ 48px.
7. `prefers-reduced-motion` respetado (`css/estilos.css`, media query al final).
8. Divulgación progresiva: foto+nombre+precio siempre a la vista; descripción agrupada bajo un
   título; el estilo de imagen por producto y demás ajustes finos viven detrás de "Opciones
   avanzadas" (`<details>`) en el alta/edición, no en la lista.

## Antes de un release
`/mejorar ciberseguridad performance`

## Los datos de usuario nunca van al repo
Productos, fotos y plantilla personalizada viven **solo** en el IndexedDB del navegador de quien
instala la app. El único archivo que sale del celular es el respaldo `.json` que Bruno baja a
propósito desde la pestaña "Respaldo" — y ese archivo tampoco se commitea (ver `.gitignore`: los
`.tmp-respaldo-*.json` que generan los tests E2E están explícitamente ignorados).

## Mapa del código
- `js/modelo.js` — reglas puras: formato de precio (es-AR, opcional), validación de producto y de
  respaldo, resolución de estilo (`resolverEstilo`) y de descripción (`resolverDescripcion`/
  `aplicarPlantillaDescripcion`, marcadores `{nombre} {precio} {descripcion}`, limpieza sin precio),
  `normalizarAjustes` (compatibilidad con respaldos viejos).
- `js/layout.js` — cálculo puro de wrap de texto y cover-fit (sin canvas; recibe un medidor inyectado).
- `js/editor-geometria.js` — hit-testing, mover/redimensionar con límites y snap del editor (puro).
- `js/fuentes.js` — carga de las 8 tipografías OFL con `FontFace`, memoizada (Newsreader/Manrope para
  la UI + las 6 originales que siguen usando los estilos de imagen con tipografía elegible).
- `js/geometria-presets.js` — geometría pura (sin canvas) de los 4 presets de composición de Fase 4
  (banner inferior, editorial, polaroid, story inmersiva): rectángulos de foto/zona decorativa/
  textos según si el producto tiene precio y/o descripción.
- `js/componer.js` — dibuja en un canvas 1080×1920 → Blob **JPEG** (calidad Estándar 0.85 / Alta
  0.95, elegible en la hoja de revisión); `componerSegunEstilo` elige entre `componerSoloFoto`,
  `componerFotoConPrecio`, `componerFotoConDescripcion`, `componerImagen` ("Mi plantilla") y los 4
  presets de `geometria-presets.js`; nombre/precio/descripción comparten los mismos `ajustes`.
- `js/db.js` / `js/repositorio.js` — IndexedDB y las operaciones de dominio (selección persistente,
  ajustes generales, normalización de ajustes al leer/importar, reordenamiento de secciones
  arrastrando).
- `js/respaldo-automatico.js` / `js/utils/respaldo-copia.js` — copia automática diaria del respaldo
  (APK + PWA) a la carpeta pública, con rotación (máximo 7 copias).
- `js/main.js` — router por hash, guardia de salida (con "Guardar y salir") y `estadosRapidosBack`:
  el Atrás del teléfono en el APK cierra lo que haya encima, vuelve a la pantalla anterior
  (`pilaPantallas`) y recién desde Productos sale de la app.
- `js/vistas/*.js` — pantallas: `lista` (inicio, réplica del mock de Bruno del 2026-10-07: buscador,
  "Filtros" —panel con las secciones y "Marcar todos"— y "Ordenar", cuenta + conmutador
  Lista/Grilla, secciones plegables, tarjetas en 2 columnas y barra fija "Publicar N productos" +
  "+"; para verla a ojo: `node scripts/capturas-inicio.mjs <carpeta> <foto1> <foto2> …`), `detalle`
  (alta/edición: la vista previa 9:16 del estado es la imagen del panel de foto, "Guardar" también
  en la barra superior, override de estilo en "Opciones avanzadas"), `varias` ("Agregar varios",
  `#/varias`: varias fotos de una vez y un producto por foto, con nombre y precio en una sola
  pantalla; en el APK también llegan compartiendo fotos desde la galería — `recibirCompartidas`
  en `PantallaPrincipal.kt` + `Android.fotosCompartidas()`), `ajustes` (tarjetas de estilo con
  miniatura en vivo, descripción modelo, formato de precio), `plantillas` (galería de estilos con
  favoritas), `plantilla` (editor de plantilla interactivo), `respaldo` (exportar/importar/borrar todo), `revision` (hoja de revisión antes de publicar).
- `js/utils/*.js` — toast, confirmación propia (nunca `confirm()` nativo), compartir (con timeout
  de seguridad y soporte multi-archivo), achicar fotos.
- `sw.js` + `js/sw-estrategia.js` — Service Worker network-first, con la decisión de cacheo separada como función pura y testeada.
