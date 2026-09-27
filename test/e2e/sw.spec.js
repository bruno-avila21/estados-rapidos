// Smoke del Service Worker real (no mockeado): la lógica de ruteo ya tiene su unit test en
// test/sw-estrategia.test.js; acá se verifica el comportamiento end-to-end que ese unit test no
// puede ver (receta e2e.md, "Service Worker: verificarlo aparte de los E2E mockeados").
import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('el SW se instala y, sin red, la app sigue abriendo desde caché', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/listo/);

  await page.waitForFunction(async () => {
    const registro = await navigator.serviceWorker.getRegistration();
    return !!registro?.active;
  }, null, { timeout: 15_000 });

  // `context.setOffline(true)` corta la red un nivel más abajo que el SW (CDP): ni siquiera
  // llega a evaluarse el fetch handler, así que nunca sirve desde Cache Storage (BUGS.md #3).
  // Bloquear con page.route sí deja pasar lo que el SW resuelve sin tocar la red real.
  await page.route('**/*', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/listo/);
  await expect(page.locator('[data-accion="agregar"]')).toBeVisible();
  await page.unroute('**/*');
});
