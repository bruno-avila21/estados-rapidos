// Selección múltiple persistente + hoja de revisión (CREAR-BRIEF.md, cambio 2026-09-27).
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FOTO = path.join(AQUI, 'fixtures', 'producto.png');

async function crearProducto(page, { nombre, precio, descripcion = '' } = {}) {
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill(nombre);
  await page.locator('#campo-precio').fill(precio);
  if (descripcion) await page.locator('#campo-descripcion').fill(descripcion);
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
        dimensiones.push({ w: bitmap.width, h: bitmap.height, tipo: archivo.type });
        bitmap.close?.();
      }
      window.__compartir.llamadas.push({ text: datos.text, cantidad: datos.files?.length ?? 0, dimensiones });
      return Promise.resolve();
    };
  });
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('la selección de cada producto persiste tras recargar', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'Uno', precio: '1000' });
  await crearProducto(page, { nombre: 'Dos', precio: '2000' });

  // nuevos productos arrancan marcados (CREAR-BRIEF.md)
  const checks = page.locator('[data-accion="seleccionar"]');
  await expect(checks).toHaveCount(2);
  await expect(checks.nth(0)).toBeChecked();

  await checks.nth(0).uncheck();
  // esperar la confirmación visible de que la escritura async en IndexedDB terminó, antes de
  // recargar: uncheck() resuelve al despachar el evento, no al terminar el handler (BUGS.md #12).
  await expect(page.locator('[data-accion="publicar-seleccionados"]')).toHaveText('Publicar 1');
  await page.reload();
  await expect(page.locator('[data-accion="seleccionar"]').nth(0)).not.toBeChecked();
  await expect(page.locator('[data-accion="seleccionar"]').nth(1)).toBeChecked();
});

test('marcar todos / desmarcar afectan a todos los productos', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'A', precio: '100' });
  await crearProducto(page, { nombre: 'B', precio: '200' });

  await page.locator('[data-accion="desmarcar-todos"]').click();
  for (const check of await page.locator('[data-accion="seleccionar"]').all()) {
    await expect(check).not.toBeChecked();
  }
  await expect(page.locator('[data-accion="publicar-seleccionados"]')).toHaveCount(0);

  await page.locator('[data-accion="marcar-todos"]').click();
  for (const check of await page.locator('[data-accion="seleccionar"]').all()) {
    await expect(check).toBeChecked();
  }
  await expect(page.locator('[data-accion="publicar-seleccionados"]')).toHaveText('Publicar 2');
});

test('hoja de revisión con 3 productos: arma 3 imágenes 1080x1920, texto editable, comparte todo junto', async ({ page }) => {
  await mockearCompartir(page);
  await page.goto('/');
  await crearProducto(page, { nombre: 'Remera', precio: '10000', descripcion: 'Talle M' });
  await crearProducto(page, { nombre: 'Pantalón', precio: '20000' }); // sin descripción propia: usa el modelo
  await crearProducto(page, { nombre: 'Gorra', precio: '8000', descripcion: 'Ajustable' });

  await page.locator('[data-accion="publicar-seleccionados"]').click();
  const hoja = page.locator('.hoja-revision');
  await expect(hoja).toBeVisible();
  await expect(hoja.locator('[role="status"]')).toHaveText('', { timeout: 10_000 }); // progreso terminó (queda vacío)
  await expect(hoja.locator('.hoja-revision__miniatura')).toHaveCount(3);

  const textarea = hoja.locator('#revision-descripcion');
  const texto = await textarea.inputValue();
  expect(texto.split('\n')).toHaveLength(3);
  expect(texto).toContain('Talle M');
  expect(texto).toContain('Ajustable');
  expect(texto).toMatch(/Pantalón a \$ 20\.000/); // el que no tenía descripción usó el modelo

  await textarea.fill('Texto editado a mano para los 3');
  await hoja.locator('[data-accion="revision-compartir"]').click();
  await expect(page.locator('#toast')).toHaveText(/Mi estado/);

  const llamadas = await page.evaluate(() => window.__compartir.llamadas);
  expect(llamadas).toHaveLength(1);
  expect(llamadas[0].cantidad).toBe(3);
  expect(llamadas[0].text).toBe('Texto editado a mano para los 3');
  for (const dim of llamadas[0].dimensiones) {
    expect(dim).toEqual({ w: 1080, h: 1920, tipo: 'image/png' });
  }
});

test('Publicar de una tarjeta abre la hoja con 1 sola imagen', async ({ page }) => {
  await mockearCompartir(page);
  await page.goto('/');
  await crearProducto(page, { nombre: 'Solo uno', precio: '5000' });
  await page.locator('[data-accion="publicar"]').first().click();
  await expect(page.locator('.hoja-revision__miniatura')).toHaveCount(1, { timeout: 10_000 });
  await page.locator('[data-accion="revision-compartir"]').click();
  await expect(page.locator('#toast')).toHaveText(/Mi estado/); // espera a que termine la cadena async
  const llamadas = await page.evaluate(() => window.__compartir.llamadas);
  expect(llamadas[0].cantidad).toBe(1);
});

test('el selector de estilo de la hoja regenera las imágenes', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'Reversible', precio: '3000' });
  await page.locator('[data-accion="publicar"]').first().click();
  await expect(page.locator('.hoja-revision__miniatura')).toHaveCount(1, { timeout: 10_000 });
  const primeraImagen = await page.locator('.hoja-revision__miniatura').first().getAttribute('src');

  await page.locator('#revision-estilo').selectOption('foto-precio');
  await expect(page.locator('.hoja-revision__miniatura')).toHaveCount(1, { timeout: 10_000 });
  const segundaImagen = await page.locator('.hoja-revision__miniatura').first().getAttribute('src');
  expect(segundaImagen).not.toBe(primeraImagen);
});

// La hoja tenía su propia copia de las etiquetas y le faltaba el 4º estilo: la opción salía en
// blanco (QA v4, BUGS.md). Ahora usa la tabla de modelo.js; esto cuida que ninguna quede vacía.
test('el selector de estilo de la hoja tiene etiqueta en todas sus opciones', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'Etiquetas', precio: '1000' });
  await page.locator('[data-accion="publicar"]').first().click();
  await expect(page.locator('#revision-estilo option')).toHaveCount(5); // la hoja se arma async
  const textos = await page.locator('#revision-estilo option').allTextContents();
  expect(textos).toHaveLength(5); // "El de cada producto" + los 4 estilos
  for (const t of textos) expect(t.trim()).not.toBe('');
  expect(textos).toContain('Foto con descripción');
});

// Atrás (el botón de Android) cierra la hoja y deja la lista usable; antes la hoja quedaba encima
// de la pantalla siguiente tapándolo todo (BUGS.md #20).
test('Atrás cierra la hoja de revisión y no cambia de pantalla', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'Atrás', precio: '100' });
  await page.locator('[data-accion="publicar"]').first().click();
  await expect(page.locator('.hoja-revision')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.hoja-revision')).toHaveCount(0);
  await expect(page.locator('[data-accion="agregar"]')).toBeVisible();
  await page.locator('[data-accion="agregar"]').click(); // la lista responde: nada la tapa
  await expect(page.locator('#campo-nombre')).toBeVisible();
});

test('cerrar la hoja con la X no deja un paso de más en el historial', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'Equis', precio: '100' });
  const largo = await page.evaluate(() => history.length);
  await page.locator('[data-accion="publicar"]').first().click();
  await expect(page.locator('.hoja-revision')).toBeVisible();
  await page.locator('[data-accion="revision-cerrar"]').click();
  await expect(page.locator('.hoja-revision')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => history.state?.hojaRevision ?? null)).toBeNull();
  expect(await page.evaluate(() => history.length)).toBeGreaterThanOrEqual(largo);
});
