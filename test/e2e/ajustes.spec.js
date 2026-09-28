// Ajustes: tarjetas de estilo con miniatura en vivo, editor de plantilla siempre accesible,
// descripción modelo (CREAR-BRIEF.md, rondas 2026-09-27; "ajustes por estilo" 2026-09-28).
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FOTO = path.join(AQUI, 'fixtures', 'producto.png');

async function crearProducto(page) {
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill('Producto ajustes');
  await page.locator('#campo-precio').fill('5000');
  await page.locator('[data-accion-input="elegir-galeria"]').setInputFiles(FOTO);
  await page.locator('[data-accion="guardar"]').click();
  await expect(page.locator('[data-accion="editar"]')).toBeVisible();
}

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

// --- "Editar" por tarjeta + badge "Personalizado" (ronda "ajustes por estilo", 2026-09-28) ---

test('"Solo la foto" no tiene botón Editar (no es editable); los otros 3 sí', async ({ page }) => {
  await page.goto('/#/ajustes');
  await expect(page.locator('[data-accion="editar-estilo-solo-foto"]')).toHaveCount(0);
  for (const estilo of ['foto-precio', 'foto-descripcion', 'mi-plantilla']) {
    await expect(page.locator(`[data-accion="editar-estilo-${estilo}"]`)).toBeVisible();
  }
});

test('"Editar" de una tarjeta abre el editor en ESE estilo', async ({ page }) => {
  await page.goto('/#/ajustes');
  await page.locator('[data-accion="editar-estilo-foto-descripcion"]').click();
  await expect(page).toHaveURL(/#\/plantilla\?estilo=foto-descripcion/);
  await expect(page.locator('#editor-vista-previa-estilo')).toHaveValue('foto-descripcion');
});

test('badge "Personalizado" en la tarjeta de Ajustes aparece después de editar ese estilo', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/ajustes');
  const tarjetaFotoPrecio = page.locator('.tarjeta-estilo', { has: page.locator('[data-accion="estilo-foto-precio"]') });
  await expect(tarjetaFotoPrecio.locator('.tarjeta-estilo__badge')).toBeHidden();

  await page.locator('[data-accion="editar-estilo-foto-precio"]').click();
  await expect(page).toHaveURL(/estilo=foto-precio/);
  const caja = await page.locator('[data-elemento="nombre"]').boundingBox();
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2 + 100, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.editor-plantilla__badge')).toBeVisible();
  await page.waitForTimeout(100); // deja que la escritura a IndexedDB (persistir) termine antes de navegar

  await page.locator('[data-accion="ir-ajustes"]').first().click();
  await expect(tarjetaFotoPrecio.locator('.tarjeta-estilo__badge')).toBeVisible();
});

// --- Encuadre de la foto (ronda "foto entera") ---

test('encuadre de la foto: "Entera" por defecto, se puede cambiar a "Llenar la pantalla" y persiste', async ({ page }) => {
  await page.goto('/#/ajustes');
  await expect(page.locator('[data-accion="encuadre-contain"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-accion="encuadre-cover"]')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('[data-accion="encuadre-cover"]').click();
  await expect(page.locator('[data-accion="encuadre-cover"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#toast')).toHaveText(/Llenar la pantalla/);

  await page.reload();
  await expect(page.locator('[data-accion="encuadre-cover"]')).toHaveAttribute('aria-pressed', 'true');
});

// --- "La app": instalar/compartir/QR (ronda "instalar y compartir la app") ---

test('"La app": sin prompt nativo (entorno de test) muestra instrucciones cortas para instalar', async ({ page }) => {
  await page.goto('/#/ajustes');
  await expect(page.locator('[data-estado="instrucciones-instalar"]')).toBeVisible();
  await expect(page.locator('[data-estado="instrucciones-instalar"]')).toContainText('Instalar app');
});

test('"La app": dibuja un QR con el link de la app', async ({ page }) => {
  await page.goto('/#/ajustes');
  const canvas = page.locator('.qr-app__canvas');
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => canvas.evaluate((el) => el.width), { timeout: 5_000 })
    .toBeGreaterThan(0);
  const dimensiones = await canvas.evaluate((el) => ({ w: el.width, h: el.height }));
  expect(dimensiones.w).toBeGreaterThan(0);
  expect(dimensiones.h).toBeGreaterThan(0);
  await expect(page.locator('.qr-app__link')).toHaveText(/^https?:\/\//);
});

test('"Compartir la app" usa navigator.share si está disponible', async ({ page }) => {
  await page.goto('/#/ajustes');
  await page.evaluate(() => {
    window.__compartidoApp = null;
    navigator.share = async (datos) => {
      window.__compartidoApp = datos;
    };
  });
  await page.locator('[data-accion="compartir-app"]').click();
  await expect.poll(() => page.evaluate(() => window.__compartidoApp?.url)).toMatch(/^https?:\/\//);
});

test('"Compartir la app" sin navigator.share copia el link (fallback)', async ({ page }) => {
  await page.goto('/#/ajustes');
  await page.evaluate(() => {
    // @ts-ignore
    delete navigator.share;
    window.__copiado = null;
    navigator.clipboard.writeText = async (texto) => {
      window.__copiado = texto;
    };
  });
  await page.locator('[data-accion="compartir-app"]').click();
  await expect(page.locator('#toast')).toHaveText(/copiado/i);
  const copiado = await page.evaluate(() => window.__copiado);
  expect(copiado).toMatch(/^https?:\/\//);
});
