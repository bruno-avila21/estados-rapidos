// Validación del archivo de respaldo importado: nunca confiar en la forma de un archivo externo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarRespaldo, construirRespaldo, VERSION_RESPALDO, AJUSTES_POR_DEFECTO_POR_ESTILO } from '../js/modelo.js';

test('validarRespaldo: rechaza objeto vacío o null', () => {
  assert.equal(validarRespaldo(null).ok, false);
  assert.equal(validarRespaldo(undefined).ok, false);
  assert.equal(validarRespaldo({}).ok, false);
  assert.equal(validarRespaldo('texto').ok, false);
});

test('validarRespaldo: rechaza demasiados productos', () => {
  const productos = Array.from({ length: 2001 }, (_, i) => ({ id: String(i), nombre: 'x', precio: 1 }));
  const { ok, error } = validarRespaldo({ version: VERSION_RESPALDO, productos });
  assert.equal(ok, false);
  assert.match(error, /demasiados/i);
});

test('validarRespaldo: rechaza foto codificada absurdamente grande', () => {
  const productos = [{ id: 'a', nombre: 'x', precio: 1, fotoBase64: 'A'.repeat(5_000_000) }];
  const { ok, error } = validarRespaldo({ version: VERSION_RESPALDO, productos });
  assert.equal(ok, false);
  assert.match(error, /grande/i);
});

test('validarRespaldo: rechaza precio no numérico', () => {
  const productos = [{ id: 'a', nombre: 'x', precio: 'gratis' }];
  const { ok } = validarRespaldo({ version: VERSION_RESPALDO, productos });
  assert.equal(ok, false);
});

test('validarRespaldo: rechaza plantilla con imagen inválida', () => {
  const respaldo = construirRespaldo({ productos: [], plantilla: { imagenBase64: 123 } });
  const { ok } = validarRespaldo(respaldo);
  assert.equal(ok, false);
});

test('ida y vuelta: exportar y volver a validar sin pérdida de datos', () => {
  const original = [
    { id: 'x1', nombre: 'Gorra', precio: 8000, descripcion: 'Talle único', fotoBase64: null, creado: 'a', actualizado: 'a' },
  ];
  const respaldo = construirRespaldo({ productos: original, plantilla: null });
  const serializado = JSON.stringify(respaldo);
  const vueltoAParsear = JSON.parse(serializado);
  const { ok } = validarRespaldo(vueltoAParsear);
  assert.equal(ok, true);
  assert.equal(vueltoAParsear.productos[0].nombre, 'Gorra');
  assert.equal(vueltoAParsear.productos[0].precio, 8000);
});

// --- ajustesPorEstilo / incluirTextoAlCompartir (ronda "ajustes por estilo", 2026-09-28) ---

test('construirRespaldo: sin plantilla propia, usa los defaults por estilo (no un ajustes compartido)', () => {
  const respaldo = construirRespaldo({ productos: [], plantilla: { imagenBase64: null } });
  assert.deepEqual(respaldo.plantilla.ajustesPorEstilo, AJUSTES_POR_DEFECTO_POR_ESTILO);
  assert.equal(validarRespaldo(respaldo).ok, true);
});

test('construirRespaldo: general incluye incluirTextoAlCompartir (por defecto encendido)', () => {
  const respaldo = construirRespaldo({ productos: [], general: {} });
  assert.equal(respaldo.general.incluirTextoAlCompartir, true);
  assert.equal(validarRespaldo(respaldo).ok, true);
});

test('validarRespaldo: rechaza incluirTextoAlCompartir que no sea booleano', () => {
  const respaldo = construirRespaldo({ productos: [], general: {} });
  respaldo.general.incluirTextoAlCompartir = 'sí';
  assert.equal(validarRespaldo(respaldo).ok, false);
});

test('validarRespaldo: un respaldo viejo (ajustes compartido, sin ajustesPorEstilo) sigue siendo válido', () => {
  const respaldo = construirRespaldo({ productos: [], plantilla: { imagenBase64: null } });
  delete respaldo.plantilla.ajustesPorEstilo;
  respaldo.plantilla.ajustes = { nombre: { x: 10, y: 20, w: 100, h: 40 } }; // formato de antes de 2026-09-28
  assert.equal(validarRespaldo(respaldo).ok, true);
});

// --- Secciones en el respaldo (ronda "secciones", 2026-09-28) ---

test('construirRespaldo: incluye la colección de secciones y `secciones` por producto', () => {
  const secciones = [{ id: 's1', nombre: 'Lunes', orden: 0 }];
  const productos = [{ id: 'p1', nombre: 'Gorra', precio: 1000, secciones: ['s1'], creado: 'a', actualizado: 'a' }];
  const respaldo = construirRespaldo({ productos, secciones });
  assert.deepEqual(respaldo.secciones, [{ id: 's1', nombre: 'Lunes', orden: 0 }]);
  assert.deepEqual(respaldo.productos[0].secciones, ['s1']);
  assert.equal(validarRespaldo(respaldo).ok, true);
});

test('construirRespaldo: sin secciones, la colección queda vacía y cada producto con `secciones: []`', () => {
  const productos = [{ id: 'p1', nombre: 'Gorra', precio: 1000, creado: 'a', actualizado: 'a' }];
  const respaldo = construirRespaldo({ productos });
  assert.deepEqual(respaldo.secciones, []);
  assert.deepEqual(respaldo.productos[0].secciones, []);
  assert.equal(validarRespaldo(respaldo).ok, true);
});

test('validarRespaldo: un respaldo VIEJO (de antes de la ronda "secciones", sin el campo) sigue siendo válido', () => {
  const respaldo = construirRespaldo({ productos: [{ id: 'p1', nombre: 'Gorra', precio: 1000, creado: 'a', actualizado: 'a' }] });
  delete respaldo.secciones;
  delete respaldo.productos[0].secciones;
  assert.equal(validarRespaldo(respaldo).ok, true);
});

test('validarRespaldo: rechaza `secciones` que no sea un array', () => {
  const respaldo = construirRespaldo({ productos: [] });
  respaldo.secciones = 'no-es-array';
  assert.equal(validarRespaldo(respaldo).ok, false);
});

test('validarRespaldo: rechaza una sección sin id o sin nombre', () => {
  const base = construirRespaldo({ productos: [] });
  assert.equal(validarRespaldo({ ...base, secciones: [{ nombre: 'Lunes' }] }).ok, false);
  assert.equal(validarRespaldo({ ...base, secciones: [{ id: 's1', nombre: '' }] }).ok, false);
});

test('validarRespaldo: rechaza `secciones` de un producto que no sea un array de strings', () => {
  const productos = [{ id: 'p1', nombre: 'Gorra', precio: 1000, secciones: [123] }];
  const respaldo = construirRespaldo({ productos });
  assert.equal(validarRespaldo(respaldo).ok, false);
});
