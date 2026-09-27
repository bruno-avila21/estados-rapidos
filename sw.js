// Service worker: network-first para html/js/css/manifest (con fallback a caché si no hay red),
// cache-first solo para los íconos. Receta pwa.md. `VERSION` sube en cada release.
import { tipoDeCache } from './js/sw-estrategia.js';

const VERSION = 'v2';
const CACHE = `estados-rapidos-${VERSION}`;
const NUCLEO = [
  './',
  './index.html',
  './css/estilos.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/db.js',
  './js/repositorio.js',
  './js/modelo.js',
  './js/layout.js',
  './js/componer.js',
  './js/plantilla-defecto.js',
  './js/utils/imagen.js',
  './js/utils/toast.js',
  './js/utils/confirmar.js',
  './js/utils/compartir.js',
  './js/vistas/lista.js',
  './js/vistas/detalle.js',
  './js/vistas/plantilla.js',
  './js/vistas/respaldo.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(NUCLEO.map((ruta) => new Request(ruta, { cache: 'reload' })));
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  const estrategia = tipoDeCache(request.url);
  if (estrategia === 'cache-first') {
    evento.respondWith(cacheFirst(request));
  } else {
    evento.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request) {
  const enCache = await caches.match(request);
  if (enCache) return enCache;
  const respuesta = await fetch(request);
  const cache = await caches.open(CACHE);
  cache.put(request, respuesta.clone());
  return respuesta;
}

async function networkFirst(request) {
  try {
    const respuesta = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put(request, respuesta.clone());
    return respuesta;
  } catch (error) {
    const enCache = await caches.match(request);
    if (enCache) return enCache;
    throw error;
  }
}

self.addEventListener('message', (evento) => {
  if (evento.data === 'saltar-espera') self.skipWaiting();
});
