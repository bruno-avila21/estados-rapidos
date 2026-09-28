// Geometría pura de los 4 presets de composición (Fase 4, "catálogo de presets"): rectángulos de
// cada zona, qué pasa sin precio/sin descripción, y que el rectángulo de foto de cada preset sirve
// para un cover-fit correcto tanto con una foto horizontal como con una vertical (calcularRecorteCover).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  geometriaBannerInferior,
  geometriaEditorial,
  geometriaPolaroid,
  geometriaStoryInmersiva,
  ANCHO_LIENZO,
  ALTO_LIENZO,
} from '../js/geometria-presets.js';
import { calcularRecorteCover } from '../js/layout.js';

const FOTO_HORIZONTAL = { anchoOrigen: 1600, altoOrigen: 900 };
const FOTO_VERTICAL = { anchoOrigen: 900, altoOrigen: 1600 };

function dentroDelLienzo(rect) {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.w <= ANCHO_LIENZO + 0.001 &&
    rect.y + rect.h <= ALTO_LIENZO + 0.001 &&
    rect.w > 0 &&
    rect.h > 0
  );
}

/** Reusado por los 4 presets: el rectángulo de foto que devuelve la geometría, recortado cover con
 * una foto horizontal y con una vertical, siempre da un recorte válido (dentro del origen). */
function assertCoverFitValido(rectFoto) {
  for (const origen of [FOTO_HORIZONTAL, FOTO_VERTICAL]) {
    const { sx, sy, sw, sh } = calcularRecorteCover({
      ...origen,
      anchoDestino: rectFoto.w,
      altoDestino: rectFoto.h,
    });
    assert.ok(sw > 0 && sh > 0, 'el recorte tiene que tener área positiva');
    assert.ok(sx >= 0 && sy >= 0, 'el recorte no puede arrancar antes del origen');
    assert.ok(sx + sw <= origen.anchoOrigen + 0.001, 'el recorte no puede salirse del ancho de origen');
    assert.ok(sy + sh <= origen.altoOrigen + 0.001, 'el recorte no puede salirse del alto de origen');
  }
}

// --- Banner inferior ---

test('geometriaBannerInferior: la foto ocupa todo el lienzo y la franja queda anclada abajo', () => {
  const geo = geometriaBannerInferior();
  assert.deepEqual(geo.foto, { x: 0, y: 0, w: ANCHO_LIENZO, h: ALTO_LIENZO });
  assert.equal(geo.franja.y + geo.franja.h, ALTO_LIENZO);
  assert.ok(dentroDelLienzo(geo.franja));
  assert.ok(dentroDelLienzo(geo.nombre));
  assert.ok(dentroDelLienzo(geo.precio));
  assert.ok(dentroDelLienzo(geo.descripcion));
  assertCoverFitValido(geo.foto);
});

test('geometriaBannerInferior: sin precio, no hay caja de precio y el nombre ocupa todo el ancho de la franja', () => {
  const conPrecio = geometriaBannerInferior({ conPrecio: true });
  const sinPrecio = geometriaBannerInferior({ conPrecio: false });
  assert.equal(sinPrecio.precio, null);
  assert.ok(sinPrecio.nombre.w > conPrecio.nombre.w);
  assert.equal(sinPrecio.nombre.w, ANCHO_LIENZO - 56 * 2);
});

test('geometriaBannerInferior: sin descripción, la franja es más baja (no queda un hueco vacío)', () => {
  const conDescripcion = geometriaBannerInferior({ conDescripcion: true });
  const sinDescripcion = geometriaBannerInferior({ conDescripcion: false });
  assert.equal(sinDescripcion.descripcion, null);
  assert.ok(sinDescripcion.franja.h < conDescripcion.franja.h);
});

// --- Editorial ---

test('geometriaEditorial: el marco 4:5 queda arriba y el texto debajo, todo dentro del lienzo', () => {
  const geo = geometriaEditorial();
  assert.ok(dentroDelLienzo(geo.marco));
  assert.equal(Math.round(geo.marco.h / geo.marco.w * 100) / 100, 1.25); // 4:5 vertical
  assert.ok(geo.nombre.y > geo.marco.y + geo.marco.h);
  assert.ok(dentroDelLienzo(geo.nombre));
  assert.ok(dentroDelLienzo(geo.precio));
  assert.ok(dentroDelLienzo(geo.descripcion));
  assertCoverFitValido(geo.marco);
});

test('geometriaEditorial: sin precio ni descripción, no rompe y no deja cajas colgadas', () => {
  const geo = geometriaEditorial({ conPrecio: false, conDescripcion: false });
  assert.equal(geo.precio, null);
  assert.equal(geo.descripcion, null);
  assert.ok(dentroDelLienzo(geo.nombre));
});

// --- Polaroid ---

test('geometriaPolaroid: la foto es cuadrada y va dentro de la tarjeta', () => {
  const geo = geometriaPolaroid();
  assert.equal(geo.foto.w, geo.foto.h); // cuadrada
  assert.ok(geo.foto.x >= geo.tarjeta.x && geo.foto.x + geo.foto.w <= geo.tarjeta.x + geo.tarjeta.w);
  assert.ok(dentroDelLienzo(geo.tarjeta));
  assertCoverFitValido(geo.foto);
});

test('geometriaPolaroid: sin precio ni descripción, la tarjeta es más baja', () => {
  const completa = geometriaPolaroid({ conPrecio: true, conDescripcion: true });
  const minima = geometriaPolaroid({ conPrecio: false, conDescripcion: false });
  assert.equal(minima.precio, null);
  assert.equal(minima.descripcion, null);
  assert.ok(minima.tarjeta.h < completa.tarjeta.h);
  assert.ok(dentroDelLienzo(minima.tarjeta));
});

// --- Story inmersiva ---

test('geometriaStoryInmersiva: foto de fondo a pantalla completa, contenido anclado abajo', () => {
  const geo = geometriaStoryInmersiva();
  assert.deepEqual(geo.foto, { x: 0, y: 0, w: ANCHO_LIENZO, h: ALTO_LIENZO });
  assert.ok(dentroDelLienzo(geo.scrim));
  assert.ok(dentroDelLienzo(geo.nombre));
  assert.ok(dentroDelLienzo(geo.precio));
  assert.ok(dentroDelLienzo(geo.descripcion));
  // orden visual de arriba hacia abajo: nombre, luego precio, luego descripción (la más pegada al margen inferior).
  assert.ok(geo.nombre.y < geo.precio.y);
  assert.ok(geo.precio.y < geo.descripcion.y);
  assertCoverFitValido(geo.foto);
});

test('geometriaStoryInmersiva: sin precio, el nombre baja hasta pegarse a la descripción (no queda un hueco en el medio)', () => {
  const conPrecio = geometriaStoryInmersiva({ conPrecio: true });
  const sinPrecio = geometriaStoryInmersiva({ conPrecio: false });
  assert.equal(sinPrecio.precio, null);
  // la descripción sigue anclada al mismo margen inferior (es el ÚLTIMO elemento del stack):
  // lo que cambia es que el nombre, al no tener precio en el medio, baja y queda pegado a ella.
  assert.equal(sinPrecio.descripcion.y, conPrecio.descripcion.y);
  assert.ok(sinPrecio.nombre.y > conPrecio.nombre.y);
});

test('geometriaStoryInmersiva: sin descripción tampoco rompe', () => {
  const geo = geometriaStoryInmersiva({ conDescripcion: false });
  assert.equal(geo.descripcion, null);
  assert.ok(dentroDelLienzo(geo.nombre));
});
