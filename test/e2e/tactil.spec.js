// En un celular el editor se usa con el dedo, y con touch el navegador captura el puntero en el
// elemento tocado: si ese elemento se reemplaza a mitad del gesto, el "soltar" no llega a window.
// Con mouse eso no pasa, por eso los E2E con mouse no lo vieron (QA v4, BUGS.md).
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FOTO = path.join(AQUI, 'fixtures', 'producto.png');

async function crearProducto(page) {
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill('Producto táctil');
  await page.locator('#campo-precio').fill('15000');
  await page.locator('[data-accion-input="elegir-galeria"]').setInputFiles(FOTO);
  await page.locator('[data-accion="guardar"]').click();
  await expect(page.locator('[data-accion="editar"]')).toBeVisible();
}

async function arrastrarConDedo(page, selector, dx, dy) {
  const caja = await page.locator(selector).boundingBox();
  const x = caja.x + caja.width / 2;
  const y = caja.y + caja.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const tocar = (type, px, py) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py }],
  });
  await tocar('touchStart', x, y);
  for (let i = 1; i <= 6; i++) await tocar('touchMove', x + (dx * i) / 6, y + (dy * i) / 6);
  await tocar('touchEnd', x + dx, y + dy);
}

const posicion = (page, clave) =>
  page.locator(`[data-elemento="${clave}"]`).evaluate((el) => ({ left: el.style.left, top: el.style.top }));

test('con el dedo: arrastrar mueve y deshacer lo devuelve', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantilla');
  // Esperar la primera vista previa: arrastrar antes compite con el render inicial del editor.
  await expect(page.locator('.editor-plantilla__imagen')).toHaveAttribute('src', /^blob:/);

  const inicial = await posicion(page, 'nombre');
  await arrastrarConDedo(page, '[data-elemento="nombre"]', 0, 120);
  const movido = await posicion(page, 'nombre');
  expect(movido.top).not.toBe(inicial.top);

  await expect(page.locator('[data-accion="deshacer"]')).toBeEnabled();
  // .click() y no .tap(): con la emulación táctil por CDP el primer toque después de un arrastre
  // no genera click (pasa igual en una página vacía: es del emulador, no de la app — BUGS.md #18).
  await page.locator('[data-accion="deshacer"]').click();
  await expect.poll(() => posicion(page, 'nombre')).toEqual(inicial);
  await expect(page.locator('[data-accion="rehacer"]')).toBeEnabled();
});
