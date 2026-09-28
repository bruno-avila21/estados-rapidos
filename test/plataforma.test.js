// El puente hacia el APK (js/utils/plataforma.js) tiene que elegir el camino nativo
// (window.Android) cuando existe, y no reventar ni tocarlo cuando no existe (navegador normal,
// y este mismo entorno de test: node --test no tiene DOM real).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Node 22 expone `globalThis.navigator` como getter sin setter (mismo motivo que compartir.test.js).
Object.defineProperty(global, 'navigator', {
  configurable: true,
  writable: true,
  value: { clipboard: { writeText: async () => {} } },
});

const { enApk, copiarTexto, guardarArchivoApk, compartirImagenesApk, versionApk } = await import(
  '../js/utils/plataforma.js'
);

test('enApk: false sin window ni window.Android (navegador / test)', () => {
  assert.equal(enApk(), false);
});

test('enApk: true cuando window.Android existe', () => {
  global.window = { Android: {} };
  try {
    assert.equal(enApk(), true);
  } finally {
    delete global.window;
  }
});

test('copiarTexto: usa navigator.clipboard cuando no hay puente', async () => {
  const llamado = mock.fn(async () => {});
  global.navigator.clipboard.writeText = llamado;
  await copiarTexto('hola');
  assert.equal(llamado.mock.calls.length, 1);
  assert.equal(llamado.mock.calls[0].arguments[0], 'hola');
});

test('copiarTexto: usa Android.copiar cuando hay puente, y no toca navigator.clipboard', async () => {
  const copiar = mock.fn();
  global.window = { Android: { copiar } };
  const llamadoClipboard = mock.fn(async () => {});
  global.navigator.clipboard.writeText = llamadoClipboard;
  try {
    await copiarTexto('chau');
    assert.equal(copiar.mock.calls.length, 1);
    assert.equal(copiar.mock.calls[0].arguments[0], 'chau');
    assert.equal(llamadoClipboard.mock.calls.length, 0);
  } finally {
    delete global.window;
  }
});

test('guardarArchivoApk: llama a Android.guardarArchivo con nombre/mime/contenido', () => {
  const guardarArchivo = mock.fn();
  global.window = { Android: { guardarArchivo } };
  try {
    guardarArchivoApk({ nombre: 'x.json', mime: 'application/json', contenido: '{"a":1}' });
    assert.equal(guardarArchivo.mock.calls.length, 1);
    assert.deepEqual(guardarArchivo.mock.calls[0].arguments, ['x.json', 'application/json', '{"a":1}']);
  } finally {
    delete global.window;
  }
});

test('compartirImagenesApk: manda una dataURL por archivo, apenas está lista, y al final compartirPreparadas', async () => {
  const guardarParaCompartir = mock.fn();
  const compartirPreparadas = mock.fn();
  global.window = { Android: { guardarParaCompartir, compartirPreparadas } };
  try {
    const archivo = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    // FileReader no existe en node --test: se simula devolviendo directo una dataURL fija,
    // total lo que importa acá es que cada archivo llegue con su índice, en orden.
    global.FileReader = class {
      readAsDataURL() {
        this.onload && this.onload();
      }
      get result() {
        return 'data:image/jpeg;base64,AQID';
      }
    };
    await compartirImagenesApk({ archivos: [archivo, archivo], texto: 'hola' });
    assert.equal(guardarParaCompartir.mock.calls.length, 2);
    assert.deepEqual(guardarParaCompartir.mock.calls[0].arguments, [0, 'data:image/jpeg;base64,AQID']);
    assert.deepEqual(guardarParaCompartir.mock.calls[1].arguments, [1, 'data:image/jpeg;base64,AQID']);
    assert.equal(compartirPreparadas.mock.calls.length, 1);
    assert.equal(compartirPreparadas.mock.calls[0].arguments[0], 'hola');
  } finally {
    delete global.window;
    delete global.FileReader;
  }
});

test('versionApk: null sin puente, y el string del puente cuando existe', () => {
  assert.equal(versionApk(), null);
  global.window = { Android: { version: () => '1.0' } };
  try {
    assert.equal(versionApk(), '1.0');
  } finally {
    delete global.window;
  }
});
