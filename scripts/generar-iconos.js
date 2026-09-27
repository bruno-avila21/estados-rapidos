#!/usr/bin/env node
// Genera icons/icon-192.png e icon-512.png sin dependencias (PNG dibujado a mano con zlib),
// adaptado del generador de D:\Proyectos_Propios\claude-GUIA-USO\bin\guia.js (subcomando iconos).
// Diseño: etiqueta de precio (motivo del producto) en ámbar sobre fondo sobrio, full-bleed
// para maskable (zona segura: círculo centrado al 80% del tamaño).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESTINO = path.join(__dirname, '..', 'icons');

const FONDO = [0x12, 0x16, 0x1c];
const ACENTO = [0xf5, 0xa6, 0x23];
const AGUJERO = [0x12, 0x16, 0x1c];

function png(size) {
  const crc = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return (buf) => {
      let c = 0xffffffff;
      for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
  })();
  const chunk = (tipo, datos) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(datos.length);
    const td = Buffer.concat([Buffer.from(tipo), datos]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = size / 2;
  const cy = size / 2;
  // Etiqueta de precio: diamante (rotación 45° de un cuadrado) con un agujero circular cerca
  // de una punta, como una etiqueta colgante. Todo con distancia Manhattan/euclídea: sin libs.
  const radioDiamante = size * 0.30;
  const centroAgujeroX = cx - radioDiamante * 0.32;
  const centroAgujeroY = cy - radioDiamante * 0.32;
  const radioAgujero = size * 0.045;

  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const px = x + 0.5;
      const py = y + 0.5;
      const manhattan = Math.abs(px - cx) + Math.abs(py - cy);
      const enDiamante = manhattan <= radioDiamante;
      const enAgujero = Math.hypot(px - centroAgujeroX, py - centroAgujeroY) <= radioAgujero;

      let color = FONDO;
      if (enDiamante && !enAgujero) color = ACENTO;
      else if (enDiamante && enAgujero) color = AGUJERO;

      raw[o] = color[0];
      raw[o + 1] = color[1];
      raw[o + 2] = color[2];
      raw[o + 3] = 255; // full-bleed: sin transparencia, para maskable
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(DESTINO, { recursive: true });
for (const n of [192, 512]) {
  fs.writeFileSync(path.join(DESTINO, `icon-${n}.png`), png(n));
}
console.log('icons/icon-192.png e icons/icon-512.png generados');
