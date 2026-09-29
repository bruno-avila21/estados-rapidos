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
    // `active` ya existe mientras el SW está "activating": cortar la red ahí cae antes de que
    // tome las navegaciones (BUGS.md #10). Hay que esperar "activated".
    return registro?.active?.state === 'activated';
  }, null, { timeout: 15_000 });

  // Causa real del flake (BUGS.md #50): `registration.active.state === 'activated'` es un flag
  // JS que puede quedar en `true` ANTES de que el proceso del navegador termine de establecer,
  // para ESTA página, el ruteo "SW-controlled" de navegaciones nuevas. Si la siguiente
  // navegación (la que corta la red) llega antes de esa sincronización, el navegador la trata
  // como no controlada: no dispara el fetch handler del SW y el abort() de abajo la mata de
  // verdad. La sincronización real es una navegación CON red que confirme
  // `navigator.serviceWorker.controller` — no un timeout a ciegas.
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });

  // `context.setOffline(true)` corta la red un nivel más abajo que el SW (CDP): ni siquiera
  // llega a evaluarse el fetch handler, así que nunca sirve desde Cache Storage (BUGS.md #3).
  // Bloquear con page.route sí deja pasar lo que el SW resuelve sin tocar la red real.
  await page.route('**/*', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/listo/);
  await expect(page.locator('[data-accion="agregar"]')).toBeVisible();
  await page.unroute('**/*');
});
