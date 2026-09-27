# Seguridad — estados-rapidos

**Qué se protege:** los datos de un solo negocio (productos, fotos, plantilla) que viven **solo en
el celular de Bruno** (IndexedDB del navegador). **De quién:** de que ese dato salga del celular sin
que Bruno lo decida (el único canal de salida es el botón **Publicar**, que comparte una imagen ya
compuesta, nunca los datos crudos) y de que un archivo de respaldo importado rompa la app.
**Fuera de alcance:** no hay servidor, no hay cuentas, no hay login — un solo usuario, sin datos de
terceros. No hay automatización sobre WhatsApp (decisión del brief: el último toque siempre es humano,
cero riesgo de baneo).

## Siempre (checklist de la receta `seguridad.md`)
- [x] Sin secretos: no hay `.env`, no hay claves, no hay backend. `.gitignore` cubre `node_modules`
      y artefactos de test igual, por prolijidad.
- [x] Dependencias: `@playwright/test` es la única (devDependency, de test — cero dependencias de
      runtime, como pide el brief). `npm audit` se corre antes de cada release (`/mejorar ciberseguridad`).
- [x] Logs sin datos sensibles: la app no manda logs a ningún lado (no hay backend ni analytics).
- [x] Mínimo privilegio: el Service Worker solo cachea los archivos propios de la app (network-first
      para código, cache-first solo para íconos — nunca cachea nada dinámico ni de terceros).
- [x] Este archivo, con fecha 2026-09-27.

## Web (checklist aplicable a una PWA sin backend)
- [x] Sin auth: no aplica (un solo usuario, sin cuentas ni sesión).
- [x] **Validar toda entrada**, incluida la que viene de un archivo externo: `js/modelo.js`
      (`validarProducto`, `validarRespaldo`) rechaza formas inválidas, precios no numéricos, más de
      2000 productos, fotos codificadas en base64 desproporcionadamente grandes (> 4 MB por foto,
      > 8 MB la plantilla) — un `.json` de respaldo hostil no puede tirar la app ni llenar el disco.
- [x] CSP estricta en `<meta>` (`index.html`): `default-src 'self'`, `script-src 'self'` (sin
      `unsafe-inline` ni `unsafe-eval`, sin CDNs), `img-src 'self' blob: data:` (fotos y plantillas
      vienen de IndexedDB como blob o del respaldo como data URI), `object-src 'none'`,
      `frame-ancestors 'none'`, `base-uri 'none'`.
- [x] **Nunca `innerHTML` con datos del usuario**: toda la UI se arma con `createElement` +
      `textContent` (ver `js/vistas/*.js`); el nombre, precio y descripción del producto nunca se
      interpretan como HTML.
- [x] Uploads (fotos y plantilla): `accept="image/*"` / `image/png`, se procesan con
      `createImageBitmap` (si el archivo no es una imagen válida, falla ahí, no se ejecuta nada) y
      se redimensionan/comprimen antes de guardar (máx. 1600 px, JPEG 0.85) — nunca se guarda el
      archivo original tal cual llegó.
- [x] CORS: no aplica (no hay API propia). El `manifest.webmanifest` y el `sw.js` sirven desde el
      mismo origen (`scope`/`start_url` relativos).
- [x] Rutas públicas: TODO el sitio es público por diseño (repo y Pages públicos, decisión del
      brief) — no hay datos en el repo, solo código; los datos de cada usuario quedan en su propio
      navegador.
- [x] "Desde localhost entra sin clave": no aplica, no hay backend.
- [x] `preflight` / build: no hay build (HTML+JS+CSS planos); `npm test` + `npm run test:e2e` antes
      de cada release, y `npx playwright install --with-deps chromium` en CI (`.github/workflows/test.yml`).

## Específico de esta app
- [x] `scripts/servir.js` (servidor de desarrollo local, no se publica en Pages): resuelve rutas con
      `path.normalize` + chequeo de prefijo contra la raíz del proyecto — sin path traversal.
- [x] `js/repositorio.js` / `js/db.js`: todo el acceso a datos pasa por acá; no hay SQL (IndexedDB),
      no hay concatenación de queries.
- [x] Sin `eval`/`new Function` en ningún archivo.
- [x] `navigator.storage.persist()` se pide al arrancar para reducir el riesgo de que el navegador
      borre los datos por presión de espacio (A.8.13, ver `CALIDAD.md`).
- [x] El respaldo (`.json`) que baja Bruno **nunca se sube al repo** (no vive en el proyecto, lo
      genera y guarda el propio navegador al exportar).

## OWASP — qué no aplica y por qué
Esta app no tiene servidor, no autentica, no ejecuta SQL ni comandos, no hace requests salientes
propias (no hay SSRF posible) y no depende de componentes con historial de CVEs relevantes (una sola
devDependency de test). El único vector real es **un archivo de respaldo hostil** importado por el
propio Bruno, cubierto arriba con `validarRespaldo`. XSS por nombre/descripción de producto está
cubierto por no usar `innerHTML` en ningún punto de la UI.
