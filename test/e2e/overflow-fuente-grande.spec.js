// El WebView del APK escala el texto con la fuente del sistema (Ajustes > Tamaño de fuente) y con
// el zoom de pantalla (que además achica el ancho lógico en dp) — Bruno reportó "se sobresale de
// la pantalla" en su Samsung con el APK 1.1, probado solo a escala 1.0 (skill crear-apk BUGS.md,
// referencias/ui-movil.md §10). Reproducido en el emulador: a font_scale 1.6 + densidad +20%
// (~343px CSS de ancho) la tarjeta "Foto con precio" de Ajustes (con el badge "Personalizado"
// visible) se salía 120px a la derecha — invisible porque `.vista` usa overflow-x: clip, así que
// scrollWidth no lo detecta: hay que medir los propios elementos.
//
// Este test simula esa letra grande con `documentElement.style.fontSize` (130% y 160%, lo más
// parecido en un navegador de escritorio a un textZoom de sistema) en los 3 anchos típicos de
// celular Android (320/360/412) y falla si algo se pasa del viewport en cualquier pantalla.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FOTO = path.join(AQUI, 'fixtures', 'producto.png');

async function crearProducto(page, { nombre, precio }) {
  await page.goto('/#/producto/nuevo');
  await page.locator('#campo-nombre').fill(nombre);
  if (precio != null) await page.locator('#campo-precio').fill(String(precio));
  await page.locator('[data-accion-input="elegir-galeria"]').setInputFiles(FOTO);
  await page.locator('[data-accion="guardar"]').click();
  // .last(): con 2+ productos ya hay un [data-accion="editar"] por tarjeta en la lista (BUGS.md #30).
  await expect(page.locator('[data-accion="editar"]').last()).toBeVisible();
}

// Ronda "reskin plantilla": la tarjeta de controles + "Presets de diseño rápidos" van ARRIBA del
// lienzo, así que ya no está visible al cargar sin más — mismo helper que editor.spec.js (BUGS.md
// #48/#50: scrollIntoViewIfNeeded solo no alcanza porque no sabe que la nav inferior es fixed).
async function asegurarLienzoVisible(page) {
  await page.locator('.editor-plantilla__lienzo').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const el = document.querySelector('.editor-plantilla__lienzo');
    const nav = document.querySelector('.nav-inferior');
    if (!el) return;
    const limite = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    const rect = el.getBoundingClientRect();
    const exceso = rect.bottom - limite + 16;
    if (exceso > 0) window.scrollBy(0, exceso);
  });
}

/** Deja "Foto con precio" en estado "Personalizado" (badge de la barra superior) moviendo el
 * elemento "nombre" en el editor — mismo gesto que ajustes.spec.js. Necesario porque el badge +
 * "Editar" en la misma fila es justo lo que hacía overflow (grid 1fr sin minmax(0, ...)). */
async function personalizarEstiloFotoPrecio(page) {
  await page.goto('/#/plantilla?estilo=foto-precio');
  // render() de plantilla.js es async (decodificar la foto/plantilla desde IndexedDB) — esperar
  // a que el elemento esté visible antes de leer su boundingBox() (mismo patrón que BUGS.md #24).
  const elementoNombre = page.locator('[data-elemento="nombre"]');
  await expect(elementoNombre).toBeVisible();
  await asegurarLienzoVisible(page);
  const caja = await elementoNombre.boundingBox();
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.editor-plantilla__badge')).toHaveText('Personalizado');
  await page.waitForTimeout(100);
}

/** Ningún elemento se pasa del ancho: ni por scrollWidth (se ve un scroll horizontal fantasma) ni
 * por su propio getBoundingClientRect (se corta invisible detrás de un overflow-x: clip/hidden de
 * un ancestro — el caso real de Ajustes). Devuelve la lista de culpables para el mensaje de error. */
async function medirDesborde(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const culpables = [];
    // Contenedores con scroll horizontal PROPIO a propósito (carrusel de la hoja de revisión,
    // filtro de secciones con chips) — sus hijos SE SUPONE que sobresalen del viewport, eso es
    // justamente lo que el scroll resuelve: no son desbordes, así que ni ellos ni su contenido
    // cuentan acá (ronda "secciones", BUGS.md #40).
    function dentroDeScrollHorizontalPropio(el) {
      let nodo = el;
      while (nodo && nodo !== document.body) {
        const estilo = getComputedStyle(nodo);
        if ((estilo.overflowX === 'auto' || estilo.overflowX === 'scroll') && nodo.scrollWidth > nodo.clientWidth + 1) {
          return true;
        }
        nodo = nodo.parentElement;
      }
      return false;
    }
    document.querySelectorAll('body *').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return; // elementos ocultos/sin layout
      if (rect.right > innerWidth + 1 || rect.left < -1) {
        if (dentroDeScrollHorizontalPropio(el)) return;
        let clase = '';
        if (el.className && typeof el.className === 'string') clase = '.' + el.className.trim().split(/\s+/).join('.');
        culpables.push(`${el.tagName}${el.id ? '#' + el.id : ''}${clase} right=${Math.round(rect.right)} left=${Math.round(rect.left)} "${(el.textContent || '').trim().slice(0, 40)}"`);
      }
    });
    // El `scrollWidth` del documento SÍ tiene que seguir dando bien: un scroll horizontal propio
    // (con overflow-x:auto EN SU PROPIO contenedor, no en `body`/`html`) no mueve el ancho de la
    // página entera — si lo hiciera, ahí sí habría un desborde real.
    return { scrollOverflow: doc.scrollWidth > innerWidth + 1, culpables };
  });
}

async function esperarSinDesborde(page, etiqueta) {
  const { scrollOverflow, culpables } = await medirDesborde(page);
  const mensaje = `${etiqueta}: scrollOverflow=${scrollOverflow}\n${culpables.join('\n')}`;
  expect(culpables, mensaje).toEqual([]);
  expect(scrollOverflow, mensaje).toBe(false);
}

const ANCHOS = [320, 360, 412];
const ESCALAS_FUENTE = [130, 160]; // % — simula textZoom del sistema (font_scale 1.3 / 1.6)

for (const ancho of ANCHOS) {
  for (const escala of ESCALAS_FUENTE) {
    test(`sin desborde horizontal a ${ancho}px con fuente al ${escala}%`, async ({ page }) => {
      test.setTimeout(90_000);
      // height 1400 y no 800: con la barra + capas del editor de plantilla, el elemento
      // "nombre" del lienzo cae cerca de y=746 — un drag de +60px con altura 800 empuja el
      // puntero AFUERA del viewport (nunca llega a soltar sobre el lienzo) y el gesto no se
      // registra (confirmado con un script de diagnóstico aparte: "despues" quedaba igual a
      // "antes"). No es el bug que este test busca (ese es horizontal); es solo espacio vertical
      // de sobra para que el gesto de personalizarEstiloFotoPrecio() se pueda completar.
      await page.setViewportSize({ width: ancho, height: 1400 });
      await page.goto('/');

      // Secciones (ronda "secciones"): nombres largos a propósito, es lo que más chance tiene de
      // desbordar la fila de chips con scroll horizontal propio y el panel de gestión (se revisa
      // más abajo, ya con la letra grande puesta).
      await page.goto('/#/secciones');
      for (const nombre of ['Lunes para publicar', 'Electrodomésticos de línea blanca']) {
        await page.locator('input[aria-label="Nombre de la nueva sección"]').fill(nombre);
        await page.locator('[data-accion="crear-seccion"]').click();
        // Esperar la fila nueva ANTES de tipear la siguiente: `recargar()` reconstruye todo el
        // formulario (input incluido) de forma async — sin esto, el segundo fill() puede escribir
        // en un input que está a punto de desaparecer y la 2ª sección nunca se crea (BUGS.md #41).
        await expect(page.locator(`input[aria-label="Nombre de la sección ${nombre}"]`)).toBeVisible();
      }

      await crearProducto(page, { nombre: 'Remera básica algodón', precio: 8500 });
      await crearProducto(page, {
        nombre: 'Campera de jean forrada con corderoy premium edición limitada invierno',
        precio: 32000,
      });
      await crearProducto(page, { nombre: 'Gorra sin precio', precio: null });

      await personalizarEstiloFotoPrecio(page);

      // A partir de acá, todo con la letra grande puesta (simula font_scale del sistema).
      await page.evaluate((pct) => {
        document.documentElement.style.fontSize = pct + '%';
      }, escala);

      await page.goto('/#/');
      await esperarSinDesborde(page, 'Productos (lista)');

      await page.locator('.fila-compacta__seleccion').first().click();
      await esperarSinDesborde(page, 'Productos (con selección / barra Publicar)');

      await page.goto('/#/producto/nuevo');
      await esperarSinDesborde(page, 'Alta de producto');
      await page.locator('details.grupo summary').click();
      await esperarSinDesborde(page, 'Alta de producto (opciones avanzadas)');

      const idLargo = await page.evaluate(async () => {
        const repo = await import('/js/repositorio.js');
        const productos = await repo.listarProductos();
        return productos.find((p) => p.nombre.startsWith('Campera')).id;
      });
      await page.goto(`/#/producto/${idLargo}`);
      await esperarSinDesborde(page, 'Edición (nombre largo)');
      // Chips de sección con las 2 ACTIVAS (más anchas/en negrita que sin marcar): asignar este
      // producto a ambas y volver a medir es lo que más chance tiene de desbordar la fila.
      await page.locator('[data-accion="toggle-seccion"]').first().click();
      await page.locator('[data-accion="toggle-seccion"]').nth(1).click();
      await esperarSinDesborde(page, 'Edición (chips de sección marcados)');

      await page.locator('[data-accion="borrar"]').click();
      await expect(page.locator('.dialogo')).toBeVisible();
      await esperarSinDesborde(page, 'Diálogo de confirmación (borrar producto)');
      // .dialogo acota al diálogo: el form de detalle.js tiene SU PROPIO "Cancelar" (volver sin
      // guardar) además del "Cancelar" del diálogo de confirmación — sin acotar, ambigüo (BUGS.md #32).
      await page.locator('.dialogo [data-accion="cancelar"]').click(); // cerrar sin borrar

      await page.goto('/#/ajustes');
      await esperarSinDesborde(page, 'Ajustes (con badge Personalizado)');

      await page.goto('/#/plantilla?estilo=foto-precio');
      await esperarSinDesborde(page, 'Editor de plantilla');
      await page.locator('[data-accion^="capa-"]:not([data-accion*="ojo"])').first().click();
      await esperarSinDesborde(page, 'Editor de plantilla (capa seleccionada)');

      await page.goto('/#/respaldo');
      await esperarSinDesborde(page, 'Respaldo');

      await page.goto('/#/secciones');
      await esperarSinDesborde(page, 'Gestión de secciones');

      await page.goto('/#/');
      // Filtro por sección (chips con scroll horizontal propio) + "Publicar esta sección (N)".
      await page.locator('[data-accion="filtro-seccion"]', { hasText: 'Lunes para publicar' }).click();
      await esperarSinDesborde(page, 'Productos (filtro por sección)');
      await expect(page.locator('[data-accion="publicar-seccion"]')).toBeVisible();

      // Vista GRILLA (3 columnas): conmuta y mide de nuevo, todavía con el filtro activo.
      await page.locator('[data-accion="vista-grilla"]').click();
      await esperarSinDesborde(page, 'Productos (grilla, filtrado)');

      // Volver a "Todas" + lista compacta para el resto del flujo (agrupado por sección).
      await page.locator('[data-accion="filtro-seccion"]', { hasText: 'Todas' }).click();
      await esperarSinDesborde(page, 'Productos (Todas, agrupado por sección, grilla)');
      await page.locator('[data-accion="vista-compacta"]').click();
      await esperarSinDesborde(page, 'Productos (Todas, agrupado por sección, compacta)');

      // Plegar/desplegar un grupo: el summary con el contador es otro candidato a desborde.
      await page.locator('details.grupo-seccion summary').first().click();
      await esperarSinDesborde(page, 'Productos (grupo plegado)');
      await page.locator('details.grupo-seccion summary').first().click();

      await page.locator('[data-accion="publicar-seleccionados"]').click();
      await expect(page.locator('.hoja-revision')).toBeVisible();
      await esperarSinDesborde(page, 'Hoja de revisión');
    });
  }
}
