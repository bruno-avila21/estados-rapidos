// Ronda "reordenar arrastrando" (reskin "gesti_n_de_secciones_natural"): la manija de 6 puntos
// reemplaza los botones subir/bajar de antes — arrastre real con el dedo (pointer events, reusa
// js/reordenar.js, MISMO patrón que la manija de la hoja de revisión) y flechas arriba/abajo por
// teclado con foco en la manija, con el aria-live (`.panel-secciones__progreso-orden`) anunciando
// la nueva posición. El orden se persiste (repo.reordenarSecciones) — se verifica recargando.
import { test, expect } from '@playwright/test';

async function crearSeccion(page, nombre) {
  await page.locator('input[aria-label="Nombre de la nueva sección"]').fill(nombre);
  await page.locator('[data-accion="crear-seccion"]').click();
  await expect(page.getByLabel(`Nombre de la sección ${nombre}`)).toBeVisible();
}

// Orden real, leído del DOM (sincronizarFilasConSecciones mueve los nodos existentes).
function idsDeLasFilas(page) {
  return page.locator('.fila-seccion').evaluateAll((els) => els.map((el) => el.dataset.id));
}

test('arrastrar la manija con el dedo cambia el orden y se persiste', async ({ page }) => {
  await page.goto('/#/secciones');
  await crearSeccion(page, 'Lunes');
  await crearSeccion(page, 'Martes');
  await crearSeccion(page, 'Miércoles');

  const antes = await idsDeLasFilas(page);
  expect(antes).toHaveLength(3);
  const idLunes = antes[0];
  // Localizador por `data-id` (no por posición): la fila de "Lunes" cambia de índice DOM durante
  // el propio arrastre, así que `filas.nth(0)` dejaría de apuntar a "Lunes" apenas se mueve.
  const manijaLunes = page.locator(`[data-id="${idLunes}"] [data-accion="arrastrar-seccion"]`);

  // Arrastra la manija de "Lunes" hasta abajo de "Miércoles" — con pointer events reales por CDP
  // (Input.dispatchTouchEvent), igual que revision-reordenar.spec.js: la API HTML5 drag/drop no
  // dispara en Android WebView, por eso la manija usa pointer events y por eso el test simula
  // touch real, no `dragTo()` de Playwright (mousedown/mousemove, no pointerdown con
  // setPointerCapture).
  const cajaManija = await manijaLunes.boundingBox();
  const cajaUltima = await page.locator('.fila-seccion').nth(2).boundingBox();
  const x0 = cajaManija.x + cajaManija.width / 2;
  const y0 = cajaManija.y + cajaManija.height / 2;
  const y1 = cajaUltima.y + cajaUltima.height - 5;

  const cdp = await page.context().newCDPSession(page);
  const tocar = (type, px, py) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py }] });
  await tocar('touchStart', x0, y0);
  for (let i = 1; i <= 6; i++) await tocar('touchMove', x0, y0 + ((y1 - y0) * i) / 6);
  await tocar('touchEnd', x0, y1);
  // CDP no siempre traduce el `touchend` sintético en un `pointerup` real sobre el elemento que
  // tiene la captura del puntero (limitación conocida del harness de test, no del gesto en un
  // dispositivo real) — se cierra el arrastre a mano con el MISMO evento que soltaría un dedo real,
  // para que la persistencia y el anuncio (que van en `pointerup`/`pointercancel`, no en cada
  // `pointermove`) sean deterministas en el test.
  await manijaLunes.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', bubbles: true });

  const despues = await idsDeLasFilas(page);
  expect(despues).not.toEqual(antes);
  expect(despues[2]).toBe(idLunes); // "Lunes" quedó último

  // El anuncio de posición (aria-live) refleja el movimiento.
  await expect(page.locator('.panel-secciones__progreso-orden')).toContainText('posición 3 de 3');

  // Persistido de verdad (no solo en memoria): recargar mantiene el nuevo orden.
  await page.reload();
  const trasRecargar = await idsDeLasFilas(page);
  expect(trasRecargar).toEqual(despues);
});

test('flechas arriba/abajo con foco en la manija reordenan y anuncian la posición (teclado)', async ({ page }) => {
  await page.goto('/#/secciones');
  await crearSeccion(page, 'Novedades');
  await crearSeccion(page, 'Ofertas');

  const filas = page.locator('.fila-seccion');
  await expect(filas).toHaveCount(2);
  const antes = await idsDeLasFilas(page);

  // "Ofertas" (2da fila) sube con ArrowUp.
  await filas.nth(1).locator('[data-accion="arrastrar-seccion"]').focus();
  await page.keyboard.press('ArrowUp');

  const despues = await idsDeLasFilas(page);
  expect(despues[0]).toBe(antes[1]); // "Ofertas" ahora primera
  expect(despues[1]).toBe(antes[0]); // "Novedades" quedó segunda
  await expect(page.locator('.panel-secciones__progreso-orden')).toContainText('Ofertas — posición 1 de 2');

  // El foco se queda en la MISMA manija lógica (mismo producto), para seguir moviéndolo sin perder
  // contexto — mismo criterio que revision.js `moverProducto`.
  await expect(filas.nth(0).locator('[data-accion="arrastrar-seccion"]')).toBeFocused();

  // En la punta (posición 1), ArrowUp no rompe nada ni cambia el orden.
  await page.keyboard.press('ArrowUp');
  expect(await idsDeLasFilas(page)).toEqual(despues);

  // ArrowDown la vuelve a su lugar original.
  await page.keyboard.press('ArrowDown');
  // Esperar el anuncio (aria-live) antes de comparar: `moverPorTeclado` persiste en IndexedDB
  // ANTES de escribirlo, así que es la señal de que el `await repo.reordenarSecciones(...)` de
  // este paso ya terminó — sin esto, `page.reload()` puede llegar antes de que la escritura se
  // complete y el test ve el orden de un paso anterior (ronda "reordenar arrastrando", BUGS.md).
  await expect(page.locator('.panel-secciones__progreso-orden')).toContainText('posición 2 de 2');
  expect(await idsDeLasFilas(page)).toEqual(antes);

  await page.reload();
  expect(await idsDeLasFilas(page)).toEqual(antes);
});
