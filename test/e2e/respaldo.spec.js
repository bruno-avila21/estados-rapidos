// Exportar -> borrar -> importar: vuelve todo (probado por la UI, no solo en test de node --test).
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FOTO = path.join(AQUI, 'fixtures', 'producto.png');

test('exportar, borrar todo, importar: los productos vuelven', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill('Mochila urbana');
  await page.locator('#campo-precio').fill('28000');
  await page.locator('[data-accion-input="elegir-galeria"]').setInputFiles(FOTO);
  await page.locator('[data-accion="guardar"]').click();
  await expect(page.locator('[data-accion="editar"]', { hasText: 'Mochila urbana' })).toBeVisible();

  await page.locator('[data-accion="ir-respaldo"]').click();
  const descargaPromesa = page.waitForEvent('download');
  await page.locator('[data-accion="exportar"]').click();
  const descarga = await descargaPromesa;
  const rutaRespaldo = path.join(AQUI, '..', '..', '.tmp-respaldo-test.json');
  await descarga.saveAs(rutaRespaldo);
  const contenido = JSON.parse(fs.readFileSync(rutaRespaldo, 'utf8'));
  expect(contenido.version).toBe(1);
  expect(contenido.productos).toHaveLength(1);
  expect(contenido.productos[0].nombre).toBe('Mochila urbana');
  expect(contenido.productos[0].fotoBase64).toMatch(/^data:image\//);

  // borro todo importando un respaldo vacío primero, para simular "perdí los datos"
  await page.locator('[data-accion="ir-lista"]').click();
  await page.locator('[data-accion="borrar"]').first().click();
  await page.locator('[data-accion="confirmar-borrar"]').click();
  await expect(page.getByText('Todavía no cargaste productos')).toBeVisible();

  // importo el respaldo real: tiene que volver el producto con su foto
  await page.locator('[data-accion="ir-respaldo"]').click();
  await page.locator('[data-accion-input="importar"]').setInputFiles(rutaRespaldo);
  await expect(page.locator('.dialogo')).toBeVisible();
  await page.locator('[data-accion="confirmar-borrar"]').click();
  await expect(page.locator('#toast')).toHaveText(/importado/);

  await expect(page.locator('[data-accion="editar"]', { hasText: 'Mochila urbana' })).toBeVisible();
  await expect(page.locator('[data-accion="precio"]').first()).toHaveValue('$ 28.000');
  await expect(page.locator('.tarjeta__foto')).toBeVisible();

  fs.rmSync(rutaRespaldo, { force: true });
});

test('importar rechaza un archivo con forma inválida', async ({ page }) => {
  await page.goto('/#/respaldo');
  const rutaInvalida = path.join(AQUI, '..', '..', '.tmp-respaldo-invalido.json');
  fs.writeFileSync(rutaInvalida, JSON.stringify({ version: 99, productos: [] }));
  await page.locator('[data-accion-input="importar"]').setInputFiles(rutaInvalida);
  await expect(page.locator('[role="alert"]')).toHaveText(/versión/i);
  fs.rmSync(rutaInvalida, { force: true });
});
