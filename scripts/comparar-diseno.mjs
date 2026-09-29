#!/usr/bin/env node
// Compara una pantalla del diseño Stitch (Interfaz/stitch_.../<pantalla>/code.html) contra la
// misma pantalla ya renderizada por la app real, lado a lado, en Interfaz/comparacion/<pantalla>.png.
// Uso: npm run comparar -- <pantalla>   (ej.: productos_lista_natural, productos_vista_grilla_natural)
//
// El code.html del diseño SÍ puede cargar Tailwind/Google Fonts por CDN (es un mock de Stitch, no
// la app) — solo para esta comparación. La app se sirve con scripts/servir.js (igual que en local)
// y se siembra con datos parecidos a los del mock (mismos nombres/precios/secciones de ejemplo,
// foto de prueba de test/e2e/fixtures) antes de la captura.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..');
const ANCHO = 412;
const ALTO = 915;

// --- Qué pantalla del diseño corresponde a qué ruta/estado de la app ---
const ESCENAS = {
  productos_lista_natural: { hash: '#/', vista: 'compacta', titulo: 'Productos — lista' },
  productos_vista_grilla_natural: { hash: '#/', vista: 'grilla', titulo: 'Productos — grilla' },
};

// --- Dataset de ejemplo (nombres/precios/secciones tomados de los 2 code.html; ver comentario en
// el propio dataset). Mismo dataset para lista y grilla: son la misma pantalla en 2 vistas. ---
const SECCIONES_EJEMPLO = ['Lencería', 'Novedades'];
const PRODUCTOS_EJEMPLO = [
  { nombre: 'Taza Cerámica Salvia', descripcion: 'Taza de cerámica artesanal', precio: 14500, seccion: null, seleccionado: true },
  { nombre: 'Vela de Soja Higo & Cedro', descripcion: 'Vela de soja aromática', precio: 8900, seccion: null, seleccionado: true },
  { nombre: 'Conejo de Lana Fieltro', descripcion: 'Peluche de lana fieltro', precio: 6200, seccion: null, seleccionado: true },
  { nombre: 'Remera Oversize Oliva', descripcion: 'Remera oversize algodón', precio: 21000, seccion: 'Lencería', seleccionado: false },
  { nombre: 'Sneakers Cuero Arena', descripcion: 'Sneakers urbanas de cuero', precio: 38000, seccion: 'Novedades', seleccionado: false },
  { nombre: 'Torta Botánica Lavanda', descripcion: 'Torta artesanal botánica', precio: null, seccion: 'Lencería', seleccionado: false },
];

function esperarLinea(child, contiene) {
  return new Promise((resolve, reject) => {
    let salida = '';
    const alDato = (buf) => {
      salida += buf.toString();
      if (salida.includes(contiene)) {
        child.stdout.off('data', alDato);
        resolve();
      }
    };
    child.stdout.on('data', alDato);
    child.once('error', reject);
    child.once('exit', (code) => {
      if (!salida.includes(contiene)) reject(new Error(`servir.js terminó (código ${code}) antes de arrancar`));
    });
  });
}

async function arrancarServidor(puerto) {
  const child = spawn(process.execPath, [path.join(RAIZ, 'scripts', 'servir.js'), String(puerto)], {
    cwd: RAIZ,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await esperarLinea(child, 'estados-rapidos en');
  return child;
}

async function sembrarApp(page, { vista }) {
  const fixture = path.join(RAIZ, 'test', 'e2e', 'fixtures', 'producto.png');
  const fotoBase64 = fs.readFileSync(fixture).toString('base64');

  await page.goto('/');
  await page.evaluate(
    async ({ fotoBase64, secciones, productos, vista }) => {
      const repo = await import('/js/repositorio.js');

      const idPorSeccion = new Map();
      for (const nombre of secciones) {
        const s = await repo.crearSeccion(nombre);
        idPorSeccion.set(nombre, s.id);
      }

      const binario = atob(fotoBase64);
      const bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);

      for (const p of productos) {
        const archivo = new File([bytes], 'producto.png', { type: 'image/png' });
        const guardado = await repo.guardarProducto(
          {
            nombre: p.nombre,
            precio: p.precio,
            descripcion: p.descripcion,
            secciones: p.seccion ? [idPorSeccion.get(p.seccion)] : [],
          },
          archivo
        );
        if (!p.seleccionado) await repo.actualizarSeleccion(guardado.id, false);
      }

      await repo.guardarPreferenciasLista({ vista, filtroSeccion: 'todas' });
    },
    { fotoBase64, secciones: SECCIONES_EJEMPLO, productos: PRODUCTOS_EJEMPLO, vista }
  );
  await page.reload();
  // Las fotos se leen de IndexedDB de forma async (Promise.all en lista.js): esperar a que la
  // primera miniatura real ya tenga `src` antes de la captura, no un timeout fijo a ciegas.
  await page.waitForSelector('.fila-compacta__foto, .grilla-item__foto', { state: 'visible' });
  await page.waitForTimeout(150); // transiciones/skeleton -> contenido final
}

async function componerLadoALado(browser, { disenoPng, appPng, titulo, destino }) {
  const disenoB64 = disenoPng.toString('base64');
  const appB64 = appPng.toString('base64');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; background:#2a2a2a; font-family: system-ui, sans-serif; }
    .fila { display:flex; gap:24px; padding:24px; align-items:flex-start; }
    figure { margin:0; background:#111; border-radius:8px; padding:12px 12px 16px; }
    figure img { display:block; width:${ANCHO}px; height:${ALTO}px; border-radius:4px; }
    figcaption { color:#eee; text-align:center; margin-top:10px; font-size:15px; font-weight:600; }
    h1 { color:#fff; font-size:18px; margin:0 0 4px 24px; padding-top:20px; }
  </style></head><body>
    <h1>${titulo}</h1>
    <div class="fila">
      <figure><img src="data:image/png;base64,${disenoB64}"><figcaption>DISEÑO (Stitch)</figcaption></figure>
      <figure><img src="data:image/png;base64,${appB64}"><figcaption>APP (real)</figcaption></figure>
    </div>
  </body></html>`;
  const page = await browser.newPage({ viewport: { width: (ANCHO + 24) * 2 + 48, height: ALTO + 140 } });
  await page.setContent(html);
  await page.screenshot({ path: destino });
  await page.close();
}

async function main() {
  const pantalla = process.argv[2];
  const escena = ESCENAS[pantalla];
  if (!escena) {
    console.error(`Pantalla desconocida: "${pantalla}".\nDisponibles: ${Object.keys(ESCENAS).join(', ')}`);
    process.exit(1);
  }

  const disenoHtml = path.join(RAIZ, 'Interfaz', 'stitch_whatsapp_status_uploader_ui', pantalla, 'code.html');
  if (!fs.existsSync(disenoHtml)) {
    console.error(`No existe ${disenoHtml}`);
    process.exit(1);
  }

  const destinoDir = path.join(RAIZ, 'Interfaz', 'comparacion');
  fs.mkdirSync(destinoDir, { recursive: true });
  const destino = path.join(destinoDir, `${pantalla}.png`);

  const puerto = 8199;
  const servidor = await arrancarServidor(puerto);
  const browser = await chromium.launch();
  try {
    // 1) Diseño Stitch: puede pedir red (Tailwind CDN + Google Fonts) — solo para esta comparación.
    const paginaDiseno = await browser.newPage({ viewport: { width: ANCHO, height: ALTO } });
    await paginaDiseno.goto('file://' + disenoHtml.replace(/\\/g, '/'));
    await paginaDiseno.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await paginaDiseno.waitForTimeout(300);
    const disenoPng = await paginaDiseno.screenshot();
    await paginaDiseno.close();

    // 2) App real, servida local, sembrada con datos parecidos.
    const paginaApp = await browser.newPage({ viewport: { width: ANCHO, height: ALTO }, baseURL: `http://localhost:${puerto}` });
    await sembrarApp(paginaApp, escena);
    if (escena.hash !== '#/') await paginaApp.evaluate((h) => { location.hash = h; }, escena.hash);
    await paginaApp.waitForTimeout(150);
    const appPng = await paginaApp.screenshot();
    await paginaApp.close();

    await componerLadoALado(browser, { disenoPng, appPng, titulo: escena.titulo, destino });
    console.log(`Comparación guardada: ${path.relative(RAIZ, destino)}`);
  } finally {
    await browser.close();
    servidor.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
