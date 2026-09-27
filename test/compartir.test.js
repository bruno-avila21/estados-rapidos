// Timeout de seguridad de compartirArchivos (QA.md #6): si navigator.share nunca resuelve, el
// llamador se libera igual. Se stubean navigator/document (no hay DOM en node --test) y se usan
// los temporizadores falsos de node:test para no esperar de verdad.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

global.document = { getElementById: () => null };
// Node 22 expone `globalThis.navigator` como getter sin setter: no se puede reasignar directo.
Object.defineProperty(global, 'navigator', {
  configurable: true,
  writable: true,
  value: {
    canShare: () => true,
    clipboard: { writeText: async () => {} },
    share: () => new Promise(() => {}), // nunca resuelve: simula una hoja que nadie cierra
  },
});

const { compartirArchivos, TIMEOUT_COMPARTIR_MS } = await import('../js/utils/compartir.js');

test('compartirArchivos: el timeout de seguridad devuelve "tardando" sin esperar a share()', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const archivo = { name: 'x.png', type: 'image/png' };
    const promesa = compartirArchivos({ archivos: [archivo], texto: 'hola' });
    mock.timers.tick(TIMEOUT_COMPARTIR_MS + 1);
    const resultado = await promesa;
    assert.equal(resultado, 'tardando');
  } finally {
    mock.timers.reset();
  }
});

test('compartirArchivos: sin canShare devuelve sin-soporte de inmediato', async () => {
  const original = global.navigator.canShare;
  global.navigator.canShare = () => false;
  const resultado = await compartirArchivos({ archivos: [{ name: 'x.png' }], texto: '' });
  assert.equal(resultado, 'sin-soporte');
  global.navigator.canShare = original;
});

test('compartirArchivos: AbortError se traduce a "cancelado"', async () => {
  const original = global.navigator.share;
  global.navigator.share = () => {
    const error = new Error('cancelado por el usuario');
    error.name = 'AbortError';
    return Promise.reject(error);
  };
  const resultado = await compartirArchivos({ archivos: [{ name: 'x.png' }], texto: '' });
  assert.equal(resultado, 'cancelado');
  global.navigator.share = original;
});
