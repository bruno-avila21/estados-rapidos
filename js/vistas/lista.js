// Pantalla "Productos": filtro por sección (chips con scroll propio), agrupado "Todas" con
// encabezados plegables, dos vistas (lista compacta / grilla 3 columnas) y selección múltiple
// persistente con la barra "Publicar N". Ronda "secciones" (CREAR-BRIEF.md): un producto puede
// estar en varias secciones a la vez (etiquetas, no carpetas).
import * as repo from '../repositorio.js';
import { formatearPrecio, parsearPrecio, agruparProductosPorSeccion, contarProductosPorSeccion, filtrarProductosPorSeccion, ID_SIN_SECCION } from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { mostrarToast } from '../utils/toast.js';
import { abrirHojaRevision } from './revision.js';
import { crearIcono } from '../utils/iconos.js';

let urlsActuales = [];

function limpiarUrls() {
  urlsActuales.forEach((u) => URL.revokeObjectURL(u));
  urlsActuales = [];
}

// ¿Seguimos en la pantalla de Productos? `render()` se auto-llama (`recargar`) sin esperar a
// terminar, y sus `await` (leer la lista, traer cada foto) le dan tiempo de sobra al usuario para
// navegar a OTRA pantalla mientras tanto — sin este chequeo, cuando ese render viejo termina de
// juntar sus datos pisa con la lista lo que la pantalla nueva ya dibujó en el mismo `contenedor`.
function esVigente() {
  return !location.hash || location.hash === '#/';
}

let formatoPrecioCache = null;
async function formatoActual() {
  if (!formatoPrecioCache) formatoPrecioCache = (await repo.obtenerPlantillaConfig()).formatoPrecio;
  return formatoPrecioCache;
}

export async function render(contenedor, { navegar }) {
  // `recargar()` (checkbox/marcar todos/borrar) espera su propio `await` (escribir en IndexedDB)
  // ANTES de llamar acá — tiempo de sobra para que el usuario ya haya navegado a otra pantalla.
  // Si ya no estamos en Productos, ni arrancar: ni el skeleton se llega a mostrar.
  if (!esVigente()) return;
  formatoPrecioCache = null;
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

  // Performance (CREAR-BRIEF.md, 150 productos < 300ms): las 3 lecturas de IndexedDB en paralelo,
  // no encadenadas.
  let productos, secciones, prefs;
  try {
    [productos, secciones, prefs] = await Promise.all([
      repo.listarProductos(),
      repo.listarSecciones(),
      repo.obtenerPreferenciasLista(),
    ]);
  } catch (error) {
    if (!esVigente()) return; // ya se navegó a otro lado mientras esto cargaba
    contenedor.textContent = '';
    const alerta = document.createElement('div');
    alerta.setAttribute('role', 'alert');
    alerta.textContent = 'No se pudieron cargar los productos: ' + error.message;
    contenedor.append(alerta);
    return;
  }
  if (!esVigente()) return;

  const recargar = () => render(contenedor, { navegar });
  await formatoActual();

  // Arma TODO fuera del DOM primero y recién al final, en un solo golpe, reemplaza `contenedor`.
  // Nada de ir mutando `contenedor` a medida que cada pieza está lista (BUGS.md #34).
  const piezas = [];

  if (productos.length === 0) {
    piezas.push(estadoVacio());
  } else {
    // Fotos: TODAS en paralelo (Promise.all), no un `await` por producto en un for secuencial —
    // con 150 productos eso era el cuello de botella real (150 viajes a IndexedDB en serie).
    const fotoUrlPorId = new Map();
    await Promise.all(
      productos.map(async (producto) => {
        if (!producto.fotoId) return;
        const blob = await repo.obtenerFotoBlob(producto.fotoId).catch(() => null);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        urlsActuales.push(url);
        fotoUrlPorId.set(producto.id, url);
      })
    );
    if (!esVigente()) return;

    const conteos = contarProductosPorSeccion(productos, secciones);
    piezas.push(filaFiltro(secciones, conteos, prefs, { navegar, recargar }));
    piezas.push(conmutadorVista(prefs, recargar));

    const visibles = filtrarProductosPorSeccion(productos, prefs.filtroSeccion);
    piezas.push(barraSeleccion(visibles, recargar));

    const ctx = {
      navegar,
      recargar,
      fotoUrlPorId,
      vista: prefs.vista,
      onToggle: async (producto, checked) => {
        producto.seleccionado = checked;
        await repo.actualizarSeleccion(producto.id, checked);
        // Sin recomponer todo: solo se sincronizan las casillas del mismo producto (puede
        // aparecer en 2 grupos a la vez) y la barra fija "Publicar N" (CREAR-BRIEF.md, rendimiento).
        sincronizarSeleccion(contenedor, producto.id, checked);
        actualizarBarraPublicarFija(contenedor, productos);
      },
    };

    if (prefs.filtroSeccion === 'todas') {
      if (visibles.length === 0) piezas.push(estadoVacio());
      else piezas.push(vistaAgrupada(productos, secciones, prefs, recargar, ctx));
    } else {
      if (visibles.length === 0) {
        piezas.push(estadoVacioFiltro());
      } else {
        piezas.push(prefs.vista === 'grilla' ? grilla(visibles, ctx) : listaCompacta(visibles, ctx));
      }
      piezas.push(botonPublicarSeccion(visibles));
    }

    const seleccionados = productos.filter((p) => p.seleccionado);
    if (seleccionados.length > 0) piezas.push(barraPublicarFija(seleccionados));
  }

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'fab';
  fab.setAttribute('data-accion', 'agregar');
  fab.setAttribute('aria-label', 'Agregar producto');
  fab.textContent = '+';
  fab.addEventListener('click', () => navegar('#/producto/nuevo'));
  piezas.push(fab);

  // Guarda contra una carrera real (BUGS.md #34): si mientras se armaban las piezas el usuario ya
  // navegó a OTRA pantalla, este render que recién termina no puede pisarla con la lista vieja.
  if (!esVigente()) return;
  contenedor.textContent = '';
  contenedor.append(...piezas);
}

/** Actualiza SOLO las casillas del producto `id` (puede haber más de una si está en 2 secciones y
 * la vista "Todas" las muestra en 2 grupos) sin recomponer el resto de la lista. */
function sincronizarSeleccion(contenedor, id, checked) {
  let selector;
  try {
    selector = `[data-id="${CSS.escape(id)}"] [data-accion="seleccionar"]`;
  } catch {
    return;
  }
  contenedor.querySelectorAll(selector).forEach((cb) => {
    cb.checked = checked;
  });
}

/** Recalcula la barra fija "Publicar N" (marcados) a partir de `productos` ya actualizado en
 * memoria, y la reemplaza/crea/saca sin tocar el resto del DOM. */
function actualizarBarraPublicarFija(contenedor, productos) {
  const seleccionados = productos.filter((p) => p.seleccionado);
  const actual = contenedor.querySelector('.barra-publicar');
  if (seleccionados.length === 0) {
    actual?.remove();
    return;
  }
  const nueva = barraPublicarFija(seleccionados);
  if (actual) actual.replaceWith(nueva);
  else contenedor.append(nueva);
}

function estadoVacio() {
  const div = document.createElement('div');
  div.className = 'estado';
  const icono = document.createElement('div');
  icono.className = 'estado__icono';
  icono.append(crearIcono('etiqueta'));
  const titulo = document.createElement('div');
  titulo.className = 'estado__titulo';
  titulo.textContent = 'Todavía no cargaste productos';
  const texto = document.createElement('p');
  texto.className = 'texto-tenue';
  texto.textContent = 'Tocá el + para agregar el primero: foto, nombre y precio.';
  div.append(icono, titulo, texto);
  return div;
}

function estadoVacioFiltro() {
  const div = document.createElement('div');
  div.className = 'estado';
  const icono = document.createElement('div');
  icono.className = 'estado__icono';
  icono.append(crearIcono('buscar'));
  const titulo = document.createElement('div');
  titulo.className = 'estado__titulo';
  titulo.textContent = 'No hay productos acá todavía';
  div.append(icono, titulo);
  return div;
}

// --- Fila de filtro por sección: chips con scroll horizontal PROPIO ("Todas" + cada sección +
// "Sin sección", con contador), la elegida se recuerda (CREAR-BRIEF.md). ---
function filaFiltro(secciones, conteos, prefs, { navegar, recargar }) {
  const cont = document.createElement('div');
  cont.className = 'filtro-secciones';

  const definiciones = [
    { id: 'todas', nombre: 'Todas', cantidad: conteos.todas },
    ...secciones.map((s) => ({ id: s.id, nombre: s.nombre, cantidad: conteos.porSeccion.get(s.id) || 0 })),
    { id: ID_SIN_SECCION, nombre: 'Sin sección', cantidad: conteos.sinSeccion },
  ];

  for (const def of definiciones) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (prefs.filtroSeccion === def.id ? ' chip--activo' : '');
    chip.setAttribute('data-accion', 'filtro-seccion');
    chip.setAttribute('data-id', def.id);
    chip.setAttribute('aria-pressed', String(prefs.filtroSeccion === def.id));
    chip.textContent = `${def.nombre} (${def.cantidad})`;
    chip.addEventListener('click', async () => {
      if (prefs.filtroSeccion === def.id) return;
      await repo.guardarPreferenciasLista({ filtroSeccion: def.id });
      recargar();
    });
    cont.append(chip);
  }

  const btnGestionar = document.createElement('button');
  btnGestionar.type = 'button';
  btnGestionar.className = 'chip chip--fantasma';
  btnGestionar.setAttribute('data-accion', 'gestionar-secciones');
  btnGestionar.append(crearIcono('etiqueta'), document.createTextNode('Secciones'));
  btnGestionar.addEventListener('click', () => navegar('#/secciones'));
  cont.append(btnGestionar);

  return cont;
}

// --- Conmutador de vista: lista compacta / grilla, se recuerda (CREAR-BRIEF.md). ---
function conmutadorVista(prefs, recargar) {
  const cont = document.createElement('div');
  cont.className = 'fila conmutador-vista';
  const opciones = [
    { valor: 'compacta', icono: 'lista', etiqueta: 'Lista' },
    { valor: 'grilla', icono: 'grilla', etiqueta: 'Grilla' },
  ];
  for (const op of opciones) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const activo = prefs.vista === op.valor;
    btn.className = 'boton boton--chico ' + (activo ? 'boton--primario' : 'boton--fantasma');
    btn.setAttribute('data-accion', `vista-${op.valor}`);
    btn.setAttribute('aria-pressed', String(activo));
    btn.append(crearIcono(op.icono), document.createTextNode(op.etiqueta));
    btn.addEventListener('click', async () => {
      if (activo) return;
      await repo.guardarPreferenciasLista({ vista: op.valor });
      recargar();
    });
    cont.append(btn);
  }
  return cont;
}

function barraSeleccion(visibles, recargar) {
  const div = document.createElement('div');
  div.className = 'fila barra-seleccion';

  const btnMarcarTodos = document.createElement('button');
  btnMarcarTodos.type = 'button';
  btnMarcarTodos.className = 'boton boton--chico boton--fantasma';
  btnMarcarTodos.setAttribute('data-accion', 'marcar-todos');
  btnMarcarTodos.textContent = 'Marcar todos';
  btnMarcarTodos.addEventListener('click', async () => {
    // Solo los VISIBLES (el filtro de sección activo): "Marcar todos" dentro de una sección marca
    // nada más que esa sección (CREAR-BRIEF.md).
    await repo.marcarTodos(true, visibles.map((p) => p.id));
    recargar();
  });

  const btnDesmarcar = document.createElement('button');
  btnDesmarcar.type = 'button';
  btnDesmarcar.className = 'boton boton--chico boton--fantasma';
  btnDesmarcar.setAttribute('data-accion', 'desmarcar-todos');
  btnDesmarcar.textContent = 'Desmarcar';
  btnDesmarcar.addEventListener('click', async () => {
    await repo.marcarTodos(false, visibles.map((p) => p.id));
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

/** Botón "Publicar esta sección (N)": independiente de las casillas marcadas, publica TODOS los
 * productos de la sección/filtro elegido (CREAR-BRIEF.md). */
function botonPublicarSeccion(visibles) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'boton boton--primario boton--ancho boton-publicar-seccion';
  btn.setAttribute('data-accion', 'publicar-seccion');
  btn.textContent = `Publicar esta sección (${visibles.length})`;
  btn.disabled = visibles.length === 0;
  btn.addEventListener('click', () => abrirHojaRevision({ ids: visibles.map((p) => p.id) }));
  return btn;
}

// --- Vista "Todas": agrupada por sección, encabezados plegables (estado recordado); un producto en
// 2 secciones aparece en ambos grupos con la MISMA casilla (sincronizada); "Sin sección" al final. ---
function vistaAgrupada(productos, secciones, prefs, recargar, ctx) {
  const grupos = agruparProductosPorSeccion(productos, secciones).filter((g) => g.productos.length > 0);
  const raiz = document.createElement('div');
  raiz.className = 'pila';
  for (const grupo of grupos) {
    const clave = grupo.id ?? ID_SIN_SECCION;
    const detalle = document.createElement('details');
    detalle.className = 'grupo grupo-seccion';
    detalle.open = !prefs.gruposPlegados?.[clave];
    const resumen = document.createElement('summary');
    resumen.className = 'grupo__titulo';
    resumen.textContent = `${grupo.nombre} (${grupo.productos.length})`;
    detalle.append(resumen);
    detalle.append(ctx.vista === 'grilla' ? grilla(grupo.productos, ctx) : listaCompacta(grupo.productos, ctx));
    detalle.addEventListener('toggle', () => {
      repo.guardarPreferenciasLista({
        gruposPlegados: { ...(prefs.gruposPlegados || {}), [clave]: !detalle.open },
      });
    });
    raiz.append(detalle);
  }
  return raiz;
}

// --- Vista LISTA COMPACTA: una fila por producto (checkbox, miniatura ~56px, nombre 1 línea,
// precio en línea, publicar como ícono) — objetivo ~8-10 filas por pantalla en 412×915. ---
function listaCompacta(productos, ctx) {
  const cont = document.createElement('div');
  cont.className = 'lista-compacta';
  for (const producto of productos) cont.append(filaCompacta(producto, ctx));
  return cont;
}

function filaCompacta(producto, ctx) {
  const fila = document.createElement('div');
  fila.className = 'fila-compacta';
  fila.setAttribute('data-id', producto.id);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'fila-compacta__seleccion';
  checkbox.checked = !!producto.seleccionado;
  checkbox.setAttribute('data-accion', 'seleccionar');
  checkbox.setAttribute('aria-label', `Seleccionar ${producto.nombre} para publicar`);
  checkbox.addEventListener('change', () => ctx.onToggle(producto, checkbox.checked));

  const url = ctx.fotoUrlPorId.get(producto.id);
  let foto;
  if (url) {
    foto = document.createElement('img');
    foto.className = 'fila-compacta__foto';
    foto.src = url;
    foto.alt = '';
    foto.loading = 'lazy'; // 150 productos: no decodificar las que no entran en pantalla todavía
    foto.decoding = 'async';
  } else {
    foto = document.createElement('div');
    foto.className = 'fila-compacta__foto fila-compacta__foto--vacia';
    foto.setAttribute('aria-hidden', 'true');
    foto.append(crearIcono('camara'));
  }

  const nombre = document.createElement('button');
  nombre.type = 'button';
  nombre.className = 'fila-compacta__nombre';
  nombre.setAttribute('data-accion', 'editar');
  nombre.textContent = producto.nombre;
  nombre.addEventListener('click', () => ctx.navegar(`#/producto/${producto.id}`));

  const inputPrecio = document.createElement('input');
  inputPrecio.type = 'text';
  inputPrecio.inputMode = 'decimal';
  inputPrecio.className = 'fila-compacta__precio';
  inputPrecio.setAttribute('data-accion', 'precio');
  inputPrecio.setAttribute('aria-label', `Precio de ${producto.nombre}`);
  inputPrecio.placeholder = 'Sin precio';
  inputPrecio.value = producto.precio != null ? formatearPrecio(producto.precio, formatoPrecioCache) : '';
  const guardarPrecio = async () => {
    const texto = inputPrecio.value.trim();
    let nuevo;
    if (!texto) {
      nuevo = null;
    } else {
      const parseado = parsearPrecio(texto);
      if (!Number.isFinite(parseado) || parseado <= 0) {
        inputPrecio.value = producto.precio != null ? formatearPrecio(producto.precio, formatoPrecioCache) : '';
        mostrarToast('El precio tiene que ser mayor a cero (o dejalo vacío para no mostrarlo).');
        return;
      }
      nuevo = parseado;
    }
    producto.precio = nuevo;
    await repo.actualizarPrecio(producto.id, nuevo);
    inputPrecio.value = nuevo != null ? formatearPrecio(nuevo, formatoPrecioCache) : '';
    mostrarToast(nuevo != null ? 'Precio actualizado' : 'Precio quitado');
  };
  inputPrecio.addEventListener('blur', guardarPrecio);
  inputPrecio.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') inputPrecio.blur();
  });

  const btnPublicar = document.createElement('button');
  btnPublicar.type = 'button';
  btnPublicar.className = 'boton-icono';
  btnPublicar.setAttribute('data-accion', 'publicar');
  btnPublicar.setAttribute('aria-label', `Publicar ${producto.nombre}`);
  btnPublicar.append(crearIcono('subir'));
  btnPublicar.addEventListener('click', () => abrirHojaRevision({ ids: [producto.id] }));

  const btnBorrar = document.createElement('button');
  btnBorrar.type = 'button';
  btnBorrar.className = 'boton-icono';
  btnBorrar.setAttribute('data-accion', 'borrar');
  btnBorrar.setAttribute('aria-label', `Borrar ${producto.nombre}`);
  btnBorrar.append(crearIcono('borrar'));
  btnBorrar.addEventListener('click', async () => {
    const ok = await pedirConfirmacion({
      titulo: 'Borrar producto',
      mensaje: `Se va a borrar "${producto.nombre}" y su foto. Esta acción no se puede deshacer.`,
    });
    if (!ok) return;
    await repo.borrarProducto(producto.id);
    mostrarToast('Producto borrado');
    ctx.recargar();
  });

  fila.append(checkbox, foto, nombre, inputPrecio, btnPublicar, btnBorrar);
  return fila;
}

// --- Vista GRILLA: 3 columnas, solo foto cuadrada + nombre corto abajo + casilla superpuesta;
// tocar abre edición. ---
function grilla(productos, ctx) {
  const cont = document.createElement('div');
  cont.className = 'grilla-productos';
  for (const producto of productos) cont.append(tarjetaGrilla(producto, ctx));
  return cont;
}

function tarjetaGrilla(producto, ctx) {
  const div = document.createElement('div');
  div.className = 'grilla-item';
  div.setAttribute('data-id', producto.id);
  div.setAttribute('data-accion', 'editar');
  div.setAttribute('role', 'button');
  div.tabIndex = 0;
  div.setAttribute('aria-label', `Editar ${producto.nombre}`);
  const abrir = () => ctx.navegar(`#/producto/${producto.id}`);
  div.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-accion="seleccionar"]')) return;
    abrir();
  });
  div.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && !ev.target.closest('[data-accion="seleccionar"]')) {
      ev.preventDefault();
      abrir();
    }
  });

  const url = ctx.fotoUrlPorId.get(producto.id);
  let foto;
  if (url) {
    foto = document.createElement('img');
    foto.className = 'grilla-item__foto';
    foto.src = url;
    foto.alt = '';
    foto.loading = 'lazy';
    foto.decoding = 'async';
  } else {
    foto = document.createElement('div');
    foto.className = 'grilla-item__foto grilla-item__foto--vacia';
    foto.setAttribute('aria-hidden', 'true');
    foto.append(crearIcono('camara'));
  }

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'grilla-item__seleccion';
  checkbox.checked = !!producto.seleccionado;
  checkbox.setAttribute('data-accion', 'seleccionar');
  checkbox.setAttribute('aria-label', `Seleccionar ${producto.nombre} para publicar`);
  checkbox.addEventListener('click', (ev) => ev.stopPropagation());
  checkbox.addEventListener('change', () => ctx.onToggle(producto, checkbox.checked));

  const nombre = document.createElement('div');
  nombre.className = 'grilla-item__nombre';
  nombre.textContent = producto.nombre;

  div.append(foto, checkbox, nombre);
  return div;
}
