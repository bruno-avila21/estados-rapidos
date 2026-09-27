#!/usr/bin/env node
// Servidor estático mínimo, sin dependencias, para probar la PWA localmente (SW y Share API
// necesitan http(s); no alcanza con abrir index.html por doble clic). Uso: node scripts/servir.js [puerto]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..');
const PUERTO = Number(process.argv[2]) || 8080;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const destino = path.normalize(path.join(RAIZ, p));
    if (!destino.startsWith(RAIZ) || !fs.existsSync(destino) || fs.statSync(destino).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('no encontrado');
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(destino)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(destino).pipe(res);
  })
  .listen(PUERTO, '0.0.0.0', () => {
    const ips = Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i.family === 'IPv4' && !i.internal)
      .map((i) => i.address);
    console.log(`estados-rapidos en http://localhost:${PUERTO}`);
    ips.forEach((ip) => console.log(`  desde el celular (misma red): http://${ip}:${PUERTO}`));
    console.log('Ctrl+C para cerrar.');
  });
