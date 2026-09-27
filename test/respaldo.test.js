// Validación del archivo de respaldo importado: nunca confiar en la forma de un archivo externo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarRespaldo, construirRespaldo, VERSION_RESPALDO } from '../js/modelo.js';

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
