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

test('deshacer / rehacer / restablecer están disponibles y no rompen la app', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');

  await page.locator('[data-elemento="nombre"]').click();
  await page.locator('.editor-plantilla__panel input[type="range"]').first().fill('100');
  await page.waitForTimeout(500); // debounce del historial

  await expect(page.locator('[data-accion="deshacer"]')).toBeEnabled();
  await page.locator('[data-accion="deshacer"]').click();
  await expect(page.locator('[data-accion="rehacer"]')).toBeEnabled();

  await page.locator('[data-accion="restablecer-plantilla"]').click();
  await page.locator('[data-accion="confirmar-borrar"]').click();
  await expect(page.locator('#toast')).toHaveText(/restablecida/i);
});
