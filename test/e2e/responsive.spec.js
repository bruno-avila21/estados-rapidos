// La barra del editor (Deshacer / Rehacer / Acomodar / Restablecer) se salía de la pantalla en un
// celular real (~412px CSS de ancho, Samsung de Bruno) — "Restablecer" quedaba cortado a la
// derecha (BUGS.md, ronda "editor en el celular"). Verifica que entra SIEMPRE en 360-412px, sin
// scroll horizontal, en los dos anchos típicos de celular Android.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FOTO = path.join(AQUI, 'fixtures', 'producto.png');

async function crearProducto(page) {
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill('Producto responsive');
  await page.locator('#campo-precio').fill('9990');
  await page.locator('[data-accion-input="elegir-galeria"]').setInputFiles(FOTO);
  await page.locator('[data-accion="guardar"]').click();
  await expect(page.locator('[data-accion="editar"]')).toBeVisible();
}

for (const ancho of [360, 412]) {
  test(`editor de plantilla: sin scroll horizontal y la barra entra en el viewport (${ancho}px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 800 });
    await page.goto('/');
    await crearProducto(page);
    await page.goto('/#/plantilla?estilo=mi-plantilla');

    // Nada de la pantalla se sale a la derecha (scrollWidth === innerWidth, sin overflow-x).
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth))
      .toBe(true);

    // Cada botón de la barra (Deshacer/Rehacer/Acomodar/Restablecer) queda DENTRO del viewport.
    const botones = page.locator('.editor-plantilla__barra .boton');
    await expect(botones).toHaveCount(4);
    for (const boton of await botones.all()) {
      const caja = await boton.boundingBox();
      expect(caja.x).toBeGreaterThanOrEqual(0);
      expect(caja.x + caja.width).toBeLessThanOrEqual(ancho + 1); // +1px de margen por redondeo
    }
  });
}
