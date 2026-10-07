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
// Cada estilo con texto ("Foto con precio", "Foto con descripción", "Mi plantilla" y, desde la
// Fase 4, los 4 presets de composición: banner inferior/editorial/polaroid/story inmersiva) tiene
// su PROPIO juego de ajustes (`ajustesPorEstilo` en modelo.js/repositorio.js, ronda "ajustes por
// estilo", 2026-09-28) — acá solo se dibuja con el que llega en `datos.ajustes`, sin saber de dónde
// salió. `foto` solo aplica a "Mi plantilla" (los otros van siempre a pantalla completa o al marco
// del preset, con el encuadre elegido en Ajustes: "Entera"/contain por defecto, o "Llenar la
// pantalla"/cover — los 4 presets nuevos siempre son "cover" dentro de su propia zona de foto,
// como en el mockup original).
// Los 4 presets de composición (Fase 4, "catálogo de presets"; ronda 2026-09-29 "calzan con los
// mocks"): la zona DECORATIVA de cada uno (franja del banner, marco del editorial, tarjeta del
// polaroid, scrim de la story) la calculan las funciones puras de geometria-presets.js según la
// visibilidad VIGENTE de precio/descripción/sección/nombre del negocio; nombre/precio/descripción
// en sí siguen viniendo de `datos.ajustes`, igual que los demás estilos con texto (el usuario los
// mueve/redimensiona en el editor de plantilla exactamente igual). El resto de los elementos de
// cada preset (sección, número de tanda, nombre del negocio, botón) son decoración fija:
// `datos.seccionNombre` (resuelta por quien llama con `resolverSeccionNombre`, modelo.js),
// `datos.posicion` ({n, m}, la posición del producto en la tanda que se está publicando) y
// `datos.general.nombreNegocio`/`datos.general.textoBoton` (ajustes generales, editables en la
// pantalla Plantilla) — ninguno inventado: si falta el dato, no se dibuja (nunca "Stock"/"Ref."/
// "Pieza única"/"Edición limitada" de relleno).
import { calcularLineas, calcularParrafo, calcularRecorteCover } from './layout.js';
import { formatearPrecio } from './modelo.js';
import { cargarFuentes, familiaCanvas } from './fuentes.js';
import {
  geometriaBannerInferior,
  geometriaEditorial,
  geometriaPolaroid,
  geometriaStoryInmersiva,
  EXTRA_DESCRIPCION_MAX,
} from './geometria-presets.js';

export const ANCHO = 1080;
export const ALTO = 1920;
const FONDO_BASE = '#0d0f1a';

const INTERLINEADO = 1.22;
// Aire arriba y abajo del párrafo de la descripción dentro de su caja (que no toque el borde de la
// etiqueta), y margen que se deja libre arriba del lienzo cuando la caja crece.
const PAD_VERTICAL_PARRAFO = 10;
const MARGEN_SUPERIOR_TEXTO = 60;

const GEOMETRIA_PRESET = Object.freeze({
  'banner-inferior': geometriaBannerInferior,
  editorial: geometriaEditorial,
  polaroid: geometriaPolaroid,
  'story-inmersiva': geometriaStoryInmersiva,
});
// Estilos que dibujan la descripción ("Foto con precio" y "Mi plantilla" no la dibujan).
export const ESTILOS_CON_DESCRIPCION = Object.freeze(['foto-descripcion', ...Object.keys(GEOMETRIA_PRESET)]);

// --- Colores propios de los 4 presets de composición: tokens de la piel "Organic Minimalist"
// (css/estilos.css: --color-primario #3a4d39, --color-primario-oscuro #243624, --color-acento
// #6e5b49, --color-primario-tinte-suave #d2e9ce) medidos de los mocks Stitch organic_minimalist —
// ver ANALISIS-STITCH.md y geometria-presets.js. ---
const COLOR_BANNER_FRANJA = '#3a4d39';
const COLOR_BANNER_LABEL = 'rgba(253,248,245,0.72)';
const COLOR_BANNER_DIVISOR = 'rgba(255,255,255,0.16)';
const COLOR_BANNER_NEGOCIO = '#d2e9ce';
const COLOR_BANNER_BOTON_BG = '#fdf8f5';
const COLOR_BANNER_BOTON_TEXTO = '#243624';

const COLOR_EDITORIAL_FONDO = '#f6f3ed';
const COLOR_EDITORIAL_MARCO = 'rgba(36,34,32,0.2)';
const COLOR_EDITORIAL_MARCO_OFFSET = 'rgba(58,77,57,0.35)';
const COLOR_EDITORIAL_SECCION = '#3a4d39';
const COLOR_EDITORIAL_NUMERO = '#5a5856';
const COLOR_EDITORIAL_DIVISOR = 'rgba(36,34,32,0.14)';
const COLOR_EDITORIAL_NEGOCIO = '#747871';

const COLOR_POLAROID_FONDO = '#ebe5dd';
const COLOR_POLAROID_PUNTOS = 'rgba(58,77,57,0.16)';
const COLOR_POLAROID_TARJETA = '#fbf9f5';
const COLOR_POLAROID_DIVISOR = 'rgba(90,88,86,0.4)';

const COLOR_STORY_SCRIM_ARRIBA = 'rgba(5,6,10,0)';
const COLOR_STORY_SCRIM_ABAJO = 'rgba(5,6,10,0.85)';
const COLOR_STORY_PILL_BG = 'rgba(255,255,255,0.18)';
const COLOR_STORY_PILL_BORDE = 'rgba(255,255,255,0.38)';

/** Qué elementos opcionales entran en el dibujo (hay dato Y está visible): los mismos flags que
 * recibe la geometría de los 4 presets. */
function banderasDeContenido({ producto, ajustes, formatoPrecio, descripcion, general, seccionNombre }) {
  const textoPrecio = formatearPrecio(producto?.precio, formatoPrecio);
  return {
    textoPrecio,
    conPrecio: ajustes?.precio?.visible !== false && !!textoPrecio,
    conDescripcion: ajustes?.descripcion?.visible !== false && !!descripcion,
    conSeccion: !!seccionNombre,
    conNombreNegocio: !!general?.nombreNegocio,
  };
}

/**
 * Cajas de texto EFECTIVAS de un dibujo: las de `datos.ajustes`, salvo cuando la descripción no
 * entra en su caja — ahí la caja crece (`extra` px) para que el párrafo entre partido en renglones,
 * y nombre/precio se corren para acompañarla: en los 4 presets, lo que diga su geometría con
 * `extraDescripcion`; en "Foto con descripción", la descripción crece hacia arriba y sube lo que
 * tenga encima. La usa `dibujarSegunEstilo` y también el editor de plantilla, para que los
 * recuadros del overlay coincidan con lo que se ve dibujado.
 * @returns {{nombre: object, precio: object, descripcion: object, extra: number}}
 */
export function resolverCajasTexto(ctx, datos) {
  const { estilo, ajustes, descripcion } = datos;
  const cajas = { nombre: ajustes?.nombre, precio: ajustes?.precio, descripcion: ajustes?.descripcion, extra: 0 };
  const caja = ajustes?.descripcion;
  if (!ESTILOS_CON_DESCRIPCION.includes(estilo) || !caja || caja.visible === false || !descripcion) return cajas;

  const geometria = GEOMETRIA_PRESET[estilo];
  const extraMax = geometria ? EXTRA_DESCRIPCION_MAX[estilo] : Math.max(0, caja.y - MARGEN_SUPERIOR_TEXTO);
  const { lineas, tamano } = parrafoDeCaja(ctx, descripcion, caja, caja.h + extraMax);
  const altoNecesario = Math.ceil(lineas.length * tamano * INTERLINEADO + PAD_VERTICAL_PARRAFO * 2);
  const extra = Math.min(extraMax, Math.max(0, altoNecesario - caja.h));
  if (!extra) return cajas;

  if (geometria) {
    const { conPrecio, conDescripcion, conSeccion, conNombreNegocio } = banderasDeContenido(datos);
    const flags = { conPrecio, conDescripcion, conSeccion, conNombreNegocio };
    const antes = geometria(flags);
    const despues = geometria({ ...flags, extraDescripcion: extra });
    const mover = (clave) => {
      const c = ajustes[clave];
      if (!c || !antes[clave] || !despues[clave]) return c;
      return { ...c, y: c.y + (despues[clave].y - antes[clave].y) };
    };
    const descripcionMovida = mover('descripcion');
    return {
      nombre: mover('nombre'),
      precio: mover('precio'),
      descripcion: { ...descripcionMovida, h: descripcionMovida.h + extra },
      extra,
    };
  }

  const subirSiEstaArriba = (c) => (c && c.y + (c.h ?? 0) <= caja.y + 1 ? { ...c, y: c.y - extra } : c);
  return {
    nombre: subirSiEstaArriba(ajustes.nombre),
    precio: subirSiEstaArriba(ajustes.precio),
    descripcion: { ...caja, y: caja.y - extra, h: caja.h + extra },
    extra,
  };
}

/**
 * Dibuja el estado completo en `ctx` según el estilo resuelto (ver `resolverEstilo` en modelo.js).
 * Síncrona a propósito: asume que las fuentes ya están cargadas (`await cargarFuentes()` antes) y
 * que las imágenes (`plantillaImagen`/`fotoImagen`) ya son `ImageBitmap` decodificados — así se
 * puede llamar en cada frame sin volver a decodificar ni esperar nada.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{estilo:string, plantillaImagen, fotoImagen, producto, ajustes, formatoPrecio, descripcion, encuadreFoto, general, seccionNombre, posicion}} datos
 */
export function dibujarSegunEstilo(ctx, datos) {
  const {
    estilo,
    plantillaImagen,
    fotoImagen,
    producto,
    formatoPrecio,
    descripcion,
    encuadreFoto,
    general,
    seccionNombre,
    posicion,
  } = datos;
  // `ajustes` con las cajas de texto EFECTIVAS (la descripción crecida si hizo falta, y nombre/
  // precio corridos para acompañarla) — el resto de la función dibuja con esto, igual que siempre.
  const cajas = resolverCajasTexto(ctx, datos);
  const ajustes = { ...datos.ajustes, nombre: cajas.nombre, precio: cajas.precio, descripcion: cajas.descripcion };
  const extraDescripcion = cajas.extra;
  const { textoPrecio, conPrecio, conDescripcion, conSeccion, conNombreNegocio } = banderasDeContenido(datos);
  limpiarLienzo(ctx);

  if (estilo === 'foto-precio') {
    dibujarFondoFoto(ctx, fotoImagen, encuadreFoto);
    dibujarNombrePrecio(ctx, producto, ajustes, formatoPrecio);
    return;
  }

  if (estilo === 'foto-descripcion') {
    dibujarFondoFoto(ctx, fotoImagen, encuadreFoto);
    if (ajustes.nombre?.visible !== false) dibujarCajaTexto(ctx, producto.nombre ?? '', ajustes.nombre);
    if (conDescripcion) dibujarCajaTexto(ctx, descripcion, ajustes.descripcion, { parrafo: true });
    if (conPrecio) dibujarCajaTexto(ctx, textoPrecio, ajustes.precio);
    return;
  }

  if (estilo === 'mi-plantilla') {
    if (plantillaImagen) ctx.drawImage(plantillaImagen, 0, 0, ANCHO, ALTO);
    if (fotoImagen && ajustes.foto && ajustes.foto.visible !== false) dibujarFotoCover(ctx, fotoImagen, ajustes.foto);
    dibujarNombrePrecio(ctx, producto, ajustes, formatoPrecio);
    return;
  }

  // --- 4 presets de composición (Fase 4, catálogo de presets; ronda 2026-09-29 "calzan con los
  // mocks") ---
  // La geometría (foto de fondo + zona decorativa) la calculan las funciones puras de
  // geometria-presets.js, siempre con la visibilidad VIGENTE de precio/descripción/sección/nombre
  // del negocio (no la de fábrica): "sin precio"/"sin descripción"/etc. nunca deja un hueco en el
  // fondo. Nombre/precio/descripción en sí se dibujan con `ajustes[clave]` igual que los demás
  // estilos con texto — el usuario los puede mover/redimensionar en el editor exactamente igual.
  if (estilo === 'banner-inferior') {
    const geo = geometriaBannerInferior({ conPrecio, conDescripcion, conSeccion, extraDescripcion });

    dibujarFondoFoto(ctx, fotoImagen, 'cover');
    dibujarRectanguloSolido(ctx, geo.franja, COLOR_BANNER_FRANJA, { arribaIzq: geo.radioSuperior, arribaDer: geo.radioSuperior });
    if (conSeccion) {
      dibujarEtiqueta(ctx, seccionNombre.toUpperCase(), geo.seccion, {
        tamano: 24,
        familia: 'manrope',
        peso: 600,
        color: COLOR_BANNER_LABEL,
        alineacion: 'left',
        tracking: 2,
      });
    }
    if (ajustes.nombre?.visible !== false) dibujarCajaTexto(ctx, producto?.nombre ?? '', ajustes.nombre);
    if (conPrecio) dibujarCajaTexto(ctx, textoPrecio, ajustes.precio);
    if (conDescripcion) dibujarCajaTexto(ctx, descripcion, ajustes.descripcion, { parrafo: true });
    dibujarLineaFina(ctx, geo.divisor, COLOR_BANNER_DIVISOR);
    dibujarPieBanner(ctx, geo.pie, { nombreNegocio: general?.nombreNegocio, textoBoton: general?.textoBoton });
    return;
  }

  if (estilo === 'editorial') {
    const geo = geometriaEditorial({ conPrecio, conDescripcion, conSeccion, conNombreNegocio, extraDescripcion });

    ctx.save();
    ctx.fillStyle = COLOR_EDITORIAL_FONDO;
    ctx.fillRect(0, 0, ANCHO, ALTO);
    ctx.restore();

    dibujarFilaSuperiorEditorial(ctx, geo.topRow, seccionNombre, posicion);
    dibujarMarcoDesplazado(ctx, geo.marco, COLOR_EDITORIAL_MARCO_OFFSET);
    if (fotoImagen) dibujarFotoCover(ctx, fotoImagen, geo.marco);
    dibujarBordeFino(ctx, geo.marco, COLOR_EDITORIAL_MARCO);

    if (ajustes.nombre?.visible !== false) dibujarCajaTexto(ctx, producto?.nombre ?? '', ajustes.nombre);
    if (geo.precio) {
      const textoLinea = [conPrecio ? textoPrecio : null, conSeccion ? seccionNombre.toUpperCase() : null]
        .filter(Boolean)
        .join('  •  ');
      dibujarCajaTexto(ctx, textoLinea, ajustes.precio);
    }
    if (conDescripcion) dibujarCajaTexto(ctx, descripcion, ajustes.descripcion, { parrafo: true });
    if (conNombreNegocio) dibujarPieEditorial(ctx, geo.pie, general.nombreNegocio);
    return;
  }

  if (estilo === 'polaroid') {
    const geo = geometriaPolaroid({ conPrecio, conDescripcion, extraDescripcion });

    dibujarFondoPuntos(ctx, COLOR_POLAROID_FONDO, COLOR_POLAROID_PUNTOS);
    dibujarRectanguloSolido(ctx, geo.tarjeta, COLOR_POLAROID_TARJETA, { todas: 10 }, { blur: 36, color: 'rgba(58,48,40,0.16)', y: 10 });
    if (fotoImagen) dibujarFotoCover(ctx, fotoImagen, geo.foto);
    if (ajustes.nombre?.visible !== false) dibujarCajaTexto(ctx, producto?.nombre ?? '', ajustes.nombre);
    if (conPrecio) dibujarCajaTexto(ctx, `— ${textoPrecio}`, ajustes.precio);
    if (conDescripcion) {
      dibujarLineaFina(ctx, geo.divisor, COLOR_POLAROID_DIVISOR);
      dibujarCajaTexto(ctx, descripcion, ajustes.descripcion, { parrafo: true });
    }
    return;
  }

  if (estilo === 'story-inmersiva') {
    const geo = geometriaStoryInmersiva({ conPrecio, conDescripcion, conSeccion, extraDescripcion });

    dibujarFondoFoto(ctx, fotoImagen, 'cover');
    dibujarDegradadoVertical(ctx, geo.scrim, COLOR_STORY_SCRIM_ARRIBA, COLOR_STORY_SCRIM_ABAJO);
    if (conSeccion) {
      dibujarPill(ctx, geo.seccion, seccionNombre.toUpperCase(), {
        tamano: 24,
        familia: 'manrope',
        peso: 600,
        color: '#ffffff',
        fondoColor: COLOR_STORY_PILL_BG,
        bordeColor: COLOR_STORY_PILL_BORDE,
        tracking: 2,
      });
    }
    if (ajustes.nombre?.visible !== false) dibujarCajaTexto(ctx, producto?.nombre ?? '', ajustes.nombre);
    if (conPrecio) {
      dibujarCajaTexto(ctx, textoPrecio, {
        ...ajustes.precio,
        bordeColor: COLOR_STORY_PILL_BORDE,
      });
    }
    if (conDescripcion) dibujarCajaTexto(ctx, descripcion, ajustes.descripcion, { parrafo: true });
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

function fuenteDeCaja(caja, tamano) {
  const cursiva = caja.familia === 'newsreader-italica' ? 'italic ' : '';
  return `${cursiva}${caja.peso || 400} ${tamano}px ${familiaCanvas(caja.familia)}`;
}

/** Renglones y tamaño de letra de un PÁRRAFO (la descripción) para una caja y un alto dado: parte
 * en todas las líneas que hagan falta y respeta los saltos escritos (ver `calcularParrafo`). */
function parrafoDeCaja(ctx, texto, caja, altoCaja) {
  const tamanoInicial = caja.tamano || 48;
  ctx.save();
  const resultado = calcularParrafo({
    texto,
    anchoMax: caja.w - 24,
    altoMax: Math.max(0, altoCaja - PAD_VERTICAL_PARRAFO * 2),
    medirAncho: (t, tamano) => {
      ctx.font = fuenteDeCaja(caja, tamano);
      return ctx.measureText(t).width;
    },
    tamanoInicial,
    tamanoMinimo: Math.max(16, Math.round(tamanoInicial * 0.45)),
    interlineado: INTERLINEADO,
  });
  ctx.restore();
  return resultado;
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

/** Un color CSS (hex o ya `rgb(a)(...)`) tal cual lo puede usar `fillStyle`/`strokeStyle`. */
function colorCss(color) {
  return color || '#000000';
}

/** Rectángulo sólido con esquinas redondeadas: todas iguales (`radios.todas`, ej. la tarjeta
 * Polaroid) o solo las de arriba (`radios.arribaIzq/arribaDer`, la franja del banner inferior).
 * `sombra` opcional (`{blur,color,y}`) para la sombra suave de la tarjeta Polaroid. */
function dibujarRectanguloSolido(ctx, rect, color, radios = {}, sombra = null) {
  if (!rect) return;
  ctx.save();
  if (sombra) {
    ctx.shadowColor = sombra.color;
    ctx.shadowBlur = sombra.blur;
    ctx.shadowOffsetY = sombra.y || 0;
  }
  ctx.fillStyle = colorCss(color);
  if (radios.todas != null) {
    rutaRedondeada(ctx, rect.x, rect.y, rect.w, rect.h, radios.todas);
  } else {
    rutaRedondeadaSuperior(ctx, rect.x, rect.y, rect.w, rect.h, radios.arribaIzq ?? 0, radios.arribaDer ?? 0);
  }
  ctx.fill();
  ctx.restore();
}

function rutaRedondeadaSuperior(ctx, x, y, w, h, rIzq, rDer) {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + rIzq);
  ctx.arcTo(x, y, x + rIzq, y, rIzq);
  ctx.lineTo(x + w - rDer, y);
  ctx.arcTo(x + w, y, x + w, y + rDer, rDer);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

/** Borde fino sin relleno (el marco 4:5 del preset "Editorial"). */
function dibujarBordeFino(ctx, rect, color) {
  if (!rect) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 1, rect.y + 1, Math.max(0, rect.w - 2), Math.max(0, rect.h - 2));
  ctx.restore();
}

/** Degradado vertical (el scrim del preset "Story inmersiva", para que el texto flotante sobre la
 * foto se siga leyendo — funcional, no decorativo). */
function dibujarDegradadoVertical(ctx, rect, colorArriba, colorAbajo) {
  if (!rect) return;
  ctx.save();
  const gradiente = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  gradiente.addColorStop(0, colorArriba);
  gradiente.addColorStop(1, colorAbajo);
  ctx.fillStyle = gradiente;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/** El "hairline" desplazado detrás del marco del preset "Editorial" (el rectángulo que sobresale
 * arriba/a la derecha en el mock) — se dibuja ANTES que la foto, así solo se ve peeking por los
 * bordes que la foto no tapa. */
function dibujarMarcoDesplazado(ctx, rect, color) {
  if (!rect) return;
  const dx = Math.round(rect.w * 0.02);
  ctx.save();
  ctx.strokeStyle = colorCss(color);
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + dx, rect.y - dx, rect.w, rect.h);
  ctx.restore();
}

/** Fondo con un patrón de puntos sutil (el beige del preset "Polaroid"): grilla espaciada, no
 * pixel-a-pixel — barato incluso a 1080×1920. */
function dibujarFondoPuntos(ctx, colorFondo, colorPunto) {
  ctx.save();
  ctx.fillStyle = colorFondo;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  ctx.fillStyle = colorCss(colorPunto);
  const paso = 40;
  const radio = 2.2;
  for (let y = paso / 2; y < ALTO; y += paso) {
    for (let x = paso / 2; x < ANCHO; x += paso) {
      ctx.beginPath();
      ctx.arc(x, y, radio, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Línea fina horizontal (el separador entre la descripción y el pie, en Banner inferior/Polaroid). */
function dibujarLineaFina(ctx, rect, color) {
  if (!rect) return;
  ctx.save();
  ctx.strokeStyle = colorCss(color);
  ctx.lineWidth = Math.max(1, rect.h);
  ctx.beginPath();
  ctx.moveTo(rect.x, rect.y + rect.h / 2);
  ctx.lineTo(rect.x + rect.w, rect.y + rect.h / 2);
  ctx.stroke();
  ctx.restore();
}

/** Intenta aplicar tracking (letter-spacing) real de canvas; en motores que no lo soportan
 * (`ctx.letterSpacing` es relativamente nuevo) simplemente no hace nada — nunca rompe el dibujo. */
function conTracking(ctx, px) {
  try {
    ctx.letterSpacing = `${px}px`;
  } catch {
    /* no soportado: se sigue sin tracking, no es crítico */
  }
}

/** Etiqueta chica de una sola línea (la sección del preset "Banner inferior"): mayúsculas ya
 * resueltas por quien llama, tracking, sin fondo. Achica si hiciera falta para no desbordar. */
function dibujarEtiqueta(ctx, texto, rect, { tamano, familia, peso, color, alineacion = 'left', tracking = 0 }) {
  if (!rect || !texto) return;
  const fam = familiaCanvas(familia);
  ctx.save();
  conTracking(ctx, tracking);
  const medirAncho = (t, tam) => {
    ctx.font = `${peso} ${tam}px ${fam}`;
    return ctx.measureText(t).width;
  };
  const { lineas, tamano: tamanoFinal } = calcularLineas({
    texto,
    anchoMax: rect.w,
    medirAncho,
    tamanoInicial: tamano,
    tamanoMinimo: Math.max(12, Math.round(tamano * 0.6)),
    maxLineas: 1,
    elipsis: true,
  });
  ctx.font = `${peso} ${tamanoFinal}px ${fam}`;
  ctx.fillStyle = colorCss(color);
  ctx.textBaseline = 'middle';
  ctx.textAlign = alineacion;
  const x = alineacion === 'left' ? rect.x : alineacion === 'right' ? rect.x + rect.w : rect.x + rect.w / 2;
  ctx.fillText(lineas[0], x, rect.y + rect.h / 2);
  ctx.restore();
}

/** Pill translúcido con borde (la sección de "Story inmersiva"): fondo + borde redondeados +
 * etiqueta centrada. */
function dibujarPill(ctx, rect, texto, { tamano, familia, peso, color, fondoColor, bordeColor, tracking = 0 }) {
  if (!rect) return;
  const radio = rect.h / 2;
  ctx.save();
  ctx.fillStyle = colorCss(fondoColor);
  rutaRedondeada(ctx, rect.x, rect.y, rect.w, rect.h, radio);
  ctx.fill();
  if (bordeColor) {
    ctx.strokeStyle = colorCss(bordeColor);
    ctx.lineWidth = 1.5;
    rutaRedondeada(ctx, rect.x + 0.75, rect.y + 0.75, rect.w - 1.5, rect.h - 1.5, radio - 0.75);
    ctx.stroke();
  }
  ctx.restore();
  if (texto) dibujarEtiqueta(ctx, texto, rect, { tamano, familia, peso, color, alineacion: 'center', tracking });
}

/** Icono chico de "chat" (burbuja con una línea), dibujado con primitivas de canvas — nunca una
 * fuente de íconos remota. Usado en el botón del preset "Banner inferior". */
function dibujarIconoChat(ctx, cx, cy, tamano, color) {
  ctx.save();
  ctx.fillStyle = colorCss(color);
  const w = tamano;
  const h = tamano * 0.8;
  rutaRedondeada(ctx, cx - w / 2, cy - h / 2, w, h * 0.82, h * 0.28);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.15, cy + h * 0.12);
  ctx.lineTo(cx - w * 0.05, cy + h * 0.38);
  ctx.lineTo(cx + w * 0.2, cy + h * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Fila de pie del preset "Banner inferior": "Nombre del negocio" a la izquierda (si hay) + botón
 * blanco con ícono de chat y el texto del botón a la derecha, hugging su propio ancho (nunca un
 * botón fijo más ancho o más angosto que el texto real). */
function dibujarPieBanner(ctx, rect, { nombreNegocio, textoBoton }) {
  if (!rect) return;
  const texto = (textoBoton || '').trim() || 'Pedir por privado';
  const tamanoBoton = 28;
  const familiaBoton = familiaCanvas('manrope');
  ctx.save();
  ctx.font = `700 ${tamanoBoton}px ${familiaBoton}`;
  const anchoTexto = ctx.measureText(texto).width;
  const iconoTamano = 34;
  const gapIconoTexto = 10;
  const padX = 22;
  const anchoBoton = Math.min(rect.w, padX * 2 + iconoTamano + gapIconoTexto + anchoTexto);
  const xBoton = rect.x + rect.w - anchoBoton;
  const alturaBoton = Math.min(rect.h, 58);
  const yBoton = rect.y + (rect.h - alturaBoton) / 2;

  ctx.fillStyle = colorCss(COLOR_BANNER_BOTON_BG);
  rutaRedondeada(ctx, xBoton, yBoton, anchoBoton, alturaBoton, alturaBoton / 2);
  ctx.fill();
  dibujarIconoChat(ctx, xBoton + padX + iconoTamano / 2, yBoton + alturaBoton / 2, iconoTamano * 0.62, COLOR_BANNER_BOTON_TEXTO);
  ctx.fillStyle = colorCss(COLOR_BANNER_BOTON_TEXTO);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, xBoton + padX + iconoTamano + gapIconoTexto, yBoton + alturaBoton / 2 + 1);
  ctx.restore();

  const nombre = (nombreNegocio || '').trim();
  if (nombre) {
    dibujarEtiqueta(ctx, nombre, { x: rect.x, y: rect.y, w: Math.max(0, xBoton - rect.x - 16), h: rect.h }, {
      tamano: 27,
      familia: 'manrope',
      peso: 600,
      color: COLOR_BANNER_NEGOCIO,
      alineacion: 'left',
    });
  }
}

/** Fila superior del preset "Editorial": sección en mayúsculas con tracking a la izquierda + "N°
 * 0X" (posición en la tanda) a la derecha. Ninguna de las dos es inventada: si no hay sección, ese
 * lado queda vacío; el número sale de `datos.posicion` (quien publica sabe cuántos son). */
function dibujarFilaSuperiorEditorial(ctx, rect, seccionNombre, posicion) {
  if (!rect) return;
  if (seccionNombre) {
    dibujarEtiqueta(ctx, seccionNombre.toUpperCase(), rect, {
      tamano: 26,
      familia: 'newsreader',
      peso: 500,
      color: COLOR_EDITORIAL_SECCION,
      alineacion: 'left',
      tracking: 3,
    });
  }
  if (posicion?.m > 1) {
    const numero = `N° ${String(posicion.n).padStart(2, '0')}`;
    dibujarEtiqueta(ctx, numero, rect, {
      tamano: 24,
      familia: 'newsreader',
      peso: 400,
      color: COLOR_EDITORIAL_NUMERO,
      alineacion: 'right',
      tracking: 1,
    });
  }
  dibujarLineaFina(ctx, { x: rect.x, y: rect.y + rect.h + 2, w: rect.w, h: 1 }, COLOR_EDITORIAL_DIVISOR);
}

/** Pie del preset "Editorial": separador fino + "NOMBRE DEL NEGOCIO" en mayúsculas con tracking. */
function dibujarPieEditorial(ctx, rect, nombreNegocio) {
  if (!rect || !nombreNegocio) return;
  dibujarLineaFina(ctx, { x: rect.x, y: rect.y, w: rect.w, h: 1 }, COLOR_EDITORIAL_DIVISOR);
  dibujarEtiqueta(ctx, nombreNegocio.toUpperCase(), { x: rect.x, y: rect.y + 10, w: rect.w, h: rect.h - 10 }, {
    tamano: 22,
    familia: 'manrope',
    peso: 600,
    color: COLOR_EDITORIAL_NEGOCIO,
    alineacion: 'left',
    tracking: 2,
  });
}

/** Dibuja el fondo/etiqueta (color, opacidad, redondeo, borde opcional) de una caja de texto. */
function dibujarFondoCaja(ctx, caja) {
  const tieneFondo = caja.fondoColor && caja.fondoOpacidad > 0;
  const tieneBorde = !!caja.bordeColor;
  if (!tieneFondo && !tieneBorde) return;
  ctx.save();
  if (tieneFondo) {
    ctx.fillStyle = hexARgba(caja.fondoColor, caja.fondoOpacidad);
    rutaRedondeada(ctx, caja.x, caja.y, caja.w, caja.h, caja.fondoRadio ?? 0);
    ctx.fill();
  }
  if (tieneBorde) {
    ctx.strokeStyle = colorCss(caja.bordeColor);
    ctx.lineWidth = caja.bordeAncho ?? 1.5;
    rutaRedondeada(ctx, caja.x + 1, caja.y + 1, caja.w - 2, caja.h - 2, (caja.fondoRadio ?? 0) - 1);
    ctx.stroke();
  }
  ctx.restore();
}

/** Dibuja una caja de texto completa: fondo/etiqueta + texto ajustado (achica o parte en líneas, o
 * trunca con "…" si `caja.elipsis` — los 4 presets de composición); con `parrafo: true` (la
 * descripción) parte en todos los renglones que entren en el alto de la caja. `caja.familia ===
 * 'newsreader-italica'` fuerza `font-style: italic` real (la descripción del preset "Polaroid"). */
function dibujarCajaTexto(ctx, texto, caja, { parrafo = false } = {}) {
  if (!caja || caja.visible === false) return;
  dibujarFondoCaja(ctx, caja);

  const familia = familiaCanvas(caja.familia);
  const peso = caja.peso || 400;
  const cursiva = caja.familia === 'newsreader-italica' ? 'italic ' : '';
  const medirAncho = (t, tamano) => {
    ctx.font = `${cursiva}${peso} ${tamano}px ${familia}`;
    return ctx.measureText(t).width;
  };
  const tamanoInicial = caja.tamano || 48;
  const tamanoMinimo = Math.max(16, Math.round(tamanoInicial * 0.45));
  const maxLineas = caja.maxLineas ?? 2;
  const { lineas, tamano } = parrafo ? parrafoDeCaja(ctx, texto, caja, caja.h ?? ALTO) : calcularLineas({
    texto,
    anchoMax: caja.w - 24, // margen interno para que el texto no toque el borde de la etiqueta
    medirAncho,
    tamanoInicial,
    tamanoMinimo,
    maxLineas,
    // Los 4 presets de composición (Fase 4) truncan con "…" en vez de dejar que el clip recorte
    // el texto a la mitad: tienen geometría/fondo fijo donde eso se nota más que en los estilos de
    // siempre. `caja.elipsis` lo trae el juego de ajustes de cada preset (modelo.js); los demás
    // estilos no lo tienen, así que siguen con el comportamiento de clip de toda la vida.
    elipsis: caja.elipsis === true,
  });

  ctx.save();
  ctx.beginPath();
  ctx.rect(caja.x, caja.y, caja.w, caja.h ?? tamano * 1.3 * lineas.length);
  ctx.clip();

  ctx.font = `${cursiva}${peso} ${tamano}px ${familia}`;
  ctx.fillStyle = caja.color || '#ffffff';
  ctx.textBaseline = 'middle';
  const alineacion = caja.alineacion || 'center';
  ctx.textAlign = alineacion;
  const xTexto = alineacion === 'left' ? caja.x + 12 : alineacion === 'right' ? caja.x + caja.w - 12 : caja.x + caja.w / 2;

  const interlineado = tamano * INTERLINEADO;
  const altoTotal = interlineado * lineas.length;
  const alto = caja.h ?? altoTotal;
  let y = caja.y + Math.max(interlineado / 2, (alto - altoTotal) / 2 + interlineado / 2);
  for (const linea of lineas) {
    ctx.fillText(linea, xTexto, y, caja.w - 24);
    y += interlineado;
  }
  ctx.restore();
}
