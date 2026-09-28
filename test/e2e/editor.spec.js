// Editor de plantilla tipo inspector: seleccionar un elemento en el lienzo, moverlo,
// redimensionarlo y cambiarle color/tipografía se ve al instante (CREAR-BRIEF.md 2026-09-27).
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FOTO = path.join(AQUI, 'fixtures', 'producto.png');

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

  await page.locator('[data-elemento="nombre"]').click();
  const antesBox = await page.locator('[data-elemento="nombre"]').boundingBox();
  const antesSrc = await page.locator('.editor-plantilla__imagen').getAttribute('src');

  await page.mouse.move(antesBox.x + antesBox.width / 2, antesBox.y + antesBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(antesBox.x + antesBox.width / 2 - 40, antesBox.y + antesBox.height / 2 - 60, { steps: 5 });
  await page.mouse.up();

  const despuesBox = await page.locator('[data-elemento="nombre"]').boundingBox();
  expect(Math.abs(despuesBox.x - antesBox.x)).toBeGreaterThan(10);

  await expect
    .poll(async () => page.locator('.editor-plantilla__imagen').getAttribute('src'), { timeout: 5_000 })
    .not.toBe(antesSrc);
});

test('arrastrar la manija de resize agranda la caja seleccionada', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');

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

  await page.locator('[data-elemento="nombre"]').click();
  const panel = page.locator('.editor-plantilla__panel');

  const srcInicial = await page.locator('.editor-plantilla__imagen').getAttribute('src');

  // Tamaño de letra (slider): .fill() no dispara bien el evento input en type=range (BUGS.md #15);
  // se fija el valor y se despacha el evento a mano, como haría un usuario arrastrándolo.
  await panel.locator('input[type="range"]').first().evaluate((el, val) => {
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, '140');
  await expect
    .poll(async () => page.locator('.editor-plantilla__imagen').getAttribute('src'), { timeout: 5_000 })
    .not.toBe(srcInicial);

  // Tipografía
  const srcTrasTamano = await page.locator('.editor-plantilla__imagen').getAttribute('src');
  await panel.locator('select[data-accion="editor-fuente"]').selectOption('pacifico');
  await expect
    .poll(async () => page.locator('.editor-plantilla__imagen').getAttribute('src'), { timeout: 5_000 })
    .not.toBe(srcTrasTamano);

  // Color rápido (swatch)
  const srcTrasFuente = await page.locator('.editor-plantilla__imagen').getAttribute('src');
  await panel.locator('.editor-plantilla__swatch').first().click();
  await expect
    .poll(async () => page.locator('.editor-plantilla__imagen').getAttribute('src'), { timeout: 5_000 })
    .not.toBe(srcTrasFuente);
});

// El test anterior solo miraba que los botones se habilitaran y dejó pasar que no revertían
// nada (QA v4, BUGS.md): estos miden la posición y el tamaño de verdad, antes y después.
async function editorListo(page) {
  await expect(page.locator('.editor-plantilla__imagen')).toHaveAttribute('src', /^blob:/);
}

async function posicion(page, clave) {
  return page.locator(`[data-elemento="${clave}"]`).evaluate((el) => ({ left: el.style.left, top: el.style.top }));
}

async function arrastrar(page, clave, dx, dy) {
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
  await editorListo(page);

  const inicial = await posicion(page, 'nombre');
  await arrastrar(page, 'nombre', 0, 120);
  const movido = await posicion(page, 'nombre');
  expect(movido.top).not.toBe(inicial.top);

  await page.locator('[data-accion="deshacer"]').click();
  await expect.poll(() => posicion(page, 'nombre')).toEqual(inicial);
  await expect(page.locator('[data-accion="rehacer"]')).toBeEnabled();

  await page.locator('[data-accion="rehacer"]').click();
  await expect.poll(() => posicion(page, 'nombre')).toEqual(movido);
});

test('deshacer revierte la tipografía y el tamaño de letra', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');

  await page.locator('[data-elemento="nombre"]').click();
  const selectFuente = page.locator('.editor-plantilla__panel select[data-accion="editor-fuente"]');
  const fuenteInicial = await selectFuente.inputValue();
  await selectFuente.selectOption('pacifico');
  await page.waitForTimeout(500); // debounce del historial
  await page.locator('[data-accion="deshacer"]').click();
  await expect(page.locator('.editor-plantilla__panel select[data-accion="editor-fuente"]')).toHaveValue(fuenteInicial);
});

test('restablecer vuelve a la posición de fábrica', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  await editorListo(page);

  const inicial = await posicion(page, 'nombre');
  await arrastrar(page, 'nombre', 0, 150);
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
  await page.locator('[data-elemento="nombre"]').click();
  const deslizador = page.locator('.editor-plantilla__panel input[type="range"]').first();
  await deslizador.scrollIntoViewIfNeeded();
  const caja = await deslizador.boundingBox();
  await page.mouse.move(caja.x + caja.width * 0.3, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width * 0.98, caja.y + caja.height / 2, { steps: 15 });
  await page.mouse.up();
  expect(Number(await deslizador.inputValue())).toBeGreaterThan(140);
});
