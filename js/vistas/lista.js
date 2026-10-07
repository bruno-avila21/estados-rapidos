// Pantalla "Productos" (inicio). Rediseño 2026-10-07, réplica del mock que entregó Bruno: buscador,
// botones "Filtros" (abre el panel con las secciones y la selección rápida) y "Ordenar", cuenta de
// productos + conmutador Lista/Grilla, secciones plegables, tarjetas de grilla en 2 columnas y la
// barra fija "Publicar N productos" con el "+" al lado. Un producto puede estar en varias
// secciones a la vez (etiquetas, no carpetas).
import * as repo from '../repositorio.js';
import {
  formatearPrecio,
  parsearPrecio,
  validarProducto,
  agruparProductosPorSeccion,
  contarProductosPorSeccion,
  filtrarProductosPorSeccion,
  ordenarProductos,
  coincideBusqueda,
  ORDENES_LISTA,
  ETIQUETA_ORDEN_LISTA,
  ID_SIN_SECCION,
} from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { mostrarToast } from '../utils/toast.js';
import { abrirHojaRevision } from './revision.js';
import { crearIcono } from '../utils/iconos.js';

let urlsActuales = [];
// Lo escrito en el buscador vale mientras la app esté abierta (no se guarda): así sobrevive a los
// re-render de la lista (marcar todos, cambiar de vista) sin quedar pegado para el otro día.
let busquedaActual = '';

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
  productos = ordenarProductos(productos, prefs.orden);

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
    const visibles = filtrarProductosPorSeccion(productos, prefs.filtroSeccion);
    const alBuscar = () => aplicarBusqueda(contenedor, productos);

    piezas.push(buscador(alBuscar));
    const panelFiltros = panelDeFiltros(secciones, conteos, prefs, visibles, { navegar, recargar });
    piezas.push(filaFiltrosYOrden(prefs, panelFiltros, recargar));
    piezas.push(panelFiltros);
    piezas.push(filaControles(prefs, recargar));

    const nombrePorSeccion = new Map(secciones.map((s) => [s.id, s.nombre]));
    const ctx = {
      navegar,
      recargar,
      fotoUrlPorId,
      nombrePorSeccion,
      vista: prefs.vista,
      onToggle: async (producto, checked) => {
        producto.seleccionado = checked;
        await repo.actualizarSeleccion(producto.id, checked);
        // Sin recomponer todo: solo se sincronizan las casillas del mismo producto (puede
        // aparecer en 2 grupos a la vez) y la barra fija "Publicar N" (CREAR-BRIEF.md, rendimiento).
        sincronizarSeleccion(contenedor, producto.id, checked);
        actualizarBarraPublicarFija(contenedor, productos);
        actualizarContadoresDeGrupo(contenedor, productos);
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
    piezas.push(estadoSinResultados());

    if (prefs.vista !== 'grilla' && visibles.length > 0) piezas.push(consejoPublicacion());
  }

  // Barra fija de abajo: "Publicar N productos" (solo con marcados) + el "+" de agregar al lado.
  // Sin marcados queda solo el "+", en el mismo lugar.
  piezas.push(barraPublicarFija(productos.filter((p) => p.seleccionado), navegar));

  // Guarda contra una carrera real (BUGS.md #34): si mientras se armaban las piezas el usuario ya
  // navegó a OTRA pantalla, este render que recién termina no puede pisarla con la lista vieja.
  if (!esVigente()) return;
  contenedor.textContent = '';
  contenedor.append(...piezas);
  if (productos.length > 0) aplicarBusqueda(contenedor, productos);
}

/** Muestra solo los productos que coinciden con `busquedaActual` (sin recomponer la lista: se
 * ocultan filas/tarjetas y los grupos que quedan vacíos) y actualiza la cuenta "N productos". */
function aplicarBusqueda(contenedor, productos) {
  const coincide = new Set(productos.filter((p) => coincideBusqueda(p, busquedaActual)).map((p) => p.id));
  const mostrados = new Set();
  contenedor.querySelectorAll('.grilla-item[data-id], .fila-compacta[data-id]').forEach((el) => {
    const visible = coincide.has(el.dataset.id);
    el.hidden = !visible;
    if (visible) mostrados.add(el.dataset.id);
  });
  contenedor.querySelectorAll('details.grupo-seccion').forEach((grupo) => {
    grupo.hidden = !grupo.querySelector('[data-id]:not([hidden])');
  });
  const buscando = busquedaActual.trim() !== '';
  const cuenta = contenedor.querySelector('[data-estado="cuenta-productos"]');
  if (cuenta) cuenta.textContent = `${mostrados.size} producto${mostrados.size === 1 ? '' : 's'}`;
  const sinResultados = contenedor.querySelector('[data-estado="sin-resultados"]');
  if (sinResultados) sinResultados.hidden = !(buscando && mostrados.size === 0);
  // "Publicar esta sección" y el consejo no tienen sentido sobre una búsqueda sin resultados.
  contenedor.querySelectorAll('.boton-publicar-seccion, .consejo').forEach((el) => {
    el.hidden = buscando && mostrados.size === 0;
  });
}

/** El contador de cada grupo ("2 seleccionados" o la cantidad) al día después de marcar/desmarcar. */
function actualizarContadoresDeGrupo(contenedor, productos) {
  const porId = new Map(productos.map((p) => [p.id, p]));
  contenedor.querySelectorAll('details.grupo-seccion').forEach((grupo) => {
    const ids = [...new Set([...grupo.querySelectorAll('[data-id]')].map((el) => el.dataset.id))];
    const marcados = ids.filter((id) => porId.get(id)?.seleccionado).length;
    const contador = grupo.querySelector('.grupo__contador');
    if (contador) pintarContadorDeGrupo(contador, marcados, ids.length);
  });
}

function pintarContadorDeGrupo(contador, marcados, total) {
  contador.className = 'grupo__contador' + (marcados > 0 ? ' grupo__contador--seleccion' : '');
  contador.textContent = marcados > 0 ? `${marcados} seleccionado${marcados === 1 ? '' : 's'}` : String(total);
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

/** Recalcula el botón "Publicar N" (marcados) a partir de `productos` ya actualizado en memoria,
 * y lo reemplaza/crea/saca dentro de la barra fija sin tocar el resto del DOM. */
function actualizarBarraPublicarFija(contenedor, productos) {
  const barra = contenedor.querySelector('.barra-publicar');
  if (!barra) return;
  const seleccionados = productos.filter((p) => p.seleccionado);
  const actual = barra.querySelector('[data-accion="publicar-seleccionados"]');
  if (seleccionados.length === 0) {
    actual?.remove();
    return;
  }
  const nuevo = botonPublicarSeleccionados(seleccionados);
  if (actual) actual.replaceWith(nuevo);
  else barra.prepend(nuevo);
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

function estadoSinResultados() {
  const div = document.createElement('div');
  div.className = 'estado';
  div.setAttribute('data-estado', 'sin-resultados');
  div.hidden = true;
  const icono = document.createElement('div');
  icono.className = 'estado__icono';
  icono.append(crearIcono('buscar'));
  const titulo = document.createElement('div');
  titulo.className = 'estado__titulo';
  titulo.textContent = 'Ningún producto coincide';
  const texto = document.createElement('p');
  texto.className = 'texto-tenue';
  texto.textContent = 'Probá con otra palabra o borrá la búsqueda.';
  div.append(icono, titulo, texto);
  return div;
}

// --- Buscador: filtra por nombre y descripción mientras se escribe, sin recomponer la lista. ---
function buscador(alBuscar) {
  const cont = document.createElement('label');
  cont.className = 'buscador';
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'buscador__input';
  input.placeholder = 'Buscar productos...';
  input.setAttribute('aria-label', 'Buscar productos');
  input.setAttribute('data-accion', 'buscar-productos');
  input.enterKeyHint = 'search';
  input.value = busquedaActual;
  input.addEventListener('input', () => {
    busquedaActual = input.value;
    alBuscar();
  });
  cont.append(crearIcono('buscar'), input);
  return cont;
}

// --- "Filtros" (abre/cierra el panel de abajo; el número dice cuántos filtros hay puestos) y
// "Ordenar" (un <select> real tapado por el botón: abre el selector nativo del teléfono). ---
function filaFiltrosYOrden(prefs, panelFiltros, recargar) {
  const fila = document.createElement('div');
  fila.className = 'fila-filtros';

  const btnFiltros = document.createElement('button');
  btnFiltros.type = 'button';
  btnFiltros.className = 'boton-control';
  btnFiltros.setAttribute('data-accion', 'abrir-filtros');
  btnFiltros.setAttribute('aria-expanded', String(prefs.filtrosAbiertos));
  btnFiltros.setAttribute('aria-controls', panelFiltros.id);
  btnFiltros.append(crearIcono('filtro'), document.createTextNode('Filtros'));
  if (prefs.filtroSeccion !== 'todas') {
    const badge = document.createElement('span');
    badge.className = 'boton-control__badge';
    badge.textContent = '1';
    badge.setAttribute('aria-label', '1 filtro puesto');
    btnFiltros.append(badge);
  }
  btnFiltros.addEventListener('click', () => {
    const abrir = panelFiltros.hidden;
    panelFiltros.hidden = !abrir;
    btnFiltros.setAttribute('aria-expanded', String(abrir));
    prefs.filtrosAbiertos = abrir;
    repo.guardarPreferenciasLista({ filtrosAbiertos: abrir });
  });

  const cajaOrden = document.createElement('div');
  cajaOrden.className = 'boton-control boton-control--select';
  const etiquetaOrden = document.createElement('span');
  etiquetaOrden.textContent = 'Ordenar';
  const selectOrden = document.createElement('select');
  selectOrden.className = 'boton-control__select';
  selectOrden.setAttribute('data-accion', 'ordenar-productos');
  selectOrden.setAttribute('aria-label', 'Ordenar productos');
  for (const valor of ORDENES_LISTA) {
    const opcion = document.createElement('option');
    opcion.value = valor;
    opcion.textContent = ETIQUETA_ORDEN_LISTA[valor];
    selectOrden.append(opcion);
  }
  selectOrden.value = prefs.orden;
  selectOrden.addEventListener('change', async () => {
    await repo.guardarPreferenciasLista({ orden: selectOrden.value });
    recargar();
  });
  cajaOrden.append(crearIcono('ordenar'), etiquetaOrden, selectOrden);

  fila.append(btnFiltros, cajaOrden);
  return fila;
}

/** Panel que abre "Filtros": las secciones (chips), "Secciones" para administrarlas y la selección
 * rápida de lo que se está viendo. */
function panelDeFiltros(secciones, conteos, prefs, visibles, { navegar, recargar }) {
  const panel = document.createElement('div');
  panel.className = 'panel-filtros';
  panel.id = 'panel-filtros';
  panel.hidden = !prefs.filtrosAbiertos;
  const rotuloSecciones = document.createElement('span');
  rotuloSecciones.className = 'panel-filtros__rotulo';
  rotuloSecciones.textContent = 'Sección';
  const rotuloSeleccion = document.createElement('span');
  rotuloSeleccion.className = 'panel-filtros__rotulo';
  rotuloSeleccion.textContent = 'Selección';
  panel.append(rotuloSecciones, filaFiltro(secciones, conteos, prefs, { navegar, recargar }), rotuloSeleccion, barraSeleccion(visibles, recargar));
  return panel;
}

// --- Chips de sección ("Todas" + "Sin sección" + cada sección, con contador), la elegida se
// recuerda (CREAR-BRIEF.md). Nota: el orden del AGRUPADO ("Todas", vistaAgrupada) es otro — ahí
// "Sin sección" va al final a propósito (test "Sin sección queda al final del agrupado Todas"). ---
function filaFiltro(secciones, conteos, prefs, { navegar, recargar }) {
  const cont = document.createElement('div');
  cont.className = 'filtro-secciones';

  const definiciones = [
    { id: 'todas', nombre: 'Todas', cantidad: conteos.todas },
    { id: ID_SIN_SECCION, nombre: 'Sin sección', cantidad: conteos.sinSeccion },
    ...secciones.map((s) => ({ id: s.id, nombre: s.nombre, cantidad: conteos.porSeccion.get(s.id) || 0 })),
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
  btnGestionar.append(crearIcono('engranaje'), document.createTextNode('Secciones'));
  btnGestionar.addEventListener('click', () => navegar('#/secciones'));
  cont.append(btnGestionar);

  return cont;
}

// --- Fila de controles: la cuenta "N productos" a la izquierda y el conmutador Lista/Grilla a la
// derecha (mock del inicio). "Marcar todos"/"Desmarcar" viven en el panel de "Filtros". ---
function filaControles(prefs, recargar) {
  const cont = document.createElement('div');
  cont.className = 'fila-controles';
  const cuenta = document.createElement('span');
  cuenta.className = 'fila-controles__cuenta';
  cuenta.setAttribute('data-estado', 'cuenta-productos');
  cuenta.setAttribute('role', 'status');
  cont.append(cuenta, conmutadorVista(prefs, recargar));
  return cont;
}

// --- Conmutador de vista: lista compacta / grilla, se recuerda (CREAR-BRIEF.md). Segmented
// control (productos_lista_natural): pista con las 2 opciones, la activa con fondo propio. ---
function conmutadorVista(prefs, recargar) {
  const cont = document.createElement('div');
  cont.className = 'conmutador-vista';
  const opciones = [
    { valor: 'compacta', icono: 'lista', etiqueta: 'Lista' },
    { valor: 'grilla', icono: 'grilla', etiqueta: 'Grilla' },
  ];
  for (const op of opciones) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const activo = prefs.vista === op.valor;
    btn.className = 'conmutador-vista__opcion' + (activo ? ' conmutador-vista__opcion--activa' : '');
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

// --- Selección rápida: "Marcar todos" / "Desmarcar" (panel de "Filtros"). ---
function barraSeleccion(visibles, recargar) {
  const div = document.createElement('div');
  div.className = 'barra-seleccion';

  const btnMarcarTodos = document.createElement('button');
  btnMarcarTodos.type = 'button';
  btnMarcarTodos.className = 'barra-seleccion__boton';
  btnMarcarTodos.setAttribute('data-accion', 'marcar-todos');
  btnMarcarTodos.append(crearIcono('todos'), document.createTextNode('Marcar todos'));
  btnMarcarTodos.addEventListener('click', async () => {
    // Solo los VISIBLES (el filtro de sección activo): "Marcar todos" dentro de una sección marca
    // nada más que esa sección (CREAR-BRIEF.md).
    await repo.marcarTodos(true, visibles.map((p) => p.id));
    recargar();
  });

  const btnDesmarcar = document.createElement('button');
  btnDesmarcar.type = 'button';
  btnDesmarcar.className = 'barra-seleccion__boton barra-seleccion__boton--fantasma';
  btnDesmarcar.setAttribute('data-accion', 'desmarcar-todos');
  btnDesmarcar.textContent = 'Desmarcar';
  btnDesmarcar.addEventListener('click', async () => {
    await repo.marcarTodos(false, visibles.map((p) => p.id));
    recargar();
  });

  div.append(btnMarcarTodos, btnDesmarcar);
  return div;
}

// --- Tarjeta "Consejo de publicación" (productos_lista_natural, pie de la lista): texto estático,
// solo en la vista lista (la grilla del diseño no la incluye). ---
function consejoPublicacion() {
  const div = document.createElement('div');
  div.className = 'consejo';
  div.append(crearIcono('info'));
  const texto = document.createElement('p');
  const fuerte = document.createElement('strong');
  fuerte.textContent = 'Consejo de publicación: ';
  // Texto ajustado a lo que la app hace de verdad (no la promesa genérica del mock): antes de
  // compartir se abre una hoja de revisión donde se puede reordenar y editar el texto; la app NO
  // garantiza "calidad original" (comprime la foto, ver js/utils/imagen.js `achicarFoto`).
  texto.append(fuerte, document.createTextNode('antes de compartir vas a poder revisar el orden y el texto de cada estado (dura 24 horas en WhatsApp).'));
  div.append(texto);
  return div;
}

/** Barra fija de abajo (mock del inicio): "Publicar N productos" con el ícono de WhatsApp y, al
 * lado, el "+" para agregar un producto. El botón de publicar solo existe con productos marcados. */
function barraPublicarFija(seleccionados, navegar) {
  const div = document.createElement('div');
  div.className = 'barra-publicar';
  if (seleccionados.length > 0) div.append(botonPublicarSeleccionados(seleccionados));
  const btnAgregar = document.createElement('button');
  btnAgregar.type = 'button';
  btnAgregar.className = 'barra-publicar__agregar';
  btnAgregar.setAttribute('data-accion', 'agregar');
  btnAgregar.setAttribute('aria-label', 'Agregar producto');
  btnAgregar.append(crearIcono('agregar'));
  btnAgregar.addEventListener('click', () => navegar('#/producto/nuevo'));
  div.append(btnAgregar);
  return div;
}

function botonPublicarSeleccionados(seleccionados) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'boton boton--primario barra-publicar__boton';
  btn.setAttribute('data-accion', 'publicar-seleccionados');
  // El ícono es SVG sin nodos de texto: `textContent` del botón es exacto "Publicar N producto(s)"
  // (lo leen los tests). El texto va en un <span> que trunca con ellipsis a fuente grande/pantallas
  // angostas en vez de empujar el "+" fuera de la pantalla (overflow-fuente-grande.spec.js).
  const palabra = seleccionados.length === 1 ? 'producto' : 'productos';
  const texto = document.createElement('span');
  texto.className = 'barra-publicar__texto';
  texto.textContent = `Publicar ${seleccionados.length} ${palabra}`;
  const redondel = document.createElement('span');
  redondel.className = 'barra-publicar__wa';
  redondel.append(crearIcono('whatsapp'));
  btn.append(redondel, texto);
  btn.addEventListener('click', () => abrirHojaRevision({ ids: seleccionados.map((p) => p.id) }));
  return btn;
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
    resumen.className = 'grupo__titulo grupo__titulo--seccion';
    const nombreYContador = document.createElement('span');
    nombreYContador.className = 'grupo__titulo-grupo';
    const nombre = document.createElement('span');
    nombre.className = 'grupo__titulo-texto';
    nombre.textContent = grupo.nombre;
    // Con marcados en el grupo, el contador lo dice ("2 seleccionados"); si no, la cantidad.
    const contador = document.createElement('span');
    pintarContadorDeGrupo(contador, grupo.productos.filter((p) => p.seleccionado).length, grupo.productos.length);
    nombreYContador.append(nombre, contador);
    // El texto empieza siempre por el nombre del grupo (sin espacio antes del contador): los tests
    // que chequean el prefijo de `summary.textContent` (ej. "Sin sección...") siguen pasando.
    resumen.append(nombreYContador);
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

  // La casilla se ve del tamaño del diseño (24px) pero el área táctil real es más grande: un
  // envoltorio con padding + margen negativo (no en la casilla misma, que necesita apariencia
  // nativa/appearance:none intacta para el estilo custom) — mismo criterio que patrones.md regla 6.
  const cajaCheckbox = document.createElement('span');
  cajaCheckbox.className = 'fila-compacta__seleccion-caja';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'fila-compacta__seleccion';
  checkbox.checked = !!producto.seleccionado;
  checkbox.setAttribute('data-accion', 'seleccionar');
  checkbox.setAttribute('aria-label', `Seleccionar ${producto.nombre} para publicar`);
  checkbox.addEventListener('change', () => ctx.onToggle(producto, checkbox.checked));
  cajaCheckbox.append(checkbox);

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

  // Bloque de metadatos (productos_lista_natural): nombre + subtítulo (la descripción, si tiene) +
  // precio en línea propia, todo dentro de una sola columna angosta.
  const meta = document.createElement('div');
  meta.className = 'fila-compacta__meta';

  const nombre = document.createElement('button');
  nombre.type = 'button';
  nombre.className = 'fila-compacta__nombre';
  nombre.setAttribute('data-accion', 'editar');
  nombre.textContent = producto.nombre;
  nombre.addEventListener('click', () => ctx.navegar(`#/producto/${producto.id}`));
  meta.append(nombre);

  if (producto.descripcion) {
    const subtitulo = document.createElement('p');
    subtitulo.className = 'fila-compacta__subtitulo';
    subtitulo.textContent = producto.descripcion;
    meta.append(subtitulo);
  }

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
  meta.append(inputPrecio);

  const acciones = document.createElement('div');
  acciones.className = 'fila-compacta__acciones';

  const btnPublicar = document.createElement('button');
  btnPublicar.type = 'button';
  btnPublicar.className = 'boton-icono boton-icono-mini boton-icono-mini--lleno';
  btnPublicar.setAttribute('data-accion', 'publicar');
  btnPublicar.setAttribute('aria-label', `Publicar ${producto.nombre}`);
  btnPublicar.append(crearIcono('enviar'));
  btnPublicar.addEventListener('click', () => abrirHojaRevision({ ids: [producto.id] }));

  const btnBorrar = document.createElement('button');
  btnBorrar.type = 'button';
  btnBorrar.className = 'boton-icono boton-icono-mini boton-icono-mini--peligro';
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
  acciones.append(btnPublicar, btnBorrar);

  fila.append(cajaCheckbox, foto, meta, acciones);
  return fila;
}

// --- Vista GRILLA: 3 columnas, solo foto cuadrada + nombre corto abajo + casilla superpuesta;
// tocar abre edición. Fase 3 "M" #3 (Interfaz/ANALISIS-STITCH.md, productos_vista_grilla_natural):
// la grilla YA existía (conmutador lista/grilla persistido en `obtenerPreferenciasLista`/
// `guardarPreferenciasLista`) — lo que faltaba eran las ACCIONES visibles por tarjeta (acá se suman
// "Subir a Estado" y "Editar precio", sin tocar la selección persistente que ya funcionaba). ---
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
  const esControl = (ev) => ev.target.closest('[data-accion="seleccionar"], [data-accion="grilla-precio"], [data-accion="grilla-publicar"]');
  div.addEventListener('click', (ev) => {
    if (esControl(ev)) return;
    abrir();
  });
  div.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && !esControl(ev)) {
      ev.preventDefault();
      abrir();
    }
  });

  // productos_vista_grilla_natural: la foto vive en un contenedor propio (relative) para poder
  // superponer la casilla (arriba-izq.) y la pastilla "Listo" (abajo-der., solo si está marcado).
  const fotoCaja = document.createElement('div');
  fotoCaja.className = 'grilla-item__foto-caja';

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

  // Misma idea que en la fila compacta: casilla visualmente chica (24px, igual al diseño) con un
  // envoltorio con área táctil más grande (patrones.md regla 6). Es un <label> (no un <span>): así
  // tocar el aro de relleno también alterna la casilla sin JS aparte, y lleva el mismo
  // `data-accion="seleccionar"` para que `esControl` (más abajo) no confunda ese toque con "abrir".
  const cajaCheckbox = document.createElement('label');
  cajaCheckbox.className = 'grilla-item__seleccion-caja';
  cajaCheckbox.setAttribute('data-accion', 'seleccionar');
  cajaCheckbox.addEventListener('click', (ev) => ev.stopPropagation());
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'grilla-item__seleccion';
  checkbox.checked = !!producto.seleccionado;
  checkbox.setAttribute('data-accion', 'seleccionar');
  checkbox.setAttribute('aria-label', `Seleccionar ${producto.nombre} para publicar`);
  checkbox.addEventListener('click', (ev) => ev.stopPropagation());
  checkbox.addEventListener('change', () => ctx.onToggle(producto, checkbox.checked));
  cajaCheckbox.append(checkbox);

  fotoCaja.append(foto, cajaCheckbox);

  const nombre = document.createElement('div');
  nombre.className = 'grilla-item__nombre';
  nombre.textContent = producto.nombre;

  // Chips con las secciones del producto (hasta 2). El renglón existe siempre, aunque no tenga
  // ninguna: así todas las tarjetas de una fila miden lo mismo.
  const chips = document.createElement('div');
  chips.className = 'grilla-item__chips';
  for (const idSeccion of (producto.secciones ?? []).filter((id) => ctx.nombrePorSeccion.has(id)).slice(0, 2)) {
    const chip = document.createElement('span');
    chip.className = 'grilla-item__chip';
    chip.textContent = ctx.nombrePorSeccion.get(idSeccion);
    chips.append(chip);
  }

  const precio = document.createElement('div');
  precio.className = 'grilla-item__precio';
  precio.textContent = producto.precio != null ? formatearPrecio(producto.precio, formatoPrecioCache) : 'Sin precio';
  precio.classList.toggle('grilla-item__precio--vacio', producto.precio == null);

  const pie = document.createElement('div');
  pie.className = 'grilla-item__pie';

  // El diseño usa un lápiz para "Editar producto" y un avión de papel para "Compartir en
  // WhatsApp"; acá el lápiz sigue editando el PRECIO (el modal rápido que ya existía y tienen
  // tests, Fase 3 "M" #2) — tocar el resto de la tarjeta ya abre la edición completa del producto,
  // así que no se pierde ninguna acción, solo se reparte distinto.
  const btnPrecio = document.createElement('button');
  btnPrecio.type = 'button';
  btnPrecio.className = 'grilla-item__accion boton-icono-mini';
  btnPrecio.setAttribute('data-accion', 'grilla-precio');
  btnPrecio.setAttribute('aria-label', `Editar precio de ${producto.nombre}`);
  btnPrecio.append(crearIcono('lapiz'));
  btnPrecio.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const guardado = await abrirModalPrecio(producto);
    if (guardado) {
      precio.textContent = producto.precio != null ? formatearPrecio(producto.precio, formatoPrecioCache) : 'Sin precio';
      precio.classList.toggle('grilla-item__precio--vacio', producto.precio == null);
    }
  });

  const btnPublicar = document.createElement('button');
  btnPublicar.type = 'button';
  // Sin fondo por defecto (productos_vista_grilla_natural: "text-primary hover:bg-..."), a
  // diferencia del botón "Subir a Estado" de la fila compacta que SÍ arranca relleno.
  btnPublicar.className = 'grilla-item__accion boton-icono-mini boton-icono-mini--primario';
  btnPublicar.setAttribute('data-accion', 'grilla-publicar');
  btnPublicar.setAttribute('aria-label', `Publicar ${producto.nombre}`);
  btnPublicar.append(crearIcono('enviar'));
  btnPublicar.addEventListener('click', (ev) => {
    ev.stopPropagation();
    abrirHojaRevision({ ids: [producto.id] });
  });

  pie.append(btnPrecio, btnPublicar);
  div.append(fotoCaja, nombre, chips, precio, pie);
  return div;
}

// --- Modal rápido de precio (Fase 3 "M" #2): editar el precio desde la lista SIN entrar al
// detalle. La vista compacta ya tenía un input inline equivalente (con sus propios tests e2e que
// no hay que romper); este modal es la vía nueva para la grilla, que no tiene lugar para un input
// en la tarjeta. Valida con `validarProducto` de modelo.js (precio vacío = válido, negativo/0 =
// error), atrapa el foco, Escape/"Cancelar" cierran, y el botón atrás de Android también la cierra
// (mismo patrón `history.pushState({modalAbierto:true})` + `popstate` que usa `estadosRapidosBack`
// en main.js para la hoja de revisión). Devuelve una Promise<boolean> (true = se guardó). ---
function abrirModalPrecio(producto) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialogo-overlay';

    const caja = document.createElement('div');
    caja.className = 'dialogo';
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-modal', 'true');
    caja.setAttribute('aria-label', `Editar precio de ${producto.nombre}`);

    const titulo = document.createElement('h2');
    titulo.className = 'dialogo__titulo';
    titulo.textContent = 'Editar precio';

    const sub = document.createElement('p');
    sub.className = 'dialogo__mensaje';
    sub.textContent = producto.nombre;

    const campo = document.createElement('div');
    campo.className = 'campo';
    const label = document.createElement('label');
    label.className = 'campo__etiqueta';
    label.htmlFor = 'modal-precio-input';
    label.textContent = 'Precio';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.id = 'modal-precio-input';
    input.placeholder = 'Sin precio';
    input.setAttribute('data-accion', 'modal-precio-input');
    input.value = producto.precio != null ? formatearPrecio(producto.precio, formatoPrecioCache) : '';
    const error = document.createElement('p');
    error.className = 'campo__error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    campo.append(label, input, error);

    const acciones = document.createElement('div');
    acciones.className = 'dialogo__acciones';
    const btnCancelar = document.createElement('button');
    btnCancelar.type = 'button';
    btnCancelar.className = 'boton boton--fantasma';
    btnCancelar.setAttribute('data-accion', 'modal-precio-cancelar');
    btnCancelar.textContent = 'Cancelar';
    const btnGuardar = document.createElement('button');
    btnGuardar.type = 'button';
    btnGuardar.className = 'boton boton--primario';
    btnGuardar.setAttribute('data-accion', 'modal-precio-guardar');
    btnGuardar.textContent = 'Guardar';
    acciones.append(btnCancelar, btnGuardar);

    caja.append(titulo, sub, campo, acciones);
    overlay.append(caja);
    document.body.append(overlay);

    // Foco atrapado: Tab/Shift+Tab nunca se escapan del diálogo mientras está abierto.
    const focosDelDialogo = () => Array.from(caja.querySelectorAll('input, button')).filter((el) => !el.disabled);
    const alTab = (ev) => {
      if (ev.key !== 'Tab') return;
      const focos = focosDelDialogo();
      if (!focos.length) return;
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      if (ev.shiftKey && document.activeElement === primero) {
        ev.preventDefault();
        ultimo.focus();
      } else if (!ev.shiftKey && document.activeElement === ultimo) {
        ev.preventDefault();
        primero.focus();
      }
    };
    const alEscape = (ev) => {
      if (ev.key === 'Escape') cerrar(false);
    };
    document.addEventListener('keydown', alTab);
    document.addEventListener('keydown', alEscape);
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) cerrar(false);
    });
    btnCancelar.addEventListener('click', () => cerrar(false));

    // Atrás de Android cierra el modal en vez de salir de la pantalla de abajo — mismo criterio
    // que la hoja de revisión (BUGS.md #20); `estadosRapidosBack` (main.js) reconoce
    // `modalAbierto` igual que reconoce `hojaRevision`.
    history.pushState({ modalAbierto: true }, '');
    const alVolver = () => cerrar(false, { desdeHistorial: true });
    window.addEventListener('popstate', alVolver);

    function cerrar(guardado, { desdeHistorial = false } = {}) {
      document.removeEventListener('keydown', alTab);
      document.removeEventListener('keydown', alEscape);
      window.removeEventListener('popstate', alVolver);
      overlay.remove();
      if (!desdeHistorial && history.state?.modalAbierto) history.back();
      resolve(guardado);
    }

    const guardar = async () => {
      const texto = input.value.trim();
      const nuevoPrecio = texto ? parsearPrecio(texto) : null;
      const { ok, errores } = validarProducto({ ...producto, precio: nuevoPrecio });
      if (!ok && errores.precio) {
        error.textContent = errores.precio;
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      producto.precio = nuevoPrecio;
      await repo.actualizarPrecio(producto.id, nuevoPrecio);
      mostrarToast(nuevoPrecio != null ? 'Precio actualizado' : 'Precio quitado');
      cerrar(true);
    };
    btnGuardar.addEventListener('click', guardar);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        guardar();
      }
    });

    input.focus();
    input.select();
  });
}
