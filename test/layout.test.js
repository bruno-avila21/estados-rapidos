import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularLineas, calcularParrafo, calcularRecorteCover } from '../js/layout.js';

// Medidor simulado: monoespaciado, cada carácter ocupa 0.55 * tamano px (no hay canvas en Node).
const medirAncho = (texto, tamano) => texto.length * tamano * 0.55;

test('calcularLineas: texto corto entra en una línea al tamaño inicial', () => {
  const { lineas, tamano } = calcularLineas({ texto: 'Remera', anchoMax: 400, medirAncho, tamanoInicial: 60, tamanoMinimo: 20 });
  assert.deepEqual(lineas, ['Remera']);
  assert.equal(tamano, 60);
});

test('calcularLineas: texto largo se achica antes de partir', () => {
  const texto = 'Zapatillas deportivas';
  const { lineas, tamano } = calcularLineas({ texto, anchoMax: 300, medirAncho, tamanoInicial: 60, tamanoMinimo: 20 });
  assert.equal(lineas.length, 1);
  assert.ok(tamano < 60);
  assert.ok(medirAncho(lineas[0], tamano) <= 300);
});

test('calcularLineas: texto largo se parte en 2 líneas que entran en el ancho', () => {
  const texto = 'Campera de invierno linda';
  const { lineas, tamano } = calcularLineas({ texto, anchoMax: 260, medirAncho, tamanoInicial: 60, tamanoMinimo: 24, maxLineas: 2 });
  assert.equal(lineas.length, 2);
  for (const linea of lineas) assert.ok(medirAncho(linea, tamano) <= 260 + 1e-6);
});

test('calcularLineas: si ni partido en maxLineas entra, no se pierde texto (el dibujo lo recorta)', () => {
  const texto = 'Campera de invierno impermeable talle grande con capucha desmontable';
  const { lineas, tamano } = calcularLineas({ texto, anchoMax: 260, medirAncho, tamanoInicial: 60, tamanoMinimo: 24, maxLineas: 2 });
  assert.equal(lineas.length, 2);
  assert.equal(tamano, 24);
  // se prioriza no perder palabras: la primera línea siempre entra; la última puede desbordar
  // y por eso el dibujo real la recorta con ctx.clip() — nunca se sale de la caja visualmente.
  assert.ok(medirAncho(lineas[0], tamano) <= 260 + 1e-6);
  assert.ok(lineas.join(' ').length >= texto.length - 1);
});

test('calcularLineas: nunca devuelve más líneas que maxLineas', () => {
  const texto = 'Un nombre de producto extremadamente largo con muchas palabras distintas';
  const { lineas } = calcularLineas({ texto, anchoMax: 150, medirAncho, tamanoInicial: 60, tamanoMinimo: 20, maxLineas: 2 });
  assert.ok(lineas.length <= 2);
});

test('calcularLineas: texto vacío no rompe', () => {
  const { lineas } = calcularLineas({ texto: '', anchoMax: 300, medirAncho, tamanoInicial: 40, tamanoMinimo: 20 });
  assert.deepEqual(lineas, ['']);
});

// --- `elipsis: true` (Fase 4, presets de composición: banner inferior/editorial/polaroid/story
// inmersiva) — en vez del clip de siempre, la última línea se trunca con "…" antes de desbordar.

test('calcularLineas con elipsis: si ni partido en maxLineas entra, la última línea se trunca con "…" en vez de desbordar', () => {
  const texto = 'Campera de invierno impermeable talle grande con capucha desmontable';
  const { lineas, tamano } = calcularLineas({
    texto,
    anchoMax: 260,
    medirAncho,
    tamanoInicial: 60,
    tamanoMinimo: 24,
    maxLineas: 2,
    elipsis: true,
  });
  assert.equal(lineas.length, 2);
  for (const linea of lineas) assert.ok(medirAncho(linea, tamano) <= 260 + 1e-6);
  assert.ok(lineas[1].endsWith('…'));
});

test('calcularLineas con elipsis: una sola palabra más ancha que la caja también se trunca', () => {
  const texto = 'Superextraordinariamente';
  const { lineas, tamano } = calcularLineas({
    texto,
    anchoMax: 150,
    medirAncho,
    tamanoInicial: 40,
    tamanoMinimo: 20,
    maxLineas: 1,
    elipsis: true,
  });
  assert.equal(lineas.length, 1);
  assert.ok(lineas[0].endsWith('…'));
  assert.ok(medirAncho(lineas[0], tamano) <= 150 + 1e-6);
});

test('calcularLineas con elipsis: texto que entra tal cual no se toca (sin "…" de más)', () => {
  const { lineas } = calcularLineas({
    texto: 'Remera',
    anchoMax: 400,
    medirAncho,
    tamanoInicial: 60,
    tamanoMinimo: 20,
    elipsis: true,
  });
  assert.deepEqual(lineas, ['Remera']);
});

test('calcularLineas: sin elipsis (comportamiento de siempre) sigue dejando desbordar la última línea', () => {
  const texto = 'Campera de invierno impermeable talle grande con capucha desmontable';
  const { lineas } = calcularLineas({ texto, anchoMax: 260, medirAncho, tamanoInicial: 60, tamanoMinimo: 24, maxLineas: 2 });
  assert.ok(!lineas[1].endsWith('…'));
});

test('calcularRecorteCover: origen más ancho recorta los costados', () => {
  const { sx, sy, sw, sh } = calcularRecorteCover({ anchoOrigen: 2000, altoOrigen: 1000, anchoDestino: 800, altoDestino: 800 });
  assert.equal(sh, 1000);
  assert.ok(sw < 2000);
  assert.ok(sx > 0);
  assert.equal(sy, 0);
});

test('calcularRecorteCover: origen más alto recorta arriba/abajo', () => {
  const { sx, sy, sw, sh } = calcularRecorteCover({ anchoOrigen: 1000, altoOrigen: 2000, anchoDestino: 800, altoDestino: 800 });
  assert.equal(sw, 1000);
  assert.ok(sh < 2000);
  assert.equal(sx, 0);
  assert.ok(sy > 0);
});

test('calcularRecorteCover: mismo aspecto no recorta', () => {
  const { sw, sh } = calcularRecorteCover({ anchoOrigen: 800, altoOrigen: 800, anchoDestino: 400, altoDestino: 400 });
  assert.equal(sw, 800);
  assert.equal(sh, 800);
});

// --- calcularParrafo (la descripción, pedido 2026-10-03): parte en renglones al tamaño elegido y
// respeta los saltos escritos, en vez de achicar a una línea o truncar con "…". ---
test('calcularParrafo: un texto largo se parte en renglones SIN achicar la letra si hay alto', () => {
  const texto = 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce';
  const { lineas, tamano, recortado } = calcularParrafo({ texto, anchoMax: 200, altoMax: 2000, medirAncho, tamanoInicial: 40, tamanoMinimo: 18 });
  assert.equal(tamano, 40);
  assert.equal(recortado, false);
  assert.ok(lineas.length > 2);
  assert.equal(lineas.join(' '), texto); // no se pierde ni una palabra
  for (const l of lineas) assert.ok(medirAncho(l, tamano) <= 200, l);
});

test('calcularParrafo: respeta los saltos de línea escritos (y colapsa los renglones en blanco de más)', () => {
  const { lineas } = calcularParrafo({ texto: 'Talle S y M\r\nColor negro\n\n\n\nEnvíos a todo el país', anchoMax: 2000, altoMax: 2000, medirAncho, tamanoInicial: 30 });
  assert.deepEqual(lineas, ['Talle S y M', 'Color negro', '', 'Envíos a todo el país']);
});

test('calcularParrafo: si no entra en el alto, achica la letra antes de truncar', () => {
  const texto = 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce';
  const { tamano, recortado, lineas } = calcularParrafo({ texto, anchoMax: 200, altoMax: 150, medirAncho, tamanoInicial: 40, tamanoMinimo: 18 });
  assert.ok(tamano < 40 && tamano >= 18);
  assert.equal(recortado, false);
  assert.ok(lineas.length * tamano * 1.22 <= 150);
});

test('calcularParrafo: recién al tamaño mínimo y sin alto trunca con "…", sin pasarse del ancho', () => {
  const texto = 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince';
  const { lineas, tamano, recortado } = calcularParrafo({ texto, anchoMax: 200, altoMax: 50, medirAncho, tamanoInicial: 40, tamanoMinimo: 18 });
  assert.equal(tamano, 18);
  assert.equal(recortado, true);
  assert.ok(lineas.at(-1).endsWith('…'));
  for (const l of lineas) assert.ok(medirAncho(l, tamano) <= 200, l);
});

test('calcularParrafo: una palabra más ancha que la caja se corta por letras, no desborda', () => {
  const { lineas, tamano } = calcularParrafo({ texto: 'a'.repeat(60), anchoMax: 200, altoMax: 2000, medirAncho, tamanoInicial: 30 });
  assert.ok(lineas.length > 1);
  assert.equal(lineas.join(''), 'a'.repeat(60));
  for (const l of lineas) assert.ok(medirAncho(l, tamano) <= 200, l);
});
