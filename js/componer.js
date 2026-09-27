// Composición del estado: dibuja en un canvas 1080x1920 según el estilo elegido.
// El cálculo de layout vive en layout.js (puro); acá solo se dibuja con canvas real (DOM).
// Nombre, precio y descripción comparten UN solo conjunto de ajustes (ver AJUSTES_POR_DEFECTO en
// modelo.js) usado por "Foto con precio", "Foto con descripción" y "Mi plantilla" (CREAR-BRIEF.md
// 2026-09-27); `foto` solo aplica a "Mi plantilla" (los otros dos van siempre a pantalla completa).
import { calcularLineas, calcularRecorteCover } from './layout.js';
import { formatearPrecio } from './modelo.js';
import { cargarFuentes, familiaCanvas } from './fuentes.js';

export const ANCHO = 1080;
export const ALTO = 1920;
const FONDO_BASE = '#0d0f1a';

/**
 * Elige la función de composición según el estilo resuelto (ver `resolverEstilo` en modelo.js).
 * @param {{estilo:string, plantillaImagen, fotoImagen, producto, ajustes, formatoPrecio, descripcion}} datos
 * @returns {Promise<Blob>}
 */
export async function componerSegunEstilo({ estilo, plantillaImagen, fotoImagen, producto, ajustes, formatoPrecio, descripcion }) {
  if (estilo === 'foto-precio') return componerFotoConPrecio({ fotoImagen, producto, ajustes, formatoPrecio });
  if (estilo === 'foto-descripcion') {
    return componerFotoConDescripcion({ fotoImagen, producto, ajustes, formatoPrecio, descripcion });
  }
  if (estilo === 'mi-plantilla') return componerImagen({ plantillaImagen, fotoImagen, producto, ajustes, formatoPrecio });
  return componerSoloFoto({ fotoImagen });
}

/**
 * Estilo "Mi plantilla": plantilla propia de fondo + foto + nombre + precio (posiciones de
 * `ajustes`, incluida la caja `foto`).
 */
export async function componerImagen({ plantillaImagen, fotoImagen, producto, ajustes, formatoPrecio }) {
  await cargarFuentes();
  const { canvas, ctx } = lienzoNuevo();

  if (plantillaImagen) ctx.drawImage(plantillaImagen, 0, 0, ANCHO, ALTO);
  if (fotoImagen && ajustes.foto) dibujarFotoCover(ctx, fotoImagen, ajustes.foto);

  dibujarNombrePrecio(ctx, producto, ajustes, formatoPrecio);

  return exportarBlob(canvas);
}

/**
 * Estilo "Solo la foto" (por defecto): la foto del producto tal cual, sin textos, llevada a
 * 1080×1920 con un fondo difuminado de la misma foto (evita el letterboxing negro cuando la
 * relación de aspecto de la foto no coincide con la del estado).
 */
export async function componerSoloFoto({ fotoImagen }) {
  const { canvas, ctx } = lienzoNuevo();

  if (fotoImagen) {
    // Fondo: la misma foto, cover-fit y difuminada, para llenar los márgenes sin barras negras.
    ctx.save();
    ctx.filter = 'blur(40px) brightness(0.6)';
    dibujarFotoCover(ctx, fotoImagen, { x: -40, y: -40, w: ANCHO + 80, h: ALTO + 80 });
    ctx.restore();

    // Primer plano: la foto entera, sin recortar (contain), nítida y centrada.
    dibujarFotoContain(ctx, fotoImagen, { x: 0, y: 0, w: ANCHO, h: ALTO });
  }

  return exportarBlob(canvas);
}

/** Estilo "Foto con precio": foto de fondo a pantalla completa + nombre y precio (sin descripción). */
export async function componerFotoConPrecio({ fotoImagen, producto, ajustes, formatoPrecio }) {
  await cargarFuentes();
  const { canvas, ctx } = lienzoNuevo();
  if (fotoImagen) dibujarFotoCover(ctx, fotoImagen, { x: 0, y: 0, w: ANCHO, h: ALTO });
  dibujarNombrePrecio(ctx, producto, ajustes, formatoPrecio);
  return exportarBlob(canvas);
}

/**
 * Estilo "Foto con descripción": foto de fondo a pantalla completa + nombre + descripción
 * (la propia del producto, o la resuelta con el modelo) + precio opcional debajo.
 */
export async function componerFotoConDescripcion({ fotoImagen, producto, ajustes, formatoPrecio, descripcion }) {
  await cargarFuentes();
  const { canvas, ctx } = lienzoNuevo();
  if (fotoImagen) dibujarFotoCover(ctx, fotoImagen, { x: 0, y: 0, w: ANCHO, h: ALTO });

  if (ajustes.nombre?.visible !== false) dibujarCajaTexto(ctx, producto.nombre ?? '', ajustes.nombre);
  if (ajustes.descripcion?.visible !== false && descripcion) {
    dibujarCajaTexto(ctx, descripcion, { ...ajustes.descripcion, maxLineas: ajustes.descripcion.maxLineas ?? 3 });
  }
  const textoPrecio = formatearPrecio(producto.precio, formatoPrecio);
  if (ajustes.precio?.visible !== false && textoPrecio) dibujarCajaTexto(ctx, textoPrecio, ajustes.precio);

  return exportarBlob(canvas);
}

function dibujarNombrePrecio(ctx, producto, ajustes, formatoPrecio) {
  if (ajustes.nombre?.visible !== false) dibujarCajaTexto(ctx, producto.nombre ?? '', ajustes.nombre);
  const textoPrecio = formatearPrecio(producto.precio, formatoPrecio);
  if (ajustes.precio?.visible !== false && textoPrecio) dibujarCajaTexto(ctx, textoPrecio, ajustes.precio);
}

function lienzoNuevo() {
  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = FONDO_BASE;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  return { canvas, ctx };
}

function exportarBlob(canvas) {
  return new Promise((resolve, reject) => {
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

function rutaRedondeada(ctx, x, y, w, h, radio) {
  const r = Math.max(0, Math.min(radio, w / 2, h / 2));
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexARgba(hex, alfa) {
  const limpio = (hex || '#000000').replace('#', '');
  const n = limpio.length === 3 ? limpio.split('').map((c) => c + c).join('') : limpio.padEnd(6, '0');
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

/** Dibuja el fondo/etiqueta (color, opacidad, redondeo) de una caja de texto, si corresponde. */
function dibujarFondoCaja(ctx, caja) {
  if (!caja.fondoColor || !(caja.fondoOpacidad > 0)) return;
  ctx.save();
  ctx.fillStyle = hexARgba(caja.fondoColor, caja.fondoOpacidad);
  rutaRedondeada(ctx, caja.x, caja.y, caja.w, caja.h, caja.fondoRadio ?? 0);
  ctx.fill();
  ctx.restore();
}

/** Dibuja una caja de texto completa: fondo/etiqueta + texto ajustado (achica o parte en líneas). */
function dibujarCajaTexto(ctx, texto, caja) {
  if (!caja || caja.visible === false) return;
  dibujarFondoCaja(ctx, caja);

  const familia = familiaCanvas(caja.familia);
  const peso = caja.peso || 400;
  const medirAncho = (t, tamano) => {
    ctx.font = `${peso} ${tamano}px ${familia}`;
    return ctx.measureText(t).width;
  };
  const tamanoInicial = caja.tamano || 48;
  const tamanoMinimo = Math.max(16, Math.round(tamanoInicial * 0.45));
  const maxLineas = caja.maxLineas ?? 2;
  const { lineas, tamano } = calcularLineas({
    texto,
    anchoMax: caja.w - 24, // margen interno para que el texto no toque el borde de la etiqueta
    medirAncho,
    tamanoInicial,
    tamanoMinimo,
    maxLineas,
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
  const xTexto = alineacion === 'left' ? caja.x + 12 : alineacion === 'right' ? caja.x + caja.w - 12 : caja.x + caja.w / 2;

  const interlineado = tamano * 1.22;
  const altoTotal = interlineado * lineas.length;
  const alto = caja.h ?? altoTotal;
  let y = caja.y + Math.max(interlineado / 2, (alto - altoTotal) / 2 + interlineado / 2);
  for (const linea of lineas) {
    ctx.fillText(linea, xTexto, y, caja.w - 24);
    y += interlineado;
  }
  ctx.restore();
}
