// Ajustes: estilo general, descripción modelo, y Plantilla solo visible para "Mi plantilla"
// (CREAR-BRIEF.md, cambio 2026-09-27).
import { test, expect } from '@playwright/test';

test('Plantilla no está en la navegación principal', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-accion="ir-plantilla"]')).toHaveCount(0);
  await expect(page.locator('[data-accion="ir-ajustes"]').first()).toBeVisible();
});

test('elegir "Mi plantilla" muestra el link a Plantilla; otro estilo lo oculta', async ({ page }) => {
  await page.goto('/#/ajustes');
  const enlace = page.locator('[data-accion="ir-plantilla"]');
  await expect(enlace).toBeHidden();

  await page.locator('input[name="estilo-general"][value="mi-plantilla"]').check();
  await expect(enlace).toBeVisible();
  await enlace.click();
  await expect(page).toHaveURL(/#\/plantilla$/);
  await expect(page.locator('#titulo-pantalla')).toHaveText('Plantilla');

  await page.locator('[data-accion="ir-ajustes"]').first().click();
  await expect(page).toHaveURL(/#\/ajustes$/);
  await page.locator('input[name="estilo-general"][value="solo-foto"]').check();
  await expect(page.locator('[data-accion="ir-plantilla"]')).toBeHidden();
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
