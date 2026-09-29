// Copia automática diaria, lado PWA (ronda "copia automática", Respaldo → "Preferencias de
// respaldo"): el navegador no deja escribir sin un gesto de la persona, así que en vez de la copia
// silenciosa del APK esto es un aviso de un toque (`#aviso-respaldo`) que aparece cuando la
// preferencia está activada y pasaron 24h o más desde la última copia — descartado, no vuelve
// hasta el día siguiente. La lógica pura (¿toca copiar?, nombre de archivo, rotación de las 7) ya
// se prueba en test/respaldo-automatico.test.js; esto cubre el disparador real (main.js) end-to-end.
import { test, expect } from '@playwright/test';

const CLAVE_ULTIMO_RESPALDO = 'estados-rapidos:ultimo-respaldo';
const CLAVE_AVISO_DESCARTADO = 'estados-rapidos:aviso-respaldo-descartado';
const UN_DIA_MS = 24 * 60 * 60 * 1000;

async function activarCopiaAutomatica(page) {
  await page.goto('/#/respaldo');
  const interruptor = page.locator('#respaldo-copia-automatica');
  await interruptor.check();
  await expect(page.locator('#toast')).toHaveText(/activada/);
}

async function simularUltimoRespaldoViejo(page, hace = UN_DIA_MS * 2) {
  await page.evaluate(
    ({ clave, fecha }) => localStorage.setItem(clave, JSON.stringify({ fecha, tamano: 1234 })),
    { clave: CLAVE_ULTIMO_RESPALDO, fecha: Date.now() - hace }
  );
}

test('activada + más de 24h sin copiar: aparece el aviso y "Descargar" lo resuelve con un toque', async ({ page }) => {
  await activarCopiaAutomatica(page);
  await simularUltimoRespaldoViejo(page);

  // El disparador corre al abrir/recargar la app (main.js, `revisarCopiaAutomatica`).
  await page.reload();
  await expect(page.locator('#aviso-respaldo')).toBeVisible();
  await expect(page.locator('#aviso-respaldo')).toContainText('Hace más de un día que no guardás una copia');

  const descargaPromesa = page.waitForEvent('download');
  await page.locator('[data-accion="descargar-respaldo-aviso"]').click();
  const descarga = await descargaPromesa;
  expect(descarga.suggestedFilename()).toMatch(/^estados-rapidos-\d{4}-\d{2}-\d{2}\.json$/);

  await expect(page.locator('#aviso-respaldo')).toBeHidden();
  await expect(page.locator('#toast')).toHaveText(/descargado/);

  // Se registró como "última copia" (Estado actual la refleja al volver a Respaldo). `page.goto`
  // al mismo hash en el que ya estamos es un no-op (no dispara navegación): hace falta `reload()`
  // para que respaldo.js vuelva a leer localStorage y se note el cambio.
  const ultimo = await page.evaluate((clave) => JSON.parse(localStorage.getItem(clave)), CLAVE_ULTIMO_RESPALDO);
  expect(ultimo.automatico).toBe(true);
  await page.reload();
  await expect(page.locator('.panel-respaldo__fila-dato', { hasText: 'Último respaldo' })).toContainText('(automática)');
});

test('desactivada: nunca aparece el aviso aunque pasen 24h', async ({ page }) => {
  await page.goto('/#/respaldo');
  await simularUltimoRespaldoViejo(page);
  await page.reload();
  await expect(page.locator('#aviso-respaldo')).toBeHidden();
});

test('descartar el aviso: no vuelve a aparecer hasta que cambie el día', async ({ page }) => {
  await activarCopiaAutomatica(page);
  await simularUltimoRespaldoViejo(page);
  await page.reload();
  await expect(page.locator('#aviso-respaldo')).toBeVisible();

  await page.locator('[data-accion="descartar-aviso-respaldo"]').click();
  await expect(page.locator('#aviso-respaldo')).toBeHidden();

  // Recargar el mismo día: sigue sin aparecer (todavía no se hizo ninguna copia real).
  await page.reload();
  await expect(page.locator('#aviso-respaldo')).toBeHidden();
  const descartado = await page.evaluate((clave) => localStorage.getItem(clave), CLAVE_AVISO_DESCARTADO);
  expect(descartado).toBe(new Date().toISOString().slice(0, 10));

  // Si "cambia el día" (se borra la marca de descarte), vuelve a aparecer.
  await page.evaluate((clave) => localStorage.removeItem(clave), CLAVE_AVISO_DESCARTADO);
  await page.reload();
  await expect(page.locator('#aviso-respaldo')).toBeVisible();
});
