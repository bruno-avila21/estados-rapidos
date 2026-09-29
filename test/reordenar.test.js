// Reordenamiento de la hoja de revisión (Fase 3 "M" #1): lógica pura, sin DOM. `moverElemento` la
// usan tanto el arrastre con el dedo como los botones "Mover antes"/"Mover después" (alternativa
// accesible) — mismo resultado por los dos caminos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moverElemento, indiceDesdePosicion } from '../js/reordenar.js';

test('moverElemento: mueve hacia adelante', () => {
  assert.deepEqual(moverElemento(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
});

test('moverElemento: mueve hacia atrás', () => {
  assert.deepEqual(moverElemento(['a', 'b', 'c', 'd'], 3, 1), ['a', 'd', 'b', 'c']);
});

test('moverElemento: mismo índice no cambia nada', () => {
  const original = ['a', 'b', 'c'];
  assert.deepEqual(moverElemento(original, 1, 1), ['a', 'b', 'c']);
});

test('moverElemento: un solo elemento', () => {
  assert.deepEqual(moverElemento(['a'], 0, 0), ['a']);
});

test('moverElemento: array vacío devuelve []', () => {
  assert.deepEqual(moverElemento([], 0, 0), []);
});

test('moverElemento: índices fuera de rango se recortan al límite válido', () => {
  assert.deepEqual(moverElemento(['a', 'b', 'c'], -5, 99), ['b', 'c', 'a']);
  assert.deepEqual(moverElemento(['a', 'b', 'c'], 99, -5), ['c', 'a', 'b']);
});

test('moverElemento: no muta el array recibido', () => {
  const original = ['a', 'b', 'c'];
  const copia = [...original];
  moverElemento(original, 0, 2);
  assert.deepEqual(original, copia);
});

test('moverElemento: no acepta que no sea array', () => {
  assert.deepEqual(moverElemento(null, 0, 1), []);
  assert.deepEqual(moverElemento(undefined, 0, 1), []);
});

test('moverElemento: extremo a extremo y viceversa, mantiene los demás en orden', () => {
  assert.deepEqual(moverElemento(['a', 'b', 'c', 'd', 'e'], 0, 4), ['b', 'c', 'd', 'e', 'a']);
  assert.deepEqual(moverElemento(['a', 'b', 'c', 'd', 'e'], 4, 0), ['e', 'a', 'b', 'c', 'd']);
});

test('indiceDesdePosicion: devuelve el slot cuya coordenada X todavía no se pasó', () => {
  const centros = [50, 150, 250, 350]; // 4 slots iguales, centro de cada uno
  assert.equal(indiceDesdePosicion(centros, 10), 0);
  assert.equal(indiceDesdePosicion(centros, 60), 1);
  assert.equal(indiceDesdePosicion(centros, 160), 2);
  assert.equal(indiceDesdePosicion(centros, 400), 3); // pasó el último centro: cae en el último slot
});

test('indiceDesdePosicion: array de centros vacío no revienta', () => {
  assert.equal(indiceDesdePosicion([], 100), 0);
});
