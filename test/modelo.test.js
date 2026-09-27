import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatearPrecio,
  parsearPrecio,
  validarProducto,
  validarRespaldo,
  construirRespaldo,
  resolverEstilo,
  aplicarPlantillaDescripcion,
  resolverDescripcion,
  ESTILOS_IMAGEN,
  ESTILO_POR_DEFECTO,
  DESCRIPCION_MODELO_POR_DEFECTO,
  AJUSTES_FRANJA_POR_DEFECTO,
} from '../js/modelo.js';

test('formatearPrecio: miles es-AR, sin decimales por defecto', () => {
  assert.equal(formatearPrecio(12500), '$ 12.500');
  assert.equal(formatearPrecio(1000000), '$ 1.000.000');
  assert.equal(formatearPrecio(0), '$ 0');
});

test('formatearPrecio: con decimales', () => {
  assert.equal(formatearPrecio(1250.5, { decimales: true }), '$ 1.250,50');
});

test('formatearPrecio: sin separador de miles', () => {
  assert.equal(formatearPrecio(12500, { separadorMiles: false }), '$ 12500');
});

test('formatearPrecio: prefijo configurable y valores inválidos', () => {
  assert.equal(formatearPrecio(12500, { prefijo: 'ARS ' }), 'ARS 12.500');
  assert.equal(formatearPrecio(-50), '$ 0');
  assert.equal(formatearPrecio(NaN), '$ 0');
});

test('parsearPrecio: admite formatos con y sin separadores', () => {
  assert.equal(parsearPrecio('12.500'), 12500);
  assert.equal(parsearPrecio('12500'), 12500);
  assert.equal(parsearPrecio('$ 12.500'), 12500);
  assert.equal(parsearPrecio('1250,50'), 1250.5);
});

test('parsearPrecio: vacío o no numérico da NaN, negativo preserva el signo (QA.md #8)', () => {
  // a propósito NO clampea: la validación es responsabilidad de validarProducto, para no
  // guardar un precio inválido en silencio como "$ 0".
  assert.ok(Number.isNaN(parsearPrecio('')));
  assert.ok(Number.isNaN(parsearPrecio('abc')));
  assert.equal(parsearPrecio('-500'), -500);
});

test('validarProducto: nombre y precio obligatorios', () => {
  const { ok, errores } = validarProducto({ nombre: '', precio: -1 });
  assert.equal(ok, false);
  assert.ok(errores.nombre);
  assert.ok(errores.precio);
});

test('validarProducto: precio vacío (NaN) o cero también son inválidos (QA.md #8)', () => {
  assert.equal(validarProducto({ nombre: 'x', precio: NaN }).ok, false);
  assert.equal(validarProducto({ nombre: 'x', precio: 0 }).ok, false);
  assert.equal(validarProducto({ nombre: 'x', precio: 1 }).ok, true);
});

test('validarProducto: producto válido', () => {
  const { ok, errores } = validarProducto({ nombre: 'Remera', precio: 9990, descripcion: 'Talle M' });
  assert.equal(ok, true);
  assert.deepEqual(errores, {});
});

test('validarProducto: nombre demasiado largo', () => {
  const { ok, errores } = validarProducto({ nombre: 'a'.repeat(90), precio: 10 });
  assert.equal(ok, false);
  assert.ok(errores.nombre);
});

test('validarRespaldo: rechaza versión desconocida', () => {
  const { ok, error } = validarRespaldo({ version: 99, productos: [] });
  assert.equal(ok, false);
  assert.match(error, /versión/i);
});

test('validarRespaldo: rechaza si falta productos', () => {
  const { ok } = validarRespaldo({ version: 1 });
  assert.equal(ok, false);
});

test('validarRespaldo: acepta un respaldo bien formado', () => {
  const respaldo = construirRespaldo({
    productos: [{ id: 'p1', nombre: 'Remera', precio: 9990, descripcion: '', fotoBase64: null }],
    plantilla: null,
  });
  const { ok, error } = validarRespaldo(respaldo);
  assert.equal(ok, true, error);
});

test('validarRespaldo: rechaza producto sin id', () => {
  const { ok } = validarRespaldo({ version: 1, productos: [{ nombre: 'x', precio: 1 }] });
  assert.equal(ok, false);
});

test('construirRespaldo → validarRespaldo: ida y vuelta', () => {
  const productos = [
    { id: 'a', nombre: 'Pantalón', precio: 15000, descripcion: 'Azul', fotoBase64: null, creado: '2026-01-01', actualizado: '2026-01-01' },
    { id: 'b', nombre: 'Campera', precio: 45000, descripcion: '', fotoBase64: 'data:image/jpeg;base64,AAA=', creado: '2026-01-02', actualizado: '2026-01-02' },
  ];
  const plantilla = { imagenBase64: null, ajustes: { foto: { x: 0, y: 0, w: 10, h: 10 } }, formatoPrecio: { prefijo: '$ ' } };
  const respaldo = construirRespaldo({ productos, plantilla });
  assert.equal(respaldo.version, 1);
  assert.equal(respaldo.productos.length, 2);
  const { ok } = validarRespaldo(respaldo);
  assert.equal(ok, true);
  assert.equal(JSON.parse(JSON.stringify(respaldo)).productos[1].nombre, 'Campera');
});

// --- Estilo de imagen + descripción modelo (cambio de producto 2026-09-27) ---

test('resolverEstilo: usa el override del producto si es válido', () => {
  assert.equal(resolverEstilo({ estilo: 'foto-precio' }, { estiloGeneral: 'solo-foto' }), 'foto-precio');
});

test('resolverEstilo: sin override, usa el general', () => {
  assert.equal(resolverEstilo({ estilo: null }, { estiloGeneral: 'mi-plantilla' }), 'mi-plantilla');
  assert.equal(resolverEstilo({}, {}), ESTILO_POR_DEFECTO);
});

test('resolverEstilo: ignora un override u estiloGeneral inválido (dato corrupto)', () => {
  assert.equal(resolverEstilo({ estilo: 'no-existe' }, { estiloGeneral: 'foto-precio' }), 'foto-precio');
  assert.equal(resolverEstilo({}, { estiloGeneral: 'tampoco-existe' }), ESTILO_POR_DEFECTO);
});

test('resolverEstilo: los 3 estilos declarados son válidos', () => {
  for (const estilo of ESTILOS_IMAGEN) {
    assert.equal(resolverEstilo({ estilo }, {}), estilo);
  }
});

test('aplicarPlantillaDescripcion: reemplaza los 3 marcadores', () => {
  const resultado = aplicarPlantillaDescripcion('{nombre} a {precio} — {descripcion}', {
    nombre: 'Remera',
    precio: '$ 12.500',
    descripcion: 'talle M',
  });
  assert.equal(resultado, 'Remera a $ 12.500 — talle M');
});

test('aplicarPlantillaDescripcion: marcador repetido se reemplaza todas las veces', () => {
  const resultado = aplicarPlantillaDescripcion('{nombre}! Sí, {nombre}!', { nombre: 'Oferta', precio: '', descripcion: '' });
  assert.equal(resultado, 'Oferta! Sí, Oferta!');
});

test('aplicarPlantillaDescripcion: sin plantilla, usa el modelo por defecto', () => {
  const resultado = aplicarPlantillaDescripcion(null, { nombre: 'Gorra', precio: '$ 8.000', descripcion: '' });
  assert.equal(resultado, aplicarPlantillaDescripcion(DESCRIPCION_MODELO_POR_DEFECTO, { nombre: 'Gorra', precio: '$ 8.000', descripcion: '' }));
});

test('resolverDescripcion: producto con descripción propia la usa tal cual (sin aplicar el modelo)', () => {
  const producto = { nombre: 'Campera', precio: 45000, descripcion: 'Talle único, azul' };
  assert.equal(resolverDescripcion(producto, { descripcionModelo: '{nombre} baratísimo' }), 'Talle único, azul');
});

test('resolverDescripcion: sin descripción propia, aplica el modelo con el precio formateado', () => {
  const producto = { nombre: 'Campera', precio: 45000, descripcion: '' };
  const resultado = resolverDescripcion(producto, {
    descripcionModelo: '{nombre} a {precio} 🔥',
    formatoPrecio: { prefijo: '$ ', separadorMiles: true, decimales: false },
  });
  assert.equal(resultado, 'Campera a $ 45.000 🔥');
});

test('AJUSTES_FRANJA_POR_DEFECTO: trae franja, nombre y precio dentro del lienzo 1080x1920', () => {
  for (const caja of [AJUSTES_FRANJA_POR_DEFECTO.franja, AJUSTES_FRANJA_POR_DEFECTO.nombre, AJUSTES_FRANJA_POR_DEFECTO.precio]) {
    assert.ok(caja.x >= 0 && caja.x + caja.w <= 1080);
    assert.ok(caja.y >= 0 && caja.y + caja.h <= 1920);
  }
});
