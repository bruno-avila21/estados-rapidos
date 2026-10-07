// Una hoja con la lista de Productos y Ajustes → Apariencia en cada tono, para revisarlos a ojo.
// Uso: node scripts/capturas-tonos.mjs <carpeta-de-salida>   (deja tono-<nombre>.png)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const salida = process.argv[2];
if (!salida) {
  console.error('Uso: node scripts/capturas-tonos.mjs <carpeta-de-salida>');
  process.exit(1);
}

const PUERTO = 8995;
const servidor = spawn(process.execPath, [path.join(RAIZ, 'scripts', 'servir.js'), String(PUERTO)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage({ viewport: { width: 412, height: 915 } });
  await pagina.goto(`http://127.0.0.1:${PUERTO}/index.html#/ajustes`);
  await pagina.locator('[data-panel="apariencia"] > summary').click();
  for (const [tono, modo] of [
    ['cipres', 'claro'],
    ['oceano', 'claro'],
    ['terracota', 'claro'],
    ['ciruela', 'claro'],
    ['grafito', 'claro'],
    ['oceano', 'oscuro'],
  ]) {
    await pagina.locator(`[data-accion="modo-${modo}"]`).click();
    await pagina.locator(`[data-accion="tono-${tono}"]`).click();
    await pagina.locator('[data-panel="apariencia"]').scrollIntoViewIfNeeded();
    await pagina.evaluate(() => window.scrollBy(0, -330));
    await pagina.waitForTimeout(2600); // que se vaya el toast
    await pagina.screenshot({ path: path.join(salida, `tono-${tono}-${modo}.png`) });
  }
  console.log(`listo: ${salida}`);
} finally {
  await navegador.close();
  servidor.kill();
}
