// Geometría PURA de los 4 presets de composición (Fase 4, "catálogo de presets"): calcula los
// rectángulos de cada zona (foto de fondo + zona decorativa + nombre/precio/descripción) para el
// lienzo 1080×1920, en función de si el producto tiene precio y/o descripción. Sin canvas, sin
// DOM — testeable con node:test, mismo criterio que layout.js/editor-geometria.js.
//
// Dos usos, mismas funciones:
//   1) Construir los DEFAULTS de `ajustesPorEstilo` (modelo.js) para estos 4 estilos, llamando con
//      {conPrecio:true, conDescripcion:true} — la posición de partida de nombre/precio/descripción,
//      que después el editor (js/vistas/plantilla.js) deja mover/redimensionar igual que los demás
//      estilos con texto.
//   2) En cada dibujo real (js/componer.js), la pieza DECORATIVA de cada preset (franja/marco/
//      tarjeta/scrim) se recalcula con la visibilidad VIGENTE de precio/descripción — así "sin
//      precio" o "sin descripción" no deja un hueco vacío en el fondo, sin importar dónde el
//      usuario haya arrastrado los textos.
//
// El recorte de la foto (horizontal o vertical, "cover-fit") lo sigue resolviendo
// `calcularRecorteCover` (layout.js) sobre el rectángulo `foto`/`marco` que devuelve cada función
// de aquí — no hace falta el tamaño real de la imagen para calcular estos rectángulos.
import { acomodarAutomatico } from './editor-geometria.js';

export const ANCHO_LIENZO = 1080;
export const ALTO_LIENZO = 1920;

function zona(x, y, w, h) {
  return { x, y, w, h };
}

/**
 * Banner inferior: foto de fondo a pantalla completa + una franja sólida anclada abajo (esquinas
 * superiores redondeadas) con nombre + precio en la misma fila y la descripción debajo. Sin
 * precio, el nombre ocupa todo el ancho de la franja. Sin descripción, la franja es más baja (no
 * queda espacio vacío colgando).
 */
export function geometriaBannerInferior({ ancho = ANCHO_LIENZO, alto = ALTO_LIENZO, conPrecio = true, conDescripcion = true } = {}) {
  const margen = 56;
  const padding = 36;
  const alturaFila = 104;
  const anchoPrecio = 300;
  const espacioPrecio = 24;
  const alturaDescripcion = 130;
  const separacion = 20;

  const elementos = [{ clave: 'fila', w: ancho - margen * 2, h: alturaFila }];
  if (conDescripcion) elementos.push({ clave: 'descripcion', w: ancho - margen * 2, h: alturaDescripcion });
  const posiciones = acomodarAutomatico(elementos, { ancho, alto, margenInferior: padding, separacion });

  const yFila = posiciones.fila.y;
  const nombre = zona(
    margen,
    yFila,
    conPrecio ? ancho - margen * 2 - anchoPrecio - espacioPrecio : ancho - margen * 2,
    alturaFila
  );
  const precio = conPrecio ? zona(ancho - margen - anchoPrecio, yFila, anchoPrecio, alturaFila) : null;
  const descripcion = conDescripcion ? zona(margen, posiciones.descripcion.y, ancho - margen * 2, alturaDescripcion) : null;
  const yFranja = yFila - padding;

  return {
    foto: zona(0, 0, ancho, alto),
    franja: zona(0, yFranja, ancho, alto - yFranja),
    nombre,
    precio,
    descripcion,
  };
}

/**
 * Editorial: fondo claro (no la foto a pantalla completa), con la foto dentro de un marco 4:5
 * cerca del arriba y el bloque de texto (título serif, precio/referencia, descripción) debajo del
 * marco. Sin precio o sin descripción el bloque de texto es más corto — nunca queda un renglón
 * vacío porque cada zona se calcula en cadena a partir de la anterior.
 */
export function geometriaEditorial({ ancho = ANCHO_LIENZO, alto = ALTO_LIENZO, conPrecio = true, conDescripcion = true } = {}) {
  const margenLateral = 90;
  const yMarco = 160;
  const wMarco = ancho - margenLateral * 2;
  const hMarco = Math.round(wMarco * 1.25); // aspecto 4:5 (vertical)
  const marco = zona(margenLateral, yMarco, wMarco, hMarco);

  const alturaNombre = 130;
  const alturaPrecio = 70;
  const alturaDescripcion = 130;
  const espacio = 24;

  let y = marco.y + marco.h + 56;
  const nombre = zona(margenLateral, y, wMarco, alturaNombre);
  y += alturaNombre + espacio;
  const precio = conPrecio ? zona(margenLateral, y, wMarco, alturaPrecio) : null;
  if (conPrecio) y += alturaPrecio + espacio;
  const descripcion = conDescripcion ? zona(margenLateral, y, wMarco, alturaDescripcion) : null;

  return { foto: marco, marco, nombre, precio, descripcion };
}

/**
 * Polaroid: tarjeta clara centrada con la foto (cuadrada, cover-fit) arriba y, en el margen
 * inferior de la tarjeta, nombre + precio + descripción centrados y apilados. La altura de la
 * tarjeta se ajusta a lo que hay visible (sin precio/sin descripción, la tarjeta es más baja).
 */
export function geometriaPolaroid({ ancho = ANCHO_LIENZO, alto = ALTO_LIENZO, conPrecio = true, conDescripcion = true } = {}) {
  const margenLateral = 90;
  const yTarjeta = 300;
  const paddingTarjeta = 46;
  const wTarjeta = ancho - margenLateral * 2;
  const wFoto = wTarjeta - paddingTarjeta * 2;
  const foto = zona(margenLateral + paddingTarjeta, yTarjeta + paddingTarjeta, wFoto, wFoto);

  const alturaNombre = 84;
  const alturaPrecio = 64;
  const alturaDescripcion = 72;
  const espacio = 12;
  const paddingInferior = 46;

  let y = foto.y + foto.h + 40;
  const nombre = zona(foto.x, y, wFoto, alturaNombre);
  y += alturaNombre + espacio;
  const precio = conPrecio ? zona(foto.x, y, wFoto, alturaPrecio) : null;
  if (conPrecio) y += alturaPrecio + espacio;
  const descripcion = conDescripcion ? zona(foto.x, y, wFoto, alturaDescripcion) : null;
  if (conDescripcion) y += alturaDescripcion;

  const tarjeta = zona(margenLateral, yTarjeta, wTarjeta, y + paddingInferior - yTarjeta);

  return { foto, tarjeta, nombre, precio, descripcion };
}

/**
 * Story inmersiva: foto a pantalla completa (cover-fit) con un scrim (degradado oscuro) sobre el
 * tercio inferior para que el texto flotante se lea, título grande + precio en "pill" + descripción
 * apilados de abajo hacia arriba (reusa `acomodarAutomatico`, igual que el editor de plantilla).
 * Sin precio o sin descripción, el resto se corre hacia abajo — nunca queda un hueco.
 */
export function geometriaStoryInmersiva({ ancho = ANCHO_LIENZO, alto = ALTO_LIENZO, conPrecio = true, conDescripcion = true } = {}) {
  const margenLateral = 64;
  const margenInferior = 110;
  const separacion = 18;
  const alturaNombre = 150;
  const anchoPrecio = 280;
  const alturaPrecio = 84;
  const alturaDescripcion = 90;

  const elementos = [{ clave: 'nombre', w: ancho - margenLateral * 2, h: alturaNombre }];
  if (conPrecio) elementos.push({ clave: 'precio', w: anchoPrecio, h: alturaPrecio });
  if (conDescripcion) elementos.push({ clave: 'descripcion', w: ancho - margenLateral * 2, h: alturaDescripcion });
  const posiciones = acomodarAutomatico(elementos, { ancho, alto, margenInferior, separacion });

  const nombre = zona(margenLateral, posiciones.nombre.y, ancho - margenLateral * 2, alturaNombre);
  const precio = conPrecio ? zona(margenLateral, posiciones.precio.y, anchoPrecio, alturaPrecio) : null;
  const descripcion = conDescripcion
    ? zona(margenLateral, posiciones.descripcion.y, ancho - margenLateral * 2, alturaDescripcion)
    : null;

  const yScrim = Math.max(0, Math.min(nombre.y - 80, Math.round(alto * 0.45)));

  return {
    foto: zona(0, 0, ancho, alto),
    scrim: zona(0, yScrim, ancho, alto - yScrim),
    nombre,
    precio,
    descripcion,
  };
}
