// Fase 3 "M" #1 (Interfaz/ANALISIS-STITCH.md): reordenar el carrusel de la hoja de revisión, con
// las 2 vías que ofrece js/vistas/revision.js — los botones accesibles "Mover antes"/"Mover
// después" (teclado) y el arrastre con el dedo desde la manija (pointer events, no HTML5
// drag/drop — CLAUDE.md). js/reordenar.js ya tenía sus 11 tests unitarios; esto cubre el
// comportamiento end-to-end (DOM + persistencia del orden al compartir) que esos no ven.
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

// Orden actual del carrusel, leído del DOM (fuente de verdad real: `sincronizarDomConProductos`
// mueve los nodos existentes, no los reordena solo en memoria).
function idsDelCarrusel(page) {
  return page.locator('.hoja-revision__item').evaluateAll((els) => els.map((el) => el.dataset.id));
}

function itemPorNombre(page, nombre) {
  return page.locator('.hoja-revision__item').filter({ has: page.locator('img[alt="' + nombre + '"]') });
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('reordenar con los botones "Mover antes"/"Mover después" cambia el orden real', async ({ page }) => {
  await mockearCompartir(page);
  await page.goto('/');
  await crearProducto(page, { nombre: 'Uno', precio: 1000 });
  await crearProducto(page, { nombre: 'Dos', precio: 2000 });
  await crearProducto(page, { nombre: 'Tres', precio: 3000 });

  await page.locator('[data-accion="publicar-seleccionados"]').click();
  await expect(page.locator('.hoja-revision__miniatura')).toHaveCount(3, { timeout: 10_000 });

  const antes = await idsDelCarrusel(page);
  expect(antes).toHaveLength(3);

  const itemDos = itemPorNombre(page, 'Dos');
  await expect(itemDos.locator('.hoja-revision__orden')).toHaveText('2/3');

  // "Mover antes" en "Dos": pasa a la posición 1.
  await itemDos.locator('[data-accion="mover-antes"]').click();
  await expect(itemPorNombre(page, 'Dos').locator('.hoja-revision__orden')).toHaveText('1/3');
  const despuesDeAntes = await idsDelCarrusel(page);
  expect(despuesDeAntes[0]).toBe(antes[1]); // "Dos" ahora primero
  expect(despuesDeAntes[1]).toBe(antes[0]); // "Uno" quedó segundo

  // en la punta, "Mover antes" está deshabilitado (no puede seguir).
  await expect(itemPorNombre(page, 'Dos').locator('[data-accion="mover-antes"]')).toBeDisabled();

  // "Mover después" en "Dos": vuelve a la posición 2.
  await itemPorNombre(page, 'Dos').locator('[data-accion="mover-despues"]').click();
  await expect(itemPorNombre(page, 'Dos').locator('.hoja-revision__orden')).toHaveText('2/3');
  const final = await idsDelCarrusel(page);
  expect(final).toEqual(antes); // volvió exactamente al orden original

  // el orden final es el que se comparte: "Tres" es el 3ro tanto en el DOM como al compartir.
  await page.locator('[data-accion="revision-compartir"]').click();
  await expect(page.locator('#toast')).toHaveText(/Mi estado/);
  const llamadas = await page.evaluate(() => window.__compartir.llamadas);
  expect(llamadas[0].cantidad).toBe(3);
});

test('reordenar arrastrando con el dedo desde la manija cambia el orden', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'Alfa', precio: 1000 });
  await crearProducto(page, { nombre: 'Beta', precio: 2000 });
  await crearProducto(page, { nombre: 'Gama', precio: 3000 });

  await page.locator('[data-accion="publicar-seleccionados"]').click();
  await expect(page.locator('.hoja-revision__miniatura')).toHaveCount(3, { timeout: 10_000 });

  const antes = await idsDelCarrusel(page);
  expect(antes[0]).not.toBe(antes[2]);

  // Arrastrar la manija del primer item ("Alfa") hasta más allá del centro del tercer item
  // ("Gama"): con pointer events reales por CDP (Input.dispatchTouchEvent), igual que
  // test/e2e/tactil.spec.js — la API HTML5 drag/drop no dispara en Android WebView, por eso el
  // editor y el carrusel usan pointer events y por eso el test tiene que simular touch real, no
  // dragTo() de Playwright (que usa mousedown/mousemove, no pointerdown con setPointerCapture).
  const manijaAlfa = itemPorNombre(page, 'Alfa').locator('[data-accion="arrastrar"]');
  const cajaManija = await manijaAlfa.boundingBox();
  const cajaGama = await itemPorNombre(page, 'Gama').boundingBox();
  const x0 = cajaManija.x + cajaManija.width / 2;
  const y0 = cajaManija.y + cajaManija.height / 2;
  const x1 = cajaGama.x + cajaGama.width - 5;

  const cdp = await page.context().newCDPSession(page);
  const tocar = (type, px, py) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py }] });
  await tocar('touchStart', x0, y0);
  for (let i = 1; i <= 6; i++) await tocar('touchMove', x0 + ((x1 - x0) * i) / 6, y0);
  await tocar('touchEnd', x1, y0);

  const despues = await idsDelCarrusel(page);
  expect(despues).not.toEqual(antes);
  expect(despues[despues.length - 1]).toBe(antes[0]); // "Alfa" terminó al final
});
