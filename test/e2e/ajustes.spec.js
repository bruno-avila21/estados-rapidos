// Ajustes: tarjetas de estilo con miniatura en vivo, editor de plantilla siempre accesible,
// descripción modelo (CREAR-BRIEF.md, rondas 2026-09-27).
import { test, expect } from '@playwright/test';

test('Plantilla no está en la navegación principal, pero el editor se abre desde Ajustes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-accion="ir-plantilla"]')).toHaveCount(0); // no está en la lista de productos
  await expect(page.locator('[data-accion="ir-ajustes"]').first()).toBeVisible();

  await page.locator('[data-accion="ir-ajustes"]').first().click();
  await page.locator('[data-accion="ir-plantilla"]').click();
  await expect(page).toHaveURL(/#\/plantilla$/);
  await expect(page.locator('#titulo-pantalla')).toHaveText('Plantilla');
});

test('las 4 tarjetas de estilo muestran una miniatura y se puede elegir una', async ({ page }) => {
  await page.goto('/#/ajustes');
  const tarjetas = page.locator('.tarjeta-estilo');
  await expect(tarjetas).toHaveCount(4);
  for (const tarjeta of await tarjetas.all()) {
    await expect(tarjeta.locator('img')).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
  }

  await expect(page.locator('[data-accion="estilo-solo-foto"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-accion="estilo-foto-precio"]').click();
  await expect(page.locator('[data-accion="estilo-foto-precio"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#toast')).toHaveText(/Foto con precio/);

  await page.reload();
  await expect(page.locator('[data-accion="estilo-foto-precio"]')).toHaveAttribute('aria-pressed', 'true');
});

test('la descripción modelo se guarda y se ve en el ejemplo', async ({ page }) => {
  await page.goto('/#/ajustes');
  const textarea = page.locator('#campo-descripcion-modelo');
  await textarea.fill('{nombre} — {precio}, escribinos');
  await page.waitForTimeout(400); // debounce del guardado
  await expect(page.locator('[role="status"]', { hasText: /Ejemplo:/ })).toHaveText(/Remera básica — \$ 12\.500, escribinos/);

  await page.reload();
  await expect(page.locator('#campo-descripcion-modelo')).toHaveValue('{nombre} — {precio}, escribinos');
});
