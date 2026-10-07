// Capturas a 412×915 del inicio (Productos) rediseñado y del alta/edición, con fotos reales y datos
// desparejos (nombre largo, con y sin precio, con y sin sección), para revisarlas a ojo.
// Uso: node scripts/capturas-inicio.mjs <carpeta-de-salida> <foto1> <foto2> [<foto3> ...]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [salida, ...fotos] = process.argv.slice(2);
if (!salida || fotos.length < 2) {
  console.error('Uso: node scripts/capturas-inicio.mjs <carpeta-de-salida> <foto1> <foto2> [<foto3> ...]');
  process.exit(1);
}

const PRODUCTOS = [
  { nombre: 'Torta', precio: null, seccion: 'Tortas' },
  { nombre: 'Miau', precio: null, seccion: 'Tortas' },
  { nombre: 'Taza de cerámica esmaltada a mano edición invierno', precio: 18500, seccion: 'Regalos' },
  { nombre: 'Vela de soja', precio: 9200, seccion: 'Regalos', descripcion: 'Aroma a vainilla, 40 horas.' },
  { nombre: 'Conejo tejido', precio: 22000, seccion: null },
];

const PUERTO = 8995;
const servidor = spawn(process.execPath, [path.join(RAIZ, 'scripts', 'servir.js'), String(PUERTO)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const base = `http://127.0.0.1:${PUERTO}/index.html`;
  const captura = (nombre) => pagina.screenshot({ path: path.join(salida, `${nombre}.png`) });

  await pagina.goto(`${base}#/`);
  await pagina.locator('[data-accion="agregar"]').waitFor();
  await pagina.waitForTimeout(500); // que terminen las transiciones de entrada
  await captura('inicio-vacio');

  const datos = PRODUCTOS.map((p, i) => ({ ...p, foto: readFileSync(fotos[i % fotos.length]).toString('base64') }));
  await pagina.evaluate(async (lista) => {
    const repo = await import('/js/repositorio.js');
    const idPorSeccion = new Map();
    for (const p of lista) {
      if (p.seccion && !idPorSeccion.has(p.seccion)) idPorSeccion.set(p.seccion, (await repo.crearSeccion(p.seccion)).id);
      const bytes = Uint8Array.from(atob(p.foto), (c) => c.charCodeAt(0));
      await repo.guardarProducto(
        { nombre: p.nombre, precio: p.precio, descripcion: p.descripcion || '', secciones: p.seccion ? [idPorSeccion.get(p.seccion)] : [] },
        new Blob([bytes], { type: 'image/jpeg' })
      );
    }
    await repo.marcarTodos(false, (await repo.listarProductos()).filter((x) => x.nombre !== 'Torta' && x.nombre !== 'Miau').map((x) => x.id));
    await repo.guardarPreferenciasLista({ vista: 'grilla' });
  }, datos);

  const tema = (t) => pagina.evaluate((valor) => localStorage.setItem('estados-rapidos:tema', JSON.stringify(valor)), t);
  const abrirInicio = async () => {
    await pagina.goto(`${base}#/ajustes`);
    await pagina.goto(`${base}#/`);
    await pagina.reload();
    await pagina.locator('.grilla-item, .fila-compacta').first().waitFor();
    await pagina.waitForTimeout(500);
  };

  await tema({ modo: 'claro', tono: 'oceano' });
  await abrirInicio();
  await captura('inicio-grilla-oceano');
  await pagina.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await pagina.waitForTimeout(300);
  await captura('inicio-grilla-oceano-abajo');
  await pagina.evaluate(() => window.scrollTo(0, 0));
  await pagina.locator('[data-accion="abrir-filtros"]').click();
  await pagina.waitForTimeout(300);
  await captura('inicio-filtros-abiertos');
  await pagina.locator('[data-accion="abrir-filtros"]').click();
  await pagina.locator('[data-accion="buscar-productos"]').fill('zzz');
  await captura('inicio-sin-resultados');
  await pagina.locator('[data-accion="buscar-productos"]').fill('');
  await pagina.locator('[data-accion="vista-compacta"]').click();
  await pagina.locator('.fila-compacta').first().waitFor();
  await pagina.waitForTimeout(400);
  await captura('inicio-lista-oceano');
  await pagina.locator('[data-accion="vista-grilla"]').click();
  await pagina.locator('.grilla-item').first().waitFor();

  await tema({ modo: 'claro', tono: 'cipres' });
  await abrirInicio();
  await captura('inicio-grilla-cipres');
  await tema({ modo: 'negro', tono: 'cipres' });
  await abrirInicio();
  await captura('inicio-grilla-negro');
  await tema({ modo: 'oscuro', tono: 'oceano' });
  await abrirInicio();
  await captura('inicio-grilla-oscuro');

  // Alta/edición: vista previa en el panel de foto + "Guardar" arriba.
  await tema({ modo: 'claro', tono: 'oceano' });
  await abrirInicio();
  await pagina.locator('.grilla-item').first().click();
  await pagina.locator('.foto-picker .vista-previa-estado__imagen').waitFor();
  await pagina.waitForTimeout(500);
  await captura('producto-editar');
  console.log(`listo: ${salida}`);
} finally {
  await navegador.close();
  servidor.kill();
}
