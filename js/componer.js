// Composición del estado: dibuja según el estilo elegido, separado en dos capas (CREAR-BRIEF.md,
// ronda "vista previa en vivo"):
//   - `dibujarSegunEstilo(ctx, datos)` — SÍNCRONA, dibuja en cualquier CanvasRenderingContext2D ya
//     preparado (fuentes cargadas de antemano). La usa el editor para pintar directo en el canvas
//     visible en cada frame (requestAnimationFrame), y también la exportación de abajo.
//   - `componerSegunEstilo(datos, opciones)` — async: crea un lienzo 1080×1920 fuera de pantalla,
//     llama a la función de arriba y exporta un Blob JPEG. La usa la hoja de revisión para el
//     archivo final, con `opciones` = `resolverOpcionesExportacion(calidadImagen)` (modelo.js,
//     Fase 2 "S" #5: "Estándar" 0.85 / "Alta" 0.95 — el `calidad: 0.9` de acá abajo es solo el
//     default si alguien llama sin pasar `opciones`).
//   - `componerMiniatura(datos)` — async: igual, pero a 270×480 para vista previa (Ajustes,
//     carrusel de la hoja de revisión): no hace falta resolución completa para una miniatura.
// Cada estilo con texto ("Foto con precio", "Foto con descripción", "Mi plantilla") tiene su PROPIO
// juego de ajustes (`ajustesPorEstilo` en modelo.js/repositorio.js, ronda "ajustes por estilo",
// 2026-09-28) — acá solo se dibuja con el que llega en `datos.ajustes`, sin saber de dónde salió.
// `foto` solo aplica a "Mi plantilla" (los otros van siempre a pantalla completa, con el encuadre
// elegido en Ajustes: "Entera"/contain por defecto, o "Llenar la pantalla"/cover).
import { calcularLineas, calcularRecorteCover } from './layout.js';
import { formatearPrecio } from './modelo.js';
import { cargarFuentes, familiaCanvas } from './fuentes.js';

export const ANCHO = 1080;
export const ALTO = 1920;
const FONDO_BASE = '#0d0f1a';

/**
 * Dibuja el estado completo en `ctx` según el estilo resuelto (ver `resolverEstilo` en modelo.js).
 * Síncrona a propósito: asume que las fuentes ya están cargadas (`await cargarFuentes()` antes) y
 * que las imágenes (`plantillaImagen`/`fotoImagen`) ya son `ImageBitmap` decodificados — así se
 * puede llamar en cada frame sin volver a decodificar ni esperar nada.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{estilo:string, plantillaImagen, fotoImagen, producto, ajustes, formatoPrecio, descripcion, encuadreFoto}} datos
 */
export function dibujarSegunEstilo(ctx, datos) {
  const { estilo, plantillaImagen, fotoImagen, producto, ajustes, formatoPrecio, descripcion, encuadreFoto } = datos;
  limpiarLienzo(ctx);

  if (estilo === 'foto-precio') {
    dibujarFondoFoto(ctx, fotoImagen, encuadreFoto);
    dibujarNombrePrecio(ctx, producto, ajustes, formatoPrecio);
    return;
  }

  if (estilo === 'foto-descripcion') {
    dibujarFondoFoto(ctx, fotoImagen, encuadreFoto);
    if (ajustes.nombre?.visible !== false) dibujarCajaTexto(ctx, producto.nombre ?? '', ajustes.nombre);
    if (ajustes.descripcion?.visible !== false && descripcion) {
      dibujarCajaTexto(ctx, descripcion, { ...ajustes.descripcion, maxLineas: ajustes.descripcion.maxLineas ?? 3 });
    }
    const textoPrecio = formatearPrecio(producto?.precio, formatoPrecio);
    if (ajustes.precio?.visible !== false && textoPrecio) dibujarCajaTexto(ctx, textoPrecio, ajustes.precio);
    return;
  }

  if (estilo === 'mi-plantilla') {
    if (plantillaImagen) ctx.drawImage(plantillaImagen, 0, 0, ANCHO, ALTO);
    if (fotoImagen && ajustes.foto && ajustes.foto.visible !== false) dibujarFotoCover(ctx, fotoImagen, ajustes.foto);
    dibujarNombrePrecio(ctx, producto, ajustes, formatoPrecio);
    return;
  }

  // 'solo-foto' (por defecto): siempre la foto entera (contain) con fondo difuminado, sin textos.
  dibujarFondoFoto(ctx, fotoImagen, 'contain');
}

/**
 * Versión "de exportación": crea un lienzo 1080×1920 fuera de pantalla, carga las fuentes que
 * hagan falta y devuelve la imagen ya compuesta. La usa Publicar/la hoja de revisión para el
 * archivo FINAL que se comparte.
 *
 * JPEG calidad 0.9 por defecto (no PNG): WhatsApp recomprime igual las imágenes que llegan por
 * `Intent.ACTION_SEND`/`navigator.share`, así que el PNG sin pérdida solo hacía más lento
 * comprimir y más pesado el archivo que había que pasarle al puente nativo (ronda "publicar más
 * rápido", CREAR-BRIEF.md 2026-09-28). Sigue en 1080×1920: el tamaño no cambia, solo el formato.
 * @returns {Promise<Blob>}
 */
export async function componerSegunEstilo(datos, { formato = 'image/jpeg', calidad = 0.9 } = {}) {
  if (datos.estilo !== 'solo-foto') await cargarFuentes();
  const { canvas, ctx } = lienzoNuevo();
  dibujarSegunEstilo(ctx, datos);
  return exportarBlob(canvas, formato, calidad);
}

/**
 * Miniatura LIVIANA (por defecto 270×480, un cuarto del lienzo real): mismo dibujo que la
 * exportación, pero en un lienzo chico escalado con `setTransform` en vez de rasterizar a
 * 1080×1920 y después achicar con CSS — las miniaturas de Ajustes y el carrusel de la hoja de
 * revisión no necesitan más resolución que esa (ronda "publicar más rápido"/"miniaturas con
 * placeholder"). JPEG de calidad media: son solo vista previa, no el archivo que se comparte.
 * @returns {Promise<Blob>}
 */
export async function componerMiniatura(datos, { ancho = 270, alto = 480 } = {}) {
  if (datos.estilo !== 'solo-foto') await cargarFuentes();
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ancho / ANCHO, 0, 0, alto / ALTO, 0, 0);
  dibujarSegunEstilo(ctx, datos);
  return exportarBlob(canvas, 'image/jpeg', 0.75);
}

function limpiarLienzo(ctx) {
  ctx.fillStyle = FONDO_BASE;
  ctx.fillRect(0, 0, ANCHO, ALTO);
}

/**
 * Fondo de foto compartido por "Solo la foto", "Foto con precio" y "Foto con descripción":
 * - 'contain' (defecto): la foto entera, sin recortar, centrada, con la misma foto de fondo
 *   difuminada llenando los márgenes (evita el letterboxing negro cuando la relación de aspecto no
 *   coincide con la del estado).
 * - 'cover': la foto llena toda la pantalla, recortada si hace falta (comportamiento previo a la
 *   ronda de distribución, disponible como "Llenar la pantalla" en Ajustes).
 */
function dibujarFondoFoto(ctx, fotoImagen, encuadreFoto) {
  if (!fotoImagen) return;
  if (encuadreFoto === 'cover') {
    dibujarFotoCover(ctx, fotoImagen, { x: 0, y: 0, w: ANCHO, h: ALTO });
    return;
  }
  ctx.save();
  ctx.filter = 'blur(40px) brightness(0.6)';
  dibujarFotoCover(ctx, fotoImagen, { x: -40, y: -40, w: ANCHO + 80, h: ALTO + 80 });
  ctx.restore();
  dibujarFotoContain(ctx, fotoImagen, { x: 0, y: 0, w: ANCHO, h: ALTO });
}

function dibujarNombrePrecio(ctx, producto, ajustes, formatoPrecio) {
  if (ajustes.nombre?.visible !== false) dibujarCajaTexto(ctx, producto?.nombre ?? '', ajustes.nombre);
  const textoPrecio = formatearPrecio(producto?.precio, formatoPrecio);
  if (ajustes.precio?.visible !== false && textoPrecio) dibujarCajaTexto(ctx, textoPrecio, ajustes.precio);
}

function lienzoNuevo() {
  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

function exportarBlob(canvas, tipo = 'image/png', calidad) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen.'))), tipo, calidad);
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
