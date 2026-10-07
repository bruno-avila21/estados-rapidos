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

// --- Rediseño del inicio (2026-10-07): buscador, Filtros, Ordenar y barra "Publicar" + "+" ---
test('Inicio: el buscador filtra mientras se escribe y la cuenta acompaña', async ({ page }) => {
  await page.goto('/');
  for (const nombre of ['Torta de limón', 'Gato de peluche']) {
    await page.locator('[data-accion="agregar"]').click();
    await page.locator('#campo-nombre').fill(nombre);
    await page.locator('[data-accion="guardar"]').click();
    await expect(page.locator('[data-accion="editar"]', { hasText: nombre })).toBeVisible();
  }
  await expect(page.locator('[data-estado="cuenta-productos"]')).toHaveText('2 productos');

  await page.locator('[data-accion="buscar-productos"]').fill('LIMON');
  await expect(page.locator('[data-estado="cuenta-productos"]')).toHaveText('1 producto');
  await expect(page.locator('[data-accion="editar"]', { hasText: 'Torta de limón' })).toBeVisible();
  await expect(page.locator('[data-accion="editar"]', { hasText: 'Gato de peluche' })).toBeHidden();

  await page.locator('[data-accion="buscar-productos"]').fill('zzz');
  await expect(page.locator('[data-estado="sin-resultados"]')).toBeVisible();
  await expect(page.locator('[data-estado="cuenta-productos"]')).toHaveText('0 productos');

  await page.locator('[data-accion="buscar-productos"]').fill('');
  await expect(page.locator('[data-estado="sin-resultados"]')).toBeHidden();
  await expect(page.locator('[data-estado="cuenta-productos"]')).toHaveText('2 productos');
});

test('Inicio: "Ordenar" reordena y se recuerda; "Filtros" abre el panel y queda abierto', async ({ page }) => {
  await page.goto('/');
  for (const nombre of ['Zapallo', 'Anana']) {
    await page.locator('[data-accion="agregar"]').click();
    await page.locator('#campo-nombre').fill(nombre);
    await page.locator('[data-accion="guardar"]').click();
    await expect(page.locator('[data-accion="editar"]', { hasText: nombre })).toBeVisible();
  }
  const nombres = () => page.locator('[data-accion="editar"]').allTextContents();
  expect((await nombres())[0]).toContain('Zapallo');
  await page.locator('[data-accion="ordenar-productos"]').selectOption('nombre');
  await expect.poll(async () => (await nombres())[0]).toContain('Anana');
  await page.reload();
  await expect(page.locator('[data-accion="ordenar-productos"]')).toHaveValue('nombre');
  await expect.poll(async () => (await nombres())[0]).toContain('Anana');

  const filtros = page.locator('[data-accion="abrir-filtros"]');
  await expect(filtros).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#panel-filtros')).toBeHidden();
  await filtros.click();
  await expect(page.locator('[data-accion="filtro-seccion"]', { hasText: 'Todas (2)' })).toBeVisible();
  // La preferencia se guarda sin bloquear la pantalla: esperar el dato antes de recargar (BUGS.md #75).
  await expect
    .poll(() => page.evaluate(async () => (await (await import('/js/repositorio.js')).obtenerPreferenciasLista()).filtrosAbiertos))
    .toBe(true);
  await page.reload();
  await expect(page.locator('[data-accion="abrir-filtros"]')).toHaveAttribute('aria-expanded', 'true');
});

test('Inicio: abajo quedan "Publicar N productos" y el "+" lado a lado; sin marcados, solo el "+"', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-accion="agregar"]')).toBeVisible(); // sin productos también está
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill('Uno');
  await page.locator('[data-accion="guardar"]').click();

  const publicar = page.locator('[data-accion="publicar-seleccionados"]');
  const agregar = page.locator('[data-accion="agregar"]');
  await expect(publicar).toHaveText('Publicar 1 producto');
  const cajaPublicar = await publicar.boundingBox();
  const cajaAgregar = await agregar.boundingBox();
  expect(cajaAgregar.x).toBeGreaterThan(cajaPublicar.x + cajaPublicar.width); // no se pisan
  expect(Math.abs(cajaAgregar.y + cajaAgregar.height / 2 - (cajaPublicar.y + cajaPublicar.height / 2))).toBeLessThan(2);

  await page.locator('[data-accion="seleccionar"]').first().uncheck();
  await expect(publicar).toHaveCount(0);
  await expect(agregar).toBeVisible();
});


// --- "Agregar varios" (2026-10-07): varias fotos de una vez, un producto por foto ---
const AQUI_VARIAS = path.dirname(fileURLToPath(import.meta.url));
const FOTO_VARIAS = path.join(AQUI_VARIAS, 'fixtures', 'producto.png');

test('Agregar varios: se eligen varias fotos, se nombran en una pantalla y se guarda un producto por foto', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('[data-accion="ir-agregar-varios"]').click();
  await expect(page.locator('h1.pagina__titulo')).toHaveText('Agregar varios');
  await expect(page.getByText('Todavía no elegiste fotos')).toBeVisible();

  await page.locator('[data-accion-input="elegir-varias"]').setInputFiles([FOTO_VARIAS, FOTO_VARIAS, FOTO_VARIAS]);
  await expect(page.locator('.varias__fila')).toHaveCount(3);
  await expect(page.locator('[data-accion="guardar-varios"]')).toHaveText('Guardar 3');

  // Sin nombre no guarda: marca la fila que falta y se queda.
  await page.locator('[data-accion="varias-nombre"]').nth(0).fill('Primero');
  await page.locator('[data-accion="varias-precio"]').nth(0).fill('1500');
  await page.locator('[data-accion="guardar-varios"]').click();
  await expect(page.locator('.varias__fila .campo__error:not([hidden])')).toHaveCount(2);
  await expect(page).toHaveURL(/#\/varias$/);

  // Se quita una foto y se completa la otra.
  await page.locator('[data-accion="varias-quitar"]').nth(2).click();
  await expect(page.locator('.varias__fila')).toHaveCount(2);
  await page.locator('[data-accion="varias-nombre"]').nth(1).fill('Segundo');
  await page.locator('[data-accion="guardar-varios-pie"]').click();

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('[data-estado="cuenta-productos"]')).toHaveText('2 productos');
  await expect(page.locator('[data-accion="editar"]', { hasText: 'Primero' })).toBeVisible();
  await expect(page.locator('[data-accion="editar"]', { hasText: 'Segundo' })).toBeVisible();
  const conFoto = await page.evaluate(async () => {
    const repo = await import('/js/repositorio.js');
    return (await repo.listarProductos()).map((p) => [p.nombre, p.precio, !!p.fotoId]);
  });
  expect(conFoto).toEqual([['Primero', 1500, true], ['Segundo', null, true]]);
});

test('Agregar varios: salir con fotos cargadas pregunta antes; sin fotos sale directo', async ({ page }) => {
  await page.goto('/#/varias');
  await page.locator('[data-accion="volver-header"]').click();
  await expect(page).toHaveURL(/#\/$/);

  await page.goto('/#/varias');
  await page.locator('[data-accion-input="elegir-varias"]').setInputFiles([FOTO_VARIAS]);
  await expect(page.locator('.varias__fila')).toHaveCount(1);
  await page.locator('[data-accion="volver-header"]').click();
  await expect(page.locator('.dialogo')).toContainText('cambios sin guardar');
  await page.locator('.dialogo [data-accion="confirmar-borrar"]').click(); // "Salir sin guardar"
  await expect(page).toHaveURL(/#\/$/);
});
