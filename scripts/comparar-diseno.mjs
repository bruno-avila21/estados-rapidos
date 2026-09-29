#!/usr/bin/env node
// Compara una pantalla del diseño Stitch (Interfaz/stitch_.../<pantalla>/code.html) contra la
// misma pantalla ya renderizada por la app real, lado a lado, en Interfaz/comparacion/<pantalla>.png.
// Uso: npm run comparar -- <pantalla>   (ej.: productos_lista_natural, productos_vista_grilla_natural)
//
// El code.html del diseño SÍ puede cargar Tailwind/Google Fonts por CDN (es un mock de Stitch, no
// la app) — solo para esta comparación. La app se sirve con scripts/servir.js (igual que en local)
// y se siembra con datos parecidos a los del mock (mismos nombres/precios/secciones de ejemplo,
// foto de prueba de test/e2e/fixtures) antes de la captura.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..');
const ANCHO = 412;
const ALTO = 915;

const FOTOS_DIR = path.join(RAIZ, 'Interfaz', 'comparacion', 'fotos');

// --- Datasets de ejemplo: EXACTAMENTE los productos/precios/secciones/selección visibles en cada
// code.html (no un dataset inventado ni compartido entre las 2 pantallas — así cada diferencia
// entre las capturas es de maqueta, no de datos). Fotos: las mismas del code.html, bajadas una vez
// a Interfaz/comparacion/fotos/ (fuera de git) con las URLs originales del mock. ---

// Las secciones "Lencería"/"Novedades" se crean vacías (0 productos) SOLO para que los chips del
// filtro existan como en el mock (el número exacto del chip no es lo que se está comparando acá);
// como quedan sin productos, `vistaAgrupada` (lista.js) las filtra y no dibuja su bloque — así
// "Sin sección" es el ÚNICO grupo visible y aparece primero (evita el choque con la regla real y
// testeada de la app "Sin sección va al final del agrupado", que el mock no respeta).

// productos_lista_natural: grupo "Sin sección" (único que el mock realmente dibuja), en orden.
const LISTA_PRODUCTOS = [
  { nombre: 'Torta Temática Clash', descripcion: 'Pastel artesanal 2 pisos', precio: 14500, seccion: null, seleccionado: true, foto: 'lista-1-torta.jpg' },
  { nombre: 'Michi Peluche Miau', descripcion: 'Accesorios y regalos deco', precio: 8900, seccion: null, seleccionado: true, foto: 'lista-2-michi.jpg' },
  { nombre: 'Remera Minimalist Algodón', descripcion: 'Ropa oversize premium', precio: null, seccion: null, seleccionado: true, foto: 'lista-3-remera.jpg' },
  { nombre: 'Sneakers Urban Flame', descripcion: 'Calzado deportivo urbano', precio: 38000, seccion: null, seleccionado: false, foto: 'lista-4-sneakers.jpg' },
];

// productos_vista_grilla_natural: "Sin sección" (3, marcados) — el único grupo que importa acá.
const GRILLA_PRODUCTOS = [
  { nombre: 'Taza Cerámica Salvia', descripcion: 'Taza de cerámica artesanal', precio: 14500, seccion: null, seleccionado: true, foto: 'grilla-1-taza.jpg' },
  { nombre: 'Vela de Soja Higo & Cedro', descripcion: 'Vela de soja aromática', precio: 8900, seccion: null, seleccionado: true, foto: 'grilla-2-vela.jpg' },
  { nombre: 'Conejo de Lana Fieltro', descripcion: 'Peluche de lana fieltro', precio: 6200, seccion: null, seleccionado: true, foto: 'grilla-3-conejo.jpg' },
];

// --- Qué pantalla del diseño corresponde a qué ruta/estado de la app + qué dataset le toca ---
const ESCENAS = {
  productos_lista_natural: { hash: '#/', vista: 'compacta', titulo: 'Productos — lista', secciones: ['Lencería', 'Novedades'], productos: LISTA_PRODUCTOS },
  productos_vista_grilla_natural: { hash: '#/', vista: 'grilla', titulo: 'Productos — grilla', secciones: ['Lencería', 'Novedades'], productos: GRILLA_PRODUCTOS },
  // Fase 5: 3 pantallas con seed propio (no lista/grilla) — usan `preparar(page)` en vez del
  // dataset lista/grilla de arriba, porque cada una necesita navegar a una ruta distinta
  // (#/producto/<id>, #/secciones, #/respaldo) después de sembrar.
  editar_producto_natural: {
    titulo: 'Editar producto',
    async preparar(page) {
      const fotoBase64 = fs.readFileSync(path.join(FOTOS_DIR, 'lista-2-michi.jpg')).toString('base64');
      await page.goto('/');
      const id = await page.evaluate(async (fotoBase64) => {
        const repo = await import('/js/repositorio.js');
        const secciones = await Promise.all(
          ['Novedades de la semana', 'Ofertas especiales', 'Lencería y Textil', 'Hecho a mano'].map((n) => repo.crearSeccion(n))
        );
        const aBytes = (b64) => {
          const binario = atob(b64);
          const bytes = new Uint8Array(binario.length);
          for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
          return bytes;
        };
        const archivo = new File([aBytes(fotoBase64)], 'michi.jpg', { type: 'image/jpeg' });
        const guardado = await repo.guardarProducto(
          {
            nombre: 'Michi Peluche Miau',
            precio: 8900,
            descripcion: 'Peluche artesanal tejido en lana premium hipoalergénica. Ideal para regalo o deco infantil. Consultas por mensaje directo.',
            secciones: [secciones[0].id],
          },
          archivo
        );
        return guardado.id;
      }, fotoBase64);
      await page.goto(`/#/producto/${id}`);
      await page.waitForSelector('.foto-picker__vista:not([hidden])', { state: 'visible' });
      await page.waitForTimeout(150);
    },
  },
  // ajustes_de_publicaci_n_natural: el mock no muestra ninguna foto/producto real (es una pantalla
  // de configuración) — catálogo vacío alcanza. Ronda "orden del diseño" (2026-09-29): la galería
  // "Estilo de las imágenes" se mudó a Plantilla, así que ya no hay miniaturas que esperar acá.
  ajustes_de_publicaci_n_natural: {
    titulo: 'Ajustes',
    async preparar(page) {
      await page.goto('/#/ajustes');
      await page.waitForSelector('.fila-acceso', { state: 'visible', timeout: 10_000 });
      await page.waitForTimeout(150);
    },
  },
  // confirmar_publicaci_n_natural: 3 productos EXACTOS del mock (nombre/precio/orden), con sus 3
  // fotos bajadas de las URLs del code.html a fotos/confirmar-*.jpg — abre la hoja de revisión de
  // verdad (revision.js), no un mock aparte.
  confirmar_publicaci_n_natural: {
    titulo: 'Confirmar publicación',
    async preparar(page) {
      const fotosBase64 = {
        taza: fs.readFileSync(path.join(FOTOS_DIR, 'confirmar-1-taza.jpg')).toString('base64'),
        vela: fs.readFileSync(path.join(FOTOS_DIR, 'confirmar-2-vela.jpg')).toString('base64'),
        conejo: fs.readFileSync(path.join(FOTOS_DIR, 'confirmar-3-conejo.jpg')).toString('base64'),
      };
      await page.goto('/');
      const ids = await page.evaluate(async (fotosBase64) => {
        const repo = await import('/js/repositorio.js');
        const aBytes = (b64) => {
          const binario = atob(b64);
          const bytes = new Uint8Array(binario.length);
          for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
          return bytes;
        };
        const datos = [
          { nombre: 'Taza Cerámica Salvia', precio: 14500, foto: fotosBase64.taza, archivo: 'taza.jpg' },
          { nombre: 'Vela de Soja Higo & Lavanda', precio: 8900, foto: fotosBase64.vela, archivo: 'vela.jpg' },
          { nombre: 'Conejo de Lana Fieltro', precio: 12000, foto: fotosBase64.conejo, archivo: 'conejo.jpg' },
        ];
        const idsCreados = [];
        for (const d of datos) {
          const archivo = new File([aBytes(d.foto)], d.archivo, { type: 'image/jpeg' });
          const guardado = await repo.guardarProducto({ nombre: d.nombre, precio: d.precio }, archivo);
          idsCreados.push(guardado.id);
        }
        return idsCreados;
      }, fotosBase64);
      await page.evaluate(async (idsCreados) => {
        const revision = await import('/js/vistas/revision.js');
        await revision.abrirHojaRevision({ ids: idsCreados });
      }, ids);
      await page.waitForSelector('.hoja-revision__miniatura', { state: 'visible', timeout: 10_000 });
      await page.waitForTimeout(200);
    },
  },
  gesti_n_de_secciones_natural: {
    titulo: 'Gestión de secciones',
    async preparar(page) {
      await page.goto('/');
      // Conteos reales iguales a los del mock (8/12/15 productos): productos "mudos" (sin foto,
      // no se ven en esta pantalla) asignados a cada sección, no un número maquillado.
      await page.evaluate(async () => {
        const repo = await import('/js/repositorio.js');
        const plan = [
          ['Novedades de la semana', 8],
          ['Ofertas especiales', 12],
          ['Lencería y Textil', 15],
        ];
        for (const [nombreSeccion, cantidad] of plan) {
          const seccion = await repo.crearSeccion(nombreSeccion);
          for (let i = 1; i <= cantidad; i += 1) {
            await repo.guardarProducto({ nombre: `${nombreSeccion} #${i}`, precio: 1000, secciones: [seccion.id] });
          }
        }
      });
      await page.goto('/#/secciones');
      await page.waitForTimeout(150);
    },
  },
  // editar_plantilla_natural: el mock muestra "Foto con descripción" seleccionado (descripción
  // visible, nombre/precio ocultos) con la foto de taza+vela del propio code.html (bajada a
  // fotos/plantilla-1-taza-vela.jpg) y el mismo texto de descripción. Encuadre "Llenar la
  // pantalla" (cover, no el "Entera"/contain por defecto): el mock recorta la foto a pantalla
  // completa, sin el fondo difuminado de "Entera". `segundaCaptura` pide una 2ª comparación
  // (`<pantalla>-2.png`) con las 2 páginas scrolleadas hasta la MISMA sección real ("Capas y
  // Visibilidad"), no un mismo número de píxeles — el lienzo de la app es mucho más alto que el
  // del mock (ancho completo, aspect-ratio 9:16 real) así que un scroll por píxeles fijos las deja
  // en puntos distintos.
  editar_plantilla_natural: {
    titulo: 'Editor de plantilla',
    segundaCaptura: { textoDiseno: 'Capas y Visibilidad', selectorApp: '.editor-plantilla__capas' },
    async preparar(page) {
      const fotoBase64 = fs.readFileSync(path.join(FOTOS_DIR, 'plantilla-1-taza-vela.jpg')).toString('base64');
      await page.goto('/');
      await page.evaluate(async (fotoBase64) => {
        const repo = await import('/js/repositorio.js');
        await repo.guardarEncuadreFoto('cover');
        const aBytes = (b64) => {
          const binario = atob(b64);
          const bytes = new Uint8Array(binario.length);
          for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
          return bytes;
        };
        const archivo = new File([aBytes(fotoBase64)], 'taza-vela.jpg', { type: 'image/jpeg' });
        await repo.guardarProducto(
          {
            nombre: 'Taza de Gres Calma',
            precio: null,
            descripcion: 'Taza de gres artesanal con esmalte salvia mate y asa ergonómica.',
          },
          archivo
        );
      }, fotoBase64);
      await page.goto('/#/plantilla?estilo=foto-descripcion');
      await page.waitForSelector('[data-elemento="descripcion"]', { state: 'visible', timeout: 10_000 });
      await page.waitForTimeout(250); // canvas (raf) + miniaturas en vivo de las 2 galerías
      // El mock muestra la descripción con el anillo de "seleccionada" (asa de arrastre incluida)
      // — un clic real deja el panel de propiedades ("Alineación y Contraste") abierto para la 2ª
      // comparación, en vez de mostrarlo oculto como quedaría sin selección. El clic auto-scrollea
      // (Playwright lleva el elemento a la vista): se vuelve a `scrollTo(0, 0)` para que la 1ª
      // captura (sin scroll) siga arrancando en el tope de la página, con la barra superior.
      await page.locator('[data-elemento="descripcion"]').click();
      await page.evaluate(() => window.scrollTo(0, 0));
    },
  },
  respaldo_natural: {
    titulo: 'Respaldo',
    // El mock dibuja el interruptor "Copia automática diaria" ya activado (aria-checked="true") —
    // se siembra igual, para que la comparación muestre la MISMA maqueta en el estado real que
    // tendría alguien que la prendió (ronda "copia automática").
    segundaCaptura: { textoDiseno: 'Preferencias de respaldo', selectorApp: '.panel-respaldo__preferencia' },
    async preparar(page) {
      await page.goto('/');
      // 48 productos · 6 secciones (conteos reales del mock) + un registro de "último respaldo"
      // (misma clave de localStorage que respaldo.js) simulando una exportación de hoy a las
      // 10:42 de 24.8 MB — mismo dato que muestra la tarjeta "Estado actual" del mock.
      await page.evaluate(async () => {
        const repo = await import('/js/repositorio.js');
        const secciones = await Promise.all(
          ['Novedades', 'Ofertas', 'Lencería', 'Hogar', 'Accesorios', 'Varios'].map((n) => repo.crearSeccion(n))
        );
        for (let i = 1; i <= 48; i += 1) {
          await repo.guardarProducto({ nombre: `Producto ${i}`, precio: 1000, secciones: [secciones[i % secciones.length].id] });
        }
        const hoy = new Date();
        hoy.setHours(10, 42, 0, 0);
        localStorage.setItem('estados-rapidos:ultimo-respaldo', JSON.stringify({ fecha: hoy.getTime(), tamano: Math.round(24.8 * 1024 * 1024) }));
        await repo.guardarCopiaAutomaticaHabilitada(true);
      });
      await page.goto('/#/respaldo');
      await page.waitForTimeout(150);
    },
  },
};

// --- Los 4 presets de composición ("plantilla_preset_<nombre>"): a diferencia de las pantallas de
// arriba (una captura de VIEWPORT de una pantalla de la app), acá se compara la IMAGEN FINAL
// 1080×1920 que arma `js/componer.js` (lo que de verdad se comparte a WhatsApp) contra el `screen.png`
// ya exportado de cada mock — no se re-renderiza el code.html con Tailwind/Google Fonts vía file://
// porque el preview de cada preset vive DENTRO de un mockup de teléfono a un ancho de frame fijo
// (290/275/280/310px, medido a mano en geometria-presets.js): la foto que ya exportó Stitch a
// `screen.png` es la referencia real, más fiel que re-renderizar el mock con un viewport adivinado.
// Misma foto que cada mock (bajada UNA vez de la URL de su code.html a Interfaz/comparacion/fotos/
// preset-<nombre>.jpg, igual que las demás pantallas) y los mismos textos reales del mock.
const PRESETS = {
  'banner-inferior': {
    carpetaMock: 'plantilla_preset_banner_inferior',
    producto: {
      nombre: 'Taza de Gres Calma',
      precio: 4500,
      descripcion: 'Gres artesanal esmaltado a mano con acabado mate sedoso. Pieza única horneada a alta temperatura.',
    },
    seccionNombre: 'Colección Hogar',
    general: { nombreNegocio: 'Taller Hogar', textoBoton: 'Pedir por privado' },
    posicion: { n: 1, m: 1 },
  },
  editorial: {
    carpetaMock: 'plantilla_preset_editorial',
    producto: {
      nombre: 'Taza de Gres Artesanal',
      precio: 4500,
      descripcion: 'Elaborada a torno con arcilla silícea de grano medio y esmalte satinado libre de plomo. Apta para microondas y lavavajillas.',
    },
    seccionNombre: 'Colección Botánica',
    general: { nombreNegocio: 'Taller Tierra Firme', textoBoton: 'Pedir por privado' },
    posicion: { n: 4, m: 12 },
  },
  polaroid: {
    carpetaMock: 'plantilla_preset_polaroid',
    producto: { nombre: 'Taza de gres artesanal', precio: 4500, descripcion: 'Edición limitada en salvia' },
    seccionNombre: '',
    general: { nombreNegocio: '', textoBoton: 'Pedir por privado' },
    posicion: { n: 1, m: 1 },
  },
  'story-inmersiva': {
    carpetaMock: 'plantilla_preset_story_inmersiva',
    producto: { nombre: 'Taza Botánica Salvia', precio: 4500, descripcion: 'Gres esmaltado a mano' },
    seccionNombre: 'Colección Botánica',
    general: { nombreNegocio: '', textoBoton: '' },
    posicion: { n: 1, m: 1 },
  },
};

/** Compone la imagen final 1080×1920 de un preset EN EL NAVEGADOR (mismo `componer.js` real que usa
 * la app), y la devuelve ya redimensionada a la altura de comparación (mismo criterio que las
 * capturas de las demás pantallas: alto fijo, ancho proporcional). */
async function componerPreset(page, { nombre, producto, seccionNombre, general, posicion }) {
  const fotoBase64 = fs.readFileSync(path.join(FOTOS_DIR, `preset-${nombre}.jpg`)).toString('base64');
  const dataUrlBase64 = await page.evaluate(
    async ({ nombre, fotoBase64, producto, seccionNombre, general, posicion, altoSalida }) => {
      const [{ dibujarSegunEstilo, ANCHO, ALTO }, { cargarFuentes }, { AJUSTES_POR_DEFECTO_POR_ESTILO, FORMATO_PRECIO_POR_DEFECTO }] =
        await Promise.all([import('/js/componer.js'), import('/js/fuentes.js'), import('/js/modelo.js')]);
      await cargarFuentes();
      const fotoBlob = await (await fetch(`data:image/jpeg;base64,${fotoBase64}`)).blob();
      const fotoImagen = await createImageBitmap(fotoBlob);
      const canvas = document.createElement('canvas');
      canvas.width = ANCHO;
      canvas.height = ALTO;
      const ctx = canvas.getContext('2d');
      dibujarSegunEstilo(ctx, {
        estilo: nombre,
        fotoImagen,
        plantillaImagen: null,
        producto,
        ajustes: AJUSTES_POR_DEFECTO_POR_ESTILO[nombre],
        formatoPrecio: FORMATO_PRECIO_POR_DEFECTO,
        descripcion: producto.descripcion,
        encuadreFoto: 'cover',
        general,
        seccionNombre,
        posicion,
      });
      const anchoSalida = Math.round((ANCHO / ALTO) * altoSalida);
      const chico = document.createElement('canvas');
      chico.width = anchoSalida;
      chico.height = altoSalida;
      chico.getContext('2d').drawImage(canvas, 0, 0, anchoSalida, altoSalida);
      const blob = await new Promise((resolve) => chico.toBlob(resolve, 'image/png'));
      const buffer = await blob.arrayBuffer();
      let binario = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 1) binario += String.fromCharCode(bytes[i]);
      return btoa(binario);
    },
    { nombre, fotoBase64, producto, seccionNombre, general, posicion, altoSalida: ALTO }
  );
  return Buffer.from(dataUrlBase64, 'base64');
}

async function compararPreset(nombre, { browser, servidorUrl }) {
  const cfg = PRESETS[nombre];
  const mockScreenPng = path.join(RAIZ, 'Interfaz', 'stitch_whatsapp_status_uploader_ui', cfg.carpetaMock, 'screen.png');
  if (!fs.existsSync(mockScreenPng)) {
    console.error(`No existe ${mockScreenPng}`);
    process.exit(1);
  }

  const pagina = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await pagina.goto(servidorUrl);
  const appPng = await componerPreset(pagina, {
    nombre,
    producto: cfg.producto,
    seccionNombre: cfg.seccionNombre,
    general: cfg.general,
    posicion: cfg.posicion,
  });
  await pagina.close();

  const disenoPng = fs.readFileSync(mockScreenPng);
  const destino = path.join(RAIZ, 'Interfaz', 'comparacion', `preset-${nombre}.png`);
  await componerPresetLadoALado(browser, { disenoPng, appPng, titulo: `Preset: ${nombre}`, destino });
  console.log(`Comparación guardada: ${path.relative(RAIZ, destino)}`);
}

/** Como `componerLadoALado`, pero para los presets: las 2 imágenes NO comparten tamaño/aspecto
 * (el `screen.png` del mock es la página de configuración entera; nuestro render es el 1080×1920
 * final) — se muestran cada una a su alto natural (max-height fijo), no forzadas al mismo box. */
async function componerPresetLadoALado(browser, { disenoPng, appPng, titulo, destino }) {
  const disenoB64 = disenoPng.toString('base64');
  const appB64 = appPng.toString('base64');
  const altoFigura = 1600;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; background:#1c1b1a; font-family: system-ui, sans-serif; }
    .fila { display:flex; gap:24px; padding:24px; align-items:flex-start; }
    figure { margin:0; background:#0d0f1a; border-radius:8px; padding:12px 12px 16px; }
    figure img { display:block; height:${altoFigura}px; width:auto; border-radius:4px; }
    figcaption { color:#eee; text-align:center; margin-top:10px; font-size:15px; font-weight:600; }
    h1 { color:#fff; font-size:18px; margin:0 0 4px 24px; padding-top:20px; }
  </style></head><body>
    <h1>${titulo}</h1>
    <div class="fila">
      <figure><img src="data:image/png;base64,${appB64}"><figcaption>APP (nuestro render, 1080×1920)</figcaption></figure>
      <figure><img src="data:image/png;base64,${disenoB64}"><figcaption>MOCK STITCH (screen.png)</figcaption></figure>
    </div>
  </body></html>`;
  const page = await browser.newPage({ viewport: { width: 2200, height: altoFigura + 140 } });
  await page.setContent(html);
  await page.locator('img').first().waitFor({ state: 'visible' });
  await page.screenshot({ path: destino, fullPage: true });
  await page.close();
}

function esperarLinea(child, contiene) {
  return new Promise((resolve, reject) => {
    let salida = '';
    const alDato = (buf) => {
      salida += buf.toString();
      if (salida.includes(contiene)) {
        child.stdout.off('data', alDato);
        resolve();
      }
    };
    child.stdout.on('data', alDato);
    child.once('error', reject);
    child.once('exit', (code) => {
      if (!salida.includes(contiene)) reject(new Error(`servir.js terminó (código ${code}) antes de arrancar`));
    });
  });
}

async function arrancarServidor(puerto) {
  const child = spawn(process.execPath, [path.join(RAIZ, 'scripts', 'servir.js'), String(puerto)], {
    cwd: RAIZ,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await esperarLinea(child, 'estados-rapidos en');
  return child;
}

async function sembrarApp(page, { vista, secciones, productos }) {
  // Una foto real por producto (las del propio code.html, bajadas a Interfaz/comparacion/fotos/ —
  // ver ESCENAS más arriba): cada producto lleva su base64 + su nombre de archivo (para el `type`).
  const nombresFoto = [...new Set(productos.map((p) => p.foto))];
  const fotosBase64 = Object.fromEntries(
    nombresFoto.map((nombre) => [nombre, fs.readFileSync(path.join(FOTOS_DIR, nombre)).toString('base64')])
  );

  await page.goto('/');
  await page.evaluate(
    async ({ fotosBase64, secciones, productos }) => {
      const repo = await import('/js/repositorio.js');

      const idPorSeccion = new Map();
      for (const nombre of secciones) {
        const s = await repo.crearSeccion(nombre);
        idPorSeccion.set(nombre, s.id);
      }

      const aBytes = (base64) => {
        const binario = atob(base64);
        const bytes = new Uint8Array(binario.length);
        for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
        return bytes;
      };

      for (const p of productos) {
        const archivo = new File([aBytes(fotosBase64[p.foto])], p.foto, { type: 'image/jpeg' });
        const guardado = await repo.guardarProducto(
          {
            nombre: p.nombre,
            precio: p.precio,
            descripcion: p.descripcion,
            secciones: p.seccion ? [idPorSeccion.get(p.seccion)] : [],
          },
          archivo
        );
        if (!p.seleccionado) await repo.actualizarSeleccion(guardado.id, false);
      }
    },
    { fotosBase64, secciones, productos }
  );
  await page.evaluate(async (vista) => {
    const repo = await import('/js/repositorio.js');
    await repo.guardarPreferenciasLista({ vista, filtroSeccion: 'todas' });
  }, vista);
  await page.reload();
  // Las fotos se leen de IndexedDB de forma async (Promise.all en lista.js): esperar a que la
  // primera miniatura real ya tenga `src` antes de la captura, no un timeout fijo a ciegas.
  await page.waitForSelector('.fila-compacta__foto, .grilla-item__foto', { state: 'visible' });
  await page.waitForTimeout(150); // transiciones/skeleton -> contenido final
}

async function componerLadoALado(browser, { disenoPng, appPng, titulo, destino }) {
  const disenoB64 = disenoPng.toString('base64');
  const appB64 = appPng.toString('base64');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; background:#2a2a2a; font-family: system-ui, sans-serif; }
    .fila { display:flex; gap:24px; padding:24px; align-items:flex-start; }
    figure { margin:0; background:#111; border-radius:8px; padding:12px 12px 16px; }
    figure img { display:block; width:${ANCHO}px; height:${ALTO}px; border-radius:4px; }
    figcaption { color:#eee; text-align:center; margin-top:10px; font-size:15px; font-weight:600; }
    h1 { color:#fff; font-size:18px; margin:0 0 4px 24px; padding-top:20px; }
  </style></head><body>
    <h1>${titulo}</h1>
    <div class="fila">
      <figure><img src="data:image/png;base64,${disenoB64}"><figcaption>DISEÑO (Stitch)</figcaption></figure>
      <figure><img src="data:image/png;base64,${appB64}"><figcaption>APP (real)</figcaption></figure>
    </div>
  </body></html>`;
  const page = await browser.newPage({ viewport: { width: (ANCHO + 24) * 2 + 48, height: ALTO + 140 } });
  await page.setContent(html);
  await page.screenshot({ path: destino });
  await page.close();
}

async function main() {
  const pantalla = process.argv[2];

  // Los 4 presets de composición (`banner-inferior`/`editorial`/`polaroid`/`story-inmersiva`):
  // comparan la imagen FINAL de `componer.js` contra el `screen.png` del mock, no una captura de
  // viewport — recorrido totalmente distinto al de `ESCENAS` (ver `compararPreset`). Sin argumento
  // o con "presets", corre los 4 de una.
  if (pantalla === 'presets' || PRESETS[pantalla]) {
    const nombres = pantalla === 'presets' ? Object.keys(PRESETS) : [pantalla];
    fs.mkdirSync(path.join(RAIZ, 'Interfaz', 'comparacion'), { recursive: true });
    const puertoPresets = 8198;
    const servidorPresets = await arrancarServidor(puertoPresets);
    const browserPresets = await chromium.launch();
    try {
      for (const nombre of nombres) {
        await compararPreset(nombre, { browser: browserPresets, servidorUrl: `http://127.0.0.1:${puertoPresets}/` });
      }
    } finally {
      await browserPresets.close();
      servidorPresets.kill();
    }
    return;
  }

  const escena = ESCENAS[pantalla];
  if (!escena) {
    console.error(
      `Pantalla desconocida: "${pantalla}".\nDisponibles: ${Object.keys(ESCENAS).join(', ')}, ${Object.keys(PRESETS).join(', ')}`
    );
    process.exit(1);
  }

  const disenoHtml = path.join(RAIZ, 'Interfaz', 'stitch_whatsapp_status_uploader_ui', pantalla, 'code.html');
  if (!fs.existsSync(disenoHtml)) {
    console.error(`No existe ${disenoHtml}`);
    process.exit(1);
  }

  const destinoDir = path.join(RAIZ, 'Interfaz', 'comparacion');
  fs.mkdirSync(destinoDir, { recursive: true });
  const destino = path.join(destinoDir, `${pantalla}.png`);

  const puerto = 8199;
  const servidor = await arrancarServidor(puerto);
  const browser = await chromium.launch();
  try {
    // 1) Diseño Stitch: puede pedir red (Tailwind CDN + Google Fonts) — solo para esta comparación.
    const paginaDiseno = await browser.newPage({ viewport: { width: ANCHO, height: ALTO } });
    await paginaDiseno.goto('file://' + disenoHtml.replace(/\\/g, '/'));
    await paginaDiseno.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await paginaDiseno.waitForTimeout(300);
    const disenoPng = await paginaDiseno.screenshot();

    // 2) App real, servida local, sembrada con datos parecidos.
    const paginaApp = await browser.newPage({ viewport: { width: ANCHO, height: ALTO }, baseURL: `http://localhost:${puerto}` });
    if (escena.preparar) {
      await escena.preparar(paginaApp);
    } else {
      await sembrarApp(paginaApp, { vista: escena.vista, secciones: escena.secciones, productos: escena.productos });
      if (escena.hash !== '#/') await paginaApp.evaluate((h) => { location.hash = h; }, escena.hash);
      await paginaApp.waitForTimeout(150);
    }
    const appPng = await paginaApp.screenshot();

    await componerLadoALado(browser, { disenoPng, appPng, titulo: escena.titulo, destino });
    console.log(`Comparación guardada: ${path.relative(RAIZ, destino)}`);

    // Segunda comparación (pantallas largas, ej. editar_plantilla_natural): cada página scrolleada
    // hasta la MISMA sección real (por texto en el mock, por selector en la app) — no un mismo
    // número de píxeles, que las dejaría en puntos distintos si una página es más alta que la otra.
    if (escena.segundaCaptura) {
      const { textoDiseno, selectorApp } = escena.segundaCaptura;
      await paginaDiseno.getByText(textoDiseno, { exact: false }).first().scrollIntoViewIfNeeded();
      await paginaDiseno.waitForTimeout(150);
      const disenoPng2 = await paginaDiseno.screenshot();

      await paginaApp.locator(selectorApp).first().scrollIntoViewIfNeeded();
      await paginaApp.waitForTimeout(150);
      const appPng2 = await paginaApp.screenshot();

      const destino2 = path.join(destinoDir, `${pantalla}-2.png`);
      await componerLadoALado(browser, { disenoPng: disenoPng2, appPng: appPng2, titulo: `${escena.titulo} (scroll)`, destino: destino2 });
      console.log(`Comparación (scroll) guardada: ${path.relative(RAIZ, destino2)}`);
    }

    await paginaDiseno.close();
    await paginaApp.close();
  } finally {
    await browser.close();
    servidor.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
