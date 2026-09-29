// Cada acción visible hace algo (receta e2e.md), pero sin encadenar un loop único sobre un
// vocabulario fijo asumiendo en qué pantalla deja cada botón anterior: eso resultó frágil
// (BUGS.md #4). Un test por acción, cada uno arranca desde una pantalla conocida.
import { test, expect } from '@playwright/test';

async function crearProducto(page, { nombre = 'Producto de prueba', precio = '1000' } = {}) {
  await page.goto('/');
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill(nombre);
  await page.locator('#campo-precio').fill(precio);
  await page.locator('[data-accion="guardar"]').click();
  await expect(page.locator('[data-accion="editar"]', { hasText: nombre })).toBeVisible();
}

test('ir-ajustes / ir-respaldo / ir-lista cambian de pantalla', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-accion="ir-ajustes"]').first().click();
  await expect(page).toHaveURL(/#\/ajustes$/);
  await expect(page.locator('#titulo-pantalla')).toHaveText('Ajustes');

  // Ajustes también tiene su propio botón "Ir a Respaldo" (sección Datos): apuntar al de la nav.
  await page.locator('.nav-inferior [data-accion="ir-respaldo"]').click();
  await expect(page).toHaveURL(/#\/respaldo$/);
  // Respaldo (respaldo_natural, Fase 5): el header ahora muestra la MARCA ("Estados Rápidos"), no
  // el nombre de la pantalla — el H1 real ("Respaldo") vive en el contenido.
  await expect(page.locator('#titulo-pantalla')).toHaveText('Estados Rápidos');
  await expect(page.locator('h1.pagina__titulo')).toHaveText('Respaldo');

  await page.locator('[data-accion="ir-lista"]').click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('#titulo-pantalla')).toHaveText('Estados Rápidos');
});

test('agregar abre el alta y cancelar vuelve sin guardar', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-accion="agregar"]').click();
  await expect(page.locator('[data-accion="guardar"]')).toBeVisible();

  await page.locator('[data-accion="cancelar"]').click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByText('Todavía no cargaste productos')).toBeVisible();
});

test('editar abre el detalle con los datos cargados', async ({ page }) => {
  await crearProducto(page, { nombre: 'Campera', precio: '30000' });
  await page.locator('[data-accion="editar"]').click();
  await expect(page.locator('#campo-nombre')).toHaveValue('Campera');
  await expect(page.locator('#campo-precio')).toHaveValue('30000');
});

test('publicar arma la imagen (mock de compartir) y avisa por toast', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    navigator.share = async () => {};
  });
  await crearProducto(page);
  await page.locator('[data-accion="publicar"]').click();
  await expect(page.locator('.hoja-revision__miniatura')).toHaveCount(1, { timeout: 10_000 });
  await page.locator('[data-accion="revision-compartir"]').click();
  await expect(page.locator('#toast')).toHaveText(/Mi estado/);
});

test('borrar desde la lista pide confirmación y, al confirmar, borra', async ({ page }) => {
  await crearProducto(page, { nombre: 'A borrar' });
  await page.locator('[data-accion="borrar"]').click();
  await expect(page.locator('.dialogo')).toBeVisible();
  await page.locator('[data-accion="confirmar-borrar"]').click();
  await expect(page.getByText('Todavía no cargaste productos')).toBeVisible();
});

test('borrar desde el detalle pide confirmación y, al confirmar, vuelve a la lista vacía', async ({ page }) => {
  await crearProducto(page, { nombre: 'Otro a borrar' });
  await page.locator('[data-accion="editar"]').click();
  await page.locator('[data-accion="borrar"]').click();
  await expect(page.locator('.dialogo')).toBeVisible();
  await page.locator('[data-accion="confirmar-borrar"]').click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByText('Todavía no cargaste productos')).toBeVisible();
});

test('exportar dispara la descarga del respaldo', async ({ page }) => {
  await crearProducto(page);
  await page.locator('[data-accion="ir-respaldo"]').click();
  const descargaPromesa = page.waitForEvent('download');
  await page.locator('[data-accion="exportar"]').click();
  const descarga = await descargaPromesa;
  expect(descarga.suggestedFilename()).toMatch(/\.json$/);
});

test('precio vacío es válido (producto sin precio); negativo sigue siendo error (CREAR-BRIEF.md 2026-09-27)', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill('Sin precio');
  await page.locator('#campo-precio').fill('');
  await page.locator('[data-accion="guardar"]').click();
  await expect(page.locator('[data-accion="editar"]', { hasText: 'Sin precio' })).toBeVisible(); // se guardó
  await expect(page.locator('[data-accion="precio"]').first()).toHaveValue(''); // "Sin precio" es el placeholder

  await page.locator('[data-accion="editar"]', { hasText: 'Sin precio' }).click();
  await page.locator('#campo-precio').fill('-500');
  await page.locator('[data-accion="guardar"]').click();
  // '../..': el precio ahora vive en `.campo__envoltorio` (prefijo "$", Fase 5 reskin
  // editar_producto_natural) — el error sigue siendo hermano de ese envoltorio, no del input.
  await expect(page.locator('#campo-precio').locator('../..').locator('.campo__error')).toHaveText(/mayor a cero/i);
  await expect(page).toHaveURL(/#\/producto\//); // no navegó: no se guardó el negativo
});

test('precio vacío editado en línea desde la lista lo quita (válido); negativo se revierte (QA.md #8 + CREAR-BRIEF.md)', async ({ page }) => {
  await crearProducto(page, { nombre: 'Con precio', precio: '10000' });
  const inputPrecio = page.locator('[data-accion="precio"]').first();

  await inputPrecio.fill('-500');
  await inputPrecio.blur();
  await expect(page.locator('#toast')).toHaveText(/mayor a cero/i);
  await expect(inputPrecio).toHaveValue('$ 10.000'); // se revierte, no se guarda el negativo

  await inputPrecio.fill('');
  await inputPrecio.blur();
  await expect(page.locator('#toast')).toHaveText(/Precio quitado/);
  await expect(inputPrecio).toHaveValue('');
  await expect(inputPrecio).toHaveAttribute('placeholder', 'Sin precio');
});

test('borrar todos los datos: pide confirmación fuerte y vuelve al vacío sin recargar (QA.md #5)', async ({ page }) => {
  await crearProducto(page, { nombre: 'Para borrar todo' });
  await page.evaluate(() => { window.__marca = 'sigo-vivo'; }); // si hubiera reload, se pierde
  await page.locator('[data-accion="ir-respaldo"]').click();

  await page.locator('[data-accion="borrar-todo"]').click();
  await expect(page.locator('.dialogo__mensaje')).toHaveText(/exportaste un respaldo/i);
  await page.locator('[data-accion="cancelar"]').click();
  await expect(page.locator('[data-accion="borrar-todo"]')).toBeVisible(); // no borró al cancelar

  await page.locator('[data-accion="borrar-todo"]').click();
  await page.locator('[data-accion="confirmar-borrar"]').click();
  await expect(page.locator('#toast')).toHaveText(/borrados/i);
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByText('Todavía no cargaste productos')).toBeVisible();
  expect(await page.evaluate(() => window.__marca)).toBe('sigo-vivo'); // no hubo reload
});

test('formato de precio con decimales (configurado en Ajustes) se refleja en la lista', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-accion="ir-ajustes"]').first().click();
  const casillaDecimales = page.locator('text=Mostrar decimales').locator('..').locator('input[type="checkbox"]');
  await casillaDecimales.check();
  await page.waitForTimeout(400); // debounce del guardado

  await crearProducto(page, { nombre: 'Con decimales', precio: '1234.5' });
  await expect(page.locator('[data-accion="precio"]').first()).toHaveValue('$ 1.234,50');
});
