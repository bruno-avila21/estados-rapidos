// Ajustes: tarjetas de estilo con miniatura en vivo, editor de plantilla siempre accesible,
// descripción modelo (CREAR-BRIEF.md, rondas 2026-09-27; "ajustes por estilo" 2026-09-28).
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FOTO = path.join(AQUI, 'fixtures', 'producto.png');

async function crearProducto(page) {
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill('Producto ajustes');
  await page.locator('#campo-precio').fill('5000');
  await page.locator('[data-accion-input="elegir-galeria"]').setInputFiles(FOTO);
  await page.locator('[data-accion="guardar"]').click();
  await expect(page.locator('[data-accion="editar"]')).toBeVisible();
}

// Ronda "reskin plantilla": la tarjeta de controles + "Presets de diseño rápidos" van ARRIBA del
// lienzo, así que ya no está visible al cargar sin más — mismo helper que editor.spec.js (BUGS.md
// #48/#50: scrollIntoViewIfNeeded solo no alcanza porque no sabe que la nav inferior es fixed).
async function asegurarLienzoVisible(page) {
  // El lienzo arranca bloqueado (2026-10-07): se habilita la edición antes de arrastrar.
  const modo = page.locator('[data-accion="editar-lienzo"]');
  if ((await modo.getAttribute('aria-pressed')) === 'false') await modo.click();
  await page.locator('.editor-plantilla__lienzo').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const el = document.querySelector('.editor-plantilla__lienzo');
    const nav = document.querySelector('.nav-inferior');
    if (!el) return;
    const limite = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    const rect = el.getBoundingClientRect();
    const exceso = rect.bottom - limite + 16;
    if (exceso > 0) window.scrollBy(0, exceso);
  });
}

// Con el lienzo en edición la zona del lienzo ocupa toda la pantalla (2026-10-07): para tocar el
// panel de propiedades, las capas o la barra de controles primero hay que salir con "Listo".
async function listo(page) {
  const modo = page.locator('[data-accion="editar-lienzo"]');
  if ((await modo.count()) && (await modo.getAttribute('aria-pressed')) === 'true') await modo.click();
}

test('Plantilla no está en la navegación principal, pero el editor se abre desde Ajustes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-accion="ir-plantilla"]')).toHaveCount(0); // no está en la lista de productos
  await expect(page.locator('[data-accion="ir-ajustes"]').first()).toBeVisible();

  await listo(page);
  await page.locator('[data-accion="ir-ajustes"]').first().click();
  await page.locator('[data-accion="ir-plantilla"]').click();
  await expect(page).toHaveURL(/#\/plantilla$/);
  await expect(page.locator('#titulo-pantalla')).toHaveText('Plantilla');
});

// Ronda "orden del diseño" (CREAR-BRIEF.md 2026-09-29): la galería "Estilo de las imágenes" se
// mudó de Ajustes a Plantilla (el mock de Ajustes no la tiene entre Encuadre y Texto que
// acompaña) — mismo componente, namespace `estilo-general-*`/`editar-estilo-general-*` para no
// chocar con los `estilo-<preset>` de la galería "Presets de composición" de la misma pantalla.
// En Ajustes queda solo una fila compacta ("Estilo de las imágenes: <actual> ›") que abre acá.
test('Ajustes: muestra la plantilla en uso y "Cambiar" abre la pantalla Plantillas', async ({ page }) => {
  await page.goto('/#/ajustes');
  await expect(page.locator('.grilla-estilos')).toHaveCount(0); // la galería no vive acá
  await expect(page.locator('[data-dato="plantilla-en-uso"]')).toHaveText('Solo la foto');
  await page.locator('[data-accion="ir-plantillas"]').click();
  await expect(page).toHaveURL(/#\/plantillas$/);
  await expect(page.locator('h1')).toHaveText('Plantillas');
});

// Pedido 2026-10-07: el resto de Ajustes va plegado, un bloque por responsabilidad.
test('Ajustes: los bloques arrancan plegados y se abren de a uno', async ({ page }) => {
  await page.goto('/#/ajustes');
  for (const nombre of ['encuadre', 'texto', 'moneda', 'datos']) {
    await expect(page.locator(`[data-panel="${nombre}"]`)).not.toHaveAttribute('open', '');
  }
  await expect(page.locator('#campo-prefijo-precio')).toBeHidden();
  const resumen = page.locator('[data-panel="moneda"] > summary');
  expect((await resumen.boundingBox()).height).toBeGreaterThanOrEqual(48);
  await resumen.click();
  await expect(page.locator('#campo-prefijo-precio')).toBeVisible();
  await expect(page.locator('#campo-descripcion-modelo')).toBeHidden(); // los demás siguen cerrados
});

test('Plantilla: las 10 tarjetas de estilo (4 de siempre + 6 presets de composición) muestran una miniatura y se puede elegir una', async ({
  page,
}) => {
  await page.goto('/#/plantillas');
  const tarjetas = page.locator('.grilla-estilos--general .tarjeta-estilo');
  await expect(tarjetas).toHaveCount(10);
  for (const tarjeta of await tarjetas.all()) {
    await expect(tarjeta.locator('img')).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
  }

  await expect(page.locator('[data-accion="estilo-general-solo-foto"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-accion="estilo-general-foto-precio"]').click();
  await expect(page.locator('[data-accion="estilo-general-foto-precio"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#toast')).toHaveText(/Foto con precio/);

  await page.reload();
  await expect(page.locator('[data-accion="estilo-general-foto-precio"]')).toHaveAttribute('aria-pressed', 'true');
});

test('la descripción modelo se guarda y se ve en el ejemplo', async ({ page }) => {
  await page.goto('/#/ajustes');
  await page.locator('[data-panel="texto"] > summary').click();
  const textarea = page.locator('#campo-descripcion-modelo');
  await textarea.fill('{nombre} — {precio}, escribinos');
  await page.waitForTimeout(400); // debounce del guardado
  await expect(page.locator('.vista-previa-copia__texto')).toHaveText(/Remera básica — \$ 12\.500, escribinos/);

  await page.reload();
  await expect(page.locator('#campo-descripcion-modelo')).toHaveValue('{nombre} — {precio}, escribinos');
});

// --- "Editar" por tarjeta + badge "Personalizado" (ronda "ajustes por estilo", 2026-09-28) ---

test('"Solo la foto" no tiene botón Editar (no es editable); los otros 7 sí', async ({ page }) => {
  await page.goto('/#/plantillas');
  await expect(page.locator('[data-accion="editar-estilo-general-solo-foto"]')).toHaveCount(0);
  for (const estilo of [
    'foto-precio',
    'foto-descripcion',
    'mi-plantilla',
    'banner-inferior',
    'editorial',
    'polaroid',
    'story-inmersiva',
    'novedad',
    'ficha-natural',
  ]) {
    await expect(page.locator(`[data-accion="editar-estilo-general-${estilo}"]`)).toBeVisible();
  }
});

test('"Editar" de una tarjeta abre el editor en ESE estilo', async ({ page }) => {
  await page.goto('/#/plantillas');
  await page.locator('[data-accion="editar-estilo-general-foto-descripcion"]').click();
  await expect(page).toHaveURL(/#\/plantilla\?estilo=foto-descripcion/);
  await expect(page.locator('#editor-vista-previa-estilo')).toHaveValue('foto-descripcion');
});

test('badge "Personalizado" en la tarjeta de Plantilla aparece después de editar ese estilo', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.goto('/#/plantillas');
  const tarjetaFotoPrecio = page.locator('.tarjeta-estilo', { has: page.locator('[data-accion="estilo-general-foto-precio"]') });
  await expect(tarjetaFotoPrecio.locator('.tarjeta-estilo__badge')).toBeHidden();

  await page.locator('[data-accion="editar-estilo-general-foto-precio"]').click();
  await expect(page).toHaveURL(/estilo=foto-precio/);
  // Misma ruta (Plantilla → Plantilla, ya no Ajustes → Plantilla): la URL cambia apenas se asigna
  // el hash, ANTES de que termine el render async, que además redibuja el overlay más de una vez
  // mientras se estabiliza (ResizeObserver/rAF) — `boundingBox()` no reintenta solo, así que se
  // espera visible Y estable (`scrollIntoViewIfNeeded` fuerza esa espera) antes de leerlo.
  // El elemento se destruye y se vuelve a crear más de una vez mientras el render async se
  // estabiliza (overlay que se redibuja) — cada paso re-consulta el locator en vivo (nunca un
  // handle guardado) y reintenta con `expect.poll` en vez de una sola lectura de `boundingBox()`.
  await expect(page.locator('[data-elemento="nombre"]')).toBeVisible();
  await expect.poll(() => page.locator('[data-elemento="nombre"]').boundingBox().catch(() => null)).toBeTruthy();
  // Ronda "reskin plantilla": la tarjeta de controles + "Presets de diseño rápidos" van ARRIBA del
  // lienzo, así que ya no está visible sin más — hay que llevarlo por delante de la nav inferior
  // fija antes de arrastrar con coordenadas de pantalla (BUGS.md #48/#50).
  await asegurarLienzoVisible(page);
  const caja = await page.locator('[data-elemento="nombre"]').boundingBox();
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2 + 100, { steps: 5 });
  await page.mouse.up();
  // El badge de estado ahora vive en la barra superior y está SIEMPRE visible (2 estados,
  // "Por defecto"/"Personalizado" — ya no aparece/desaparece con `hidden`).
  await expect(page.locator('.editor-plantilla__badge')).toHaveText('Personalizado');
  await page.waitForTimeout(100); // deja que la escritura a IndexedDB (persistir) termine antes de navegar

  await page.goto('/#/plantillas');
  await expect(tarjetaFotoPrecio.locator('.tarjeta-estilo__badge')).toBeVisible();
});

// --- Encuadre de la foto (ronda "foto entera") ---

test('encuadre de la foto: "Entera" por defecto, se puede cambiar a "Llenar la pantalla" y persiste', async ({ page }) => {
  await page.goto('/#/ajustes');
  await page.locator('[data-panel="encuadre"] > summary').click();
  await expect(page.locator('[data-accion="encuadre-contain"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-accion="encuadre-cover"]')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('[data-accion="encuadre-cover"]').click();
  await expect(page.locator('[data-accion="encuadre-cover"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#toast')).toHaveText(/Llenar la pantalla/);
  await expect(page.locator('[data-panel="encuadre"] .panel__badge')).toHaveText('Llenar la pantalla');

  await page.reload();
  await expect(page.locator('[data-accion="encuadre-cover"]')).toHaveAttribute('aria-pressed', 'true');
});

// --- "La app": instalar/compartir/QR (ronda "instalar y compartir la app") ---

test('"La app": sin prompt nativo (entorno de test) muestra instrucciones cortas para instalar', async ({ page }) => {
  await page.goto('/#/ajustes');
  await expect(page.locator('[data-estado="instrucciones-instalar"]')).toBeVisible();
  await expect(page.locator('[data-estado="instrucciones-instalar"]')).toContainText('Instalar app');
});

test('"La app": dibuja un QR con el link de la app', async ({ page }) => {
  await page.goto('/#/ajustes');
  const canvas = page.locator('.qr-app__canvas');
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => canvas.evaluate((el) => el.width), { timeout: 5_000 })
    .toBeGreaterThan(0);
  const dimensiones = await canvas.evaluate((el) => ({ w: el.width, h: el.height }));
  expect(dimensiones.w).toBeGreaterThan(0);
  expect(dimensiones.h).toBeGreaterThan(0);
  await expect(page.locator('.qr-app__link')).toHaveText(/^https?:\/\//);
});

test('"Compartir la app" usa navigator.share si está disponible', async ({ page }) => {
  await page.goto('/#/ajustes');
  await page.evaluate(() => {
    window.__compartidoApp = null;
    navigator.share = async (datos) => {
      window.__compartidoApp = datos;
    };
  });
  await page.locator('[data-accion="compartir-app"]').click();
  await expect.poll(() => page.evaluate(() => window.__compartidoApp?.url)).toMatch(/^https?:\/\//);
});

test('"Compartir la app" sin navigator.share copia el link (fallback)', async ({ page }) => {
  await page.goto('/#/ajustes');
  await page.evaluate(() => {
    // @ts-ignore
    delete navigator.share;
    window.__copiado = null;
    navigator.clipboard.writeText = async (texto) => {
      window.__copiado = texto;
    };
  });
  await page.locator('[data-accion="compartir-app"]').click();
  await expect(page.locator('#toast')).toHaveText(/copiado/i);
  const copiado = await page.evaluate(() => window.__copiado);
  expect(copiado).toMatch(/^https?:\/\//);
});

// Pedido 2026-10-03: el acceso a Plantilla es lo PRIMERO de Ajustes (antes quedaba al fondo) y hay
// "Ver completa" (visor a pantalla completa con el estado entero) en Ajustes, en cada tarjeta de
// estilo de Plantilla y en la foto del alta/edición de producto.
test('Ajustes: lo primero es la vista previa de la plantilla; tocarla abre el estado entero', async ({ page }) => {
  await page.goto('/#/ajustes');
  const primerPanel = page.locator('.panel').first();
  // Pedido 2026-10-07: la vista previa va primero, y debajo "Cambiar" / "Editar".
  await expect(primerPanel.locator('.vista-previa-estado__imagen')).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
  await expect(primerPanel.locator('[data-accion="ver-completa"]')).toBeInViewport();
  await expect(primerPanel.locator('[data-accion="ir-plantillas"]')).toBeVisible();
  await expect(primerPanel.locator('[data-accion="ir-plantilla"]')).toBeVisible();

  await primerPanel.locator('[data-accion="ver-completa"]').click();
  const imagen = page.locator('.visor-imagen__imagen');
  await expect(imagen).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
  const proporcion = await imagen.evaluate(async (img) => {
    await img.decode();
    return { natural: img.naturalWidth / img.naturalHeight, ancho: img.naturalWidth, caja: img.clientWidth / img.clientHeight };
  });
  expect(proporcion.ancho).toBe(1080);
  expect(Math.abs(proporcion.natural - proporcion.caja)).toBeLessThan(0.02); // entera, sin recortar
  await page.locator('[data-accion="cerrar-visor"]').click();
  await expect(page.locator('.visor-imagen')).toHaveCount(0);
});

test('Plantilla: cada tarjeta de estilo tiene "Ver completa" y no cambia el estilo elegido', async ({ page }) => {
  await page.goto('/#/plantillas');
  await page.locator('[data-accion="ver-estilo-general-polaroid"]').click();
  await expect(page.locator('.visor-imagen__imagen')).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.visor-imagen')).toHaveCount(0);
  await expect(page.locator('[data-accion="estilo-general-solo-foto"]')).toHaveAttribute('aria-pressed', 'true');
});

test('Alta de producto: "Ver completa" aparece al elegir la foto y muestra el estado entero', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-accion="agregar"]').click();
  await expect(page.locator('.foto-picker [data-accion="ver-completa"]')).toBeHidden();
  await page.locator('#campo-nombre').fill('Producto visor');
  await page.locator('[data-accion-input="elegir-galeria"]').setInputFiles(FOTO);
  await page.locator('.foto-picker [data-accion="ver-completa"]').click();
  await expect(page.locator('.visor-imagen__imagen')).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
  await page.locator('[data-accion="cerrar-visor"]').click();
  await expect(page.locator('#campo-nombre')).toHaveValue('Producto visor'); // el formulario sigue intacto
});

// Pedido 2026-10-03 (2ª tanda): la descripción hace salto de línea en la imagen, hay vista previa en
// vivo en Ajustes y en el alta, y salir del formulario con cambios sin guardar pregunta antes.
test('Alta de producto: salir con cambios sin guardar pregunta; "Seguir editando" no pierde nada', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill('A medio cargar');

  await page.locator('.nav-inferior__item[data-ruta="#/ajustes"]').click();
  await expect(page.locator('.dialogo')).toContainText('cambios sin guardar');
  await page.locator('.dialogo [data-accion="cancelar"]').click(); // "Seguir editando"
  await expect(page).toHaveURL(/#\/producto\/nuevo$/);
  await expect(page.locator('#campo-nombre')).toHaveValue('A medio cargar');

  await page.locator('.nav-inferior__item[data-ruta="#/ajustes"]').click();
  await page.locator('.dialogo [data-accion="confirmar-borrar"]').click(); // "Salir sin guardar"
  await expect(page).toHaveURL(/#\/ajustes$/);
  await expect(page.locator('h1.pagina__titulo')).toHaveText('Ajustes');
});

test('Alta de producto: sin tocar nada se sale sin preguntar, y guardar tampoco pregunta', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('[data-accion="cancelar"]').click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('.dialogo')).toHaveCount(0);

  await crearProducto(page); // llena, guarda y vuelve a la lista: sin diálogo en el medio
  await expect(page.locator('.dialogo')).toHaveCount(0);
});

test('Alta de producto: la vista previa en vivo se rearma al escribir', async ({ page }) => {
  await page.goto('/#/producto/nuevo');
  const imagen = page.locator('.vista-previa-estado__imagen');
  await expect(imagen).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
  const antes = await imagen.getAttribute('src');
  await page.locator('#campo-descripcion').fill('Primera línea\nSegunda línea');
  await expect(imagen).not.toHaveAttribute('src', antes, { timeout: 10_000 });
});

test('Ajustes: vista previa de la imagen junto al texto, con aviso si el estilo no dibuja la descripción', async ({ page }) => {
  await page.goto('/#/ajustes');
  await page.locator('[data-panel="texto"] > summary').click();
  await expect(page.locator('[data-panel="texto"] .vista-previa-estado__imagen')).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
  await expect(page.locator('[data-nota="estilo-sin-descripcion"]')).toContainText('Solo la foto');

  await page.evaluate(async () => {
    const repo = await import('/js/repositorio.js');
    await repo.guardarEstiloGeneral('foto-descripcion');
  });
  await page.reload();
  await page.locator('[data-panel="texto"] > summary').click();
  await expect(page.locator('[data-panel="texto"] .vista-previa-estado__imagen')).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
  await expect(page.locator('[data-nota="estilo-sin-descripcion"]')).toHaveCount(0);
});

test('La descripción larga se parte en renglones y la caja crece (no se trunca ni se achica)', async ({ page }) => {
  await page.goto('/');
  const resultado = await page.evaluate(async () => {
    const { resolverCajasTexto, dibujarSegunEstilo } = await import('/js/componer.js');
    const { calcularParrafo } = await import('/js/layout.js');
    const { AJUSTES_POR_DEFECTO_POR_ESTILO } = await import('/js/modelo.js');
    const { cargarFuentes, familiaCanvas } = await import('/js/fuentes.js');
    await cargarFuentes();
    const descripcion =
      'Remera de algodón peinado, corte recto, disponible en talles S, M, L y XL.\nColores: negro, blanco y verde.\nEnvíos a todo el país, consultá por privado.';
    const salida = {};
    for (const estilo of ['foto-descripcion', 'banner-inferior', 'editorial', 'polaroid', 'story-inmersiva', 'novedad', 'ficha-natural']) {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      const ajustes = AJUSTES_POR_DEFECTO_POR_ESTILO[estilo];
      const datos = {
        estilo,
        fotoImagen: null,
        producto: { nombre: 'Remera básica', precio: 12500 },
        ajustes,
        formatoPrecio: { prefijo: '$ ', separadorMiles: true, decimales: false },
        descripcion,
        encuadreFoto: 'contain',
        general: { nombreNegocio: 'Mi tienda' },
        seccionNombre: 'Remeras',
        posicion: { n: 1, m: 1 },
      };
      const cajas = resolverCajasTexto(ctx, datos);
      dibujarSegunEstilo(ctx, datos); // no tiene que romper con la caja crecida
      const caja = cajas.descripcion;
      const cursiva = caja.familia === 'newsreader-italica' ? 'italic ' : '';
      const { lineas, tamano, recortado } = calcularParrafo({
        texto: descripcion,
        anchoMax: caja.w - 24,
        altoMax: caja.h - 20,
        medirAncho: (t, tam) => {
          ctx.font = `${cursiva}${caja.peso} ${tam}px ${familiaCanvas(caja.familia)}`;
          return ctx.measureText(t).width;
        },
        tamanoInicial: caja.tamano,
      });
      salida[estilo] = {
        extra: cajas.extra,
        lineas: lineas.length,
        tamano,
        tamanoElegido: caja.tamano,
        recortado,
        dentro: caja.y >= 0 && caja.y + caja.h <= 1920,
        nombreDentro: cajas.nombre.y >= 0,
      };
    }
    return salida;
  });
  for (const [estilo, r] of Object.entries(resultado)) {
    expect(r.recortado, estilo).toBe(false);
    expect(r.tamano, estilo).toBe(r.tamanoElegido); // al tamaño elegido, sin achicar
    expect(r.lineas, estilo).toBeGreaterThanOrEqual(3); // respeta los 2 saltos escritos
    expect(r.extra, estilo).toBeGreaterThan(0); // la caja creció para que entre
    expect(r.dentro && r.nombreDentro, estilo).toBe(true);
  }
});

// --- Apariencia (pedido 2026-10-07): modo y tono, y el header sin el botón de tres rayas ---

test('Apariencia: el tono y el modo se aplican al toque y se recuerdan al recargar', async ({ page }) => {
  await page.goto('/#/ajustes');
  // El header ya no tiene un botón que no abre nada: a la izquierda va la marca.
  await expect(page.locator('[data-accion="ir-inicio"]')).toHaveCount(0);
  await expect(page.locator('.encabezado__marca')).toBeVisible();

  const primario = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primario').trim());
  const fondo = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-fondo').trim());
  expect(await primario()).toBe('#3a4d39');

  await page.locator('[data-panel="apariencia"] > summary').click();
  await expect(page.locator('[data-accion="tono-cipres"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-accion="modo-auto"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await page.locator('[data-accion="tono-oceano"]').boundingBox()).height).toBeGreaterThanOrEqual(48);

  await page.locator('[data-accion="tono-oceano"]').click();
  await expect(page.locator('[data-accion="tono-oceano"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-panel="apariencia"] .panel__badge')).toHaveText('Océano');
  expect(await primario()).toBe('#2f4f6b');

  await page.locator('[data-accion="modo-oscuro"]').click();
  expect(await fondo()).toBe('#201e1a');
  expect(await primario()).toBe('#a4bfd6'); // el tono también tiene su versión oscura

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-tono', 'oceano');
  expect(await primario()).toBe('#a4bfd6');

  await page.locator('[data-panel="apariencia"] > summary').click();
  await page.locator('[data-accion="modo-claro"]').click();
  await page.locator('[data-accion="tono-cipres"]').click();
  expect(await primario()).toBe('#3a4d39');
  await expect(page.locator('html')).not.toHaveAttribute('data-tono', /.+/);
});

// --- Pedido 2026-10-07 (3ª tanda): guardar a mano arriba y al salir, Atrás del teléfono, modo
// Negro, controles claros en tema claro, vista previa en el panel de foto y sección oculta ---

test('Alta de producto: "Guardar" de la barra superior guarda igual que el del pie', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('#campo-nombre').fill('Guardado desde arriba');
  await page.locator('[data-accion-input="elegir-galeria"]').setInputFiles(FOTO);
  await expect(page.locator('[data-accion="guardar-header"]')).toBeInViewport();
  await page.locator('[data-accion="guardar-header"]').click();
  await expect(page.locator('[data-accion="editar"]', { hasText: 'Guardado desde arriba' })).toBeVisible();
});

test('Alta de producto: al salir con cambios, "Guardar y salir" guarda y va a donde se iba', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-accion="agregar"]').click();
  await page.locator('[data-accion-input="elegir-galeria"]').setInputFiles(FOTO);

  // Sin nombre no se puede guardar: se queda en el formulario con el error a la vista.
  await page.locator('.nav-inferior__item[data-ruta="#/ajustes"]').click();
  await page.locator('.dialogo [data-accion="confirmar-alternativa"]').click();
  await expect(page).toHaveURL(/#\/producto\/nuevo$/);
  await expect(page.locator('.campo__error:not([hidden])')).toBeVisible();

  await page.locator('#campo-nombre').fill('Guardado al salir');
  await page.locator('.nav-inferior__item[data-ruta="#/ajustes"]').click();
  await page.locator('.dialogo [data-accion="confirmar-alternativa"]').click();
  await expect(page).toHaveURL(/#\/ajustes$/);
  await page.locator('.nav-inferior__item[data-ruta="#/"]').click();
  await expect(page.locator('[data-accion="editar"]', { hasText: 'Guardado al salir' })).toBeVisible();
});

test('Editar producto: el panel de foto muestra la vista previa entera y al tocarla se abre', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  await page.locator('[data-accion="editar"]').first().click();
  const imagen = page.locator('.foto-picker .vista-previa-estado__imagen');
  await expect(imagen).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
  const caja = await page.locator('.foto-picker .vista-previa-estado__marco').boundingBox();
  expect(caja.height / caja.width).toBeCloseTo(1920 / 1080, 1); // 9:16 entera, no un cuadrado
  await page.locator('.foto-picker [data-accion="ver-completa"]').click();
  await expect(page.locator('.visor-imagen__imagen')).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
});

test('Atrás del teléfono: cierra lo que hay encima, vuelve a la pantalla anterior y recién sale desde Productos', async ({ page }) => {
  await page.goto('/');
  await crearProducto(page);
  const atras = () => page.evaluate(() => window.estadosRapidosBack());

  await page.locator('.nav-inferior__item[data-ruta="#/ajustes"]').click();
  await page.locator('[data-accion="ir-plantillas"]').click();
  await expect(page).toHaveURL(/#\/plantillas$/);
  expect(await atras()).toBe(true);
  await expect(page).toHaveURL(/#\/ajustes$/); // la anterior, no Productos
  expect(await atras()).toBe(true);
  await expect(page).toHaveURL(/#\/$/);

  // Con el visor abierto, Atrás lo cierra sin salir del producto.
  await page.locator('[data-accion="editar"]').first().click();
  await page.locator('.foto-picker [data-accion="ver-completa"]').click();
  await expect(page.locator('.visor-imagen')).toHaveCount(1);
  expect(await atras()).toBe(true);
  await expect(page.locator('.visor-imagen')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/producto\/.+/);
  expect(await atras()).toBe(true);
  await expect(page).toHaveURL(/#\/$/);
  expect(await atras()).toBe(false); // desde Productos sí sale de la app
});

test('Apariencia: modo Negro es negro puro con texto blanco y se recuerda', async ({ page }) => {
  await page.goto('/#/ajustes');
  const token = (nombre) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), nombre);
  await page.locator('[data-panel="apariencia"] > summary').click();
  await page.locator('[data-accion="modo-negro"]').click();
  expect(await token('--color-fondo')).toBe('#000000');
  expect(await token('--color-texto')).toBe('#ffffff');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-negro', '');
  expect(await token('--color-fondo')).toBe('#000000');
  await page.locator('[data-panel="apariencia"] > summary').click();
  await page.locator('[data-accion="modo-oscuro"]').click();
  expect(await token('--color-fondo')).toBe('#201e1a');
  await expect(page.locator('html')).not.toHaveAttribute('data-negro', '');
});

test.describe('con el celular en oscuro y la app en claro', () => {
  test.use({ colorScheme: 'dark' });
  test('el campo "Nueva sección" se ve claro', async ({ page }) => {
    await page.goto('/#/ajustes');
    await page.locator('[data-panel="apariencia"] > summary').click();
    await page.locator('[data-accion="modo-claro"]').click();
    await page.goto('/#/producto/nuevo');
    await page.locator('[data-accion="mostrar-nueva-seccion"]').click();
    const input = page.locator('.chips-secciones__form input');
    await expect(input).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(input).toHaveCSS('color', 'rgb(28, 27, 26)');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
  });
});
