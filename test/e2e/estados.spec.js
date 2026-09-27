// Estados vacío / error / offline diseñados (checklist de cierre.md).
import { test, expect } from '@playwright/test';

test('estado vacío: invita a agregar el primero', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Todavía no cargaste productos')).toBeVisible();
  await expect(page.locator('[data-accion="agregar"]')).toBeVisible();
});

test('estado de error: producto inexistente muestra un cartel legible', async ({ page }) => {
  await page.goto('/#/producto/no-existe-123');
  await expect(page.locator('[role="alert"]', { hasText: /ya no existe/i })).toBeVisible();
});

test('estado offline: avisa sin romper la app', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#aviso-offline')).toBeHidden();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('#aviso-offline')).toBeVisible();
  await expect(page.locator('#aviso-offline')).toHaveText(/Sin conexión/);
  // la app se sigue pudiendo usar (todo es local, IndexedDB no depende de la red)
  await page.locator('[data-accion="agregar"]').click();
  await expect(page.locator('#campo-nombre')).toBeVisible();
  await context.setOffline(false);
});

test('confirmación de borrado es propia, nunca confirm() nativo', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill('A borrar');
  await page.locator('#campo-precio').fill('500');
  await page.locator('[data-accion="guardar"]').click();

  let seAbrioDialogoNativo = false;
  page.on('dialog', () => {
    seAbrioDialogoNativo = true;
  });

  await page.locator('[data-accion="borrar"]').first().click();
  await expect(page.locator('.dialogo')).toBeVisible();
  await page.locator('[data-accion="cancelar"]').click();
  await expect(page.locator('.dialogo')).toBeHidden();
  expect(seAbrioDialogoNativo).toBe(false);

  await page.locator('[data-accion="borrar"]').first().click();
  await page.locator('[data-accion="confirmar-borrar"]').click();
  await expect(page.getByText('Todavía no cargaste productos')).toBeVisible();
  expect(seAbrioDialogoNativo).toBe(false);
});
