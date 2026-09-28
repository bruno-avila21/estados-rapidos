// Arma `_sitio/` con SOLO lo que se sirve (sin tests, docs ni scripts). Lo usan la Action de
// GitHub Pages y el build de Cloudflare Pages: una sola lista, para que los dos publiquen lo mismo.
// Si agregás una carpeta que la app carga (como pasó con `fonts/`), sumala acá y nada más.
import { cpSync, rmSync, existsSync } from 'node:fs';

const QUE_SE_SIRVE = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'fonts', '.nojekyll', 'docs/captura-instalacion.png'];
const DESTINO = '_sitio';

rmSync(DESTINO, { recursive: true, force: true });
for (const ruta of QUE_SE_SIRVE) {
  if (!existsSync(ruta)) continue; // p. ej. la captura para el manifest, si todavía no existe
  cpSync(ruta, `${DESTINO}/${ruta}`, { recursive: true });
}
console.log(`sitio armado en ${DESTINO}/`);
