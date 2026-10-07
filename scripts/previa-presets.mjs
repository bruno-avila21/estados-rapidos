// Arma una imagen con los presets pedidos lado a lado, para revisarlos a ojo contra el diseño.
// Uso: node scripts/previa-presets.mjs <salida.jpg> <foto> <preset> [<preset>...]
// Variantes: "novedad:sin-precio", "ficha-natural:sin-descripcion", "novedad:larga", "novedad:pelado" (sin precio ni descripción).
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [salida, foto, ...presets] = process.argv.slice(2);
if (!salida || !foto || !presets.length) {
  console.error('Uso: node scripts/previa-presets.mjs <salida.jpg> <foto> <preset> [<preset>...]');
  process.exit(1);
}

const PUERTO = 8993;
const servidor = spawn(process.execPath, [path.join(RAIZ, 'scripts', 'servir.js'), String(PUERTO)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage();
  await pagina.goto(`http://127.0.0.1:${PUERTO}/index.html`);
  const fotoBase64 = readFileSync(foto).toString('base64');
  const base64 = await pagina.evaluate(
    async ({ presets, fotoBase64 }) => {
      const { dibujarSegunEstilo } = await import('/js/componer.js');
      const { AJUSTES_POR_DEFECTO_POR_ESTILO } = await import('/js/modelo.js');
      const { cargarFuentes } = await import('/js/fuentes.js');
      await cargarFuentes();
      const bytes = Uint8Array.from(atob(fotoBase64), (c) => c.charCodeAt(0));
      const fotoImagen = await createImageBitmap(new Blob([bytes]));
      const ANCHO = 360;
      const ALTO = 640;
      const lienzo = document.createElement('canvas');
      lienzo.width = ANCHO * presets.length;
      lienzo.height = ALTO;
      const ctx = lienzo.getContext('2d');
      presets.forEach((entrada, i) => {
        const [estilo, variante] = entrada.split(':');
        const uno = document.createElement('canvas');
        uno.width = ANCHO;
        uno.height = ALTO;
        const c = uno.getContext('2d');
        c.setTransform(ANCHO / 1080, 0, 0, ALTO / 1920, 0, 0);
        dibujarSegunEstilo(c, {
          estilo,
          fotoImagen,
          producto: { nombre: 'Nombre del producto', precio: variante === 'sin-precio' || variante === 'pelado' ? null : 12500 },
          ajustes: AJUSTES_POR_DEFECTO_POR_ESTILO[estilo],
          formatoPrecio: { prefijo: '$ ', separadorMiles: true, decimales: false },
          descripcion:
            variante === 'sin-descripcion' || variante === 'pelado'
              ? ''
              : variante === 'larga'
                ? 'Set de cubiertos de acero con mango gris.\n24 piezas.\nEnvíos a todo el país, consultá por privado.'
                : 'Descripción breve del producto',
          encuadreFoto: 'contain',
          general: { nombreNegocio: '' },
          seccionNombre: '',
          posicion: { n: 1, m: 1 },
        });
        ctx.drawImage(uno, ANCHO * i, 0);
      });
      return lienzo.toDataURL('image/jpeg', 0.85).split(',')[1];
    },
    { presets, fotoBase64 }
  );
  writeFileSync(salida, Buffer.from(base64, 'base64'));
  console.log(`listo: ${salida}`);
} finally {
  await navegador.close();
  servidor.kill();
}
