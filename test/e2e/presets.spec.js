// Catálogo de presets de composición (Fase 4, 2026-09-28): banner inferior/editorial/polaroid/story
// inmersiva. Cubre lo que no cubren ajustes.spec.js (tarjetas genéricas de Ajustes, ya actualizado a
// 8) ni revision.spec.js (selector de estilo genérico, ya actualizado a 9 opciones): la galería
// PROPIA del editor de plantilla (elegir con un toque + deshacer) y que publicar con un preset
// realmente genera la imagen final (blob 1080×1920).
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FOTO = path.join(AQUI, 'fixtures', 'producto.png');

async function crearProducto(page, { nombre, precio } = {}) {
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill(nombre);
  await page.locator('#campo-precio').fill(precio);
  await page.locator('[data-accion-input="elegir-galeria"]').setInputFiles(FOTO);
  await page.locator('[data-accion="guardar"]').click();
  await expect(page.locator('[data-accion="editar"]', { hasText: nombre })).toBeVisible();
}

async function mockearCompartir(page) {
  await page.addInitScript(() => {
    window.__compartir = { llamadas: [] };
    navigator.canShare = (datos) => Array.isArray(datos?.files) && datos.files.length > 0;
    navigator.share = async (datos) => {
      const dimensiones = [];
      for (const archivo of datos.files ?? []) {
        const bitmap = await createImageBitmap(archivo);
        dimensiones.push({ w: bitmap.width, h: bitmap.height, tipo: archivo.type, bytes: archivo.size });
        bitmap.close?.();
      }
      window.__compartir.llamadas.push({ dimensiones });
      return Promise.resolve();
    };
  });
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

for (const preset of ['banner-inferior', 'editorial', 'polaroid', 'story-inmersiva']) {
  test(`Ajustes: la tarjeta del preset "${preset}" tiene miniatura en vivo y botón Editar`, async ({ page }) => {
    await page.goto('/');
    await crearProducto(page, { nombre: 'Producto presets', precio: '8000' });
    await page.goto('/#/ajustes');
    const tarjeta = page.locator('.tarjeta-estilo', { has: page.locator(`[data-accion="estilo-${preset}"]`) });
    await expect(tarjeta.locator('img')).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
    await expect(page.locator(`[data-accion="editar-estilo-${preset}"]`)).toBeVisible();
  });
}

test('Plantilla: la galería de presets tiene las 4 miniaturas en vivo del producto de ejemplo', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'Ejemplo galería', precio: '6000' });
  await page.goto('/#/plantilla?estilo=editorial');
  const galeria = page.locator('.grilla-estilos--galeria .tarjeta-estilo');
  await expect(galeria).toHaveCount(4);
  for (const tarjeta of await galeria.all()) {
    await expect(tarjeta.locator('img')).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
  }
});

test('Plantilla: elegir un preset de la galería lo aplica con un toque, pasa a editarlo y ofrece Deshacer', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'Elegir preset', precio: '4500' });

  // "Deshacer preset" vuelve al ESTILO GENERAL anterior (no a "lo que se estaba mirando en el
  // editor" — son cosas distintas): se fija a propósito el estilo general en "editorial" primero
  // (como si el usuario ya lo hubiera elegido antes, en Ajustes o en la propia galería) para poder
  // comprobar que deshacer vuelve exactamente ahí.
  await page.goto('/#/ajustes');
  await page.locator('[data-accion="estilo-editorial"]').click();
  await expect(page.locator('[data-accion="estilo-editorial"]')).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/#/plantilla?estilo=editorial');
  await expect(page.locator('[data-accion="deshacer-preset"]')).toBeHidden();

  await page.locator('[data-accion="estilo-polaroid"]').scrollIntoViewIfNeeded();
  await page.locator('[data-accion="estilo-polaroid"]').click();
  await expect(page).toHaveURL(/estilo=polaroid/);
  await expect(page.locator('#toast')).toHaveText(/Preset aplicado: Polaroid/);

  // Un preset DISTINTO del estilo general anterior (editorial → polaroid) es lo que dispara
  // "Deshacer preset" — reaplicar el mismo no cambia nada, no tiene sentido ofrecer deshacer.
  await expect(page.locator('[data-accion="deshacer-preset"]')).toBeVisible();
  await page.locator('[data-accion="deshacer-preset"]').scrollIntoViewIfNeeded();
  await page.locator('[data-accion="deshacer-preset"]').click();
  await expect(page).toHaveURL(/estilo=editorial/);
  await expect(page.locator('#toast')).toHaveText(/Preset deshecho/);
});

test('Publicar con un preset de composición elegido genera una imagen final 1080×1920 real', async ({ page }) => {
  await mockearCompartir(page);
  await page.goto('/');
  await crearProducto(page, { nombre: 'Publicar preset', precio: '9900' });
  await page.locator('[data-accion="publicar"]').first().click();
  await expect(page.locator('.hoja-revision__miniatura')).toHaveCount(1, { timeout: 10_000 });

  await page.locator('#revision-estilo').selectOption('story-inmersiva');
  await page.waitForFunction(() => {
    const img = document.querySelector('.hoja-revision__miniatura');
    return !!img?.getAttribute('src');
  });

  await page.locator('[data-accion="revision-compartir"]').click();
  await expect(page.locator('#toast')).toHaveText(/Mi estado/);
  const llamadas = await page.evaluate(() => window.__compartir.llamadas);
  expect(llamadas).toHaveLength(1);
  const [{ dimensiones }] = llamadas;
  expect(dimensiones).toHaveLength(1);
  expect(dimensiones[0]).toMatchObject({ w: 1080, h: 1920, tipo: 'image/jpeg' });
  expect(dimensiones[0].bytes).toBeGreaterThan(0);
});
