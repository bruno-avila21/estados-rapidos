// Plantilla por defecto: sobria, generada en canvas (sin descargar nada), 1080x1920.
// Se usa hasta que Bruno suba su propio PNG en la pantalla "Plantilla".
import { ANCHO, ALTO } from './componer.js';

export async function generarPlantillaPorDefecto() {
  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');

  // Fondo sobrio: un solo color, sin gradientes.
  ctx.fillStyle = '#12161c';
  ctx.fillRect(0, 0, ANCHO, ALTO);

  // Banda inferior, apenas más clara, para que nombre y precio tengan contraste.
  ctx.fillStyle = '#1b2028';
  ctx.fillRect(0, 940, ANCHO, ALTO - 940);

  // Línea de acento fina, separando la banda.
  ctx.fillStyle = '#f5a623';
  ctx.fillRect(0, 940, ANCHO, 6);

  // Marco discreto para la caja de la foto (referencia visual; el ajuste real se hace en Plantilla).
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  ctx.strokeRect(140, 130, 800, 800);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la plantilla.'))), 'image/png');
  });
}
