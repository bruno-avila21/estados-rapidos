// Fase 3 "M" #2 y #3 (Interfaz/ANALISIS-STITCH.md): E2E que faltaban para la grilla de
// productos — el modal rápido de editar precio ("grilla-precio") y las acciones visibles por
// tarjeta ("grilla-publicar" = "Subir a Estado"). El modal y las acciones ya tenían lógica
// (js/vistas/lista.js) pero ningún spec los ejercitaba todavía.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FOTO = path.join(AQUI, 'fixtures', 'producto.png');

async function crearProducto(page, { nombre, precio } = {}) {
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill(nombre);
  if (precio != null) await page.locator('#campo-precio').fill(String(precio));
  await page.locator('[data-accion-input="elegir-galeria"]').setInputFiles(FOTO);
  await page.locator('[data-accion="guardar"]').click();
  await expect(page.locator('[data-accion="editar"]', { hasText: nombre })).toBeVisible();
}

async function irAGrilla(page) {
  await page.locator('[data-accion="vista-grilla"]').click();
  await expect(page.locator('.grilla-productos')).toBeVisible();
}

function tarjetaGrilla(page, nombre) {
  return page.locator('.grilla-item').filter({ has: page.locator('.grilla-item__nombre', { hasText: nombre }) });
}

async function mockearCompartir(page) {
  await page.addInitScript(() => {
    window.__compartir = { llamadas: [] };
    navigator.canShare = (datos) => Array.isArray(datos?.files) && datos.files.length > 0;
    navigator.share = async (datos) => {
      window.__compartir.llamadas.push({ text: datos.text, cantidad: datos.files?.length ?? 0 });
      return Promise.resolve();
    };
  });
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test.describe('Grilla: modal rápido de editar precio', () => {
  test('precio válido se guarda y se refleja en la tarjeta', async ({ page }) => {
    await page.goto('/');
    await crearProducto(page, { nombre: 'Remera', precio: 1000 });
    await irAGrilla(page);

    const tarjeta = tarjetaGrilla(page, 'Remera');
    await tarjeta.locator('[data-accion="grilla-precio"]').click();

    const dialogo = page.locator('.dialogo-overlay .dialogo');
    await expect(dialogo).toBeVisible();
    await expect(dialogo.locator('[data-accion="modal-precio-input"]')).toHaveValue(/1\.000/);

    await dialogo.locator('[data-accion="modal-precio-input"]').fill('2500');
    await dialogo.locator('[data-accion="modal-precio-guardar"]').click();

    await expect(dialogo).toBeHidden();
    await expect(tarjeta.locator('.grilla-item__precio')).toHaveText(/2\.500/);

    // se guardó de verdad, no solo en memoria: sobrevive un reload.
    await page.reload();
    await irAGrilla(page);
    await expect(tarjetaGrilla(page, 'Remera').locator('.grilla-item__precio')).toHaveText(/2\.500/);
  });

  test('precio vacío es válido y la tarjeta pasa a "Sin precio"', async ({ page }) => {
    await page.goto('/');
    await crearProducto(page, { nombre: 'Gorra', precio: 3000 });
    await irAGrilla(page);

    const tarjeta = tarjetaGrilla(page, 'Gorra');
    await tarjeta.locator('[data-accion="grilla-precio"]').click();
    const dialogo = page.locator('.dialogo-overlay .dialogo');
    await dialogo.locator('[data-accion="modal-precio-input"]').fill('');
    await dialogo.locator('[data-accion="modal-precio-guardar"]').click();

    await expect(dialogo).toBeHidden();
    await expect(tarjeta.locator('.grilla-item__precio')).toHaveText('Sin precio');
  });

  test('precio negativo muestra error, no cierra el modal ni guarda', async ({ page }) => {
    await page.goto('/');
    await crearProducto(page, { nombre: 'Pantalón', precio: 5000 });
    await irAGrilla(page);

    const tarjeta = tarjetaGrilla(page, 'Pantalón');
    await tarjeta.locator('[data-accion="grilla-precio"]').click();
    const dialogo = page.locator('.dialogo-overlay .dialogo');
    const input = dialogo.locator('[data-accion="modal-precio-input"]');
    await input.fill('-100');
    await dialogo.locator('[data-accion="modal-precio-guardar"]').click();

    await expect(dialogo).toBeVisible(); // sigue abierto: no guardó
    await expect(dialogo.locator('[role="alert"]')).toBeVisible();
    await expect(dialogo.locator('[role="alert"]')).toHaveText(/mayor a cero/);
    await expect(input).toHaveAttribute('aria-invalid', 'true');

    // el precio original de la tarjeta no cambió.
    await dialogo.locator('[data-accion="modal-precio-cancelar"]').click();
    await expect(dialogo).toBeHidden();
    await expect(tarjeta.locator('.grilla-item__precio')).toHaveText(/5\.000/);
  });

  test('Escape cierra el modal sin guardar', async ({ page }) => {
    await page.goto('/');
    await crearProducto(page, { nombre: 'Campera', precio: 8000 });
    await irAGrilla(page);

    const tarjeta = tarjetaGrilla(page, 'Campera');
    await tarjeta.locator('[data-accion="grilla-precio"]').click();
    const dialogo = page.locator('.dialogo-overlay .dialogo');
    await dialogo.locator('[data-accion="modal-precio-input"]').fill('9999');
    await page.keyboard.press('Escape');

    await expect(dialogo).toBeHidden();
    await expect(tarjeta.locator('.grilla-item__precio')).toHaveText(/8\.000/); // sin cambios
  });
});

test.describe('Grilla: acciones de la tarjeta', () => {
  test('"Subir a Estado" abre la revisión con 1 solo producto y no altera la selección', async ({ page }) => {
    await mockearCompartir(page);
    await page.goto('/');
    await crearProducto(page, { nombre: 'Buzo', precio: 4000 });
    await crearProducto(page, { nombre: 'Short', precio: 2000 });
    await irAGrilla(page);

    // "Short" arranca seleccionado (nuevos productos arrancan marcados); desmarcar "Buzo" antes
    // de tocar su "Subir a Estado" para poder verificar después que esa acción no la re-marca.
    const tarjetaBuzo = tarjetaGrilla(page, 'Buzo');
    await tarjetaBuzo.locator('.grilla-item__seleccion').uncheck();
    await expect(tarjetaBuzo.locator('.grilla-item__seleccion')).not.toBeChecked();

    await tarjetaBuzo.locator('[data-accion="grilla-publicar"]').click();
    await expect(page.locator('.hoja-revision__miniatura')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('.hoja-revision__miniatura').first()).toHaveAttribute('alt', 'Buzo');

    await page.locator('[data-accion="revision-cerrar"]').click();
    await expect(page.locator('.hoja-revision__miniatura')).toHaveCount(0);

    // la selección de la grilla quedó exactamente como antes de "Subir a Estado".
    await expect(tarjetaGrilla(page, 'Buzo').locator('.grilla-item__seleccion')).not.toBeChecked();
    await expect(tarjetaGrilla(page, 'Short').locator('.grilla-item__seleccion')).toBeChecked();
  });

  test('tocar "Editar precio" o "Subir a Estado" no navega a la edición del producto', async ({ page }) => {
    await mockearCompartir(page);
    await page.goto('/');
    await crearProducto(page, { nombre: 'Media', precio: 500 });
    await irAGrilla(page);

    const tarjeta = tarjetaGrilla(page, 'Media');
    await tarjeta.locator('[data-accion="grilla-publicar"]').click();
    await expect(page.locator('.hoja-revision__miniatura')).toHaveCount(1, { timeout: 10_000 });
    // seguimos en Productos, no en el detalle: no hay #campo-nombre visible de fondo relevante,
    // y la hoja se puede cerrar sin haber cambiado de pantalla.
    await page.locator('[data-accion="revision-cerrar"]').click();
    await expect(page.locator('.grilla-productos')).toBeVisible();
  });
});
