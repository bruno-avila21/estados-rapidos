// La estrategia de cacheo del SW es una función pura (ver receta pwa.md y e2e.md):
// nunca cache-first puro para código, cache-first solo para ícons con URL estable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipoDeCache } from '../js/sw-estrategia.js';

test('tipoDeCache: los íconos son cache-first', () => {
  assert.equal(tipoDeCache('https://bruno-avila21.github.io/estados-rapidos/icons/icon-192.png'), 'cache-first');
  assert.equal(tipoDeCache('https://bruno-avila21.github.io/estados-rapidos/icons/icon-512.png'), 'cache-first');
});

test('tipoDeCache: el html/js/css/manifest son network-first', () => {
  assert.equal(tipoDeCache('https://bruno-avila21.github.io/estados-rapidos/index.html'), 'network-first');
  assert.equal(tipoDeCache('https://bruno-avila21.github.io/estados-rapidos/js/main.js'), 'network-first');
  assert.equal(tipoDeCache('https://bruno-avila21.github.io/estados-rapidos/css/estilos.css'), 'network-first');
  assert.equal(tipoDeCache('https://bruno-avila21.github.io/estados-rapidos/manifest.webmanifest'), 'network-first');
  assert.equal(tipoDeCache('https://bruno-avila21.github.io/estados-rapidos/'), 'network-first');
});
