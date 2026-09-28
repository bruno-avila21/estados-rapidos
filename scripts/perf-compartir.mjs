#!/usr/bin/env node
// Mide, con el MISMO código real de la app (componer.js) corriendo en un Chromium de verdad
// (Playwright, ya devDependency), el costo de CPU de "abrir la hoja de revisión -> compartir" con
// 3 y 10 productos: ANTES (PNG completo, secuencial, foto decodificada de nuevo en cada imagen —
// el código de antes de la ronda "publicar más rápido") vs AHORA (miniaturas livianas + archivos
// finales JPEG 0.9 en paralelo acotado + foto decodificada UNA sola vez y reusada).
//
// No mide el puente nativo Android (base64 -> escritura a disco -> Intent.ACTION_SEND): eso corre
// en el runtime del WebView empaquetado, que esta terminal no puede automatizar (Playwright no
// controla un WebView dentro de un APK instalado). Lo que sigue es el cuello de botella real y
// medible: la composición/codificación de las imágenes, que es lo que este script cambia.
import { chromium } from '@playwright/test';

const PUERTO = process.env.PERF_PUERTO || 8992;
const BASE = `http://127.0.0.1:${PUERTO}`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  await page.goto(`${BASE}/index.html`);

  const resultados = {};
  for (const n of [3, 10]) {
    // eslint-disable-next-line no-await-in-loop -- corridas secuenciales a propósito (no se mezclan)
    resultados[n] = await page.evaluate(async (cantidad) => {
      const { componerSegunEstilo, componerMiniatura } = await import('/js/componer.js');
      const { AJUSTES_POR_DEFECTO_POR_ESTILO, FORMATO_PRECIO_POR_DEFECTO } = await import('/js/modelo.js');
      const { cargarFuentes } = await import('/js/fuentes.js');
      await cargarFuentes();

      const respuesta = await fetch('/assets/ejemplo.jpg');
      const fotoBlob = await respuesta.blob();

      const productos = Array.from({ length: cantidad }, (_, i) => ({
        nombre: `Producto de prueba ${i + 1}`,
        precio: 12500 + i * 1000,
        descripcion: '',
      }));
      const ajustes = AJUSTES_POR_DEFECTO_POR_ESTILO['foto-precio'];
      const datosBase = (fotoImagen, producto) => ({
        estilo: 'foto-precio',
        plantillaImagen: null,
        fotoImagen,
        producto,
        ajustes,
        formatoPrecio: FORMATO_PRECIO_POR_DEFECTO,
        descripcion: '',
        encuadreFoto: 'contain',
      });

      async function enParaleloAcotado(items, limite, tarea) {
        const resultado = new Array(items.length);
        let siguiente = 0;
        async function trabajador() {
          while (siguiente < items.length) {
            const i = siguiente;
            siguiente += 1;
            resultado[i] = await tarea(items[i], i);
          }
        }
        await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
        return resultado;
      }

      // ---- ANTES (código previo a esta ronda): secuencial, PNG completo, decodifica la foto
      // desde el Blob EN CADA imagen (no se cacheaba el ImageBitmap) ----
      const inicioAntes = performance.now();
      for (const producto of productos) {
        const fotoImagen = await createImageBitmap(fotoBlob); // decode por imagen, como antes
        // eslint-disable-next-line no-await-in-loop -- así era el código viejo: secuencial
        await componerSegunEstilo(datosBase(fotoImagen, producto), { formato: 'image/png' });
        fotoImagen.close?.();
      }
      const antesMs = performance.now() - inicioAntes;

      // ---- AHORA: foto decodificada UNA vez y reusada, miniaturas primero (lo que se ve), después
      // los archivos finales JPEG 0.9 en paralelo acotado (3 a la vez) ----
      const inicioAhora = performance.now();
      const fotoImagenUnica = await createImageBitmap(fotoBlob);
      await enParaleloAcotado(productos, 3, (producto) => componerMiniatura(datosBase(fotoImagenUnica, producto)));
      const miniaturasListasMs = performance.now() - inicioAhora;
      await enParaleloAcotado(productos, 3, (producto) =>
        componerSegunEstilo(datosBase(fotoImagenUnica, producto), { formato: 'image/jpeg', calidad: 0.9 })
      );
      const finalesListosMs = performance.now() - inicioAhora;
      fotoImagenUnica.close?.();

      return { antesMs, miniaturasListasMs, finalesListosMs };
    }, n);
  }

  await browser.close();

  console.log('Cantidad | ANTES (secuencial, PNG, decode x N) | AHORA: miniaturas listas | AHORA: archivos finales listos (JPEG 0.9, paralelo x3)');
  for (const n of [3, 10]) {
    const r = resultados[n];
    console.log(
      `${String(n).padStart(8)} | ${r.antesMs.toFixed(0).padStart(12)} ms | ${r.miniaturasListasMs.toFixed(0).padStart(12)} ms | ${r.finalesListosMs.toFixed(0).padStart(10)} ms`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
