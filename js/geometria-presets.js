// Geometría PURA de los 4 presets de composición ("Banner inferior", "Editorial", "Polaroid",
// "Story inmersiva"): calcula los rectángulos de cada zona (foto/marco/tarjeta decorativa + nombre/
// precio/descripción + los elementos fijos propios de cada preset — sección, número de tanda,
// nombre del negocio) para el lienzo 1080×1920. Sin canvas, sin DOM — testeable con node:test,
// mismo criterio que layout.js/editor-geometria.js.
//
// Ronda 2026-09-29 ("presets calzan con los mocks"): las proporciones/tamaños de esta versión salen
// de MEDIR (no de estimar) los mocks de Stitch en
// Interfaz/stitch_whatsapp_status_uploader_ui/plantilla_preset_<nombre>/code.html — la versión
// anterior (Fase 4, 2026-09-28) tenía números "a ojo" que rendían el texto a menos de la mitad del
// tamaño real del mock y sin la jerarquía serif. Cada mock renderiza su preview en un frame de ancho
// fijo (ej. 290px para "Banner inferior"), así que `escala = 1080 / anchoDelFrameEnElMock` convierte
// cualquier medida CSS del mock a píxeles reales del lienzo. Los mocks tienen algún desborde propio
// (texto a tamaño fijo en un frame angosto — ver Interfaz/comparacion/preset-*.png de la ronda
// anterior): acá se prioriza la JERARQUÍA/proporción medida sobre reproducir un desborde que es un
// artefacto del mock, no del diseño.
//
// Dos usos, mismas funciones:
//   1) Construir los DEFAULTS de `ajustesPorEstilo` (modelo.js) para nombre/precio/descripción —
//      después el editor de plantilla (js/vistas/plantilla.js) los deja mover/redimensionar, igual
//      que en los demás estilos con texto.
//   2) En cada dibujo real (js/componer.js), TODA la geometría (decorativa + fija) se recalcula con
//      la visibilidad VIGENTE (nombre siempre; precio/descripción/sección/nombre del negocio según
//      haya dato) — así ningún hueco vacío queda colgando en el fondo.
//
// El recorte de la foto (horizontal o vertical, "cover-fit") lo resuelve `calcularRecorteCover`
// (layout.js) sobre el rectángulo `foto`/`marco` que devuelve cada función de aquí.
import { acomodarAutomatico } from './editor-geometria.js';

export const ANCHO_LIENZO = 1080;
export const ALTO_LIENZO = 1920;

function zona(x, y, w, h) {
  return { x, y, w, h };
}

// --- Banner inferior: foto a sangre completa + franja sólida anclada abajo (esquinas superiores
// redondeadas). Medido sobre plantilla_preset_banner_inferior (frame 290px, escala ×3.724): label
// de sección, nombre+precio en la misma fila, descripción de 2 líneas, separador y una fila de pie
// (nombre del negocio + botón). ---
const BANNER = {
  padTop: 56,
  padSides: 48,
  padBottom: 52,
  radioSuperior: 40,
  labelH: 40,
  gapLabelNombre: 14,
  filaH: 104,
  anchoPrecio: 320,
  gapNombrePrecio: 24,
  gapFilaDescripcion: 20,
  descripcionH: 92,
  gapAntesDivisor: 18,
  divisorH: 2,
  gapDivisorPie: 18,
  pieH: 66,
};

export function geometriaBannerInferior({
  ancho = ANCHO_LIENZO,
  alto = ALTO_LIENZO,
  conPrecio = true,
  conDescripcion = true,
  conSeccion = true,
} = {}) {
  const c = BANNER;
  let y = c.padTop;

  let seccion = null;
  if (conSeccion) {
    seccion = zona(c.padSides, y, ancho - c.padSides * 2, c.labelH);
    y += c.labelH + c.gapLabelNombre;
  }

  const yFila = y;
  const anchoNombre = conPrecio ? ancho - c.padSides * 2 - c.anchoPrecio - c.gapNombrePrecio : ancho - c.padSides * 2;
  const nombre = zona(c.padSides, yFila, anchoNombre, c.filaH);
  const precio = conPrecio ? zona(ancho - c.padSides - c.anchoPrecio, yFila, c.anchoPrecio, c.filaH) : null;
  y += c.filaH;

  let descripcion = null;
  if (conDescripcion) {
    y += c.gapFilaDescripcion;
    descripcion = zona(c.padSides, y, ancho - c.padSides * 2, c.descripcionH);
    y += c.descripcionH;
  }

  y += c.gapAntesDivisor;
  const divisor = zona(c.padSides, y, ancho - c.padSides * 2, c.divisorH);
  y += c.divisorH + c.gapDivisorPie;

  const pie = zona(c.padSides, y, ancho - c.padSides * 2, c.pieH);
  y += c.pieH + c.padBottom;

  const franjaH = y;
  const franjaY = alto - franjaH;
  const trasladar = (rect) => (rect ? zona(rect.x, rect.y + franjaY, rect.w, rect.h) : null);

  return {
    foto: zona(0, 0, ancho, alto),
    franja: zona(0, franjaY, ancho, franjaH),
    radioSuperior: c.radioSuperior,
    seccion: trasladar(seccion),
    nombre: trasladar(nombre),
    precio: trasladar(precio),
    descripcion: trasladar(descripcion),
    divisor: trasladar(divisor),
    pie: trasladar(pie),
  };
}

// --- Editorial: fondo claro, foto en marco 4:5 (con un hairline desplazado detrás, el "touch
// editorial" del mock) cerca de arriba; debajo, fila sección/N° de tanda, nombre serif grande,
// línea "$precio • sección", descripción y pie con el nombre del negocio. Medido sobre
// plantilla_preset_editorial (frame 275px, escala ×3.927). ---
const EDITORIAL = {
  margenLateral: 90,
  yTop: 64,
  topRowH: 56,
  gapTopFoto: 32,
  aspectoFoto: 1.25, // 4:5 vertical
  gapFotoTexto: 44,
  nombreH: 120,
  gapNombrePrecio: 20,
  precioLineaH: 56,
  gapPrecioDescripcion: 18,
  descripcionH: 150,
  gapDescripcionPie: 26,
  pieH: 54,
};

export function geometriaEditorial({
  ancho = ANCHO_LIENZO,
  alto = ALTO_LIENZO,
  conPrecio = true,
  conDescripcion = true,
  conSeccion = true,
  conNombreNegocio = true,
} = {}) {
  const c = EDITORIAL;
  const anchoFoto = ancho - c.margenLateral * 2;
  const altoFoto = Math.round(anchoFoto * c.aspectoFoto);
  const marco = zona(c.margenLateral, c.yTop + c.topRowH + c.gapTopFoto, anchoFoto, altoFoto);
  const topRow = zona(c.margenLateral, c.yTop, anchoFoto, c.topRowH);

  let y = marco.y + marco.h + c.gapFotoTexto;
  const nombre = zona(c.margenLateral, y, anchoFoto, c.nombreH);
  y += c.nombreH;

  // La línea "$precio • SECCIÓN" existe si hay precio O sección (si no hay ninguno de los dos no
  // queda nada que mostrar ahí, y ocupar el renglón igual dejaría un hueco vacío).
  const conLineaPrecio = conPrecio || conSeccion;
  let precio = null;
  if (conLineaPrecio) {
    y += c.gapNombrePrecio;
    precio = zona(c.margenLateral, y, anchoFoto, c.precioLineaH);
    y += c.precioLineaH;
  }

  let descripcion = null;
  if (conDescripcion) {
    y += c.gapPrecioDescripcion;
    descripcion = zona(c.margenLateral, y, anchoFoto, c.descripcionH);
    y += c.descripcionH;
  }

  let pie = null;
  if (conNombreNegocio) {
    y += c.gapDescripcionPie;
    pie = zona(c.margenLateral, y, anchoFoto, c.pieH);
    y += c.pieH;
  }

  return { foto: marco, marco, topRow, nombre, precio, descripcion, pie };
}

// --- Polaroid: tarjeta blanca centrada con la foto cuadrada (borde tipo polaroid, más ancho abajo)
// arriba y nombre/precio/separador/descripción apilados y centrados debajo. Medido sobre
// plantilla_preset_polaroid (frame 280px, escala ×3.857). ---
const POLAROID = {
  margenLateral: 80,
  padCard: 44,
  padCardBottom: 64,
  gapFotoTexto: 48,
  nombreH: 110,
  gapNombrePrecio: 14,
  precioH: 96,
  gapPrecioDivisor: 22,
  divisorH: 3,
  anchoDivisor: 80,
  gapDivisorDescripcion: 20,
  descripcionH: 110,
};

export function geometriaPolaroid({
  ancho = ANCHO_LIENZO,
  alto = ALTO_LIENZO,
  conPrecio = true,
  conDescripcion = true,
} = {}) {
  const c = POLAROID;
  const wTarjeta = ancho - c.margenLateral * 2;
  const wFoto = wTarjeta - c.padCard * 2;

  let alturaTexto = c.gapFotoTexto + c.nombreH;
  if (conPrecio) alturaTexto += c.gapNombrePrecio + c.precioH;
  if (conDescripcion) alturaTexto += c.gapPrecioDivisor + c.divisorH + c.gapDivisorDescripcion + c.descripcionH;

  const alturaTarjeta = c.padCard + wFoto + alturaTexto + c.padCardBottom;
  const yTarjeta = Math.max(64, Math.round((alto - alturaTarjeta) / 2));
  const tarjeta = zona(c.margenLateral, yTarjeta, wTarjeta, alturaTarjeta);
  const foto = zona(c.margenLateral + c.padCard, yTarjeta + c.padCard, wFoto, wFoto);

  let y = foto.y + foto.h + c.gapFotoTexto;
  const nombre = zona(foto.x, y, wFoto, c.nombreH);
  y += c.nombreH;

  let precio = null;
  if (conPrecio) {
    y += c.gapNombrePrecio;
    precio = zona(foto.x, y, wFoto, c.precioH);
    y += c.precioH;
  }

  let divisor = null;
  let descripcion = null;
  if (conDescripcion) {
    y += c.gapPrecioDivisor;
    divisor = zona(foto.x + (wFoto - c.anchoDivisor) / 2, y, c.anchoDivisor, c.divisorH);
    y += c.divisorH + c.gapDivisorDescripcion;
    descripcion = zona(foto.x, y, wFoto, c.descripcionH);
  }

  return { tarjeta, foto, nombre, precio, divisor, descripcion };
}

// --- Story inmersiva: foto a pantalla completa + scrim inferior; pill de sección, nombre serif
// blanco grande y una fila con el pill de precio + descripción corta, apilados de abajo hacia
// arriba (reusa `acomodarAutomatico`, igual que el editor). Medido sobre
// plantilla_preset_story_inmersiva (frame 310px, escala ×3.484). ---
const STORY = {
  margenLateral: 64,
  margenInferior: 120,
  separacion: 22,
  seccionH: 56,
  anchoSeccion: 320,
  nombreH: 150,
  filaH: 84,
  anchoPrecioPill: 260,
  gapPrecioDescripcion: 20,
};

export function geometriaStoryInmersiva({
  ancho = ANCHO_LIENZO,
  alto = ALTO_LIENZO,
  conPrecio = true,
  conDescripcion = true,
  conSeccion = true,
} = {}) {
  const c = STORY;
  const anchoContenido = ancho - c.margenLateral * 2;

  const elementos = [];
  if (conSeccion) elementos.push({ clave: 'seccion', w: c.anchoSeccion, h: c.seccionH });
  elementos.push({ clave: 'nombre', w: anchoContenido, h: c.nombreH });
  if (conPrecio || conDescripcion) elementos.push({ clave: 'fila', w: anchoContenido, h: c.filaH });

  const posiciones = acomodarAutomatico(elementos, {
    ancho,
    alto,
    margenInferior: c.margenInferior,
    separacion: c.separacion,
  });

  const seccion = conSeccion ? zona(c.margenLateral, posiciones.seccion.y, c.anchoSeccion, c.seccionH) : null;
  const nombre = zona(c.margenLateral, posiciones.nombre.y, anchoContenido, c.nombreH);

  let precio = null;
  let descripcion = null;
  if (conPrecio || conDescripcion) {
    const yFila = posiciones.fila.y;
    if (conPrecio) precio = zona(c.margenLateral, yFila, c.anchoPrecioPill, c.filaH);
    const xDescripcion = c.margenLateral + (conPrecio ? c.anchoPrecioPill + c.gapPrecioDescripcion : 0);
    const wDescripcion = anchoContenido - (conPrecio ? c.anchoPrecioPill + c.gapPrecioDescripcion : 0);
    if (conDescripcion) descripcion = zona(xDescripcion, yFila, wDescripcion, c.filaH);
  }

  const primeraY = seccion ? seccion.y : nombre.y;
  const yScrim = Math.max(0, Math.min(primeraY - 110, Math.round(alto * 0.5)));

  return {
    foto: zona(0, 0, ancho, alto),
    scrim: zona(0, yScrim, ancho, alto - yScrim),
    seccion,
    nombre,
    precio,
    descripcion,
  };
}
