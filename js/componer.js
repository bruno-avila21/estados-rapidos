// Composición del estado: dibuja plantilla + foto + nombre + precio en un canvas 1080x1920.
// El cálculo de layout vive en layout.js (puro); acá solo se dibuja con canvas real (DOM).
import { calcularLineas, calcularRecorteCover } from './layout.js';
import { formatearPrecio } from './modelo.js';

export const ANCHO = 1080;
export const ALTO = 1920;

/**
 * @param {object} datos
 * @param {CanvasImageSource} datos.plantillaImagen
 * @param {CanvasImageSource|null} datos.fotoImagen
 * @param {{nombre:string, precio:number}} datos.producto
 * @param {object} datos.ajustes - ver AJUSTES_POR_DEFECTO en modelo.js
 * @param {object} datos.formatoPrecio
 * @returns {Promise<Blob>}
 */
export async function componerImagen({ plantillaImagen, fotoImagen, producto, ajustes, formatoPrecio }) {
  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, ANCHO, ALTO);
  if (plantillaImagen) ctx.drawImage(plantillaImagen, 0, 0, ANCHO, ALTO);

  if (fotoImagen && ajustes.foto) dibujarFotoCover(ctx, fotoImagen, ajustes.foto);

  if (ajustes.nombre) dibujarTextoEnCaja(ctx, producto.nombre ?? '', ajustes.nombre);
  if (ajustes.precio) {
    const texto = formatearPrecio(producto.precio, formatoPrecio);
    dibujarTextoEnCaja(ctx, texto, ajustes.precio);
  }

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen.'))), 'image/png');
  });
}

/**
 * Elige la función de composición según el estilo resuelto (ver `resolverEstilo` en modelo.js).
 * @param {{estilo:string, plantillaImagen, fotoImagen, producto, ajustes, ajustesFranja, formatoPrecio}} datos
 * @returns {Promise<Blob>}
 */
export async function componerSegunEstilo({
  estilo,
  plantillaImagen,
  fotoImagen,
  producto,
  ajustes,
  ajustesFranja,
  formatoPrecio,
}) {
  if (estilo === 'foto-precio') return componerFotoConPrecio({ fotoImagen, producto, ajustesFranja, formatoPrecio });
  if (estilo === 'mi-plantilla') return componerImagen({ plantillaImagen, fotoImagen, producto, ajustes, formatoPrecio });
  return componerSoloFoto({ fotoImagen });
}

/**
 * Estilo "Solo la foto" (por defecto): la foto del producto tal cual, sin textos, llevada a
 * 1080×1920 con un fondo difuminado de la misma foto (evita el letterboxing negro cuando la
 * relación de aspecto de la foto no coincide con la del estado).
 */
export async function componerSoloFoto({ fotoImagen }) {
  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12161c';
  ctx.fillRect(0, 0, ANCHO, ALTO);

  if (fotoImagen) {
    // Fondo: la misma foto, cover-fit y difuminada, para llenar los márgenes sin barras negras.
    ctx.save();
    ctx.filter = 'blur(40px) brightness(0.6)';
    dibujarFotoCover(ctx, fotoImagen, { x: -40, y: -40, w: ANCHO + 80, h: ALTO + 80 });
    ctx.restore();

    // Primer plano: la foto entera, sin recortar (contain), nítida y centrada.
    dibujarFotoContain(ctx, fotoImagen, { x: 0, y: 0, w: ANCHO, h: ALTO });
  }

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen.'))), 'image/png');
  });
}

/**
 * Estilo "Foto con precio": la foto de fondo (cover, nítida, sin difuminar) + una franja
 * translúcida abajo con el nombre y el precio.
 */
export async function componerFotoConPrecio({ fotoImagen, producto, ajustesFranja, formatoPrecio }) {
  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12161c';
  ctx.fillRect(0, 0, ANCHO, ALTO);

  if (fotoImagen) dibujarFotoCover(ctx, fotoImagen, { x: 0, y: 0, w: ANCHO, h: ALTO });

  const franja = ajustesFranja?.franja;
  if (franja) {
    ctx.fillStyle = franja.color || 'rgba(10,12,16,0.72)';
    ctx.fillRect(franja.x, franja.y, franja.w, franja.h);
  }
  if (ajustesFranja?.nombre) dibujarTextoEnCaja(ctx, producto.nombre ?? '', ajustesFranja.nombre);
  if (ajustesFranja?.precio) {
    dibujarTextoEnCaja(ctx, formatearPrecio(producto.precio, formatoPrecio), ajustesFranja.precio);
  }

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen.'))), 'image/png');
  });
}

function dibujarFotoContain(ctx, imagen, caja) {
  const anchoOrigen = imagen.naturalWidth || imagen.width;
  const altoOrigen = imagen.naturalHeight || imagen.height;
  if (!anchoOrigen || !altoOrigen) return;
  const escala = Math.min(caja.w / anchoOrigen, caja.h / altoOrigen);
  const w = anchoOrigen * escala;
  const h = altoOrigen * escala;
  const x = caja.x + (caja.w - w) / 2;
  const y = caja.y + (caja.h - h) / 2;
  ctx.drawImage(imagen, x, y, w, h);
}

function dibujarFotoCover(ctx, imagen, caja) {
  const anchoOrigen = imagen.naturalWidth || imagen.width;
  const altoOrigen = imagen.naturalHeight || imagen.height;
  if (!anchoOrigen || !altoOrigen) return;
  const { sx, sy, sw, sh } = calcularRecorteCover({
    anchoOrigen,
    altoOrigen,
    anchoDestino: caja.w,
    altoDestino: caja.h,
  });
  ctx.save();
  ctx.beginPath();
  ctx.rect(caja.x, caja.y, caja.w, caja.h);
  ctx.clip();
  ctx.drawImage(imagen, sx, sy, sw, sh, caja.x, caja.y, caja.w, caja.h);
  ctx.restore();
}

function dibujarTextoEnCaja(ctx, texto, caja) {
  const familia = caja.familia || 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const peso = caja.peso || 400;
  const medirAncho = (t, tamano) => {
    ctx.font = `${peso} ${tamano}px ${familia}`;
    return ctx.measureText(t).width;
  };
  const tamanoInicial = caja.tamano || 48;
  const tamanoMinimo = Math.max(16, Math.round(tamanoInicial * 0.45));
  const { lineas, tamano } = calcularLineas({
    texto,
    anchoMax: caja.w,
    medirAncho,
    tamanoInicial,
    tamanoMinimo,
    maxLineas: 2,
  });

  ctx.save();
  ctx.beginPath();
  ctx.rect(caja.x, caja.y, caja.w, caja.h ?? tamano * 1.3 * lineas.length);
  ctx.clip();

  ctx.font = `${peso} ${tamano}px ${familia}`;
  ctx.fillStyle = caja.color || '#ffffff';
  ctx.textBaseline = 'middle';
  const alineacion = caja.alineacion || 'center';
  ctx.textAlign = alineacion;
  const xTexto = alineacion === 'left' ? caja.x : alineacion === 'right' ? caja.x + caja.w : caja.x + caja.w / 2;

  const interlineado = tamano * 1.22;
  const altoTotal = interlineado * lineas.length;
  const alto = caja.h ?? altoTotal;
  let y = caja.y + Math.max(interlineado / 2, (alto - altoTotal) / 2 + interlineado / 2);
  for (const linea of lineas) {
    ctx.fillText(linea, xTexto, y, caja.w);
    y += interlineado;
  }
  ctx.restore();
}
