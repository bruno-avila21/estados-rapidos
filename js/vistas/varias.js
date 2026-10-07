// "Agregar varios" (pedido 2026-10-07): se eligen varias fotos de una vez (desde acá, o
// compartiéndolas a la app desde la galería en el APK) y en una sola pantalla se les pone nombre y
// precio a todas antes de guardar — un producto por foto. Cada foto se achica UNA vez, al llegar
// (mismo criterio que el alta de un producto, BUGS.md #73).
import * as repo from '../repositorio.js';
import { validarProducto, parsearPrecio } from '../modelo.js';
import { achicarFoto } from '../utils/imagen.js';
import { mostrarToast } from '../utils/toast.js';
import { crearIcono } from '../utils/iconos.js';

// Fotos que llegaron antes de que la pantalla estuviera abierta (compartidas desde la galería):
// las deja `recibirFotosPendientes` y las toma `render` al dibujarse.
let fotosPendientes = [];
let alLlegarFotos = null; // la pantalla abierta, si hay una, las suma al toque

/** Suma fotos (File/Blob) para la pantalla "Agregar varios", esté abierta o no. */
export function recibirFotosPendientes(archivos) {
  if (alLlegarFotos) alLlegarFotos(archivos);
  else fotosPendientes.push(...archivos);
}

export async function render(contenedor, { navegar, protegerSalida }) {
  const secciones = await repo.listarSecciones();
  // Se vacía DESPUÉS del await: dos render seguidos ya no dejan dos pantallas (BUGS.md #81).
  contenedor.textContent = '';
  const seccionesElegidas = new Set();
  /** @type {{ id: number, blob: Blob, url: string, nombre: HTMLInputElement, precio: HTMLInputElement, fila: HTMLElement, error: HTMLElement }[]} */
  const items = [];
  let proximoId = 1;
  let guardando = false;

  // --- Barra superior: volver + "Guardar todos" siempre a mano ---
  const barra = document.createElement('div');
  barra.className = 'barra-volver barra-volver--producto';
  const btnVolver = document.createElement('button');
  btnVolver.type = 'button';
  btnVolver.className = 'enlace-volver';
  btnVolver.setAttribute('data-accion', 'volver-header');
  const etiquetaVolver = document.createElement('span');
  etiquetaVolver.textContent = 'Volver a Productos';
  btnVolver.append(crearIcono('volver'), etiquetaVolver);
  btnVolver.addEventListener('click', () => navegar('#/'));
  const accionesBarra = document.createElement('div');
  accionesBarra.className = 'barra-volver__acciones';
  const btnGuardar = document.createElement('button');
  btnGuardar.type = 'button';
  btnGuardar.className = 'boton boton--primario boton--chico barra-volver__guardar';
  btnGuardar.setAttribute('data-accion', 'guardar-varios');
  accionesBarra.append(btnGuardar);
  barra.append(btnVolver, accionesBarra);

  const cabecera = document.createElement('div');
  cabecera.className = 'pagina__cabecera';
  const textos = document.createElement('div');
  const h1 = document.createElement('h1');
  h1.className = 'pagina__titulo';
  h1.textContent = 'Agregar varios';
  const subtitulo = document.createElement('p');
  subtitulo.className = 'pagina__subtitulo';
  subtitulo.textContent = 'Un producto por foto: poneles nombre y, si querés, precio.';
  textos.append(h1, subtitulo);
  cabecera.append(textos);

  // --- Elegir fotos (varias a la vez) ---
  const inputFotos = document.createElement('input');
  inputFotos.type = 'file';
  inputFotos.accept = 'image/*';
  inputFotos.multiple = true;
  inputFotos.className = 'campo-oculto';
  inputFotos.tabIndex = -1;
  inputFotos.setAttribute('data-accion-input', 'elegir-varias');
  const btnElegir = document.createElement('button');
  btnElegir.type = 'button';
  btnElegir.className = 'boton boton--ancho';
  btnElegir.setAttribute('data-accion', 'elegir-varias');
  btnElegir.addEventListener('click', () => inputFotos.click());
  inputFotos.addEventListener('change', async () => {
    const archivos = [...(inputFotos.files || [])];
    inputFotos.value = '';
    await sumarFotos(archivos);
  });

  const progreso = document.createElement('p');
  progreso.className = 'texto-tenue';
  progreso.setAttribute('role', 'status');
  progreso.hidden = true;

  // --- Estado vacío (diseñado, patrones.md regla 5) ---
  const vacio = document.createElement('div');
  vacio.className = 'estado';
  const iconoVacio = document.createElement('div');
  iconoVacio.className = 'estado__icono';
  iconoVacio.append(crearIcono('galeria'));
  const tituloVacio = document.createElement('div');
  tituloVacio.className = 'estado__titulo';
  tituloVacio.textContent = 'Todavía no elegiste fotos';
  const textoVacio = document.createElement('p');
  textoVacio.className = 'texto-tenue';
  textoVacio.textContent = 'Elegí varias de la galería de una sola vez. También podés seleccionarlas en la galería del teléfono y compartirlas a esta app.';
  vacio.append(iconoVacio, tituloVacio, textoVacio);

  const lista = document.createElement('div');
  lista.className = 'varias__lista';

  // --- Sección para todos (opcional) ---
  const panelSecciones = document.createElement('section');
  panelSecciones.className = 'panel';
  const tituloSecciones = document.createElement('h2');
  tituloSecciones.className = 'panel__titulo';
  tituloSecciones.textContent = 'Sección para todos';
  const subtituloSecciones = document.createElement('p');
  subtituloSecciones.className = 'panel__subtitulo';
  subtituloSecciones.textContent = 'Opcional: se le asigna a cada producto de esta tanda.';
  const chips = document.createElement('div');
  chips.className = 'chips-secciones';
  for (const seccion of secciones) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.setAttribute('data-accion', 'toggle-seccion');
    chip.setAttribute('aria-pressed', 'false');
    chip.textContent = seccion.nombre;
    chip.addEventListener('click', () => {
      const activa = !seccionesElegidas.has(seccion.id);
      if (activa) seccionesElegidas.add(seccion.id);
      else seccionesElegidas.delete(seccion.id);
      chip.classList.toggle('chip--activo', activa);
      chip.setAttribute('aria-pressed', String(activa));
    });
    chips.append(chip);
  }
  panelSecciones.append(tituloSecciones, subtituloSecciones, chips);

  const errorGeneral = document.createElement('div');
  errorGeneral.setAttribute('role', 'alert');
  errorGeneral.hidden = true;

  const btnGuardarPie = document.createElement('button');
  btnGuardarPie.type = 'button';
  btnGuardarPie.className = 'boton boton--primario boton--ancho';
  btnGuardarPie.setAttribute('data-accion', 'guardar-varios-pie');

  function pintarEstado() {
    const n = items.length;
    vacio.hidden = n > 0;
    panelSecciones.hidden = n === 0 || secciones.length === 0;
    btnGuardarPie.hidden = n === 0;
    btnGuardar.hidden = n === 0;
    btnElegir.classList.toggle('boton--primario', n === 0);
    btnElegir.replaceChildren(crearIcono('galeria'), document.createTextNode(n === 0 ? 'Elegir fotos' : 'Sumar más fotos'));
    btnGuardar.replaceChildren(crearIcono('check'), document.createTextNode(`Guardar ${n}`));
    btnGuardarPie.replaceChildren(crearIcono('check'), document.createTextNode(n === 1 ? 'Agregar 1 producto' : `Agregar ${n} productos`));
    btnGuardar.disabled = guardando;
    btnGuardarPie.disabled = guardando;
  }

  function crearFila(blob) {
    const id = proximoId++;
    const url = URL.createObjectURL(blob);
    const fila = document.createElement('div');
    fila.className = 'varias__fila';
    fila.setAttribute('data-id', String(id));

    const foto = document.createElement('img');
    foto.className = 'varias__foto';
    foto.src = url;
    foto.alt = '';

    const campos = document.createElement('div');
    campos.className = 'varias__campos campo';
    const nombre = document.createElement('input');
    nombre.type = 'text';
    nombre.placeholder = 'Nombre del producto';
    nombre.setAttribute('aria-label', `Nombre del producto ${id}`);
    nombre.setAttribute('data-accion', 'varias-nombre');
    nombre.enterKeyHint = 'next';
    const precio = document.createElement('input');
    precio.type = 'text';
    precio.inputMode = 'decimal';
    precio.placeholder = 'Precio (opcional)';
    precio.setAttribute('aria-label', `Precio del producto ${id}`);
    precio.setAttribute('data-accion', 'varias-precio');
    precio.enterKeyHint = 'next';
    const error = document.createElement('div');
    error.className = 'campo__error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    campos.append(nombre, precio, error);

    // Enter salta al campo siguiente (y del último precio al nombre de la foto que sigue): cargar
    // una tanda entera sin levantar el pulgar del teclado.
    const saltar = (ev, destino) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      destino()?.focus();
    };
    nombre.addEventListener('keydown', (ev) => saltar(ev, () => precio));
    precio.addEventListener('keydown', (ev) => saltar(ev, () => items[items.findIndex((i) => i.id === id) + 1]?.nombre));

    const btnQuitar = document.createElement('button');
    btnQuitar.type = 'button';
    btnQuitar.className = 'boton-icono boton-icono-mini';
    btnQuitar.setAttribute('data-accion', 'varias-quitar');
    btnQuitar.setAttribute('aria-label', `Quitar la foto ${id}`);
    btnQuitar.append(crearIcono('equis'));
    btnQuitar.addEventListener('click', () => {
      const indice = items.findIndex((i) => i.id === id);
      if (indice === -1) return;
      URL.revokeObjectURL(url);
      items.splice(indice, 1);
      fila.remove();
      pintarEstado();
    });

    fila.append(foto, campos, btnQuitar);
    lista.append(fila);
    items.push({ id, blob, url, nombre, precio, fila, error });
  }

  /** Achica y suma las fotos una por una (no todas en paralelo: son decodificaciones a tamaño
   * completo y el teléfono tiene poca memoria), contando cuántas van. */
  async function sumarFotos(archivos) {
    const imagenes = archivos.filter((a) => !a.type || a.type.startsWith('image/'));
    if (!imagenes.length) return;
    let fallidas = 0;
    progreso.hidden = false;
    btnElegir.disabled = true;
    for (let i = 0; i < imagenes.length; i += 1) {
      progreso.textContent = `Preparando foto ${i + 1} de ${imagenes.length}…`;
      try {
        // eslint-disable-next-line no-await-in-loop -- de a una a propósito (memoria)
        crearFila(await achicarFoto(imagenes[i]));
        pintarEstado();
      } catch {
        fallidas += 1;
      }
    }
    progreso.hidden = true;
    btnElegir.disabled = false;
    if (fallidas) mostrarToast(fallidas === 1 ? 'Una foto no se pudo leer y quedó afuera.' : `${fallidas} fotos no se pudieron leer y quedaron afuera.`);
  }

  /** Valida todas, y si están bien guarda una por una. Devuelve si se guardó todo. */
  async function guardarTodos() {
    if (guardando || !items.length) return false;
    errorGeneral.hidden = true;
    let primeraConError = null;
    const datos = items.map((item) => {
      const textoPrecio = item.precio.value.trim();
      const dato = {
        nombre: item.nombre.value,
        precio: textoPrecio ? parsearPrecio(textoPrecio) : null,
        descripcion: '',
        estilo: null,
        secciones: [...seccionesElegidas],
      };
      const { ok, errores } = validarProducto(dato);
      item.error.hidden = ok;
      item.error.textContent = ok ? '' : errores.nombre || errores.precio || 'Revisá este producto.';
      if (!ok && !primeraConError) primeraConError = { item, errores };
      return dato;
    });
    if (primeraConError) {
      const { item, errores } = primeraConError;
      item.fila.scrollIntoView({ block: 'center' });
      (errores.nombre ? item.nombre : item.precio).focus();
      return false;
    }

    guardando = true;
    pintarEstado();
    let guardados = 0;
    try {
      while (items.length) {
        // eslint-disable-next-line no-await-in-loop -- en orden: así conservan el orden de la tanda
        await repo.guardarProducto(datos[guardados], items[0].blob, { fotoYaAchicada: true });
        guardados += 1;
        URL.revokeObjectURL(items[0].url);
        items[0].fila.remove();
        items.shift();
      }
    } catch (error) {
      // Lo que ya se guardó salió de la lista: quedan en pantalla solo los que faltan.
      datos.splice(0, guardados);
      errorGeneral.hidden = false;
      errorGeneral.textContent = `Se guardaron ${guardados}; el resto no se pudo guardar: ${error.message}`;
      errorGeneral.scrollIntoView({ block: 'center' });
      return false;
    } finally {
      guardando = false;
      pintarEstado();
    }
    mostrarToast(guardados === 1 ? 'Producto agregado' : `${guardados} productos agregados`);
    return true;
  }

  const guardarYSalir = async () => {
    if (!(await guardarTodos())) return;
    protegerSalida?.(null);
    navegar('#/');
  };
  btnGuardar.addEventListener('click', guardarYSalir);
  btnGuardarPie.addEventListener('click', guardarYSalir);

  // Salir con fotos cargadas pregunta antes (misma guardia que el alta de un producto).
  protegerSalida?.(() => items.length > 0, guardarTodos);

  pintarEstado();
  contenedor.append(barra, cabecera, btnElegir, inputFotos, progreso, vacio, lista, panelSecciones, errorGeneral, btnGuardarPie);

  alLlegarFotos = (archivos) => {
    // La pantalla ya no está (se navegó a otra): las fotos esperan a la próxima vez que se abra.
    if (!contenedor.contains(lista)) {
      alLlegarFotos = null;
      fotosPendientes.push(...archivos);
      return;
    }
    sumarFotos(archivos);
  };
  if (fotosPendientes.length) {
    const pendientes = fotosPendientes;
    fotosPendientes = [];
    await sumarFotos(pendientes);
  }
}
