// "El mínimo del primer día" (CREAR-BRIEF.md): cargar un producto, ver la lista, cambiar el
// precio en línea, y Publicar arma un PNG 1080x1920 y llama a navigator.share con un File.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FOTO = path.join(AQUI, 'fixtures', 'producto.png');

// navigator.share/canShare no existen en Chromium headless: se mockean ANTES de cualquier
// navegación para poder verificar con qué se los llama (File PNG 1080x1920 + texto).
async function mockearCompartir(page) {
  await page.addInitScript(() => {
    window.__compartir = { llamadas: [] };
    navigator.canShare = (datos) => Array.isArray(datos?.files) && datos.files.length > 0;
    navigator.share = async (datos) => {
      const archivo = datos.files?.[0];
      let dimensiones = null;
      if (archivo) {
        const bitmap = await createImageBitmap(archivo);
        dimensiones = { w: bitmap.width, h: bitmap.height };
        bitmap.close?.();
      }
      window.__compartir.llamadas.push({
        text: datos.text,
        nombreArchivo: archivo?.name,
        tipoArchivo: archivo?.type,
        dimensiones,
      });
      return Promise.resolve();
    };
  });
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('mínimo del día 1: cargar producto, precio en línea, plantilla y publicar', async ({ page }) => {
  await mockearCompartir(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/listo/);

  // estado vacío al principio
  await expect(page.getByText('Todavía no cargaste productos')).toBeVisible();

  // alta de producto con foto desde "galería"
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill('Zapatillas urbanas');
  await page.locator('#campo-precio').fill('45000');
  await page.locator('#campo-descripcion').fill('Talles del 38 al 44. Envíos a todo el país.');
  await page.locator('[data-accion-input="elegir-galeria"]').setInputFiles(FOTO);
  await expect(page.locator('.foto-picker .vista-previa-estado__imagen')).toBeVisible();
  await page.locator('[data-accion="guardar"]').click();

  // vuelve a la lista y aparece la tarjeta con el precio formateado es-AR
  await expect(page.locator('[data-accion="editar"]', { hasText: 'Zapatillas urbanas' })).toBeVisible();
  const inputPrecio = page.locator('[data-accion="precio"]').first();
  await expect(inputPrecio).toHaveValue('$ 45.000');

  // precio editable en línea, sin entrar al detalle
  await inputPrecio.fill('39990');
  await inputPrecio.blur();
  await expect(page.locator('#toast')).toHaveText(/Precio actualizado/);
  await expect(inputPrecio).toHaveValue('$ 39.990');

  // recargar y el precio sigue
  await page.reload();
  await expect(page.locator('[data-accion="precio"]').first()).toHaveValue('$ 39.990');

  // Ajustes → Plantilla → "Mi plantilla": vista previa en vivo (ronda "orden del diseño"
  // 2026-09-29: la galería de estilos se mudó de Ajustes a Plantilla, namespace `estilo-general-*`).
  await page.locator('[data-accion="ir-ajustes"]').first().click();
  await page.locator('[data-accion="ir-plantillas"]').click(); // la galería vive en "Plantillas" (2026-10-07)
  await page.locator('[data-accion="estilo-general-mi-plantilla"]').click(); // fija el estilo general (para "Publicar" más abajo)
  await page.locator('[data-accion="editar-estilo-general-mi-plantilla"]').click(); // entra a verla en vivo
  await expect(page).toHaveURL(/estilo=mi-plantilla/);
  await expect(page.locator('.previa-plantilla')).toBeVisible();
  // La vista previa es un <canvas> dibujado en vivo (sin src): "listo" es que ya se dibujó.
  await expect
    .poll(() => page.evaluate(() => window.__editorDebugPlantilla?.revision ?? 0), { timeout: 5_000 })
    .toBeGreaterThan(0);

  // volver a la lista y Publicar: abre la hoja de revisión con la imagen ya armada
  await page.locator('[data-accion="ir-lista"]').click();
  await page.locator('[data-accion="publicar"]').first().click();
  await expect(page.locator('.hoja-revision__miniatura')).toHaveCount(1, { timeout: 10_000 });
  await page.locator('[data-accion="revision-compartir"]').click();
  await expect(page.locator('#toast')).toHaveText(/Mi estado/);

  const llamadas = await page.evaluate(() => window.__compartir.llamadas);
  expect(llamadas.length).toBe(1);
  // JPEG calidad 0.9 (no PNG): WhatsApp recomprime igual, y así se comparte más rápido/liviano
  // (ronda "publicar más rápido", CREAR-BRIEF.md 2026-09-28).
  expect(llamadas[0].tipoArchivo).toBe('image/jpeg');
  expect(llamadas[0].nombreArchivo).toMatch(/\.jpg$/);
  expect(llamadas[0].dimensiones).toEqual({ w: 1080, h: 1920 });
  expect(llamadas[0].text).toMatch(/Talles del 38/);

  // la descripción se copió al portapapeles antes de compartir
  const portapapeles = await page.evaluate(() => navigator.clipboard.readText());
  expect(portapapeles).toMatch(/Talles del 38/);
});

test('publicar sin soporte de compartir archivos cae a descargar', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.canShare = () => false;
  });
  await page.goto('/');
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill('Buzo');
  await page.locator('#campo-precio').fill('20000');
  await page.locator('[data-accion="guardar"]').click();

  await page.locator('[data-accion="publicar"]').first().click();
  await expect(page.locator('.hoja-revision__miniatura')).toHaveCount(1, { timeout: 10_000 });

  const descargaPromesa = page.waitForEvent('download');
  await page.locator('[data-accion="revision-compartir"]').click();
  const descarga = await descargaPromesa;
  expect(descarga.suggestedFilename()).toMatch(/\.jpg$/);
  await expect(page.locator('#toast')).toHaveText(/se descargó la imagen/);
});
