// Secciones (etiquetas tipo "Lunes"/"Lencería", un producto puede estar en varias a la vez):
// crear/renombrar/reordenar/borrar, asignación en el alta/edición, filtro con contador, "Publicar
// esta sección (N)", agrupado en "Todas" con encabezados plegables (estado recordado) y las 2
// vistas (compacta/grilla). CREAR-BRIEF.md, ronda "secciones".
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FOTO = path.join(AQUI, 'fixtures', 'producto.png');

// El nombre vive en un <input> editable (para poder renombrar inline): su `value` NO forma parte
// del `textContent` de la fila, así que `hasText` sobre `.fila-seccion` nunca lo encuentra
// (BUGS.md #36) — hay que apuntar al input por su `aria-label`, que sí es único y estable.
function filaSeccionPorNombre(page, nombre) {
  return page.locator('.fila-seccion').filter({ has: page.getByLabel(`Nombre de la sección ${nombre}`) });
}

async function crearSeccion(page, nombre) {
  await page.goto('/#/secciones');
  await page.locator('input[aria-label="Nombre de la nueva sección"]').fill(nombre);
  await page.locator('[data-accion="crear-seccion"]').click();
  await expect(filaSeccionPorNombre(page, nombre)).toBeVisible();
}

async function crearProducto(page, { nombre, precio, secciones = [] } = {}) {
  await page.goto('/#/producto/nuevo');
  await page.locator('#campo-nombre').fill(nombre);
  if (precio != null) await page.locator('#campo-precio').fill(String(precio));
  await page.locator('[data-accion-input="elegir-galeria"]').setInputFiles(FOTO);
  for (const nombreSeccion of secciones) {
    await page.locator('[data-accion="toggle-seccion"]', { hasText: nombreSeccion }).click();
  }
  await page.locator('[data-accion="guardar"]').click();
  // .first(): un producto en 2+ secciones aparece una vez POR GRUPO en la vista "Todas" (BUGS.md #37).
  await expect(page.locator('[data-accion="editar"]', { hasText: nombre }).first()).toBeVisible();
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

test('crear, renombrar, reordenar y borrar una sección (borrar NO borra productos)', async ({ page }) => {
  await page.goto('/');
  await crearSeccion(page, 'Lunes');
  await crearSeccion(page, 'Martes');

  // Reordenar (ronda "reordenar arrastrando": la manija reemplazó los botones subir/bajar) —
  // acá con teclado (foco en la manija + flecha arriba), el arrastre con el dedo tiene su propio
  // test en reordenar-secciones.spec.js: "Martes" sube por encima de "Lunes".
  const filas = page.locator('.fila-seccion');
  await expect(filas).toHaveCount(2);
  await filas.nth(1).locator('[data-accion="arrastrar-seccion"]').focus();
  await page.keyboard.press('ArrowUp');
  // El nombre vive en el `value` de un input editable, no en el texto (BUGS.md #36).
  await expect(filas.nth(0).locator('[data-accion="renombrar"]')).toHaveValue('Martes');
  await expect(filas.nth(1).locator('[data-accion="renombrar"]')).toHaveValue('Lunes');

  // Renombrar.
  const nombreMartes = filas.nth(0).locator('[data-accion="renombrar"]');
  await nombreMartes.fill('Martes y miércoles');
  await nombreMartes.blur();
  await expect(page.locator('#toast')).toHaveText(/renombrada/);

  // Producto asignado a "Lunes": borrar la sección lo desasigna, no lo borra.
  await crearProducto(page, { nombre: 'Campera', precio: 20000, secciones: ['Lunes'] });
  await page.goto('/#/secciones');
  await filaSeccionPorNombre(page, 'Lunes').locator('[data-accion="borrar-seccion"]').click();
  await expect(page.locator('.dialogo')).toBeVisible();
  await page.locator('.dialogo [data-accion="confirmar-borrar"]').click();
  await expect(page.locator('#toast')).toHaveText(/borrada/);
  await expect(page.locator('.fila-seccion')).toHaveCount(1);

  await page.goto('/#/');
  await expect(page.locator('[data-accion="editar"]', { hasText: 'Campera' })).toBeVisible(); // el producto sigue ahí
  await expect(page.locator('[data-accion="filtro-seccion"]', { hasText: 'Sin sección (1)' })).toBeVisible();
});

test('un producto en 2 secciones aparece en ambos grupos con la MISMA casilla sincronizada', async ({ page }) => {
  await page.goto('/');
  await crearSeccion(page, 'Lunes');
  await crearSeccion(page, 'Lencería');
  await crearProducto(page, { nombre: 'Conjunto', precio: 5000, secciones: ['Lunes', 'Lencería'] });
  await crearProducto(page, { nombre: 'Remera', precio: 3000, secciones: ['Lunes'] });

  await page.goto('/#/');
  await expect(page.locator('[data-accion="filtro-seccion"]', { hasText: 'Todas (2)' })).toBeVisible();

  const grupoLunes = page.locator('details.grupo-seccion', { hasText: 'Lunes' });
  const grupoLenceria = page.locator('details.grupo-seccion', { hasText: 'Lencería' });
  await expect(grupoLunes.locator('[data-id]')).toHaveCount(2); // Conjunto + Remera
  await expect(grupoLenceria.locator('[data-id]')).toHaveCount(1); // solo Conjunto

  // Tildar "Conjunto" en el grupo "Lencería" también lo marca (mismo producto) en el grupo "Lunes".
  const checkEnLenceria = grupoLenceria.locator('[data-accion="seleccionar"]');
  await checkEnLenceria.uncheck();
  const checkConjuntoEnLunes = grupoLunes.locator('[data-id]', { hasText: 'Conjunto' }).locator('[data-accion="seleccionar"]');
  await expect(checkConjuntoEnLunes).not.toBeChecked();
});

test('"Sin sección" queda al final del agrupado "Todas"', async ({ page }) => {
  await page.goto('/');
  await crearSeccion(page, 'Lunes');
  await crearProducto(page, { nombre: 'Con sección', precio: 1000, secciones: ['Lunes'] });
  await crearProducto(page, { nombre: 'Sin nada', precio: 2000 });

  await page.goto('/#/');
  const titulos = await page.locator('details.grupo-seccion summary').allTextContents();
  expect(titulos.at(-1)).toMatch(/^Sin sección/);
});

test('filtrar por sección muestra solo esos productos y "Publicar esta sección (N)" los publica, independiente de las casillas', async ({ page }) => {
  await mockearCompartir(page);
  await page.goto('/');
  await crearSeccion(page, 'Lunes');
  await crearProducto(page, { nombre: 'Uno', precio: 1000, secciones: ['Lunes'] });
  await crearProducto(page, { nombre: 'Dos', precio: 2000, secciones: ['Lunes'] });
  await crearProducto(page, { nombre: 'Otro', precio: 3000 }); // sin sección

  await page.goto('/#/');
  await page.locator('[data-accion="filtro-seccion"]', { hasText: 'Lunes (2)' }).click();
  await expect(page.locator('[data-accion="editar"]', { hasText: 'Otro' })).toHaveCount(0);
  await expect(page.locator('[data-accion="editar"]')).toHaveCount(2);

  // Desmarco las casillas de los 2: "Publicar esta sección" igual publica los 2 (independiente).
  for (const check of await page.locator('[data-accion="seleccionar"]').all()) await check.uncheck();
  await expect(page.locator('[data-accion="publicar-seccion"]')).toHaveText('Publicar esta sección (2)');
  await page.locator('[data-accion="publicar-seccion"]').click();
  await expect(page.locator('.hoja-revision')).toBeVisible();
  await expect(page.locator('.hoja-revision__miniatura')).toHaveCount(2);
});

test('"Marcar todos" con un filtro de sección activo marca solo esa sección', async ({ page }) => {
  await page.goto('/');
  await crearSeccion(page, 'Lunes');
  await crearProducto(page, { nombre: 'Uno', precio: 1000, secciones: ['Lunes'] });
  await crearProducto(page, { nombre: 'Otro', precio: 3000 }); // sin sección

  await page.goto('/#/');
  for (const check of await page.locator('[data-accion="seleccionar"]').all()) await check.uncheck();

  await page.locator('[data-accion="filtro-seccion"]', { hasText: 'Lunes (1)' }).click();
  await page.locator('[data-accion="marcar-todos"]').click();
  await expect(page.locator('[data-accion="seleccionar"]')).toHaveCount(1); // solo "Uno" está visible
  await expect(page.locator('[data-accion="seleccionar"]').first()).toBeChecked();

  // "Otro" (sin sección) sigue DESmarcado: "Marcar todos" no se escapó de la sección filtrada.
  await page.locator('[data-accion="filtro-seccion"]', { hasText: 'Sin sección (1)' }).click();
  await expect(page.locator('[data-accion="seleccionar"]').first()).not.toBeChecked();
});

test('vistas compacta / grilla: se conmutan y se recuerdan', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'Uno', precio: 1000 });

  await expect(page.locator('.lista-compacta')).toBeVisible(); // compacta por defecto
  await page.locator('[data-accion="vista-grilla"]').click();
  await expect(page.locator('.grilla-productos')).toBeVisible();
  await expect(page.locator('.grilla-item')).toHaveCount(1);

  await page.reload();
  await expect(page.locator('.grilla-productos')).toBeVisible(); // se recordó

  await page.locator('[data-accion="vista-compacta"]').click();
  await expect(page.locator('.lista-compacta')).toBeVisible();
});

test('grilla: tocar la tarjeta abre edición, tocar la casilla NO navega', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'Gorra', precio: 1000 });
  await page.locator('[data-accion="vista-grilla"]').click();

  await page.locator('.grilla-item__seleccion').click();
  await expect(page.locator('.grilla-item')).toBeVisible(); // seguimos en Productos

  await page.locator('.grilla-item__nombre').click();
  await expect(page.locator('#campo-nombre')).toHaveValue('Gorra');
});

test('plegar un grupo de "Todas" se recuerda entre visitas', async ({ page }) => {
  await page.goto('/');
  await crearSeccion(page, 'Lunes');
  await crearProducto(page, { nombre: 'Uno', precio: 1000, secciones: ['Lunes'] });

  await page.goto('/#/');
  const grupo = page.locator('details.grupo-seccion', { hasText: 'Lunes' });
  await expect(grupo).toHaveJSProperty('open', true); // abierto por defecto
  await grupo.locator('summary').click();
  await expect(grupo).toHaveJSProperty('open', false);
  // Esperar a que la escritura async en IndexedDB (guardarPreferenciasLista, sin ningún toast que
  // lo confirme visualmente) termine ANTES de recargar — si no, el reload le puede ganar a la
  // escritura y la preferencia se pierde (BUGS.md #38, mismo patrón que BUGS.md #12/#34).
  await page.waitForFunction(async () => {
    const repo = await import('/js/repositorio.js');
    const prefs = await repo.obtenerPreferenciasLista();
    return Object.values(prefs.gruposPlegados || {}).some(Boolean);
  });

  await page.reload();
  await expect(page.locator('details.grupo-seccion', { hasText: 'Lunes' })).toHaveJSProperty('open', false);
});

// --- Fase 2, "S" #2: contador de productos por sección en la pantalla de gestión ---

test('la pantalla de gestión de secciones muestra el contador de productos por sección', async ({ page }) => {
  await page.goto('/');
  await crearSeccion(page, 'Lunes');
  await crearSeccion(page, 'Martes');
  await crearProducto(page, { nombre: 'Remera lunes', precio: 1000, secciones: ['Lunes'] });
  await crearProducto(page, { nombre: 'Pantalón lunes y martes', precio: 2000, secciones: ['Lunes', 'Martes'] });
  await crearProducto(page, { nombre: 'Sin sección', precio: 500 });

  await page.goto('/#/secciones');
  const filaLunes = filaSeccionPorNombre(page, 'Lunes');
  const filaMartes = filaSeccionPorNombre(page, 'Martes');
  // "Lunes" tiene 2 productos (uno de ellos también en "Martes"); "Martes" tiene 1.
  await expect(filaLunes.locator('.fila-seccion__conteo')).toHaveText('2 productos');
  await expect(filaMartes.locator('.fila-seccion__conteo')).toHaveText('1 producto');

  // Resumen de "sin sección" arriba de la lista (mismo dato que el chip de la lista de Productos).
  await expect(page.getByText('1 producto sin ninguna sección todavía.')).toBeVisible();
});

test('el contador de una sección nueva (sin productos) arranca en 0', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page, { nombre: 'Suelto', precio: 100 });
  await crearSeccion(page, 'Vacía');
  await expect(filaSeccionPorNombre(page, 'Vacía').locator('.fila-seccion__conteo')).toHaveText('0 productos');
});
