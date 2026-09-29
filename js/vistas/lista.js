// Pantalla "Productos": filtro por sección (chips con scroll propio), agrupado "Todas" con
// encabezados plegables, dos vistas (lista compacta / grilla 3 columnas) y selección múltiple
// persistente con la barra "Publicar N". Ronda "secciones" (CREAR-BRIEF.md): un producto puede
// estar en varias secciones a la vez (etiquetas, no carpetas).
import * as repo from '../repositorio.js';
import {
  formatearPrecio,
  parsearPrecio,
  validarProducto,
  agruparProductosPorSeccion,
  contarProductosPorSeccion,
  filtrarProductosPorSeccion,
  ID_SIN_SECCION,
} from '../modelo.js';
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

    const visibles = filtrarProductosPorSeccion(productos, prefs.filtroSeccion);
    // Conmutador Lista/Grilla + "Marcar todos"/"Desmarcar": UNA sola fila en los 2 diseños (no 2
    // piezas apiladas) — productos_lista_natural/productos_vista_grilla_natural.
    piezas.push(filaControles(prefs, visibles, recargar));

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
        actualizarBarraPublicarFija(contenedor, productos, prefs.vista);
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

    if (prefs.vista !== 'grilla' && visibles.length > 0) piezas.push(consejoPublicacion());

    const seleccionados = productos.filter((p) => p.seleccionado);
    if (seleccionados.length > 0) piezas.push(barraPublicarFija(seleccionados, prefs.vista));
  }

  // El header (index.html, fuera de `contenedor`) y el FAB cambian de piel según la vista: los 2
  // diseños dibujan el "+" de la cabecera y el FAB distinto en productos_lista_natural
  // (FAB oscuro relleno, "+" del header sin fondo) que en productos_vista_grilla_natural (FAB
  // blanco con borde, "+" del header dentro de un cuadrado con fondo).
  const enGrilla = productos.length > 0 && prefs.vista === 'grilla';
  document.querySelector('.encabezado__accion')?.classList.toggle('encabezado__accion--grilla', enGrilla);

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'fab' + (enGrilla ? ' fab--grilla' : '');
  fab.setAttribute('data-accion', 'agregar');
  fab.setAttribute('aria-label', 'Agregar producto');
  fab.append(crearIcono('agregar'));
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
function actualizarBarraPublicarFija(contenedor, productos, vista) {
  const seleccionados = productos.filter((p) => p.seleccionado);
  const actual = contenedor.querySelector('.barra-publicar');
  if (seleccionados.length === 0) {
    actual?.remove();
    return;
  }
  const nueva = barraPublicarFija(seleccionados, vista);
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

// --- Fila de filtro por sección: chips con scroll horizontal PROPIO ("Todas" + "Sin sección" +
// cada sección, con contador — mismo orden que productos_lista_natural), la elegida se recuerda
// (CREAR-BRIEF.md). Nota: el orden del AGRUPADO ("Todas", vistaAgrupada) es otro — ahí "Sin
// sección" va al final a propósito (test "Sin sección queda al final del agrupado Todas"); acá es
// solo el orden de los chips del filtro, sin relación con ese. ---
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

// --- Fila de controles: conmutador Lista/Grilla + "Marcar todos"/"Desmarcar" en UNA sola fila
// (justify-between), como en los 2 diseños — antes eran 2 piezas apiladas en 2 líneas. La grilla
// además lleva un separador abajo (productos_vista_grilla_natural, "border-b"); la lista no. ---
function filaControles(prefs, visibles, recargar) {
  const cont = document.createElement('div');
  const enGrilla = prefs.vista === 'grilla';
  cont.className = 'fila-controles' + (enGrilla ? ' fila-controles--grilla' : '');
  cont.append(conmutadorVista(prefs, recargar), barraSeleccion(visibles, recargar, prefs.vista));
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

// --- Barra de selección rápida: "Marcar todos" / "Desmarcar". Los 2 diseños la dibujan distinto
// (productos_lista_natural: pastillas con borde; productos_vista_grilla_natural: links de texto
// con ícono y un "|" de separador) — mismo criterio que el encabezado de sección: un componente,
// 2 pieles según `vista`. ---
function barraSeleccion(visibles, recargar, vista) {
  const div = document.createElement('div');
  const enGrilla = vista === 'grilla';
  div.className = 'barra-seleccion' + (enGrilla ? ' barra-seleccion--grilla' : '');

  const btnMarcarTodos = document.createElement('button');
  btnMarcarTodos.type = 'button';
  btnMarcarTodos.className = 'barra-seleccion__boton';
  btnMarcarTodos.setAttribute('data-accion', 'marcar-todos');
  if (enGrilla) btnMarcarTodos.append(crearIcono('todos'));
  btnMarcarTodos.append(document.createTextNode('Marcar todos'));
  btnMarcarTodos.addEventListener('click', async () => {
    // Solo los VISIBLES (el filtro de sección activo): "Marcar todos" dentro de una sección marca
    // nada más que esa sección (CREAR-BRIEF.md).
    await repo.marcarTodos(true, visibles.map((p) => p.id));
    recargar();
  });

  const separador = document.createElement('span');
  separador.className = 'barra-seleccion__separador';
  separador.textContent = '|';
  separador.setAttribute('aria-hidden', 'true');

  const btnDesmarcar = document.createElement('button');
  btnDesmarcar.type = 'button';
  btnDesmarcar.className = 'barra-seleccion__boton barra-seleccion__boton--fantasma';
  btnDesmarcar.setAttribute('data-accion', 'desmarcar-todos');
  btnDesmarcar.textContent = 'Desmarcar';
  btnDesmarcar.addEventListener('click', async () => {
    await repo.marcarTodos(false, visibles.map((p) => p.id));
    recargar();
  });

  if (enGrilla) div.append(btnMarcarTodos, separador, btnDesmarcar);
  else div.append(btnMarcarTodos, btnDesmarcar);
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

function barraPublicarFija(seleccionados, vista) {
  const enGrilla = vista === 'grilla';
  const div = document.createElement('div');
  div.className = 'barra-publicar';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'boton boton--primario boton--ancho';
  btn.setAttribute('data-accion', 'publicar-seleccionados');
  // "Publicar N producto(s)" (productos_lista_natural/productos_vista_grilla_natural). Ni el
  // ícono ni el badge "WhatsApp →" (grilla) suman texto real: el ícono es SVG sin nodos de texto,
  // y el badge se dibuja con CSS `content` (decorativo, `aria-hidden`) — así `toHaveText(...)` en
  // los tests sigue matcheando exacto "Publicar N producto(s)" aunque se vea el badge.
  const palabra = seleccionados.length === 1 ? 'producto' : 'productos';
  // Ícono + texto van agrupados en un <span> que se puede achicar (el texto trunca con ellipsis
  // adentro): a fuente grande/pantallas angostas eso evita que el badge o el ícono se empujen
  // fuera de la pantalla (BUGS.md, overflow-fuente-grande.spec.js). `textContent` del botón sigue
  // siendo exacto "Publicar N producto(s)" para los tests — la ellipsis es solo visual (CSS).
  const contenido = document.createElement('span');
  contenido.className = 'barra-publicar__contenido';
  const texto = document.createElement('span');
  texto.className = 'barra-publicar__texto';
  texto.textContent = `Publicar ${seleccionados.length} ${palabra}`;
  contenido.append(crearIcono(enGrilla ? 'compartir' : 'enviar'), texto);
  btn.append(contenido);
  if (enGrilla) {
    btn.classList.add('boton--publicar-grilla');
    const badge = document.createElement('span');
    badge.className = 'barra-publicar__whatsapp';
    badge.setAttribute('aria-hidden', 'true');
    btn.append(badge);
  }
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
    // Los 2 diseños dibujan este mismo encabezado distinto: productos_lista_natural usa una
    // etiqueta chica en mayúsculas; productos_vista_grilla_natural, un título editorial grande.
    const resumen = document.createElement('summary');
    resumen.className = `grupo__titulo grupo__titulo--seccion grupo__titulo--seccion-${ctx.vista === 'grilla' ? 'grilla' : 'lista'}`;
    const nombreYContador = document.createElement('span');
    nombreYContador.className = 'grupo__titulo-grupo';
    const nombre = document.createElement('span');
    nombre.className = 'grupo__titulo-texto';
    nombre.textContent = grupo.nombre;
    const contador = document.createElement('span');
    // Si hay marcados en el grupo, el contador lo dice (productos_lista_natural: "3 seleccionados");
    // si no, es la cuenta neutra del grupo (productos_vista_grilla_natural: "3").
    const marcados = grupo.productos.filter((p) => p.seleccionado).length;
    contador.className = 'grupo__contador' + (marcados > 0 ? ' grupo__contador--seleccion' : '');
    contador.textContent = marcados > 0 ? `${marcados} seleccionados` : String(grupo.productos.length);
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
  btnPublicar.append(crearIcono('subir'));
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

  const listo = document.createElement('span');
  listo.className = 'grilla-item__listo';
  listo.textContent = 'Listo';
  listo.setAttribute('aria-hidden', 'true');

  fotoCaja.append(foto, cajaCheckbox, listo);

  const nombre = document.createElement('div');
  nombre.className = 'grilla-item__nombre';
  nombre.textContent = producto.nombre;

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
  div.append(fotoCaja, nombre, precio, pie);
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
