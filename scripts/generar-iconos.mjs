#!/usr/bin/env node
// Genera icons/icon-192.png e icon-512.png rasterizando assets/logo.svg con Playwright (ya es
// devDependency de test, no se suma nada nuevo). Reemplaza al viejo generador a mano
// (scripts/generar-iconos.js, que queda solo como referencia de la técnica sin dependencias).
// Full-bleed con fondo sólido + el logo centrado en la zona segura (~65% del lienzo) para
// maskable icons.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..');
const SVG = fs.readFileSync(path.join(RAIZ, 'assets', 'logo.svg'), 'utf8');
const FONDO = '#fbf9f5'; // --color-fondo claro (alabastro) de "Organic Minimalist" — mismo valor
// que background_color/theme_color de manifest.webmanifest; el logo ya no tiene degradé claro
// que necesite un fondo oscuro para contrastar (verde ciprés + umber, ambos oscuros, se leen
// mejor sobre un fondo claro).

function paginaPara(size) {
  const logoSize = Math.round(size * 0.62); // zona segura maskable
  return `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:${FONDO};display:flex;align-items:center;justify-content:center;">
    <div style="width:${logoSize}px;height:${logoSize}px;">${SVG}</div>
  </body></html>`;
}

const browser = await chromium.launch();
const destino = path.join(RAIZ, 'icons');
fs.mkdirSync(destino, { recursive: true });

for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(paginaPara(size));
  await page.screenshot({ path: path.join(destino, `icon-${size}.png`) });
  await page.close();
  console.log(`icons/icon-${size}.png generado (${size}x${size})`);
}

await browser.close();
