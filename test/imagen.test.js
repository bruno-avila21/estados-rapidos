// base64ABlob: decodifica un data URL a Blob a mano (atob), no con fetch() — BUGS.md #26 (dentro
// del WebView del APK, importar un respaldo con fotoBase64 armado a mano dejaba el producto sin
// foto, sin ningún error visible). Node 18+ ya trae `atob`/`Blob` globales, así que esto se puede
// testear sin DOM ni mocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base64ABlob } from '../js/utils/imagen.js';

test('base64ABlob: decodifica el tipo MIME y el contenido de un data URL', async () => {
  // "hola" en base64
  const dataUrl = 'data:text/plain;base64,aG9sYQ==';
  const blob = await base64ABlob(dataUrl);
  assert.equal(blob.type, 'text/plain');
  assert.equal(blob.size, 4);
  const texto = await blob.text();
  assert.equal(texto, 'hola');
});

test('base64ABlob: funciona con image/png (bytes binarios, no solo texto)', async () => {
  const bytesOriginales = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // firma PNG
  const base64 = Buffer.from(bytesOriginales).toString('base64');
  const blob = await base64ABlob(`data:image/png;base64,${base64}`);
  assert.equal(blob.type, 'image/png');
  const buffer = Buffer.from(await blob.arrayBuffer());
  assert.deepEqual([...buffer], [...bytesOriginales]);
});

test('base64ABlob: sin tipo reconocible, cae a application/octet-stream', async () => {
  const blob = await base64ABlob('data:;base64,aG9sYQ==');
  assert.equal(blob.type, 'application/octet-stream');
});
