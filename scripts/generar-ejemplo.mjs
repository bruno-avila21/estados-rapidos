#!/usr/bin/env node
// Genera assets/ejemplo.jpg: una foto de producto neutra (una caja sobre una mesa, fondo liso)
// para las miniaturas de Ajustes/editor cuando todavía no hay ningún producto cargado (ronda
// "miniaturas con placeholder", CREAR-BRIEF.md 2026-09-28). Rasterizada con Playwright (misma
// técnica que generar-iconos.mjs, sin sumar dependencias), en JPEG para pesar poco (≤80 KB).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..');
const DESTINO = path.join(RAIZ, 'assets', 'ejemplo.jpg');
const TAMANO = 900;

// Escena simple y neutra: fondo con degradé suave + una "caja de producto" con etiqueta, para que
// se vea a las claras que es un producto de ejemplo y no una foto real de nadie.
const HTML = `<!doctype html><html><body style="margin:0;width:${TAMANO}px;height:${TAMANO}px;">
  <canvas id="c" width="${TAMANO}" height="${TAMANO}"></canvas>
  <script>
    const ctx = document.getElementById('c').getContext('2d');
    const n = ${TAMANO};
    const fondo = ctx.createLinearGradient(0, 0, 0, n);
    fondo.addColorStop(0, '#e7e5f5');
    fondo.addColorStop(1, '#c9c6e8');
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, n, n);

    // "mesa"
    ctx.fillStyle = '#b7b3da';
    ctx.fillRect(0, n * 0.72, n, n * 0.28);

    // sombra de la caja
    ctx.save();
    ctx.filter = 'blur(18px)';
    ctx.fillStyle = 'rgba(20,16,50,0.28)';
    ctx.beginPath();
    ctx.ellipse(n * 0.5, n * 0.75, n * 0.28, n * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // caja de producto (rectángulo con solapa, tipo caja de cartón/regalo)
    const cajaW = n * 0.46, cajaH = n * 0.38, cajaX = (n - cajaW) / 2, cajaY = n * 0.36;
    const caja = ctx.createLinearGradient(cajaX, cajaY, cajaX + cajaW, cajaY + cajaH);
    caja.addColorStop(0, '#6d5fd8');
    caja.addColorStop(1, '#4f46e5');
    ctx.fillStyle = caja;
    ctx.beginPath();
    ctx.roundRect(cajaX, cajaY, cajaW, cajaH, 22);
    ctx.fill();

    // cinta/etiqueta cruzada
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(cajaX, cajaY + cajaH * 0.42, cajaW, cajaH * 0.16);
    ctx.fillRect(cajaX + cajaW * 0.42, cajaY, cajaW * 0.16, cajaH);

    // brillo suave arriba a la izquierda (que se note "foto", no un ícono plano)
    const brillo = ctx.createRadialGradient(
      cajaX + cajaW * 0.28, cajaY + cajaH * 0.22, 4,
      cajaX + cajaW * 0.28, cajaY + cajaH * 0.22, cajaW * 0.5
    );
    brillo.addColorStop(0, 'rgba(255,255,255,0.35)');
    brillo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = brillo;
    ctx.fillRect(cajaX, cajaY, cajaW, cajaH);
  </script>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: TAMANO, height: TAMANO } });
await page.setContent(HTML);
await page.waitForTimeout(50);

let calidad = 0.85;
let buffer;
for (; calidad >= 0.4; calidad -= 0.1) {
  // eslint-disable-next-line no-await-in-loop -- bajar calidad hasta entrar en el límite de peso
  const base64 = await page.evaluate(
    (q) => document.getElementById('c').toDataURL('image/jpeg', q).split(',')[1],
    calidad
  );
  buffer = Buffer.from(base64, 'base64');
  if (buffer.length <= 80 * 1024) break;
}

fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
fs.writeFileSync(DESTINO, buffer);
console.log(`assets/ejemplo.jpg generado: ${(buffer.length / 1024).toFixed(1)} KB (calidad ${calidad.toFixed(2)})`);

await browser.close();
