// Capturas a 412×915 de Ajustes, Plantillas y el editor a pantalla completa, para revisarlas a ojo.
// Uso: node scripts/capturas-ronda.mjs <carpeta-de-salida>
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const salida = process.argv[2];
if (!salida) {
  console.error('Uso: node scripts/capturas-ronda.mjs <carpeta-de-salida>');
  process.exit(1);
}

const PUERTO = 8994;
const servidor = spawn(process.execPath, [path.join(RAIZ, 'scripts', 'servir.js'), String(PUERTO)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const base = `http://127.0.0.1:${PUERTO}/index.html`;
  const captura = (nombre) => pagina.screenshot({ path: path.join(salida, `${nombre}.png`) });

  await pagina.goto(`${base}#/plantillas`);
  await pagina.locator('[data-accion="estilo-general-ficha-natural"]').click();
  await pagina.locator('[data-accion="favorita-ficha-natural"]').click();
  await pagina.locator('[data-accion="favorita-novedad"]').click();
  await pagina.waitForTimeout(3500); // miniaturas + toast
  await captura('plantillas-todas');
  await pagina.locator('[data-accion="filtro-favoritas"]').click();
  await captura('plantillas-favoritas');

  await pagina.goto(`${base}#/ajustes`);
  await pagina.locator('.vista-previa-estado__imagen').first().waitFor();
  await pagina.waitForTimeout(400);
  await captura('ajustes');
  await pagina.locator('[data-panel="encuadre"] > summary').click();
  await pagina.locator('[data-panel="encuadre"]').scrollIntoViewIfNeeded();
  await captura('ajustes-abierto');

  await pagina.goto(`${base}#/plantilla?estilo=ficha-natural`);
  await pagina.locator('[data-accion="editar-lienzo"]').waitFor();
  await pagina.waitForTimeout(600);
  await captura('editor-bloqueado');
  await pagina.locator('[data-accion="editar-lienzo"]').click();
  await pagina.locator('[data-elemento="nombre"]').click();
  await pagina.waitForTimeout(400);
  await captura('editor-pantalla-completa');
  console.log(`listo: ${salida}`);
} finally {
  await navegador.close();
  servidor.kill();
}
