// Pantalla "Productos": tarjetas con foto, nombre, precio editable en línea, selección múltiple
// persistente y Publicar (abre la hoja de revisión, 1 o N productos).
import * as repo from '../repositorio.js';
import { formatearPrecio, parsearPrecio } from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { mostrarToast } from '../utils/toast.js';
import { abrirHojaRevision } from './revision.js';

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
  const recargar = () => render(contenedor, { navegar });

  if (productos.length === 0) {
    contenedor.append(estadoVacio());
  } else {
    contenedor.append(barraSeleccion(productos, recargar));

    const lista = document.createElement('div');
    lista.className = 'lista-productos';
    for (const producto of productos) {
      lista.append(await tarjeta(producto, { navegar, recargar }));
    }
    contenedor.append(lista);

    const seleccionados = productos.filter((p) => p.seleccionado);
    if (seleccionados.length > 0) {
      contenedor.append(barraPublicarFija(seleccionados));
    }
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

function barraSeleccion(productos, recargar) {
  const div = document.createElement('div');
  div.className = 'fila barra-seleccion';

  const btnMarcarTodos = document.createElement('button');
  btnMarcarTodos.type = 'button';
  btnMarcarTodos.className = 'boton boton--chico boton--fantasma';
  btnMarcarTodos.setAttribute('data-accion', 'marcar-todos');
  btnMarcarTodos.textContent = 'Marcar todos';
  btnMarcarTodos.addEventListener('click', async () => {
    await repo.marcarTodos(true);
    recargar();
  });

  const btnDesmarcar = document.createElement('button');
  btnDesmarcar.type = 'button';
  btnDesmarcar.className = 'boton boton--chico boton--fantasma';
  btnDesmarcar.setAttribute('data-accion', 'desmarcar-todos');
  btnDesmarcar.textContent = 'Desmarcar';
  btnDesmarcar.addEventListener('click', async () => {
    await repo.marcarTodos(false);
    recargar();
  });

  div.append(btnMarcarTodos, btnDesmarcar);
  return div;
}

function barraPublicarFija(seleccionados) {
  const div = document.createElement('div');
  div.className = 'barra-publicar';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'boton boton--primario boton--ancho';
  btn.setAttribute('data-accion', 'publicar-seleccionados');
  btn.textContent = `Publicar ${seleccionados.length}`;
  btn.addEventListener('click', () => abrirHojaRevision({ ids: seleccionados.map((p) => p.id) }));
  div.append(btn);
  return div;
}

async function tarjeta(producto, { navegar, recargar }) {
  const div = document.createElement('div');
  div.className = 'tarjeta';
  div.setAttribute('data-id', producto.id);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'tarjeta__seleccion';
  checkbox.checked = !!producto.seleccionado;
  checkbox.setAttribute('data-accion', 'seleccionar');
  checkbox.setAttribute('aria-label', `Seleccionar ${producto.nombre} para publicar`);
  checkbox.addEventListener('change', async () => {
    await repo.actualizarSeleccion(producto.id, checkbox.checked);
    recargar();
  });

  const filaSuperior = document.createElement('div');
  filaSuperior.className = 'tarjeta__fila-superior';
  filaSuperior.append(checkbox);

  const fotoBlob = await repo.obtenerFotoBlob(producto.fotoId).catch(() => null);
  if (fotoBlob) {
    const url = URL.createObjectURL(fotoBlob);
    urlsActuales.push(url);
    const img = document.createElement('img');
    img.className = 'tarjeta__foto';
    img.src = url;
    img.alt = '';
    filaSuperior.append(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'tarjeta__foto tarjeta__foto--vacia';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.textContent = '📷';
    filaSuperior.append(placeholder);
  }

  const info = document.createElement('div');
  info.className = 'tarjeta__info';

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
  info.append(botonNombre, filaPrecio);
  filaSuperior.append(info);

  const acciones = document.createElement('div');
  acciones.className = 'tarjeta__acciones';

  const btnPublicar = document.createElement('button');
  btnPublicar.type = 'button';
  btnPublicar.className = 'boton boton--primario';
  btnPublicar.setAttribute('data-accion', 'publicar');
  btnPublicar.textContent = 'Publicar';
  btnPublicar.addEventListener('click', () => abrirHojaRevision({ ids: [producto.id] }));

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
  div.append(filaSuperior, acciones);
  return div;
}

async function formatoActual() {
  const config = await repo.obtenerPlantillaConfig();
  return config.formatoPrecio;
}
