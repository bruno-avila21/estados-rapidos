// Pantalla "Productos": tarjetas con foto, nombre, precio editable en línea y Publicar.
import * as repo from '../repositorio.js';
import { formatearPrecio, parsearPrecio } from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { mostrarToast } from '../utils/toast.js';
import { componerImagen } from '../componer.js';
import { publicarImagen, descargarImagen } from '../utils/compartir.js';

let urlsActuales = [];

function limpiarUrls() {
  urlsActuales.forEach((u) => URL.revokeObjectURL(u));
  urlsActuales = [];
}

export async function render(contenedor, { navegar }) {
  limpiarUrls();
  contenedor.textContent = '';

  const skeleton = document.createElement('div');
  skeleton.className = 'pila';
  for (let i = 0; i < 3; i += 1) {
    const s = document.createElement('div');
    s.className = 'skeleton';
    skeleton.append(s);
  }
  contenedor.append(skeleton);

  let productos;
  try {
    productos = await repo.listarProductos();
  } catch (error) {
    contenedor.textContent = '';
    const alerta = document.createElement('div');
    alerta.setAttribute('role', 'alert');
    alerta.textContent = 'No se pudieron cargar los productos: ' + error.message;
    contenedor.append(alerta);
    return;
  }

  contenedor.textContent = '';

  if (productos.length === 0) {
    contenedor.append(estadoVacio());
  } else {
    const lista = document.createElement('div');
    lista.className = 'lista-productos';
    for (const producto of productos) {
      lista.append(await tarjeta(producto, { navegar, recargar: () => render(contenedor, { navegar }) }));
    }
    contenedor.append(lista);
  }

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'fab';
  fab.setAttribute('data-accion', 'agregar');
  fab.setAttribute('aria-label', 'Agregar producto');
  fab.textContent = '+';
  fab.addEventListener('click', () => navegar('#/producto/nuevo'));
  contenedor.append(fab);
}

function estadoVacio() {
  const div = document.createElement('div');
  div.className = 'estado';
  const icono = document.createElement('div');
  icono.className = 'estado__icono';
  icono.setAttribute('aria-hidden', 'true');
  icono.textContent = '🏷️';
  const titulo = document.createElement('div');
  titulo.className = 'estado__titulo';
  titulo.textContent = 'Todavía no cargaste productos';
  const texto = document.createElement('p');
  texto.className = 'texto-tenue';
  texto.textContent = 'Tocá el + para agregar el primero: foto, nombre y precio.';
  div.append(icono, titulo, texto);
  return div;
}

async function tarjeta(producto, { navegar, recargar }) {
  const div = document.createElement('div');
  div.className = 'tarjeta';
  div.setAttribute('data-id', producto.id);

  const fotoBlob = await repo.obtenerFotoBlob(producto.fotoId).catch(() => null);
  if (fotoBlob) {
    const url = URL.createObjectURL(fotoBlob);
    urlsActuales.push(url);
    const img = document.createElement('img');
    img.className = 'tarjeta__foto';
    img.src = url;
    img.alt = '';
    div.append(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'tarjeta__foto tarjeta__foto--vacia';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.textContent = '📷';
    div.append(placeholder);
  }

  const botonNombre = document.createElement('button');
  botonNombre.type = 'button';
  botonNombre.className = 'tarjeta__nombre';
  botonNombre.setAttribute('data-accion', 'editar');
  botonNombre.textContent = producto.nombre;
  botonNombre.addEventListener('click', () => navegar(`#/producto/${producto.id}`));

  const filaPrecio = document.createElement('div');
  filaPrecio.className = 'tarjeta__fila-precio';
  const inputPrecio = document.createElement('input');
  inputPrecio.type = 'text';
  inputPrecio.inputMode = 'decimal';
  inputPrecio.className = 'tarjeta__precio';
  inputPrecio.setAttribute('data-accion', 'precio');
  inputPrecio.setAttribute('aria-label', `Precio de ${producto.nombre}`);
  inputPrecio.value = formatearPrecio(producto.precio, await formatoActual());
  const guardarPrecio = async () => {
    const nuevo = parsearPrecio(inputPrecio.value);
    if (!Number.isFinite(nuevo) || nuevo <= 0) {
      // vacío o negativo: se revierte, nunca se guarda un "$ 0" en silencio (QA.md #8).
      inputPrecio.value = formatearPrecio(producto.precio, await formatoActual());
      mostrarToast('El precio tiene que ser mayor a cero: no se guardó.');
      return;
    }
    producto.precio = nuevo;
    await repo.actualizarPrecio(producto.id, nuevo);
    inputPrecio.value = formatearPrecio(nuevo, await formatoActual());
    mostrarToast('Precio actualizado');
  };
  inputPrecio.addEventListener('blur', guardarPrecio);
  inputPrecio.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') inputPrecio.blur();
  });
  filaPrecio.append(inputPrecio);

  const acciones = document.createElement('div');
  acciones.className = 'tarjeta__acciones';

  const btnPublicar = document.createElement('button');
  btnPublicar.type = 'button';
  btnPublicar.className = 'boton boton--primario';
  btnPublicar.setAttribute('data-accion', 'publicar');
  btnPublicar.textContent = 'Publicar';
  btnPublicar.addEventListener('click', () => publicar(producto, btnPublicar));

  const btnBorrar = document.createElement('button');
  btnBorrar.type = 'button';
  btnBorrar.className = 'boton boton--fantasma';
  btnBorrar.setAttribute('data-accion', 'borrar');
  btnBorrar.textContent = 'Borrar';
  btnBorrar.addEventListener('click', async () => {
    const ok = await pedirConfirmacion({
      titulo: 'Borrar producto',
      mensaje: `Se va a borrar "${producto.nombre}" y su foto. Esta acción no se puede deshacer.`,
    });
    if (!ok) return;
    await repo.borrarProducto(producto.id);
    mostrarToast('Producto borrado');
    recargar();
  });

  acciones.append(btnPublicar, btnBorrar);
  div.append(botonNombre, filaPrecio, acciones);
  return div;
}

async function formatoActual() {
  const config = await repo.obtenerPlantillaConfig();
  return config.formatoPrecio;
}

async function publicar(producto, boton) {
  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Armando...';
  try {
    const [plantillaBlob, fotoBlob, config] = await Promise.all([
      repo.obtenerImagenPlantillaBlob(),
      repo.obtenerFotoBlob(producto.fotoId),
      repo.obtenerPlantillaConfig(),
    ]);
    const [plantillaImagen, fotoImagen] = await Promise.all([
      createImageBitmap(plantillaBlob),
      fotoBlob ? createImageBitmap(fotoBlob) : Promise.resolve(null),
    ]);
    const blob = await componerImagen({
      plantillaImagen,
      fotoImagen,
      producto,
      ajustes: config.ajustes,
      formatoPrecio: config.formatoPrecio,
    });
    const texto = producto.descripcion || producto.nombre;
    // el resultado ya se avisa por toast dentro de compartirArchivos/publicarImagen para
    // 'cancelado' y 'tardando' (timeout de seguridad, QA.md #6); acá solo faltan sin-soporte y compartido.
    const resultado = await publicarImagen({ blob, texto });
    if (resultado === 'sin-soporte') {
      descargarImagen(blob, `${producto.nombre || 'estado'}.png`);
      mostrarToast('Tu navegador no comparte archivos: se descargó la imagen');
    } else if (resultado === 'compartido') {
      mostrarToast('¡Listo! Elegí "Mi estado" en WhatsApp');
    }
  } catch (error) {
    mostrarToast('No se pudo armar la imagen: ' + error.message);
  } finally {
    // se libera el botón apenas resuelve/rechaza share (o vence el timeout de seguridad),
    // nunca se queda colgado en "Armando..." (QA.md #6).
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}
