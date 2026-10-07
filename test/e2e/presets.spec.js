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

// Ronda "orden del diseño" (CREAR-BRIEF.md 2026-09-29): la galería "Estilo de las imágenes" (con
// miniatura + botón Editar) se mudó de Ajustes a Plantilla, namespace `estilo-general-*` — no
// confundir con la galería "Presets de composición" (`estilo-<preset>` sin namespace, más abajo en
// este mismo archivo), que selecciona-y-navega-y-permite-deshacer en vez de solo marcar el general.
for (const preset of ['banner-inferior', 'editorial', 'polaroid', 'story-inmersiva', 'novedad', 'ficha-natural']) {
  test(`Plantillas: la tarjeta del preset "${preset}" tiene miniatura en vivo y botón Editar`, async ({
    page,
  }) => {
    await page.goto('/');
    await crearProducto(page, { nombre: 'Producto presets', precio: '8000' });
    await page.goto('/#/plantillas');
    const tarjeta = page.locator('.grilla-estilos--general .tarjeta-estilo', {
      has: page.locator(`[data-accion="estilo-general-${preset}"]`),
    });
    await expect(tarjeta.locator('img')).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
    await expect(page.locator(`[data-accion="editar-estilo-general-${preset}"]`)).toBeVisible();
  });
}

// Pedido 2026-10-07: las plantillas tienen pantalla propia con favoritas (antes eran dos galerías
// dentro del editor, con un "Deshacer preset" que ya no existe: elegir otra es un toque).
test('Plantillas: la estrella marca favoritas y el filtro "Favoritas" muestra solo esas', async ({ page }) => {
  await page.goto('/#/plantillas');
  const visibles = page.locator('.tarjeta-estilo:visible');
  await expect(page.locator('[data-accion="filtro-todas"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(visibles).toHaveCount(10);

  // Sin favoritas el filtro muestra un estado vacío con salida, no una pantalla en blanco.
  await page.locator('[data-accion="filtro-favoritas"]').click();
  await expect(page.locator('[data-estado="sin-favoritas"]')).toBeVisible();
  await expect(visibles).toHaveCount(0);
  await page.locator('[data-accion="ver-todas-plantillas"]').click();
  await expect(visibles).toHaveCount(10);

  const estrella = page.locator('[data-accion="favorita-polaroid"]');
  const caja = await estrella.boundingBox();
  expect(caja.width).toBeGreaterThanOrEqual(32);
  await estrella.click();
  await expect(estrella).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#toast')).toHaveText(/Polaroid: en Favoritas/);
  // marcar favorita no cambia la plantilla en uso
  await expect(page.locator('[data-accion="estilo-general-solo-foto"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-accion="filtro-favoritas"]').click();
  await expect(visibles).toHaveCount(1);
  await expect(page.locator('[data-accion="filtro-favoritas"]')).toContainText('1');

  // Persiste, y con favoritas guardadas la pantalla abre directamente en ese filtro.
  await page.reload();
  await expect(page.locator('[data-accion="filtro-favoritas"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(visibles).toHaveCount(1);
  await expect(page.locator('[data-accion="favorita-polaroid"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-accion="favorita-polaroid"]').click();
  await expect(page.locator('[data-estado="sin-favoritas"]')).toBeVisible();
});

test('Plantillas: tocar una la deja en uso (se ve en Ajustes) y el editor ya no trae galerías', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'Elegir plantilla', precio: '4500' });
  await page.goto('/#/plantillas');
  await page.locator('[data-accion="estilo-general-polaroid"]').click();
  await expect(page.locator('#toast')).toHaveText(/Plantilla en uso: Polaroid/);

  await page.goto('/#/ajustes');
  await expect(page.locator('[data-dato="plantilla-en-uso"]')).toHaveText('Polaroid');
  await page.locator('[data-accion="ir-plantilla"]').click();
  await expect(page).toHaveURL(/#\/plantilla$/);
  await expect(page.locator('#editor-vista-previa-estilo')).toHaveValue('polaroid');
  await expect(page.locator('.tarjeta-estilo')).toHaveCount(0);

  await page.locator('[data-accion="ir-plantillas"]').click();
  await expect(page).toHaveURL(/#\/plantillas$/);
  await expect(page.locator('[data-accion="estilo-general-polaroid"]')).toHaveAttribute('aria-pressed', 'true');
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

// --- "Datos del negocio" (ronda 2026-09-29): "Nombre del negocio" (banner-inferior/editorial) y
// "Texto del botón" (solo banner-inferior) — ajustes GENERALES, se guardan y solo se muestran
// mientras se edita un preset que efectivamente los dibuja. ---

test('Plantilla: "Datos del negocio" solo aparece en los presets que los dibujan (banner-inferior/editorial), no en polaroid/story', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'Datos del negocio', precio: '5000' });

  await page.goto('/#/plantilla?estilo=banner-inferior');
  await expect(page.locator('#campo-nombre-negocio')).toBeVisible();
  await expect(page.locator('#campo-texto-boton')).toBeVisible();

  await page.goto('/#/plantilla?estilo=editorial');
  await expect(page.locator('#campo-nombre-negocio')).toBeVisible();
  await expect(page.locator('#campo-texto-boton')).toBeHidden();

  await page.goto('/#/plantilla?estilo=polaroid');
  await expect(page.locator('#campo-nombre-negocio')).toBeHidden();
  await expect(page.locator('#campo-texto-boton')).toBeHidden();

  await page.goto('/#/plantilla?estilo=story-inmersiva');
  await expect(page.locator('#campo-nombre-negocio')).toBeHidden();
  await expect(page.locator('#campo-texto-boton')).toBeHidden();
});

test('Plantilla: "Nombre del negocio"/"Texto del botón" se guardan y persisten entre visitas', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'Persistencia negocio', precio: '5000' });
  await page.goto('/#/plantilla?estilo=banner-inferior');

  await page.locator('#campo-nombre-negocio').fill('Taller Tierra Firme');
  await page.locator('#campo-texto-boton').fill('Escribime');
  await page.waitForTimeout(450); // debounce de guardado (350ms)

  await page.reload();
  await expect(page.locator('#campo-nombre-negocio')).toHaveValue('Taller Tierra Firme');
  await expect(page.locator('#campo-texto-boton')).toHaveValue('Escribime');
});
