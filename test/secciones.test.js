// Modelo de secciones (etiquetas): un producto puede estar en varias a la vez. Agrupamiento,
// conteo y filtro son funciones puras — testeables sin IndexedDB (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarNombreSeccion,
  agruparProductosPorSeccion,
  contarProductosPorSeccion,
  filtrarProductosPorSeccion,
  seccionesDelProducto,
  ID_SIN_SECCION,
} from '../js/modelo.js';

const SECCIONES = [
  { id: 'lunes', nombre: 'Lunes', orden: 0 },
  { id: 'martes', nombre: 'Martes', orden: 1 },
];

function producto(id, secciones) {
  return { id, nombre: `Producto ${id}`, secciones };
}

test('validarNombreSeccion: rechaza vacío y demasiado largo, acepta lo normal', () => {
  assert.equal(validarNombreSeccion('').ok, false);
  assert.equal(validarNombreSeccion('   ').ok, false);
  assert.equal(validarNombreSeccion('a'.repeat(41)).ok, false);
  assert.equal(validarNombreSeccion('Lunes').ok, true);
  assert.equal(validarNombreSeccion('  Lunes  ').ok, true);
});

test('seccionesDelProducto: normaliza undefined/null/no-array a []', () => {
  assert.deepEqual(seccionesDelProducto({}), []);
  assert.deepEqual(seccionesDelProducto({ secciones: null }), []);
  assert.deepEqual(seccionesDelProducto({ secciones: 'lunes' }), []);
  assert.deepEqual(seccionesDelProducto({ secciones: ['lunes'] }), ['lunes']);
});

test('agruparProductosPorSeccion: un producto en 2 secciones aparece en AMBOS grupos (mismo objeto)', () => {
  const p1 = producto('1', ['lunes', 'martes']);
  const p2 = producto('2', ['lunes']);
  const p3 = producto('3', []);
  const grupos = agruparProductosPorSeccion([p1, p2, p3], SECCIONES);

  assert.equal(grupos.length, 3); // lunes, martes, "Sin sección"
  const lunes = grupos.find((g) => g.id === 'lunes');
  const martes = grupos.find((g) => g.id === 'martes');
  const sinSeccion = grupos.find((g) => g.id === null);

  assert.deepEqual(lunes.productos.map((p) => p.id), ['1', '2']);
  assert.deepEqual(martes.productos.map((p) => p.id), ['1']);
  assert.deepEqual(sinSeccion.productos.map((p) => p.id), ['3']);
  assert.equal(sinSeccion.nombre, 'Sin sección');
  // Es el MISMO objeto en los dos grupos: cambiar su selección en un grupo se ve en el otro.
  assert.strictEqual(lunes.productos[0], martes.productos[0]);
});

test('agruparProductosPorSeccion: "Sin sección" queda SIEMPRE al final', () => {
  const grupos = agruparProductosPorSeccion([producto('1', [])], SECCIONES);
  assert.equal(grupos.at(-1).id, null);
  assert.equal(grupos.at(-1).nombre, 'Sin sección');
});

test('agruparProductosPorSeccion: respeta el orden de `secciones` recibido', () => {
  const invertidas = [SECCIONES[1], SECCIONES[0]]; // martes, lunes
  const grupos = agruparProductosPorSeccion([], invertidas);
  assert.deepEqual(grupos.slice(0, 2).map((g) => g.id), ['martes', 'lunes']);
});

test('agruparProductosPorSeccion: ids de sección que ya no existen (borrada) no rompen nada', () => {
  const p1 = producto('1', ['fantasma']);
  const grupos = agruparProductosPorSeccion([p1], SECCIONES);
  const sinSeccion = grupos.find((g) => g.id === null);
  assert.deepEqual(sinSeccion.productos.map((p) => p.id), ['1']); // cae a "sin sección"
});

test('contarProductosPorSeccion: cuenta total, por sección y "sin sección"', () => {
  const productos = [producto('1', ['lunes', 'martes']), producto('2', ['lunes']), producto('3', [])];
  const conteos = contarProductosPorSeccion(productos, SECCIONES);
  assert.equal(conteos.todas, 3);
  assert.equal(conteos.porSeccion.get('lunes'), 2);
  assert.equal(conteos.porSeccion.get('martes'), 1);
  assert.equal(conteos.sinSeccion, 1);
});

test('filtrarProductosPorSeccion: "todas"/vacío/null devuelve todo sin tocar', () => {
  const productos = [producto('1', ['lunes'])];
  assert.deepEqual(filtrarProductosPorSeccion(productos, 'todas'), productos);
  assert.deepEqual(filtrarProductosPorSeccion(productos, null), productos);
  assert.deepEqual(filtrarProductosPorSeccion(productos, undefined), productos);
});

test('filtrarProductosPorSeccion: filtra por id de sección', () => {
  const p1 = producto('1', ['lunes']);
  const p2 = producto('2', ['martes']);
  const p3 = producto('3', ['lunes', 'martes']);
  const resultado = filtrarProductosPorSeccion([p1, p2, p3], 'lunes');
  assert.deepEqual(resultado.map((p) => p.id), ['1', '3']);
});

test(`filtrarProductosPorSeccion: ${ID_SIN_SECCION} devuelve solo los que no tienen ninguna`, () => {
  const p1 = producto('1', ['lunes']);
  const p2 = producto('2', []);
  const p3 = producto('3', undefined);
  const resultado = filtrarProductosPorSeccion([p1, p2, p3], ID_SIN_SECCION);
  assert.deepEqual(resultado.map((p) => p.id), ['2', '3']);
});
