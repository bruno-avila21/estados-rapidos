// Editor de plantilla tipo inspector: seleccionar un elemento en el lienzo, moverlo,
// redimensionarlo y cambiarle color/tipografía se ve al instante (CREAR-BRIEF.md 2026-09-27).
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FOTO = path.join(AQUI, 'fixtures', 'producto.png');

// La vista previa ahora es un <canvas> que se dibuja directo (sin <img src="blob:...">) — para
// detectar "se regeneró" se usa el contador que expone la propia app para los tests (CREAR-BRIEF.md
// "vista previa en vivo": exponer en window el último layout dibujado).
function revisionDibujo(page) {
  return page.evaluate(() => window.__editorDebugPlantilla?.revision ?? 0);
}

// Ronda "reskin plantilla": la tarjeta de controles + "Presets de diseño rápidos" ahora van ARRIBA
// del lienzo (editar_plantilla_natural), así que el lienzo casi nunca está ya visible al cargar la
// pantalla. `scrollIntoViewIfNeeded()` no alcanza por sí solo: no sabe que la nav inferior es
// `position: fixed` y puede "considerar visible" un lienzo cuyo borde de abajo queda tapado por
// ella (BUGS.md #48/#50) — acá se calcula el scroll exacto que hace falta para dejarlo del todo
// arriba de la nav antes de leer `boundingBox()`/arrastrar con `page.mouse`.
async function asegurarLienzoVisible(page) {
  // El lienzo arranca bloqueado (2026-10-07): se habilita la edición antes de arrastrar.
  const modo = page.locator('[data-accion="editar-lienzo"]');
  if ((await modo.getAttribute('aria-pressed')) === 'false') await modo.click();
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

// Con el lienzo en edición la zona del lienzo ocupa toda la pantalla (2026-10-07): para tocar el
// panel de propiedades, las capas o la barra de controles primero hay que salir con "Listo".
async function listo(page) {
  const modo = page.locator('[data-accion="editar-lienzo"]');
  if ((await modo.count()) && (await modo.getAttribute('aria-pressed')) === 'true') await modo.click();
}

async function crearProducto(page) {
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill('Producto editor');
  await page.locator('#campo-precio').fill('15000');
  await page.locator('[data-accion-input="elegir-galeria"]').setInputFiles(FOTO);
  await page.locator('[data-accion="guardar"]').click();
  await expect(page.locator('[data-accion="editar"]')).toBeVisible();
}

test('clic en el nombre lo selecciona y muestra el panel de propiedades', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await asegurarLienzoVisible(page);

  await expect(page.locator('[data-elemento="nombre"]')).toBeVisible();
  await page.locator('[data-elemento="nombre"]').click();
  await expect(page.locator('[data-elemento="nombre"]')).toHaveClass(/editor-plantilla__caja--activa/);
  await expect(page.locator('.editor-plantilla__panel')).toBeVisible();
  await expect(page.locator('.editor-plantilla__panel')).toContainText('Nombre');
});

test('arrastrar el nombre lo mueve y la vista previa se regenera', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await asegurarLienzoVisible(page);

  await page.locator('[data-elemento="nombre"]').click();
  const antesBox = await page.locator('[data-elemento="nombre"]').boundingBox();
  const revisionAntes = await revisionDibujo(page);

  await page.mouse.move(antesBox.x + antesBox.width / 2, antesBox.y + antesBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(antesBox.x + antesBox.width / 2 - 40, antesBox.y + antesBox.height / 2 - 60, { steps: 5 });
  await page.mouse.up();

  const despuesBox = await page.locator('[data-elemento="nombre"]').boundingBox();
  expect(Math.abs(despuesBox.x - antesBox.x)).toBeGreaterThan(10);

  await expect.poll(() => revisionDibujo(page), { timeout: 5_000 }).toBeGreaterThan(revisionAntes);
});

// El bug original (BUGS.md, ronda "vista previa en vivo"): el recuadro del overlay se movía al
// toque, pero la imagen (un <img src> regenerado a mano) tardaba y quedaba desfasada. Ahora ambos
// se derivan del MISMO `ajustes` — este test compara la posición lógica del overlay (leída del
// DOM, en % convertido a 1080x1920) contra lo que la app dice haber dibujado en el canvas.
test('el canvas dibuja exactamente la posición del overlay tras arrastrar (sin desfasaje)', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await asegurarLienzoVisible(page);

  await page.locator('[data-elemento="nombre"]').click();
  const caja = await page.locator('[data-elemento="nombre"]').boundingBox();
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width / 2 - 30, caja.y + caja.height / 2 + 90, { steps: 6 });
  await page.mouse.up();

  const overlayLogico = await page.locator('[data-elemento="nombre"]').evaluate((el) => ({
    x: (parseFloat(el.style.left) / 100) * 1080,
    y: (parseFloat(el.style.top) / 100) * 1920,
  }));

  await expect
    .poll(async () => page.evaluate(() => window.__editorDebugPlantilla?.ajustes?.nombre?.x), { timeout: 5_000 })
    .toBeCloseTo(overlayLogico.x, 0);
  const yDibujado = await page.evaluate(() => window.__editorDebugPlantilla?.ajustes?.nombre?.y);
  expect(yDibujado).toBeCloseTo(overlayLogico.y, 0);
});

test('arrastrar la manija de resize agranda la caja seleccionada', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await asegurarLienzoVisible(page);

  await page.locator('[data-elemento="nombre"]').click();
  const manija = page.locator('.editor-plantilla__caja--activa .editor-plantilla__manija--se');
  const antesCaja = await page.locator('[data-elemento="nombre"]').boundingBox();
  const manijaBox = await manija.boundingBox();

  await page.mouse.move(manijaBox.x + manijaBox.width / 2, manijaBox.y + manijaBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(manijaBox.x + 60, manijaBox.y + 40, { steps: 5 });
  await page.mouse.up();

  const despuesCaja = await page.locator('[data-elemento="nombre"]').boundingBox();
  // la caja "nombre" por defecto (x:60, w:960 de 1080) tiene poco margen antes del clamp del
  // borde derecho: el incremento real ronda los ~18px en pantalla, no los 60 pedidos (BUGS.md #15).
  expect(despuesCaja.width).toBeGreaterThan(antesCaja.width + 10);
});

test('cambiar tamaño, color y tipografía en el panel se ve al instante', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await asegurarLienzoVisible(page);

  await page.locator('[data-elemento="nombre"]').click();
  const panel = page.locator('.editor-plantilla__panel');

  const revisionInicial = await revisionDibujo(page);

  // Tamaño de letra (slider): .fill() no dispara bien el evento input en type=range (BUGS.md #15);
  // se fija el valor y se despacha el evento a mano, como haría un usuario arrastrándolo.
  await listo(page);
  await panel.locator('input[type="range"]').first().evaluate((el, val) => {
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, '140');
  await expect.poll(() => revisionDibujo(page), { timeout: 5_000 }).toBeGreaterThan(revisionInicial);
  await expect.poll(() => page.evaluate(() => window.__editorDebugPlantilla?.ajustes?.nombre?.tamano)).toBe(140);

  // Tipografía
  const revisionTrasTamano = await revisionDibujo(page);
  await listo(page);
  await panel.locator('select[data-accion="editor-fuente"]').selectOption('pacifico');
  await expect.poll(() => revisionDibujo(page), { timeout: 5_000 }).toBeGreaterThan(revisionTrasTamano);

  // Color rápido (swatch)
  const revisionTrasFuente = await revisionDibujo(page);
  await listo(page);
  await panel.locator('.editor-plantilla__swatch').first().click();
  await expect.poll(() => revisionDibujo(page), { timeout: 5_000 }).toBeGreaterThan(revisionTrasFuente);
});

// El test anterior solo miraba que los botones se habilitaran y dejó pasar que no revertían
// nada (QA v4, BUGS.md): estos miden la posición y el tamaño de verdad, antes y después.
async function editorListo(page) {
  // La vista previa es un <canvas> dibujado en vivo (sin src): "listo" es que ya dibujó al menos
  // una vez y tiene una resolución real (devicePixelRatio × tamaño en pantalla).
  await expect.poll(() => revisionDibujo(page), { timeout: 5_000 }).toBeGreaterThan(0);
  await expect
    .poll(() => page.locator('.editor-plantilla__imagen').evaluate((el) => el.width), { timeout: 5_000 })
    .toBeGreaterThan(0);
}

async function posicion(page, clave) {
  return page.locator(`[data-elemento="${clave}"]`).evaluate((el) => ({ left: el.style.left, top: el.style.top }));
}

async function arrastrar(page, clave, dx, dy) {
  await asegurarLienzoVisible(page);
  const caja = await page.locator(`[data-elemento="${clave}"]`).boundingBox();
  const x = caja.x + caja.width / 2;
  const y = caja.y + caja.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

test('deshacer devuelve el elemento a donde estaba y rehacer lo vuelve a mover', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await asegurarLienzoVisible(page);
  await editorListo(page);

  const inicial = await posicion(page, 'nombre');
  await arrastrar(page, 'nombre', 0, 120);
  const movido = await posicion(page, 'nombre');
  expect(movido.top).not.toBe(inicial.top);

  await listo(page);
  await page.locator('[data-accion="deshacer"]').click();
  await expect.poll(() => posicion(page, 'nombre')).toEqual(inicial);
  await expect(page.locator('[data-accion="rehacer"]')).toBeEnabled();

  await listo(page);
  await page.locator('[data-accion="rehacer"]').click();
  await expect.poll(() => posicion(page, 'nombre')).toEqual(movido);
});

test('deshacer revierte la tipografía y el tamaño de letra', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await asegurarLienzoVisible(page);

  await page.locator('[data-elemento="nombre"]').click();
  const selectFuente = page.locator('.editor-plantilla__panel select[data-accion="editor-fuente"]');
  const fuenteInicial = await selectFuente.inputValue();
  await listo(page);
  await selectFuente.selectOption('pacifico');
  await page.waitForTimeout(500); // debounce del historial
  await listo(page);
  await page.locator('[data-accion="deshacer"]').click();
  await expect(page.locator('.editor-plantilla__panel select[data-accion="editor-fuente"]')).toHaveValue(fuenteInicial);
});

test('restablecer vuelve a la posición de fábrica', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await asegurarLienzoVisible(page);
  await editorListo(page);

  const inicial = await posicion(page, 'nombre');
  await arrastrar(page, 'nombre', 0, 150);
  await listo(page);
  await page.locator('[data-accion="restablecer-plantilla"]').click();
  await page.locator('[data-accion="confirmar-borrar"]').click();
  await expect(page.locator('#toast')).toHaveText(/restablecida/i);
  await expect.poll(() => posicion(page, 'nombre')).toEqual(inicial);
});

// Arrastrar el deslizador de punta a punta tiene que llegar lejos: antes el panel se rehacía en
// cada paso, el control arrastrado se reemplazaba y el gesto se cortaba (58 → 64, QA v4, BUGS.md).
test('arrastrar el deslizador de tamaño recorre todo el rango', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await asegurarLienzoVisible(page);
  await page.locator('[data-elemento="nombre"]').click();
  const deslizador = page.locator('.editor-plantilla__panel input[type="range"]').first();
  await listo(page);
  await deslizador.scrollIntoViewIfNeeded();
  const caja = await deslizador.boundingBox();
  await page.mouse.move(caja.x + caja.width * 0.3, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width * 0.98, caja.y + caja.height / 2, { steps: 15 });
  await page.mouse.up();
  expect(Number(await deslizador.inputValue())).toBeGreaterThan(140);
});

// La barra de Deshacer ya NO es `position: sticky` (ronda "reskin plantilla"): vive dentro de la
// tarjeta de controles de arriba, como en editar_plantilla_natural, que no trae una barra
// flotante — antes sí lo era (BUGS.md #21), pero anidarla en esa tarjeta le acota el "contenedor
// de bloque" del sticky al tamaño de la tarjeta (BUGS.md #50), así que se sacó. Sigue en el DOM
// y funcionando (Playwright hace scroll solo al hacer clic), solo dejó de perseguir el scroll.
test('Deshacer sigue existiendo y funcionando aunque ya no sea sticky al bajar por el panel', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await asegurarLienzoVisible(page);
  await page.locator('[data-elemento="nombre"]').click();
  const inicial = await posicion(page, 'nombre');
  const caja = await page.locator('[data-elemento="nombre"]').boundingBox();
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2 - 80, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => posicion(page, 'nombre')).not.toEqual(inicial);

  await listo(page);
  await page.locator('.editor-plantilla__panel input[type="range"]').last().scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(200);
  // Ya no está pegada arriba del viewport (no sticky) — pero sigue en el DOM, visible más arriba
  // en su tarjeta, y el clic (que auto-scrollea) la sigue alcanzando y funcionando sin problema.
  await expect(page.locator('[data-accion="deshacer"]')).toBeEnabled();
  await listo(page);
  await page.locator('[data-accion="deshacer"]').click();
  await expect.poll(() => posicion(page, 'nombre')).toEqual(inicial);
});

// --- Ocultar/mostrar capas (ronda "ocultar/mostrar a un toque") ---

// Ronda "reskin plantilla": editar_plantilla_natural NO dibuja un placeholder punteado para los
// elementos ocultos — directamente no aparecen en el lienzo (solo en la lista de Capas, con el
// subtexto "Oculto en este estilo" en vez del nombre, para reactivarlos desde ahí).
test('el ojo de una capa la oculta: desaparece del lienzo, queda "Oculto en este estilo" en Capas y se puede volver a mostrar', async ({
  page,
}) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await asegurarLienzoVisible(page);

  const ojoNombre = page.locator('[data-accion="capa-ojo-nombre"]');
  await expect(ojoNombre).toHaveAttribute('aria-pressed', 'true'); // visible por defecto
  await expect(page.locator('[data-elemento="nombre"]')).toBeVisible();

  await listo(page);
  await ojoNombre.click();
  await expect(ojoNombre).toHaveAttribute('aria-pressed', 'false');
  // ya no hay caja para "nombre" en el lienzo: ni punteada ni de ningún tipo.
  await expect(page.locator('[data-elemento="nombre"]')).toHaveCount(0);
  const filaNombre = page.locator('.editor-plantilla__fila-capa', { has: page.locator('[data-accion="capa-nombre"]') });
  await expect(filaNombre).toContainText('Oculto en este estilo');
  await expect.poll(() => page.evaluate(() => window.__editorDebugPlantilla?.ajustes?.nombre?.visible)).toBe(false);

  // se puede seguir seleccionando DESDE CAPAS (ya no hay caja en el lienzo para tocar) y el panel
  // ofrece "Mostrar" arriba, no un checkbox al final.
  await listo(page);
  await page.locator('[data-accion="capa-nombre"]').click();
  const btnOcultar = page.locator('[data-accion="editor-toggle-visible"]');
  await expect(btnOcultar).toHaveText('Mostrar');
  await listo(page);
  await btnOcultar.click();
  await expect(ojoNombre).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-elemento="nombre"]')).toBeVisible();
});

// Ronda "ajustes por estilo" (2026-09-28): el selector ya no es una "vista previa" que no
// persiste — cambiarlo NAVEGA a editar ese otro estilo (su propia configuración, su propio
// historial). Cada estilo tiene sus propios defaults de visibilidad.
test('cambiar el selector navega a editar ese estilo, cada uno con sus propios defaults de visibilidad', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla?estilo=foto-precio');
  await asegurarLienzoVisible(page);
  // foto-precio: nombre y precio visibles, descripción oculta.
  await expect(page.locator('[data-accion="capa-ojo-nombre"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-accion="capa-ojo-descripcion"]')).toHaveAttribute('aria-pressed', 'false');

  await listo(page);
  await page.locator('#editor-vista-previa-estilo').selectOption('foto-descripcion');
  await expect(page).toHaveURL(/estilo=foto-descripcion/);
  // foto-descripcion: SOLO la descripción visible (nombre y precio ocultos de fábrica).
  await expect(page.locator('[data-accion="capa-ojo-nombre"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-accion="capa-ojo-precio"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-accion="capa-ojo-descripcion"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__editorDebugPlantilla?.estilo)).toBe('foto-descripcion');
});

test('"Foto con descripción": mostrar el nombre (oculto de fábrica) lo dibuja', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla?estilo=foto-descripcion');
  await asegurarLienzoVisible(page);
  await expect(page.locator('[data-accion="capa-ojo-nombre"]')).toHaveAttribute('aria-pressed', 'false');
  await listo(page);
  await page.locator('[data-accion="capa-ojo-nombre"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__editorDebugPlantilla?.ajustes?.nombre?.visible))
    .toBe(true);
  await expect.poll(() => page.evaluate(() => window.__editorDebugPlantilla?.estilo)).toBe('foto-descripcion');
});

// --- Badge de estado (Personalizado/Por defecto) + "Volver al original de este estilo" ---
// Ronda "reskin plantilla": el badge ahora vive en la barra superior y está SIEMPRE visible (antes
// aparecía/desaparecía con `hidden`) — el texto es la señal, no la visibilidad.

test('badge de la barra superior pasa de "Por defecto" a "Personalizado" al mover un elemento, y vuelve al restablecer', async ({
  page,
}) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla?estilo=foto-precio');
  await asegurarLienzoVisible(page);
  await editorListo(page);

  const badge = page.locator('.editor-plantilla__badge');
  await expect(badge).toHaveText('Por defecto');

  await arrastrar(page, 'nombre', 0, 120);
  await expect(badge).toHaveText('Personalizado');

  await listo(page);
  await page.locator('[data-accion="restablecer-plantilla"]').click();
  await page.locator('[data-accion="confirmar-borrar"]').click();
  await expect(page.locator('#toast')).toHaveText(/restablecida/i);
  await expect(badge).toHaveText('Por defecto');
});

test('"Volver al original de este estilo" no toca los otros 2 estilos', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla?estilo=foto-precio');
  await asegurarLienzoVisible(page);
  await editorListo(page);
  await arrastrar(page, 'nombre', 0, 120);
  await listo(page);
  await page.locator('[data-accion="restablecer-plantilla"]').click();
  await page.locator('[data-accion="confirmar-borrar"]').click();

  // el otro estilo (mi-plantilla) nunca se tocó: el badge sigue en "Por defecto".
  await page.goto('/#/plantilla?estilo=mi-plantilla');
  await asegurarLienzoVisible(page);
  await expect(page.locator('.editor-plantilla__badge')).toHaveText('Por defecto');
});

// --- Distribución: "Acomodar automáticamente" y "Centrar horizontal" ---

test('Acomodar automáticamente apila los elementos visibles centrados, de abajo hacia arriba', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla?estilo=foto-precio');
  await asegurarLienzoVisible(page);

  // foto-precio arranca con la descripción oculta (ronda "ajustes por estilo"): se muestra para
  // probar el acomodo con los 3 elementos, igual que antes de esa ronda.
  await listo(page);
  await page.locator('[data-accion="capa-ojo-descripcion"]').click();
  // Se descentra el nombre a propósito para verificar que el botón lo vuelve a centrar.
  await arrastrar(page, 'nombre', 200, 0);

  await listo(page);
  await page.locator('[data-accion="acomodar-automatico"]').click();
  await expect(page.locator('#toast')).toHaveText(/acomodados/i);

  // El canvas se redibuja en el siguiente requestAnimationFrame (coalescido): leer
  // `window.__editorDebugPlantilla` en el toque puede traer todavía el snapshot anterior al
  // click, así que se espera a que realmente refleje el centrado antes de comparar todo lo demás.
  await expect
    .poll(() => page.evaluate(() => window.__editorDebugPlantilla.ajustes.nombre.x + window.__editorDebugPlantilla.ajustes.nombre.w / 2))
    .toBeCloseTo(540, 0);
  const ajustes = await page.evaluate(() => window.__editorDebugPlantilla.ajustes);
  // centrado horizontal: x + w/2 == 1080/2 para los 3 (mismo ancho por defecto).
  for (const clave of ['nombre', 'precio', 'descripcion']) {
    expect(ajustes[clave].x + ajustes[clave].w / 2).toBeCloseTo(540, 0);
  }
  // apilados de abajo hacia arriba sin superponerse: nombre arriba de precio, precio arriba de descripción.
  expect(ajustes.nombre.y + ajustes.nombre.h).toBeLessThanOrEqual(ajustes.precio.y);
  expect(ajustes.precio.y + ajustes.precio.h).toBeLessThanOrEqual(ajustes.descripcion.y);
  // margen inferior respetado: el borde inferior del último elemento no toca el final del lienzo.
  expect(ajustes.descripcion.y + ajustes.descripcion.h).toBeLessThan(1920);
});

test('Centrar horizontal (panel) centra el elemento seleccionado sin tocar los demás', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await asegurarLienzoVisible(page);

  await arrastrar(page, 'nombre', -150, 0); // lo descentra
  await page.locator('[data-elemento="nombre"]').click();
  await listo(page);
  await page.locator('[data-accion="editor-centrar-horizontal"]').click();

  // Mismo motivo que en el test de "Acomodar automáticamente": esperar el próximo dibujo real.
  await expect
    .poll(() => page.evaluate(() => window.__editorDebugPlantilla.ajustes.nombre.x + window.__editorDebugPlantilla.ajustes.nombre.w / 2))
    .toBeCloseTo(540, 0);
});

// --- Capas: lista VERTICAL, cada fila = nombre (todo el ancho) + ojo a la derecha, ≥48px de alto,
// la seleccionada resaltada (ronda "capas verticales", CREAR-BRIEF.md 2026-09-28) ---

test('las capas se apilan verticalmente, cada fila ocupa el ancho y mide al menos 48px de alto', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla?estilo=mi-plantilla'); // el estilo con más capas (foto+nombre+precio+descripción)
  await asegurarLienzoVisible(page);

  const filas = page.locator('.editor-plantilla__fila-capa');
  // `count()` no espera a que la pantalla termine de armarse (a diferencia de `expect(...).toHave*`,
  // que sí reintenta): se espera la primera fila antes de contar todas.
  await expect(filas.first()).toBeVisible();
  const cantidad = await filas.count();
  expect(cantidad).toBeGreaterThanOrEqual(3);

  const cajas = [];
  for (const fila of await filas.all()) {
    const caja = await fila.boundingBox();
    expect(caja.height).toBeGreaterThanOrEqual(48);
    cajas.push(caja);
  }
  // apiladas una debajo de la otra: cada una empieza más abajo que la anterior, sin superponerse.
  for (let i = 1; i < cajas.length; i += 1) {
    expect(cajas[i].y).toBeGreaterThanOrEqual(cajas[i - 1].y + cajas[i - 1].height - 1);
  }

  // el botón ojo queda a la derecha del nombre de la capa, dentro de la misma fila.
  const primeraFila = filas.first();
  const nombreBox = await primeraFila.locator('.editor-plantilla__fila-capa__nombre').boundingBox();
  const ojoBox = await primeraFila.locator('.editor-plantilla__ojo').boundingBox();
  expect(ojoBox.x).toBeGreaterThan(nombreBox.x);
});

test('la capa seleccionada queda resaltada', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla?estilo=foto-precio');
  await asegurarLienzoVisible(page);

  const filaNombre = page.locator('.editor-plantilla__fila-capa', { has: page.locator('[data-accion="capa-nombre"]') });
  await expect(filaNombre).not.toHaveClass(/editor-plantilla__fila-capa--activa/);
  await listo(page);
  await page.locator('[data-accion="capa-nombre"]').click();
  await expect(filaNombre).toHaveClass(/editor-plantilla__fila-capa--activa/);
});

// --- Fase 2, "S" #3: fondos de texto predefinidos ---

test('un preset de fondo aplica color+opacidad+radio juntos y se ve al instante', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await asegurarLienzoVisible(page);
  await editorListo(page);

  await page.locator('[data-elemento="nombre"]').click();
  const revisionInicial = await revisionDibujo(page);

  await listo(page);
  await page.locator('[data-accion="preset-fondo-lino-claro"]').click();
  await expect.poll(() => revisionDibujo(page), { timeout: 5_000 }).toBeGreaterThan(revisionInicial);

  const caja = await page.evaluate(() => window.__editorDebugPlantilla.ajustes.nombre);
  expect(caja.fondoColor.toLowerCase()).toBe('#f3efea');
  expect(caja.fondoOpacidad).toBeCloseTo(0.9, 5);
  expect(caja.fondoRadio).toBe(12);

  // el preset aplicado queda resaltado como "activo"
  await expect(page.locator('[data-accion="preset-fondo-lino-claro"]')).toHaveClass(/editor-plantilla__preset--activo/);
  await expect(page.locator('[data-accion="preset-fondo-lino-claro"]')).toHaveAttribute('aria-pressed', 'true');
});

test('un preset de fondo es UN solo paso de deshacer (los 3 campos juntos)', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await asegurarLienzoVisible(page);
  await editorListo(page);

  await page.locator('[data-elemento="nombre"]').click();
  const fondoInicial = await page.evaluate(() => window.__editorDebugPlantilla.ajustes.nombre.fondoColor);

  await listo(page);
  await page.locator('[data-accion="preset-fondo-contraste-alto"]').click();
  await expect.poll(() => page.evaluate(() => window.__editorDebugPlantilla.ajustes.nombre.fondoRadio)).toBe(4);

  await listo(page);
  await page.locator('[data-accion="deshacer"]').click();
  // UN deshacer alcanza para volver a los 3 campos de antes del preset (no hace falta deshacer 3 veces).
  await expect
    .poll(() => page.evaluate(() => window.__editorDebugPlantilla.ajustes.nombre.fondoColor))
    .toBe(fondoInicial);

  await listo(page);
  await page.locator('[data-accion="rehacer"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__editorDebugPlantilla.ajustes.nombre.fondoRadio))
    .toBe(4);
});

// --- Guías de centrado y mini menú flotante (2026-10-07) ---

test('al arrastrar aparecen las guías del centro y se encienden al quedar centrado', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla?estilo=foto-precio');
  await asegurarLienzoVisible(page);

  const caja = page.locator('[data-elemento="nombre"]');
  const box = await caja.boundingBox();
  await expect(page.locator('.editor-plantilla__guia')).toHaveCount(0); // sin arrastre no hay guías

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 - 80, { steps: 5 });
  // El nombre ocupa casi todo el ancho: a 2px del centro queda enganchado al centro horizontal.
  await expect(page.locator('[data-guia="centro-x"]')).toHaveAttribute('data-activa', 'true');
  await expect(page.locator('[data-guia="centro-y"]')).toHaveAttribute('data-activa', 'false');
  await expect(page.locator('.editor-plantilla__guia-rotulo')).toHaveText('Centro horizontal');
  await expect(page.locator('.editor-plantilla__mini')).toHaveCount(0); // el menú no tapa mientras se mueve
  await page.mouse.up();

  await expect(page.locator('.editor-plantilla__guia')).toHaveCount(0);
  const ajustes = await page.evaluate(() => window.__editorDebugPlantilla.ajustes.nombre);
  expect(ajustes.x + ajustes.w / 2).toBe(540); // centrado exacto en 1080
});

test('el mini menú del elemento seleccionado cambia tamaño, alineación, color y tipografía', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla?estilo=foto-precio');
  await asegurarLienzoVisible(page);

  await expect(page.locator('.editor-plantilla__mini')).toHaveCount(0);
  await page.locator('[data-elemento="nombre"]').click();
  const menu = page.locator('.editor-plantilla__mini');
  await expect(menu).toBeVisible();
  const leer = () => page.evaluate(() => window.__editorDebugPlantilla.ajustes.nombre);
  const antes = await leer();

  await menu.locator('[data-accion="mini-tamano-mas"]').click();
  await expect.poll(async () => (await leer()).tamano).toBe(antes.tamano + 4);
  await menu.locator('[data-accion="mini-tamano-menos"]').click();
  await expect.poll(async () => (await leer()).tamano).toBe(antes.tamano);

  await menu.locator('[data-accion="mini-alineacion"]').click();
  await expect.poll(async () => (await leer()).alineacion).not.toBe(antes.alineacion);

  await menu.locator('[data-accion="mini-color"]').click();
  await menu.locator('[data-accion="mini-color-f5a623"]').click();
  await expect.poll(async () => (await leer()).color).toBe('#f5a623');

  await menu.locator('[data-accion="mini-fuente"]').selectOption('pacifico');
  await expect.poll(async () => (await leer()).familia).toBe('pacifico');

  // Sigue seleccionado (el menú no deselecciona) y el panel de abajo refleja lo mismo.
  await expect(page.locator('[data-elemento="nombre"]')).toHaveClass(/editor-plantilla__caja--activa/);
  await expect(page.locator('[data-accion="editor-fuente"]')).toHaveValue('pacifico');

  // El menú entra en el ancho de la pantalla (412px), sin scroll horizontal.
  const cajaMenu = await menu.boundingBox();
  expect(cajaMenu.x).toBeGreaterThanOrEqual(0);
  expect(cajaMenu.x + cajaMenu.width).toBeLessThanOrEqual(412);
});

// --- Lienzo bloqueado por defecto (2026-10-07) ---

test('el lienzo arranca bloqueado: arrastrar sobre un texto no lo mueve hasta tocar "Editar"', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla?estilo=foto-precio');
  const modo = page.locator('[data-accion="editar-lienzo"]');
  await expect(modo).toHaveAttribute('aria-pressed', 'false');
  await expect(modo).toHaveText('Editar');
  await expect(page.locator('[data-accion="terminar-edicion-lienzo"]')).toBeHidden();
  await page.locator('.editor-plantilla__lienzo').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));

  const leer = () => page.evaluate(() => window.__editorDebugPlantilla.ajustes.nombre);
  const antes = await leer();
  const caja = page.locator('[data-elemento="nombre"]');
  // Bloqueado, el lienzo no le saca el scroll al dedo.
  expect(await page.locator('.editor-plantilla__lienzo').evaluate((el) => getComputedStyle(el).touchAction)).not.toBe('none');
  expect(await caja.evaluate((el) => getComputedStyle(el).touchAction)).not.toBe('none');
  const box = await caja.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2 - 90, { steps: 5 });
  await expect(page.locator('.editor-plantilla__guia')).toHaveCount(0);
  await page.mouse.up();
  expect(await leer()).toEqual(antes);
  await expect(page.locator('.editor-plantilla__mini')).toHaveCount(0);

  // "Editar" habilita el arrastre; "Listo" lo vuelve a bloquear.
  await modo.click();
  await expect(modo).toHaveAttribute('aria-pressed', 'true');
  await expect(modo).toHaveText('Listo');
  expect(await page.locator('.editor-plantilla__lienzo').evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
  await asegurarLienzoVisible(page);
  const box2 = await caja.boundingBox();
  await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await page.mouse.down();
  await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2 - 90, { steps: 5 });
  await page.mouse.up();
  expect((await leer()).y).toBeLessThan(antes.y);

  await page.locator('[data-accion="terminar-edicion-lienzo"]').click();
  await expect(modo).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.editor-plantilla__mini')).toHaveCount(0);
});

test('tocar un texto del lienzo bloqueado entra a editar con ese texto seleccionado', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla?estilo=foto-precio');
  await page.locator('[data-elemento="precio"]').click();
  await expect(page.locator('[data-accion="editar-lienzo"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-elemento="precio"]')).toHaveClass(/editor-plantilla__caja--activa/);
  await expect(page.locator('.editor-plantilla__mini')).toBeVisible();
});

// --- Edición a pantalla completa (2026-10-07) ---

test('al editar, el lienzo ocupa toda la pantalla (entra entero, sin scroll) y "Listo" lo devuelve a la página', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla?estilo=foto-precio');
  const zona = page.locator('.editor-plantilla__zona');
  await expect(zona).not.toHaveClass(/editor-plantilla__zona--pantalla/);
  await expect(page.locator('[data-accion="deshacer-pantalla"]')).toBeHidden();

  await page.locator('[data-accion="editar-lienzo"]').click();
  await expect(zona).toHaveClass(/editor-plantilla__zona--pantalla/);
  const vista = page.viewportSize();
  const cajaZona = await zona.boundingBox();
  expect(cajaZona).toMatchObject({ x: 0, y: 0, width: vista.width, height: vista.height });
  // El lienzo entra ENTERO, con "Listo" abajo, y la nav inferior queda tapada.
  const lienzo = await page.locator('.editor-plantilla__lienzo').boundingBox();
  expect(lienzo.y).toBeGreaterThanOrEqual(0);
  expect(lienzo.y + lienzo.height).toBeLessThanOrEqual(vista.height);
  expect(lienzo.width / lienzo.height).toBeCloseTo(1080 / 1920, 1);
  await expect(page.locator('[data-accion="terminar-edicion-lienzo"]')).toBeInViewport();
  const tapaNav = await page.evaluate(() => {
    const nav = document.querySelector('.nav-inferior').getBoundingClientRect();
    return !!document.elementFromPoint(nav.left + nav.width / 2, nav.top + nav.height / 2)?.closest('.editor-plantilla__zona');
  });
  expect(tapaNav).toBe(true);

  // Deshacer/rehacer están a mano sin salir.
  const leer = () => page.evaluate(() => window.__editorDebugPlantilla.ajustes.nombre.y);
  const antes = await leer();
  await arrastrar(page, 'nombre', 0, -80);
  await page.waitForTimeout(500); // debounce del historial
  expect(await leer()).toBeLessThan(antes);
  await page.locator('[data-accion="deshacer-pantalla"]').click();
  await expect.poll(leer).toBe(antes);
  await page.locator('[data-accion="rehacer-pantalla"]').click();
  await expect.poll(leer).toBeLessThan(antes);

  await page.locator('[data-accion="terminar-edicion-lienzo"]').click();
  await expect(zona).not.toHaveClass(/editor-plantilla__zona--pantalla/);
  await expect(page.locator('[data-accion="deshacer"]')).toBeVisible();
});
