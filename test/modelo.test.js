import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatearPrecio,
  parsearPrecio,
  validarProducto,
  validarRespaldo,
  construirRespaldo,
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
  assert.equal(parsearPrecio(''), 0);
  assert.equal(parsearPrecio('abc'), 0);
});

test('validarProducto: nombre y precio obligatorios', () => {
  const { ok, errores } = validarProducto({ nombre: '', precio: -1 });
  assert.equal(ok, false);
  assert.ok(errores.nombre);
  assert.ok(errores.precio);
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
