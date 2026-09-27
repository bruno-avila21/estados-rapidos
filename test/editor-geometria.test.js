import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementoEnPunto, moverCaja, redimensionarCaja, aplicarSnap } from '../js/editor-geometria.js';

const LIMITES = { w: 1080, h: 1920 };

test('elementoEnPunto: devuelve el elemento que contiene el punto', () => {
  const cajas = [
    { clave: 'foto', x: 0, y: 0, w: 1080, h: 1000 },
    { clave: 'nombre', x: 60, y: 1400, w: 960, h: 100 },
  ];
  assert.equal(elementoEnPunto(cajas, 500, 500), 'foto');
  assert.equal(elementoEnPunto(cajas, 100, 1450), 'nombre');
  assert.equal(elementoEnPunto(cajas, 500, 1900), null);
});

test('elementoEnPunto: con cajas superpuestas devuelve la de más arriba (última)', () => {
  const cajas = [
    { clave: 'fondo', x: 0, y: 0, w: 1080, h: 1920 },
    { clave: 'frente', x: 100, y: 100, w: 200, h: 200 },
  ];
  assert.equal(elementoEnPunto(cajas, 150, 150), 'frente');
  assert.equal(elementoEnPunto(cajas, 900, 900), 'fondo');
});

test('elementoEnPunto: ignora cajas con visible:false', () => {
  const cajas = [{ clave: 'precio', x: 0, y: 0, w: 100, h: 100, visible: false }];
  assert.equal(elementoEnPunto(cajas, 50, 50), null);
});

test('moverCaja: desplaza y respeta los bordes del lienzo', () => {
  const caja = { x: 100, y: 100, w: 200, h: 200 };
  const movida = moverCaja(caja, 50, -30, LIMITES);
  assert.equal(movida.x, 150);
  assert.equal(movida.y, 70);
});

test('moverCaja: no deja salir la caja del lienzo (límite derecho/inferior)', () => {
  const caja = { x: 900, y: 1800, w: 200, h: 200 };
  const movida = moverCaja(caja, 500, 500, LIMITES);
  assert.equal(movida.x, LIMITES.w - caja.w);
  assert.equal(movida.y, LIMITES.h - caja.h);
});

test('moverCaja: no deja salir por izquierda/arriba (valores negativos)', () => {
  const caja = { x: 10, y: 10, w: 200, h: 200 };
  const movida = moverCaja(caja, -100, -100, LIMITES);
  assert.equal(movida.x, 0);
  assert.equal(movida.y, 0);
});

test('redimensionarCaja: manija "se" agranda ancho y alto sin mover x/y', () => {
  const caja = { x: 100, y: 100, w: 200, h: 200 };
  const r = redimensionarCaja(caja, 'se', 50, 30, LIMITES);
  assert.deepEqual(r, { x: 100, y: 100, w: 250, h: 230 });
});

test('redimensionarCaja: manija "nw" mueve x/y y ajusta w/h en consecuencia', () => {
  const caja = { x: 100, y: 100, w: 200, h: 200 };
  const r = redimensionarCaja(caja, 'nw', -20, -20, LIMITES);
  assert.equal(r.x, 80);
  assert.equal(r.y, 80);
  assert.equal(r.w, 220);
  assert.equal(r.h, 220);
});

test('redimensionarCaja: nunca baja del tamaño mínimo', () => {
  const caja = { x: 100, y: 100, w: 200, h: 200 };
  const r = redimensionarCaja(caja, 'se', -1000, -1000, LIMITES, 40);
  assert.equal(r.w, 40);
  assert.equal(r.h, 40);
});

test('redimensionarCaja: no crece más allá del lienzo', () => {
  const caja = { x: 900, y: 100, w: 100, h: 100 };
  const r = redimensionarCaja(caja, 'se', 500, 0, LIMITES);
  assert.equal(r.w, LIMITES.w - 900);
});

test('aplicarSnap: engancha al centro horizontal cuando está cerca', () => {
  const caja = { x: 540 - 100 + 3, y: 500, w: 200, h: 100 }; // centro a 3px del centro del lienzo
  const { caja: ajustada, guias } = aplicarSnap(caja, LIMITES, 12);
  assert.equal(ajustada.x, 540 - 100);
  assert.ok(guias.includes('centro-x'));
});

test('aplicarSnap: engancha al margen izquierdo', () => {
  const caja = { x: 5, y: 500, w: 200, h: 100 };
  const { caja: ajustada, guias } = aplicarSnap(caja, LIMITES, 12);
  assert.equal(ajustada.x, 0);
  assert.ok(guias.includes('margen-izquierdo'));
});

test('aplicarSnap: lejos de cualquier guía no cambia nada', () => {
  const caja = { x: 300, y: 300, w: 200, h: 100 };
  const { caja: ajustada, guias } = aplicarSnap(caja, LIMITES, 12);
  assert.deepEqual(ajustada, caja);
  assert.deepEqual(guias, []);
});
